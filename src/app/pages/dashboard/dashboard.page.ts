import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { Subscription, combineLatest } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ExpenseService } from '../../services/expense.service';
import { CategoryService } from '../../services/category.service';
import { ExportService } from '../../services/export.service';
import { Expense, Category, ExpenseFilter, User } from '../../models/models';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss']
})
export class DashboardPage implements OnInit, OnDestroy {
  user: User | null = null;
  expenses: Expense[] = [];
  filteredExpenses: Expense[] = [];
  categories: Category[] = [];

  filterActive = false;
  selectedCategoryIds: string[] = [];
  startDateStr = '';
  endDateStr = '';
  showFilterPanel = false;

  totalAmount = 0;
  todayAmount = 0;
  monthAmount = 0;

  private subs: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private exportService: ExportService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private router: Router
  ) {}

  ngOnInit() {
    const userSub = this.authService.user$.subscribe(user => {
      this.user = user;
      if (user) {
        this.loadData(user.uid);
      }
    });
    this.subs.push(userSub);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  // Safe initials — never crashes even if user is null
  get initials(): string {
    const f = (this.user?.firstName || '').trim();
    const l = (this.user?.lastName || '').trim();
    return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
  }

  loadData(userId: string) {
    const combined = combineLatest([
      this.expenseService.getExpenses(userId),
      this.categoryService.getCategories(userId)
    ]).subscribe(([expenses, categories]) => {
      this.expenses = expenses;
      this.categories = categories;
      this.applyFilter();
      this.calculateStats();
    });
    this.subs.push(combined);
  }

  applyFilter() {
    let filtered = [...this.expenses];

    if (this.selectedCategoryIds.length > 0) {
      filtered = filtered.filter(e => this.selectedCategoryIds.includes(e.categoryId));
    }
    if (this.startDateStr) {
      const start = new Date(this.startDateStr);
      filtered = filtered.filter(e => new Date(e.date) >= start);
    }
    if (this.endDateStr) {
      const end = new Date(this.endDateStr);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(e => new Date(e.date) <= end);
    }

    this.filteredExpenses = filtered;
    this.filterActive = this.selectedCategoryIds.length > 0 || !!this.startDateStr || !!this.endDateStr;
    this.totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0);
  }

  calculateStats() {
    const todayStr = new Date().toDateString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    this.todayAmount = this.expenses
      .filter(e => new Date(e.date).toDateString() === todayStr)
      .reduce((s, e) => s + e.amount, 0);

    this.monthAmount = this.expenses
      .filter(e => new Date(e.date) >= monthStart)
      .reduce((s, e) => s + e.amount, 0);
  }

  getCategoryName(catId: string): string {
    return this.categories.find(c => c.id === catId)?.name || 'Uncategorized';
  }

  getCategoryColor(catId: string): string {
    return this.categories.find(c => c.id === catId)?.color || '#64748b';
  }

  getCategoryIcon(catId: string): string {
    return this.categories.find(c => c.id === catId)?.icon || 'ellipsis-horizontal';
  }

  toggleCategoryFilter(catId: string) {
    const idx = this.selectedCategoryIds.indexOf(catId);
    if (idx > -1) {
      this.selectedCategoryIds.splice(idx, 1);
    } else {
      this.selectedCategoryIds.push(catId);
    }
    this.applyFilter();
  }

  isCategorySelected(catId: string): boolean {
    return this.selectedCategoryIds.includes(catId);
  }

  clearFilters() {
    this.selectedCategoryIds = [];
    this.startDateStr = '';
    this.endDateStr = '';
    this.showFilterPanel = false;
    this.applyFilter();
  }

  async deleteExpense(expense: Expense) {
    const alert = await this.alertCtrl.create({
      header: 'Delete Expense',
      message: `Delete "${expense.title}"? This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.expenseService.deleteExpense(expense.id!);
              this.showToast('Expense deleted', 'success');
            } catch (err) {
              this.showToast('Failed to delete', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  editExpense(expense: Expense) {
    this.router.navigate(['/tabs/add-expense'], { queryParams: { id: expense.id } });
  }

  addExpense() {
    this.router.navigate(['/tabs/add-expense']);
  }

  async downloadPDF() {
    if (this.filteredExpenses.length === 0) {
      this.showToast('No expenses to export', 'warning');
      return;
    }
    try {
      const expensesWithCat = this.filteredExpenses.map(e => ({
        ...e,
        categoryName: this.getCategoryName(e.categoryId),
        categoryIcon: this.getCategoryIcon(e.categoryId),
        categoryColor: this.getCategoryColor(e.categoryId)
      }));
      const filterUsed: ExpenseFilter = {
        categoryIds: this.selectedCategoryIds.length > 0 ? this.selectedCategoryIds : undefined,
        startDate: this.startDateStr ? new Date(this.startDateStr) : undefined,
        endDate: this.endDateStr ? new Date(this.endDateStr) : undefined
      };
      await this.exportService.exportToPDF(expensesWithCat, filterUsed, `${this.user?.firstName || ''} ${this.user?.lastName || ''}`);
      this.showToast('PDF downloaded!', 'success');
    } catch (err) {
      this.showToast('Export failed', 'danger');
    }
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Logout', role: 'destructive', handler: () => this.authService.logout() }
      ]
    });
    await alert.present();
  }

  goToCategories() {
    this.router.navigate(['/tabs/categories']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency', currency: 'PKR', minimumFractionDigits: 0
    }).format(amount || 0);
  }

  formatDate(date: any): string {
    try {
      return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'top' });
    toast.present();
  }
}
