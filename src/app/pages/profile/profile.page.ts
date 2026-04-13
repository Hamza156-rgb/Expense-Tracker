import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController, LoadingController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ExpenseService } from '../../services/expense.service';
import { SettingsService } from '../../services/settings.service';
import { User, Expense, WorkspaceScope } from '../../models/models';
import { ChangePasswordModalComponent } from './change-password-modal/change-password-modal.component';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss']
})
export class ProfilePage implements OnInit, OnDestroy {
  user: User | null = null;
  totalExpenses = 0;
  totalAmount = 0;
  thisMonthAmount = 0;
  avgPerDay = 0;
  private expenseSub?: Subscription;
  
  // Budget-related properties
  budget: number | null = null;
  showBudgetModal = false;
  budgetInput: number | null = null;
  readonly Math = Math;

  constructor(
    private authService: AuthService,
    private expenseService: ExpenseService,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private router: Router,
    private settingsService: SettingsService,
    private loadingCtrl: LoadingController
  ) { }

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      this.expenseSub?.unsubscribe();
      this.totalExpenses = 0;
      this.totalAmount = 0;
      this.thisMonthAmount = 0;
      this.avgPerDay = 0;
      if (user) {
        this.updateBudgetFromUser(user);
        this.expenseSub = this.expenseService
          .getExpenses(user.uid, this.getWorkspaceScope(user))
          .subscribe(expenses => this.calculateStats(expenses));
      } else {
        this.budget = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.expenseSub?.unsubscribe();
  }

  calculateStats(expenses: Expense[]) {
    this.totalExpenses = expenses.length;
    this.totalAmount = this.expenseService.getTotalAmount(expenses);

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthExpenses = expenses.filter(e => new Date(e.date) >= monthStart);
    this.thisMonthAmount = this.expenseService.getTotalAmount(monthExpenses);

    if (expenses.length > 0) {
      const dates = expenses.map(e => new Date(e.date).getTime());
      const minDate = new Date(Math.min(...dates));
      const daysDiff = Math.max(1, Math.ceil((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
      this.avgPerDay = this.totalAmount / daysDiff;
    } else {
      this.avgPerDay = 0;
    }
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Logout',
      message: 'Are you sure you want to sign out?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Logout', role: 'destructive', handler: () => this.authService.logout() }
      ]
    });
    await alert.present();
  }

  async changePassword() {
    // Moved to SettingsPage
  }

  goBack() {
    this.router.navigate(['/tabs/dashboard']);
  }

  formatCurrency(amount: number): string {
    return this.settingsService.formatCurrency(amount);
  }

  get memberSince(): string {
    if (!this.user?.createdAt) return '';

    // Check if createdAt is a Firestore timestamp object
    const date =
      // If it's a JS Date already
      this.user.createdAt instanceof Date
        ? this.user.createdAt
        : // If it's Firestore timestamp object {seconds, nanoseconds}
        new Date((this.user.createdAt as any).seconds * 1000);

    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  get initials(): string {
    return `${this.user?.firstName?.charAt(0) || ''}${this.user?.lastName?.charAt(0) || ''}`;
  }

  get modeLabel(): string {
    return this.user?.accountMode === 'business' ? 'Business' : 'Personal';
  }

  get modeSubLabel(): string {
    if (this.user?.accountMode === 'business') {
      return this.user?.businessName?.trim() || 'Shop Mode';
    }
    return 'Private Expense Tracking';
  }

  private getWorkspaceScope(user: User): WorkspaceScope {
    if (user.accountMode === 'business') {
      return {
        workspaceType: 'business',
        workspaceId: user.businessWorkspaceId || this.toBusinessWorkspaceId(user.businessName)
      };
    }
    return { workspaceType: 'personal', workspaceId: 'personal' };
  }

  private toBusinessWorkspaceId(name?: string): string {
    const slug = (name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug ? `shop-${slug}` : 'shop-default';
  }

  // Budget-related methods
  private updateBudgetFromUser(user: User) {
    if (user.accountMode === 'business') {
      this.budget = user.businessBudget || null;
    } else {
      this.budget = user.personalBudget || null;
    }
  }

  get monthProgress(): number {
    if (!this.budget || this.budget <= 0) return 0;
    const pct = (this.thisMonthAmount / this.budget) * 100;
    return pct > 100 ? 100 : Math.round(pct);
  }

  get budgetProgress(): number {
    if (!this.budget || this.budget <= 0) return 0;
    const pct = (this.thisMonthAmount / this.budget) * 100;
    return Math.round(pct * 10) / 10; // One decimal place
  }

  get isOverBudget(): boolean {
    return this.budget !== null && this.budget > 0 && this.thisMonthAmount > this.budget;
  }

  openBudgetModal() {
    this.budgetInput = this.budget;
    this.showBudgetModal = true;
  }

  closeBudgetModal() {
    this.showBudgetModal = false;
    this.budgetInput = null;
  }

  async saveBudget() {
    if (this.budgetInput !== null && this.budgetInput >= 0) {
      const loading = await this.loadingCtrl.create({
        message: 'Saving budget...',
        spinner: 'crescent'
      });
      await loading.present();
      try {
        const uid = this.user?.uid;
        const mode = this.user?.accountMode === 'business' ? 'business' : 'personal';
        if (uid) {
          await this.authService.updateUserBudget(uid, this.budgetInput, mode);
          this.budget = this.budgetInput;
          this.showBudgetModal = false;
          this.budgetInput = null;
          await loading.dismiss();
          this.showToast('Budget saved successfully', 'success');
        }
      } catch (err) {
        await loading.dismiss();
        this.showToast('Failed to save budget', 'danger');
      }
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'top' });
    toast.present();
  }
}
