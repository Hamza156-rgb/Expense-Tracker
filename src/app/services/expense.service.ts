import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Expense, ExpenseFilter, WorkspaceScope } from '../models/models';
import firebase from 'firebase/compat/app';
import { Timestamp } from 'firebase/firestore';
import { OfflineMutation, OfflineSyncService } from './offline-sync.service';


@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private streams = new Map<string, BehaviorSubject<Expense[]>>();
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

    this.offlineSync.syncTick$.subscribe(() => {
      if (this.offlineSync.isOnline()) {
        this.flushPendingMutations();
      }
    });
  }

  getExpenses(userId: string, scope?: WorkspaceScope): Observable<Expense[]> {
    const resolvedScope = this.resolveScope(scope);
    const scopeKey = this.getScopeKey(userId, resolvedScope);

    let stream = this.streams.get(scopeKey);
    if (!stream) {
      stream = new BehaviorSubject<Expense[]>(this.readCachedExpenses(scopeKey));
      this.streams.set(scopeKey, stream);
    }

    this.ensureServerSubscription(userId, resolvedScope, scopeKey);
    if (this.offlineSync.isOnline()) {
      this.flushPendingMutations();
    }

    return stream.asObservable();
  }

  getFilteredExpenses(userId: string, filter: ExpenseFilter, scope?: WorkspaceScope): Observable<Expense[]> {
    return this.getExpenses(userId, scope).pipe(
      map(expenses => {
        let filtered = expenses;

        if (filter.categoryIds && filter.categoryIds.length > 0) {
          filtered = filtered.filter(e => filter.categoryIds!.includes(e.categoryId));
        }

        if (filter.startDate) {
          filtered = filtered.filter(e => new Date(e.date) >= filter.startDate!);
        }

        if (filter.endDate) {
          const endDate = new Date(filter.endDate);
          endDate.setHours(23, 59, 59, 999);
          filtered = filtered.filter(e => new Date(e.date) <= endDate);
        }

        return filtered;
      })
    );
  }

  async addExpense(expense: Omit<Expense, 'id'>): Promise<void> {
    const normalized = this.normalizeExpenseInput(expense);
    const scopeKey = this.getScopeKey(normalized.userId, this.resolveScope(normalized));
    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');

      await this.afs.collection('expenses').add({
        ...normalized,
        date: firebase.firestore.Timestamp.fromDate(normalized.date),
        createdAt: firebase.firestore.Timestamp.fromDate(normalized.createdAt)
      });
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const tempId = `tmp-exp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const optimistic: Expense = { ...normalized, id: tempId };
      this.updateLocalExpenses(scopeKey, current => [optimistic, ...current]);

      this.offlineSync.enqueueMutation({
        entity: 'expense',
        action: 'add',
        userId: normalized.userId,
        tempId,
        payload: normalized
      });
    }
  }

  async updateExpense(id: string, expense: Partial<Expense>): Promise<void> {
    const payload = this.normalizePartialExpense(expense);
    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');

      const updateData: any = { ...payload };
      if (payload.date) {
        updateData.date = firebase.firestore.Timestamp.fromDate(new Date(payload.date));
      }
      await this.afs.doc(`expenses/${id}`).update(updateData);
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const scopeKey =
        this.findScopeKeyForExpense(id) ||
        (payload.userId ? this.getScopeKey(payload.userId, this.resolveScope(payload)) : null);
      if (!scopeKey) throw error;

      this.updateLocalExpenses(scopeKey, current =>
        current.map(item => (item.id === id ? { ...item, ...payload } as Expense : item))
      );

      const userId = payload.userId || this.findUserIdByScopeKey(scopeKey);
      if (!userId) throw error;

      this.offlineSync.enqueueMutation({
        entity: 'expense',
        action: 'update',
        userId,
        docId: id,
        payload
      });
    }
  }

  async deleteExpense(id: string): Promise<void> {
    try {
      if (!this.offlineSync.isOnline()) throw new Error('offline');
      await this.afs.doc(`expenses/${id}`).delete();
    } catch (error: any) {
      if (!this.shouldQueue(error)) throw error;

      const scopeKey = this.findScopeKeyForExpense(id);
      if (!scopeKey) throw error;

      const userId = this.findUserIdByScopeKey(scopeKey);
      if (!userId) throw error;

      this.updateLocalExpenses(scopeKey, current => current.filter(item => item.id !== id));
      this.offlineSync.enqueueMutation({
        entity: 'expense',
        action: 'delete',
        userId,
        docId: id
      });
    }
  }

  getTotalByCategory(expenses: Expense[]): { [key: string]: number } {
    const totals: { [key: string]: number } = {};
    expenses.forEach(e => {
      totals[e.categoryId] = (totals[e.categoryId] || 0) + e.amount;
    });
    return totals;
  }

  getTotalAmount(expenses: Expense[]): number {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  private ensureServerSubscription(userId: string, scope: WorkspaceScope, scopeKey: string): void {
    if (this.serverSubs.has(scopeKey)) return;

    const sub = this.afs.collection<Expense>('expenses', ref =>
      ref.where('userId', '==', userId)
    ).snapshotChanges().pipe(
      map(actions =>
        actions.map(a => {
          const data = a.payload.doc.data();
          const id = a.payload.doc.id;
          return {
            id,
            title: data.title ?? '',
            amount: data.amount ?? 0,
            categoryId: data.categoryId ?? '',
            categoryName: data.categoryName ?? '',
            categoryIcon: data.categoryIcon ?? '',
            categoryColor: data.categoryColor ?? '',
            date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
            notes: data.notes ?? '',
            userId: data.userId ?? '',
            workspaceType: data.workspaceType ?? 'personal',
            workspaceId: data.workspaceId ?? 'personal',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
          } as Expense;
        })
      )
    ).subscribe(expenses => {
      const scopedExpenses = expenses.filter(item => this.matchesExpenseScope(item, scope));
      const sorted = this.sortExpenses(scopedExpenses);

      const stream = this.streams.get(scopeKey);
      if (stream) {
        stream.next(sorted);
      }
      this.writeCachedExpenses(scopeKey, sorted);
    });

    this.serverSubs.set(scopeKey, sub);
  }

  private readCachedExpenses(scopeKey: string): Expense[] {
    const key = this.offlineSync.cacheExpensesKey(scopeKey);
    const cached = this.offlineSync.readCache<any[]>(key, []);
    return cached.map(item => ({
      ...item,
      date: item?.date ? new Date(item.date) : new Date(),
      createdAt: item?.createdAt ? new Date(item.createdAt) : new Date(),
      workspaceType: item?.workspaceType ?? 'personal',
      workspaceId: item?.workspaceId ?? 'personal'
    })) as Expense[];
  }

  private writeCachedExpenses(scopeKey: string, expenses: Expense[]): void {
    const key = this.offlineSync.cacheExpensesKey(scopeKey);
    this.offlineSync.writeCache(key, expenses);
  }

  private updateLocalExpenses(scopeKey: string, updater: (current: Expense[]) => Expense[]): void {
    let stream = this.streams.get(scopeKey);
    if (!stream) {
      stream = new BehaviorSubject<Expense[]>(this.readCachedExpenses(scopeKey));
      this.streams.set(scopeKey, stream);
    }
    const next = updater(stream.value);
    const sorted = this.sortExpenses(next);
    stream.next(sorted);
    this.writeCachedExpenses(scopeKey, sorted);
  }

  private sortExpenses(expenses: Expense[]): Expense[] {
    return [...expenses].sort((a, b) => {
      const t1 = new Date(a.date).getTime();
      const t2 = new Date(b.date).getTime();
      if (t1 !== t2) return t2 - t1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  private findScopeKeyForExpense(expenseId: string): string | null {
    for (const [scopeKey, stream] of this.streams.entries()) {
      if (stream.value.some(item => item.id === expenseId)) {
        return scopeKey;
      }
    }
    return null;
  }

  private findUserIdByScopeKey(scopeKey: string): string | null {
    const [userId] = scopeKey.split('::');
    return userId || null;
  }

  private normalizeExpenseInput(expense: Omit<Expense, 'id'>): Omit<Expense, 'id'> {
    const scope = this.resolveScope(expense);
    return {
      ...expense,
      date: new Date(expense.date),
      createdAt: expense.createdAt ? new Date(expense.createdAt) : new Date(),
      notes: expense.notes || '',
      workspaceType: scope.workspaceType,
      workspaceId: scope.workspaceId
    };
  }

  private normalizePartialExpense(expense: Partial<Expense>): Partial<Expense> {
    const payload: Partial<Expense> = { ...expense };
    if (expense.date) payload.date = new Date(expense.date);
    if (expense.createdAt) payload.createdAt = new Date(expense.createdAt);
    if (expense.workspaceType || expense.workspaceId) {
      const scope = this.resolveScope(expense);
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
    if (this.offlineSync.hasPendingEntity('category')) return;

    this.isFlushing = true;
    try {
      const mutations = this.offlineSync.getMutations('expense');
      for (const mutation of mutations) {
        const applied = await this.applyMutation(mutation);
        if (!applied) break;
        this.offlineSync.removeMutation(mutation.id);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async applyMutation(mutation: OfflineMutation): Promise<boolean> {
    try {
      if (mutation.action === 'add') {
        const payload = this.normalizeExpenseInput(mutation.payload as Omit<Expense, 'id'>);
        const ref = await this.afs.collection('expenses').add({
          ...payload,
          date: firebase.firestore.Timestamp.fromDate(new Date(payload.date)),
          createdAt: firebase.firestore.Timestamp.fromDate(new Date(payload.createdAt))
        });

        if (mutation.tempId) {
          this.offlineSync.replaceMutationDocId('expense', mutation.tempId, ref.id);
          const scopeKey = this.getScopeKey(mutation.userId, this.resolveScope(payload));
          this.updateLocalExpenses(scopeKey, current =>
            current.map(item => (item.id === mutation.tempId ? { ...item, id: ref.id } : item))
          );
        }
      }

      if (mutation.action === 'update' && mutation.docId) {
        const payload = this.normalizePartialExpense(mutation.payload || {});
        const updateData: any = { ...payload };
        if (payload.date) {
          updateData.date = firebase.firestore.Timestamp.fromDate(new Date(payload.date));
        }
        await this.afs.doc(`expenses/${mutation.docId}`).update(updateData);
      }

      if (mutation.action === 'delete' && mutation.docId) {
        await this.afs.doc(`expenses/${mutation.docId}`).delete();
      }

      return true;
    } catch {
      return false;
    }
  }

  private resolveScope(source?: Partial<Expense> | WorkspaceScope | null): WorkspaceScope {
    return {
      workspaceType: source?.workspaceType || this.personalScope.workspaceType,
      workspaceId: (source?.workspaceId || this.personalScope.workspaceId).trim()
    };
  }

  private getScopeKey(userId: string, scope: WorkspaceScope): string {
    return `${userId}::${scope.workspaceType}::${scope.workspaceId}`;
  }

  private matchesExpenseScope(expense: Expense, scope: WorkspaceScope): boolean {
    const itemType = expense.workspaceType || this.personalScope.workspaceType;
    const itemId = expense.workspaceId || this.personalScope.workspaceId;
    return itemType === scope.workspaceType && itemId === scope.workspaceId;
  }
}
