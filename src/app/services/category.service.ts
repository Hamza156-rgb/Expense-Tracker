import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Category, WorkspaceScope } from '../models/models';
import { Timestamp } from 'firebase/firestore';
import { OfflineMutation, OfflineSyncService } from './offline-sync.service';


@Injectable({ providedIn: 'root' })
export class CategoryService {
  private streams = new Map<string, BehaviorSubject<Category[]>>();
  private serverSubs = new Map<string, Subscription>();
  private isFlushing = false;
  private readonly personalScope: WorkspaceScope = { workspaceType: 'personal', workspaceId: 'personal' };

  constructor(
    private afs: AngularFirestore,
    private offlineSync: OfflineSyncService
  ) {
    this.offlineSync.online$.subscribe(online => {
      if (online) {
        this.flushPendingMutations();
      }
    });
  }

  getCategories(userId: string, scope?: WorkspaceScope): Observable<Category[]> {
    const resolvedScope = this.resolveScope(scope);
    const scopeKey = this.getScopeKey(userId, resolvedScope);

    let stream = this.streams.get(scopeKey);
    if (!stream) {
      stream = new BehaviorSubject<Category[]>(this.readCachedCategories(scopeKey));
      this.streams.set(scopeKey, stream);
    }

    this.ensureServerSubscription(userId, resolvedScope, scopeKey);
    if (this.offlineSync.isOnline()) {
      this.flushPendingMutations();
    }

    return stream.asObservable();
  }

  async seedDefaultCategories(userId: string, scope: WorkspaceScope): Promise<void> {
    const personalDefaults = [
      { name: 'Food & Dining', icon: 'restaurant', color: '#ef4444' },
      { name: 'Transportation', icon: 'car', color: '#f59e0b' },
      { name: 'Shopping', icon: 'bag-handle', color: '#8b5cf6' },
      { name: 'Entertainment', icon: 'game-controller', color: '#3b82f6' },
      { name: 'Health', icon: 'medical', color: '#10b981' },
      { name: 'Bills & Utilities', icon: 'receipt', color: '#f97316' },
      { name: 'Education', icon: 'book', color: '#06b6d4' },
      { name: 'Other', icon: 'ellipsis-horizontal', color: '#64748b' },
    ];

    const businessDefaults = [
      { name: 'Inventory', icon: 'cube', color: '#ef4444' },
      { name: 'Rent', icon: 'home', color: '#f59e0b' },
      { name: 'Utilities', icon: 'flash', color: '#3b82f6' },
      { name: 'Salaries', icon: 'people', color: '#8b5cf6' },
      { name: 'Marketing', icon: 'megaphone', color: '#10b981' },
      { name: 'Maintenance', icon: 'construct', color: '#f97316' },
      { name: 'Taxes', icon: 'calculator', color: '#06b6d4' },
      { name: 'Other', icon: 'ellipsis-horizontal', color: '#64748b' },
    ];

    const tourDefaults = [
      { name: 'Food & Dining', icon: 'restaurant', color: '#ef4444' },
      { name: 'Travel', icon: 'airplane', color: '#f59e0b' },
      { name: 'Hotel & Stay', icon: 'bed', color: '#8b5cf6' },
      { name: 'Fuel', icon: 'car', color: '#3b82f6' },
      { name: 'Tickets & Entry', icon: 'ticket', color: '#10b981' },
      { name: 'Shopping', icon: 'bag-handle', color: '#f97316' },
      { name: 'Activities', icon: 'camera', color: '#06b6d4' },
      { name: 'Other', icon: 'ellipsis-horizontal', color: '#64748b' },
    ];

    const defaults =
      scope.workspaceType === 'business' ? businessDefaults :
      scope.workspaceType === 'tour' ? tourDefaults :
      personalDefaults;

    const batch = this.afs.firestore.batch();
    defaults.forEach(cat => {
      const ref = this.afs.collection('categories').doc().ref;
      batch.set(ref, {
        ...cat,
        userId,
        workspaceType: scope.workspaceType,
        workspaceId: scope.workspaceId,
        isDefault: true,
        createdAt: new Date()
      });
    });
    await batch.commit();
  }

