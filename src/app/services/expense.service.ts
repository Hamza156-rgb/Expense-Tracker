import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable, combineLatest } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Expense, ExpenseFilter, Category } from '../models/models';
import firebase from 'firebase/compat/app';
import { Timestamp } from 'firebase/firestore';


@Injectable({ providedIn: 'root' })
export class ExpenseService {

  constructor(private afs: AngularFirestore) {}

  getExpenses(userId: string): Observable<Expense[]> {
    return this.afs.collection<Expense>('expenses', ref =>
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
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
          } as Expense;
        })
      )
    );
  }

  getFilteredExpenses(userId: string, filter: ExpenseFilter): Observable<Expense[]> {
    return this.getExpenses(userId).pipe(
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
    await this.afs.collection('expenses').add({
      ...expense,
      date: firebase.firestore.Timestamp.fromDate(new Date(expense.date)),
      createdAt: firebase.firestore.Timestamp.fromDate(new Date())
    });
  }

  async updateExpense(id: string, expense: Partial<Expense>): Promise<void> {
    const updateData: any = { ...expense };
    if (expense.date) {
      updateData.date = firebase.firestore.Timestamp.fromDate(new Date(expense.date));
    }
    await this.afs.doc(`expenses/${id}`).update(updateData);
  }

  async deleteExpense(id: string): Promise<void> {
    await this.afs.doc(`expenses/${id}`).delete();
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
}
