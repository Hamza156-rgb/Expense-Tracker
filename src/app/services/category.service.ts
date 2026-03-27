import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Category } from '../models/models';
import { Timestamp } from 'firebase/firestore';
import { OfflineMutation, OfflineSyncService } from './offline-sync.service';


@Injectable({ providedIn: 'root' })
export class CategoryService {
  private streams = new Map<string, BehaviorSubject<Category[]>>();
  private serverSubs = new Map<string, Subscription>();
  private isFlushing = false;

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

  getCategories(userId: string): Observable<Category[]> {
    let stream = this.streams.get(userId);
    if (!stream) {
      stream = new BehaviorSubject<Category[]>(this.readCachedCategories(userId));
      this.streams.set(userId, stream);
    }

    this.ensureServerSubscription(userId);
    if (this.offlineSync.isOnline()) {
      this.flushPendingMutations();
    }

    return stream.asObservable();
  }

  async addCategory(category: Omit<Category, 'id'>): Promise<void> {
    const normalized = this.normalizeCategoryInput(category);
    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');
      await this.afs.collection('categories').add(normalized);
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const tempId = `tmp-cat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const optimistic: Category = { ...normalized, id: tempId };
      this.updateLocalCategories(normalized.userId, current =>
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
    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');
      await this.afs.doc(`categories/${id}`).update(payload);
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const userId = payload.userId || this.findUserIdForCategory(id);
      if (!userId) throw error;

      this.updateLocalCategories(userId, current =>
        current
          .map(item => (item.id === id ? { ...item, ...payload } as Category : item))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

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

      const userId = this.findUserIdForCategory(id);
      if (!userId) throw error;

      this.updateLocalCategories(userId, current => current.filter(item => item.id !== id));
      this.offlineSync.enqueueMutation({
        entity: 'category',
        action: 'delete',
        userId,
        docId: id
      });
    }
  }

  private ensureServerSubscription(userId: string): void {
    if (this.serverSubs.has(userId)) return;

    const sub = this.afs.collection<Category>('categories', ref =>
      ref.where('userId', '==', userId).orderBy('name')
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
            isDefault: data.isDefault ?? false,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
          } as Category;
        })
      )
    ).subscribe(categories => {
      const stream = this.streams.get(userId);
      if (stream) {
        stream.next(categories);
      }
      this.writeCachedCategories(userId, categories);
    });

    this.serverSubs.set(userId, sub);
  }

  private readCachedCategories(userId: string): Category[] {
    const key = this.offlineSync.cacheCategoriesKey(userId);
    const cached = this.offlineSync.readCache<any[]>(key, []);
    return cached.map(item => ({
      ...item,
      createdAt: item?.createdAt ? new Date(item.createdAt) : new Date()
    })) as Category[];
  }

  private writeCachedCategories(userId: string, categories: Category[]): void {
    const key = this.offlineSync.cacheCategoriesKey(userId);
    this.offlineSync.writeCache(key, categories);
  }

  private updateLocalCategories(userId: string, updater: (current: Category[]) => Category[]): void {
    let stream = this.streams.get(userId);
    if (!stream) {
      stream = new BehaviorSubject<Category[]>(this.readCachedCategories(userId));
      this.streams.set(userId, stream);
    }
    const next = updater(stream.value);
    stream.next(next);
    this.writeCachedCategories(userId, next);
  }

  private findUserIdForCategory(categoryId: string): string | null {
    for (const [userId, stream] of this.streams.entries()) {
      if (stream.value.some(item => item.id === categoryId)) {
        return userId;
      }
    }
    return null;
  }

  private normalizeCategoryInput(category: Omit<Category, 'id'>): Omit<Category, 'id'> {
    return {
      ...category,
      createdAt: category.createdAt ? new Date(category.createdAt) : new Date(),
      isDefault: !!category.isDefault
    };
  }

  private normalizePartialCategory(category: Partial<Category>): Partial<Category> {
    const payload: Partial<Category> = { ...category };
    if (category.createdAt) payload.createdAt = new Date(category.createdAt);
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

          this.updateLocalCategories(mutation.userId, current =>
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
}