  async addCategory(category: Omit<Category, 'id'>): Promise<void> {
    const normalized = this.normalizeCategoryInput(category);
    const scopeKey = this.getScopeKey(normalized.userId, this.resolveScope(normalized));

    // Check for duplicate name within the same scope
    const currentStream = this.streams.get(scopeKey);
    if (currentStream) {
      const isDuplicate = currentStream.value.some(cat =>
        cat.name.trim().toLowerCase() === normalized.name.trim().toLowerCase()
      );
      if (isDuplicate) {
        throw new Error('DUPLICATE_CATEGORY_NAME');
      }
    }

    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');
      await this.afs.collection('categories').add(normalized);
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const tempId = `tmp-cat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const optimistic: Category = { ...normalized, id: tempId };
      this.updateLocalCategories(scopeKey, current =>
        [...current, optimistic].sort((a, b) => a.name.localeCompare(b.name))
      );

      this.offlineSync.enqueueMutation({
        entity: 'category',
        action: 'add',
        userId: normalized.userId,
        tempId,
        payload: normalized
      });
    }
  }

  async updateCategory(id: string, category: Partial<Category>): Promise<void> {
    const payload = this.normalizePartialCategory(category);
    const scopeKey =
      this.findScopeKeyForCategory(id) ||
      (payload.userId ? this.getScopeKey(payload.userId, this.resolveScope(payload)) : null);

    // Check for duplicate name if name is being updated
    if (payload.name && scopeKey) {
      const currentStream = this.streams.get(scopeKey);
      if (currentStream) {
        const isDuplicate = currentStream.value.some(cat =>
          cat.id !== id && cat.name.trim().toLowerCase() === payload.name!.trim().toLowerCase()
        );
        if (isDuplicate) {
          throw new Error('DUPLICATE_CATEGORY_NAME');
        }
      }
    }

    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');
      await this.afs.doc(`categories/${id}`).update(payload);
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      if (!scopeKey) throw error;

      this.updateLocalCategories(scopeKey, current =>
        current
          .map(item => (item.id === id ? { ...item, ...payload } as Category : item))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      const userId = payload.userId || this.findUserIdByScopeKey(scopeKey);
      if (!userId) throw error;

      this.offlineSync.enqueueMutation({
        entity: 'category',
        action: 'update',
        userId,
        docId: id,
        payload
      });
    }
  }

  async deleteCategory(id: string): Promise<void> {
    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');
      await this.afs.doc(`categories/${id}`).delete();
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const scopeKey = this.findScopeKeyForCategory(id);
      if (!scopeKey) throw error;

      const userId = this.findUserIdByScopeKey(scopeKey);
      if (!userId) throw error;

      this.updateLocalCategories(scopeKey, current => current.filter(item => item.id !== id));
      this.offlineSync.enqueueMutation({
        entity: 'category',
        action: 'delete',
        userId,
        docId: id
      });
    }
  }

  private ensureServerSubscription(userId: string, scope: WorkspaceScope, scopeKey: string): void {
    if (this.serverSubs.has(scopeKey)) return;

    const sub = this.afs.collection<Category>('categories', ref =>
      ref.where('userId', '==', userId)
    ).snapshotChanges().pipe(
      map(actions =>
        actions.map(a => {
          const data = a.payload.doc.data();
          const id = a.payload.doc.id;
          return {
            id,
            name: data.name ?? '',
            icon: data.icon ?? '',
            color: data.color ?? '',
            userId: data.userId ?? '',
            workspaceType: data.workspaceType ?? 'personal',
            workspaceId: data.workspaceId ?? 'personal',
            isDefault: data.isDefault ?? false,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
          } as Category;
        })
      )
    ).subscribe(categories => {
      const scopedCategories = categories
        .filter(item => this.matchesCategoryScope(item, scope))
        .sort((a, b) => a.name.localeCompare(b.name));
      const stream = this.streams.get(scopeKey);
      if (stream) {
        stream.next(scopedCategories);
      }
      this.writeCachedCategories(scopeKey, scopedCategories);
    });

    this.serverSubs.set(scopeKey, sub);
  }

  private readCachedCategories(scopeKey: string): Category[] {
    const key = this.offlineSync.cacheCategoriesKey(scopeKey);
    const cached = this.offlineSync.readCache<any[]>(key, []);
    return cached.map(item => ({
      ...item,
      createdAt: item?.createdAt ? new Date(item.createdAt) : new Date(),
      workspaceType: item?.workspaceType ?? 'personal',
      workspaceId: item?.workspaceId ?? 'personal'
    })) as Category[];
  }

  private writeCachedCategories(scopeKey: string, categories: Category[]): void {
    const key = this.offlineSync.cacheCategoriesKey(scopeKey);
    this.offlineSync.writeCache(key, categories);
  }

  private updateLocalCategories(scopeKey: string, updater: (current: Category[]) => Category[]): void {
    let stream = this.streams.get(scopeKey);
    if (!stream) {
      stream = new BehaviorSubject<Category[]>(this.readCachedCategories(scopeKey));
      this.streams.set(scopeKey, stream);
    }
    const next = updater(stream.value);
    stream.next(next);
    this.writeCachedCategories(scopeKey, next);
  }

  private findScopeKeyForCategory(categoryId: string): string | null {
    for (const [scopeKey, stream] of this.streams.entries()) {
      if (stream.value.some(item => item.id === categoryId)) {
        return scopeKey;
      }
    }
    return null;
  }

  private findUserIdByScopeKey(scopeKey: string): string | null {
    const [userId] = scopeKey.split('::');
    return userId || null;
  }

  private normalizeCategoryInput(category: Omit<Category, 'id'>): Omit<Category, 'id'> {
    const scope = this.resolveScope(category);
    return {
      ...category,
      createdAt: category.createdAt ? new Date(category.createdAt) : new Date(),
      isDefault: !!category.isDefault,
      workspaceType: scope.workspaceType,
      workspaceId: scope.workspaceId
    };
  }

  private normalizePartialCategory(category: Partial<Category>): Partial<Category> {
    const payload: Partial<Category> = { ...category };
    if (category.createdAt) payload.createdAt = new Date(category.createdAt);
    if (category.workspaceType || category.workspaceId) {
      const scope = this.resolveScope(category);
      payload.workspaceType = scope.workspaceType;
      payload.workspaceId = scope.workspaceId;
    }
    return payload;
  }

  private shouldQueue(error: any): boolean {
    if (!this.offlineSync.isOnline()) return true;
    const code = String(error?.code || '').toLowerCase();
    return code.includes('unavailable') || code.includes('network') || code.includes('deadline-exceeded');
  }

  private async flushPendingMutations(): Promise<void> {
    if (this.isFlushing || !this.offlineSync.isOnline()) return;

    this.isFlushing = true;
    try {
      const mutations = this.offlineSync.getMutations('category');
      for (const mutation of mutations) {
        const applied = await this.applyMutation(mutation);
        if (!applied) break;
        this.offlineSync.removeMutation(mutation.id);
      }
    } finally {
      this.isFlushing = false;
      this.offlineSync.triggerSyncTick();
    }
  }

  private async applyMutation(mutation: OfflineMutation): Promise<boolean> {
    try {
      if (mutation.action === 'add') {
        const payload = this.normalizeCategoryInput(mutation.payload as Omit<Category, 'id'>);
        const ref = await this.afs.collection('categories').add(payload);

        if (mutation.tempId) {
          this.offlineSync.replaceMutationDocId('category', mutation.tempId, ref.id);
          this.offlineSync.remapExpenseCategoryIdInQueue(mutation.tempId, ref.id);
          this.offlineSync.remapExpenseCategoryIdInCache(mutation.tempId, ref.id);

          const scopeKey = this.getScopeKey(mutation.userId, this.resolveScope(payload));
          this.updateLocalCategories(scopeKey, current =>
            current
              .map(item => (item.id === mutation.tempId ? { ...item, id: ref.id } : item))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      }

      if (mutation.action === 'update' && mutation.docId) {
        const payload = this.normalizePartialCategory(mutation.payload || {});
        await this.afs.doc(`categories/${mutation.docId}`).update(payload);
      }

      if (mutation.action === 'delete' && mutation.docId) {
        await this.afs.doc(`categories/${mutation.docId}`).delete();
      }

      return true;
    } catch {
      return false;
    }
  }

  private resolveScope(source?: Partial<Category> | WorkspaceScope | null): WorkspaceScope {
    return {
      workspaceType: source?.workspaceType || this.personalScope.workspaceType,
      workspaceId: (source?.workspaceId || this.personalScope.workspaceId).trim()
    };
  }

  private getScopeKey(userId: string, scope: WorkspaceScope): string {
    return `${userId}::${scope.workspaceType}::${scope.workspaceId}`;
  }

  private matchesCategoryScope(category: Category, scope: WorkspaceScope): boolean {
    const itemType = category.workspaceType || this.personalScope.workspaceType;
    const itemId = category.workspaceId || this.personalScope.workspaceId;
    return itemType === scope.workspaceType && itemId === scope.workspaceId;
  }
}
