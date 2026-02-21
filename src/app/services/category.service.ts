import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Category } from '../models/models';
import { Timestamp } from 'firebase/firestore';


@Injectable({ providedIn: 'root' })
export class CategoryService {

  constructor(private afs: AngularFirestore) {}

  getCategories(userId: string): Observable<Category[]> {
    return this.afs.collection<Category>('categories', ref =>
      ref.where('userId', '==', userId).orderBy('name')
    ).snapshotChanges().pipe(
      map(actions =>
        actions.map(a => {
          const data = a.payload.doc.data();
          const id = a.payload.doc.id;
          // ensure required fields exist
          return {
            id,
            name: data.name ?? '',
            icon: data.icon ?? '',
            color: data.color ?? '',
            userId: data.userId ?? '',
            isDefault: data.isDefault ?? false,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()          } as Category;
        })
      )
    );
  }

  async addCategory(category: Omit<Category, 'id'>): Promise<void> {
    await this.afs.collection('categories').add(category);
  }

  async updateCategory(id: string, category: Partial<Category>): Promise<void> {
    await this.afs.doc(`categories/${id}`).update(category);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.afs.doc(`categories/${id}`).delete();
  }
}
