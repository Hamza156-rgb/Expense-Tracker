import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { Observable, from, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { User } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  user$: Observable<User | null>;

  constructor(
    private afAuth: AngularFireAuth,
    private afs: AngularFirestore,
    private router: Router
  ) {
    this.user$ = this.afAuth.authState.pipe(
      switchMap(user => {
        if (user) {
          return this.afs.doc<User>(`users/${user.uid}`).valueChanges().pipe(
            map(u => u ? { ...u, uid: user.uid } : null)
          );
        }
        return of(null);
      })
    );
  }

  async signUp(firstName: string, lastName: string, email: string, password: string): Promise<void> {
    const credential = await this.afAuth.createUserWithEmailAndPassword(email, password);
    const uid = credential.user!.uid;

    const userData: User = {
      uid,
      firstName,
      lastName,
      email,
      createdAt: new Date(),
      accountMode: 'personal'
    };

    await this.afs.doc(`users/${uid}`).set(userData);

    // Create default categories for the user
    await this.createDefaultCategories(uid);
  }

  async login(email: string, password: string): Promise<void> {
    await this.afAuth.signInWithEmailAndPassword(email, password);
  }

  async resetPassword(email: string): Promise<void> {
    await this.afAuth.sendPasswordResetEmail(email);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const user = await this.afAuth.currentUser;
    if (user) {
      await user.updatePassword(newPassword);
    } else {
      throw new Error('No user logged in.');
    }
  }

  async logout(): Promise<void> {
    await this.afAuth.signOut();
    await this.router.navigate(['/login']);
  }

  getCurrentUser() {
    return this.afAuth.currentUser;
  }

  getAuthState() {
    return this.afAuth.authState;
  }

  private async createDefaultCategories(userId: string): Promise<void> {
    const defaultCategories = [
      { name: 'Food & Dining', icon: 'restaurant', color: '#ef4444' },
      { name: 'Transportation', icon: 'car', color: '#f59e0b' },
      { name: 'Shopping', icon: 'bag-handle', color: '#8b5cf6' },
      { name: 'Entertainment', icon: 'game-controller', color: '#3b82f6' },
      { name: 'Health', icon: 'medical', color: '#10b981' },
      { name: 'Bills & Utilities', icon: 'receipt', color: '#f97316' },
      { name: 'Education', icon: 'book', color: '#06b6d4' },
      { name: 'Other', icon: 'ellipsis-horizontal', color: '#64748b' },
    ];

    const batch = this.afs.firestore.batch();
    defaultCategories.forEach(cat => {
      const ref = this.afs.collection('categories').doc().ref;
      batch.set(ref, {
        ...cat,
        userId,
        workspaceType: 'personal',
        workspaceId: 'personal',
        isDefault: true,
        createdAt: new Date()
      });
    });
    await batch.commit();
  }
}
