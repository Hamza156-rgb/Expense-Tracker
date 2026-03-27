import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export type OfflineEntity = 'expense' | 'category';
export type OfflineAction = 'add' | 'update' | 'delete';

export interface OfflineMutation {
  id: string;
  entity: OfflineEntity;
  action: OfflineAction;
  userId: string;
  docId?: string;
  tempId?: string;
  payload?: any;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly queueKey = 'mm_pending_mutations_v1';
  private readonly cachePrefixExpenses = 'mm_cache_expenses_';
  private readonly cachePrefixCategories = 'mm_cache_categories_';

  private readonly onlineState = new BehaviorSubject<boolean>(this.getInitialOnlineState());
  readonly online$ = this.onlineState.asObservable();

  private readonly syncTick = new Subject<void>();
  readonly syncTick$ = this.syncTick.asObservable();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.onlineState.next(true));
      window.addEventListener('offline', () => this.onlineState.next(false));
    }
  }

  isOnline(): boolean {
    return this.onlineState.value;
  }

  triggerSyncTick(): void {
    this.syncTick.next();
  }

  cacheExpensesKey(userId: string): string {
    return `${this.cachePrefixExpenses}${userId}`;
  }

  cacheCategoriesKey(userId: string): string {
    return `${this.cachePrefixCategories}${userId}`;
  }

  readCache<T>(key: string, fallback: T): T {
    if (typeof localStorage === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  writeCache<T>(key: string, value: T): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore cache write failures
    }
  }

  enqueueMutation(mutation: Omit<OfflineMutation, 'id' | 'createdAt'>): OfflineMutation {
    const next: OfflineMutation = {
      ...mutation,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now()
    };
    const queue = this.getMutations();
    queue.push(next);
    this.writeQueue(queue);
    return next;
  }

  getMutations(entity?: OfflineEntity): OfflineMutation[] {
    const queue = this.readQueue();
    const filtered = entity ? queue.filter(m => m.entity === entity) : queue;
    return filtered.sort((a, b) => a.createdAt - b.createdAt);
  }

  hasPendingEntity(entity: OfflineEntity): boolean {
    return this.getMutations(entity).length > 0;
  }

  removeMutation(mutationId: string): void {
    const queue = this.readQueue().filter(m => m.id !== mutationId);
    this.writeQueue(queue);
  }

  replaceMutationDocId(entity: OfflineEntity, fromId: string, toId: string): void {
    const queue = this.readQueue().map(m => {
      if (m.entity !== entity) return m;
      if (m.docId === fromId) {
        return { ...m, docId: toId };
      }
      return m;
    });
    this.writeQueue(queue);
  }

  remapExpenseCategoryIdInQueue(fromCategoryId: string, toCategoryId: string): void {
    const queue = this.readQueue().map(m => {
      if (m.entity !== 'expense' || !m.payload) return m;
      if (m.payload.categoryId === fromCategoryId) {
        return {
          ...m,
          payload: { ...m.payload, categoryId: toCategoryId }
        };
      }
      return m;
    });
    this.writeQueue(queue);
  }

  remapExpenseCategoryIdInCache(fromCategoryId: string, toCategoryId: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.cachePrefixExpenses));
      keys.forEach(key => {
        const items = this.readCache<any[]>(key, []);
        const updated = items.map(item =>
          item?.categoryId === fromCategoryId ? { ...item, categoryId: toCategoryId } : item
        );
        this.writeCache(key, updated);
      });
    } catch {
      // Ignore cache remap failures
    }
  }

  private getInitialOnlineState(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  private readQueue(): OfflineMutation[] {
    return this.readCache<OfflineMutation[]>(this.queueKey, []);
  }

  private writeQueue(queue: OfflineMutation[]): void {
    this.writeCache(this.queueKey, queue);
  }
}

