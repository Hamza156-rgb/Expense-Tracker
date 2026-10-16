import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { AccountMode, User } from '../models/models';
import { CategoryService } from './category.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  user$: Observable<User | null>;

  constructor(
    private afAuth: AngularFireAuth,
    private afs: AngularFirestore,
    private router: Router,
    private categoryService: CategoryService
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
    await this.categoryService.seedDefaultCategories(uid, { workspaceType: 'personal', workspaceId: 'personal' });
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

  async updateUserBudget(userId: string, budget: number | null, mode: AccountMode): Promise<void> {
    const field = mode === 'business' ? 'businessBudget' : mode === 'tour' ? 'tourBudget' : 'personalBudget';
    await this.afs.doc(`users/${userId}`).update({ [field]: budget });
  }

  getCurrentUser() {
    return this.afAuth.currentUser;
  }

  getAuthState() {
    return this.afAuth.authState;
  }
}
