import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { Subscription, combineLatest } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ExpenseService } from '../../services/expense.service';
import { CategoryService } from '../../services/category.service';
import { ExportService } from '../../services/export.service';
import { Expense, Category, ExpenseFilter, User, WorkspaceScope } from '../../models/models';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss']
})
export class DashboardPage implements OnInit, OnDestroy {
  readonly Math = Math;
  readonly quickDateFilters = [
    { key: 'today', label: 'Today' },
    { key: 'last7', label: 'Last 7 Days' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'allTime', label: 'All Time' }
  ] as const;

  activeQuickDateFilter: 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'allTime' | 'custom' = 'allTime';

  user: User | null = null;
  isLoading = true;
  expenses: Expense[] = [];
  filteredExpenses: Expense[] = [];
  groupedExpenses: Array<{ dateLabel: string; expenses: Expense[] }> = [];
  categories: Category[] = [];

  filterActive = false;
  searchQuery = '';
  selectedCategoryIds: string[] = [];
  startDateStr = '';
  endDateStr = '';
  showFilterPanel = false;
  private suppressDateInputReaction = false;
  aiInsights: string[] = [];

  totalAmount = 0;
  todayAmount = 0;
  monthAmount = 0;
  bulkMode = false;
  selectedExpenseIds: string[] = [];
  showAIInsightsModal = false;

  // Sparkline data arrays
  allTimeSparkline: number[] = [];
  todaySparkline: number[] = [];
  monthSparkline: number[] = [];

  // Budget-related properties
  budget: number | null = null;
  isOverBudget: boolean = false;

  private subs: Subscription[] = [];
  private dataSub?: Subscription;

  constructor(
    private authService: AuthService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private exportService: ExportService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private router: Router,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    const userSub = this.authService.user$.subscribe(user => {
      this.user = user;
      if (user) {
        this.updateBudgetFromUser(user);
        this.loadData(user.uid);
      }
    });
    this.subs.push(userSub);
  }

  ngOnDestroy() {
    this.dataSub?.unsubscribe();
    this.subs.forEach(s => s.unsubscribe());
  }

  // Safe initials — never crashes even if user is null
  get initials(): string {
    const f = (this.user?.firstName || '').trim();
    const l = (this.user?.lastName || '').trim();
    return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
  }

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  toggleBulkMode() {
    this.bulkMode = !this.bulkMode;
    if (!this.bulkMode) {
      this.selectedExpenseIds = [];
    }
  }

  get selectedCount(): number {
    return this.selectedExpenseIds.length;
  }

  get allItemsSelected(): boolean {
    const visibleIds = this.filteredExpenses
      .map(expense => expense.id)
      .filter((id): id is string => !!id);
    return visibleIds.length > 0 && visibleIds.every(id => this.selectedExpenseIds.includes(id));
  }

  toggleSelectAll() {
    const visibleIds = this.filteredExpenses
      .map(expense => expense.id)
      .filter((id): id is string => !!id);

    if (this.allItemsSelected) {
      this.selectedExpenseIds = [];
    } else {
      this.selectedExpenseIds = visibleIds;
    }
  }

  toggleExpenseSelection(expense: Expense) {
    if (!expense.id) return;
    const index = this.selectedExpenseIds.indexOf(expense.id);
    if (index >= 0) {
      this.selectedExpenseIds.splice(index, 1);
    } else {
      this.selectedExpenseIds.push(expense.id);
    }
  }

  async confirmDeleteSelected() {
    if (this.selectedCount === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete Selected Expenses',
      message: `Delete ${this.selectedCount} selected expense${this.selectedCount > 1 ? 's' : ''}? This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.deleteSelectedExpenses();
          }
        }
      ]
    });

    await alert.present();
  }

  private async deleteSelectedExpenses() {
    const loading = await this.loadingCtrl.create({
      message: 'Deleting selected expenses...',
      spinner: 'crescent'
    });
    await loading.present();

    const results = await Promise.allSettled(
      this.selectedExpenseIds.map(id => this.expenseService.deleteExpense(id))
    );

    await loading.dismiss();

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      this.showToast(`${successCount} expense${successCount > 1 ? 's' : ''} deleted`, 'success');
    }
    if (failedCount > 0) {
      this.showToast(`${failedCount} failed to delete`, 'danger');
    }

    this.selectedExpenseIds = [];
    this.bulkMode = false;
  }

  openAIInsightsModal() {
    this.showAIInsightsModal = true;
  }

  closeAIInsightsModal() {
    this.showAIInsightsModal = false;
  }

  get activeWorkspaceLabel(): string {
    if (this.user?.accountMode === 'business') {
      return `Business • ${this.user.businessName || 'Shop'}`;
    }
    return 'Personal Mode';
  }

  trackByGroup(index: number, group: { dateLabel: string }) {
    return group.dateLabel;
  }

  trackByExpense(index: number, expense: Expense) {
    return expense.id;
  }

  loadData(userId: string) {
    this.dataSub?.unsubscribe();
    this.isLoading = true;
    this.expenses = [];
    this.filteredExpenses = [];
    this.categories = [];
    this.totalAmount = 0;
    this.todayAmount = 0;
    this.monthAmount = 0;
    const scope = this.getWorkspaceScope(this.user);
    this.dataSub = combineLatest([
      this.expenseService.getExpenses(userId, scope),
      this.categoryService.getCategories(userId, scope)
    ]).subscribe(
      ([expenses, categories]) => {
        this.expenses = expenses;
        this.categories = categories;
        this.applyFilter();
        this.calculateStats();
        this.isLoading = false;
      },
      (error) => {
        console.error('Error loading dashboard data:', error);
        this.isLoading = false;
        this.showToast('Failed to load data. Please try again.', 'danger');
      }
    );
  }

  applyFilter() {
    let filtered = [...this.expenses];

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(e => e.title.toLowerCase().includes(query));
    }
    if (this.selectedCategoryIds.length > 0) {
      filtered = filtered.filter(e => this.selectedCategoryIds.includes(e.categoryId));
    }
    if (this.startDateStr) {
      const start = this.parseDateFromInput(this.startDateStr);
      filtered = filtered.filter(e => new Date(e.date) >= start);
    }
    if (this.endDateStr) {
      const end = this.parseDateFromInput(this.endDateStr, true);
      filtered = filtered.filter(e => new Date(e.date) <= end);
    }

    this.filteredExpenses = filtered.sort((a, b) => {
      const d1 = new Date(a.date).getTime();
      const d2 = new Date(b.date).getTime();
      if (d1 !== d2) return d2 - d1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Update groupedExpenses
    const groups: { [key: string]: Expense[] } = {};
    const dateOrder: string[] = [];
    this.filteredExpenses.forEach(e => {
      const label = this.formatDate(e.date);
      if (!groups[label]) {
        groups[label] = [];
        dateOrder.push(label);
      }
      groups[label].push(e);
    });
    this.groupedExpenses = dateOrder.map(dateLabel => ({
      dateLabel,
      expenses: groups[dateLabel]
    }));

    this.filterActive = this.selectedCategoryIds.length > 0 || !!this.startDateStr || !!this.endDateStr;
    this.totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0);
    this.updateAIInsights();
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

    // Generate sparkline data
    this.generateSparklineData();
  }

  private generateSparklineData() {
    this.allTimeSparkline = this.generateAllTimeSparkline();
    this.todaySparkline = this.generateTodaySparkline();
    this.monthSparkline = this.generateMonthSparkline();
    this.updateBudgetStatus();
  }

  private updateBudgetFromUser(user: User) {
    if (user.accountMode === 'business') {
      this.budget = user.businessBudget || null;
    } else {
      this.budget = user.personalBudget || null;
    }
  }

  private updateBudgetStatus() {
    this.isOverBudget = this.budget !== null && this.budget > 0 && this.monthAmount > this.budget;
  }

  get todayTrend(): 'up' | 'down' {
    if (this.todaySparkline.length < 2) return 'up';
    const recent = this.todaySparkline.slice(-2);
    return recent[1] > recent[0] ? 'up' : 'down';
  }

  get monthTrend(): 'up' | 'down' {
    if (this.monthSparkline.length < 2) return 'up';
    const recent = this.monthSparkline.slice(-2);
    return recent[1] > recent[0] ? 'up' : 'down';
  }

  get allTimeTrend(): 'up' | 'down' {
    if (this.allTimeSparkline.length < 2) return 'up';
    const recent = this.allTimeSparkline.slice(-2);
    return recent[1] > recent[0] ? 'up' : 'down';
  }

  private generateAllTimeSparkline(): number[] {
    if (this.expenses.length === 0) return [30, 45, 60, 75, 85, 95, 100];
    
    // Group expenses by month for the last 7 months for better visualization
    const monthlyTotals = this.groupExpensesByMonth(7);
    const maxValue = Math.max(...monthlyTotals, 1);
    
    return monthlyTotals.map(value => Math.round((value / maxValue) * 100));
  }

  private generateTodaySparkline(): number[] {
    const todayExpenses = this.expenses.filter(e => 
      new Date(e.date).toDateString() === new Date().toDateString()
    );
    
    if (todayExpenses.length === 0) return [20, 40, 60, 80, 100, 85, 70, 50];
    
    // Group by 3-hour periods for the whole day (8 periods)
    const hourlyTotals = this.groupExpensesByHour(todayExpenses, 8);
    const maxValue = Math.max(...hourlyTotals, 1);
    
    return hourlyTotals.map(value => Math.round((value / maxValue) * 100));
  }

  private generateMonthSparkline(): number[] {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthExpenses = this.expenses.filter(e => new Date(e.date) >= monthStart);
    
    if (monthExpenses.length === 0) return [25, 40, 55, 70, 85, 95, 100];
    
    // Group by day for the last 7 days of the current month
    const dailyTotals = this.groupExpensesByDay(monthExpenses, 7);
    const maxValue = Math.max(...dailyTotals, 1);
    
    return dailyTotals.map(value => Math.round((value / maxValue) * 100));
  }

  private groupExpensesByMonth(months: number): number[] {
    const monthlyData: { [key: string]: number } = {};
    const now = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
      monthlyData[monthKey] = 0;
    }
    
    this.expenses.forEach(expense => {
      const expenseDate = new Date(expense.date);
      const monthKey = `${expenseDate.getFullYear()}-${expenseDate.getMonth()}`;
      if (monthlyData.hasOwnProperty(monthKey)) {
        monthlyData[monthKey] += expense.amount;
      }
    });
    
    return Object.values(monthlyData);
  }

  private groupExpensesByHour(expenses: Expense[], periods: number): number[] {
    const hourlyData = new Array(periods).fill(0);
    
    expenses.forEach(expense => {
      const expenseHour = new Date(expense.date).getHours();
      const periodIndex = Math.floor((expenseHour / 24) * periods);
      if (periodIndex >= 0 && periodIndex < periods) {
        hourlyData[periodIndex] += expense.amount;
      }
    });
    
    return hourlyData;
  }

  private groupExpensesByDay(expenses: Expense[], days: number): number[] {
    const dailyData = new Array(days).fill(0);
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() - i);
      targetDate.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(targetDate);
      nextDate.setDate(targetDate.getDate() + 1);
      
      expenses.forEach(expense => {
        const expenseDate = new Date(expense.date);
        if (expenseDate >= targetDate && expenseDate < nextDate) {
          dailyData[days - 1 - i] += expense.amount;
        }
      });
    }
    
    return dailyData;
  }

  private groupExpensesByWeek(expenses: Expense[], weeks: number): number[] {
    const weeklyData = new Array(weeks).fill(0);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    expenses.forEach(expense => {
      const expenseDate = new Date(expense.date);
      const daysIntoMonth = Math.floor((expenseDate.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.min(Math.floor(daysIntoMonth / 7), weeks - 1);
      if (weekIndex >= 0) {
        weeklyData[weekIndex] += expense.amount;
      }
    });
    
    return weeklyData;
  }

  private updateAIInsights() {
    const source = this.filteredExpenses.length > 0 ? this.filteredExpenses : this.expenses;
    const insights: string[] = [];

    if (this.expenses.length === 0) {
      this.aiInsights = ['Add a few expenses and Money Map AI Insights will start showing your spending trends.'];
      return;
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const currentMonthTotal = this.expenses
      .filter(e => new Date(e.date) >= currentMonthStart)
      .reduce((sum, e) => sum + e.amount, 0);

    const previousMonthTotal = this.expenses
      .filter(e => {
        const d = new Date(e.date);
        return d >= previousMonthStart && d <= previousMonthEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    if (previousMonthTotal > 0) {
      const diffPct = Math.round(((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100);
      if (Math.abs(diffPct) >= 10) {
        insights.push(
          diffPct > 0
            ? `Your monthly spending is up ${diffPct}% versus last month.`
            : `Nice progress: spending is down ${Math.abs(diffPct)}% versus last month.`
        );
      }
    }

    const categoryTotals = this.getCategoryTotals(source);
    if (categoryTotals.length > 0) {
      const top = categoryTotals[0];
      const sourceTotal = source.reduce((sum, e) => sum + e.amount, 0);
      const share = sourceTotal > 0 ? Math.round((top.total / sourceTotal) * 100) : 0;
      insights.push(`${top.name} is your top spending category (${share}% of selected expenses).`);
    }

    const avg = source.reduce((sum, e) => sum + e.amount, 0) / Math.max(1, source.length);
    const biggest = [...source].sort((a, b) => b.amount - a.amount)[0];
    if (biggest && biggest.amount >= avg * 2.2 && avg > 0) {
      insights.push(`Unusual spend detected: "${biggest.title}" is ${Math.round(biggest.amount / avg)}x your average expense.`);
    }

    const recent7 = source.filter(e => {
      const d = new Date(e.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 6);
      return d >= cutoff;
    });
    if (recent7.length >= 4) {
      insights.push(`You logged ${recent7.length} expenses in the last 7 days. Great tracking consistency.`);
    }

    this.aiInsights = insights.slice(0, 3);
    if (this.aiInsights.length === 0) {
      this.aiInsights = ['Your spending is stable. Keep logging expenses for deeper insights.'];
    }
  }

  private getCategoryTotals(expenses: Expense[]): Array<{ name: string; total: number }> {
    const map = new Map<string, number>();
    expenses.forEach(expense => {
      const name = this.getCategoryName(expense.categoryId);
      map.set(name, (map.get(name) || 0) + expense.amount);
    });
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
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
    this.searchQuery = '';
    this.selectedCategoryIds = [];
    this.startDateStr = '';
    this.endDateStr = '';
    this.activeQuickDateFilter = 'allTime';
    this.showFilterPanel = false;
    this.applyFilter();
  }

  getActiveFilterBadgeCount(): number {
    const searchCount = this.searchQuery.trim() ? 1 : 0;
    const categoryCount = this.selectedCategoryIds.length;
    let dateCount = 0;

    if (this.activeQuickDateFilter === 'custom') {
      dateCount = (this.startDateStr ? 1 : 0) + (this.endDateStr ? 1 : 0);
    } else if (this.activeQuickDateFilter !== 'allTime') {
      dateCount = 1;
    } else if (this.startDateStr || this.endDateStr) {
      dateCount = (this.startDateStr ? 1 : 0) + (this.endDateStr ? 1 : 0);
    }

    return searchCount + categoryCount + dateCount;
  }

  getActiveFilterLabels(): Array<{ type: 'search' | 'category' | 'date'; label: string; value?: string }> {
    const labels: Array<{ type: 'search' | 'category' | 'date'; label: string; value?: string }> = [];

    if (this.searchQuery.trim()) {
      labels.push({ type: 'search', label: `"${this.searchQuery}"` });
    }

    this.selectedCategoryIds.forEach(id => {
      const cat = this.categories.find(c => c.id === id);
      if (cat) labels.push({ type: 'category', label: cat.name, value: id });
    });

    if (this.activeQuickDateFilter !== 'allTime') {
      labels.push({ type: 'date', label: this.getActiveDateFilterLabel() });
    } else if (this.startDateStr || this.endDateStr) {
      if (this.startDateStr && this.endDateStr) {
        labels.push({ type: 'date', label: `${this.formatDate(this.startDateStr)} - ${this.formatDate(this.endDateStr)}` });
      } else if (this.startDateStr) {
        labels.push({ type: 'date', label: `From ${this.formatDate(this.startDateStr)}` });
      } else {
        labels.push({ type: 'date', label: `To ${this.formatDate(this.endDateStr)}` });
      }
    }

    return labels;
  }

  removeFilter(filter: { type: 'search' | 'category' | 'date'; value?: string }) {
    if (filter.type === 'search') {
      this.searchQuery = '';
    } else if (filter.type === 'category' && filter.value) {
      this.selectedCategoryIds = this.selectedCategoryIds.filter(id => id !== filter.value);
    } else if (filter.type === 'date') {
      this.startDateStr = '';
      this.endDateStr = '';
      this.activeQuickDateFilter = 'allTime';
    }
    this.applyFilter();
  }

  applyQuickDateFilter(
    filterKey: 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'allTime'
  ) {
    if (this.activeQuickDateFilter === filterKey && filterKey !== 'allTime') {
      this.suppressDateInputReaction = true;
      this.startDateStr = '';
      this.endDateStr = '';
      this.suppressDateInputReaction = false;
      this.activeQuickDateFilter = 'allTime';
      this.applyFilter();
      return;
    }

    const today = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (filterKey === 'today') {
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      end = new Date(start);
    }

    if (filterKey === 'last7') {
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      start = new Date(end);
      start.setDate(end.getDate() - 6);
    }

    if (filterKey === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    }

    if (filterKey === 'lastMonth') {
      const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      start = new Date(firstDayThisMonth);
      start.setMonth(start.getMonth() - 1);
      end = new Date(firstDayThisMonth);
      end.setDate(0);
    }

    this.suppressDateInputReaction = true;
    this.startDateStr = start ? this.toDateInputValue(start) : '';
    this.endDateStr = end ? this.toDateInputValue(end) : '';
    this.suppressDateInputReaction = false;

    this.activeQuickDateFilter = filterKey;
    this.applyFilter();
  }

  onDateRangeInputChange() {
    if (this.suppressDateInputReaction) return;
    this.activeQuickDateFilter = 'custom';
    this.applyFilter();
  }

  async deleteExpense(expense: Expense, slidingItem?: any) {
    if (slidingItem) {
      slidingItem.close();
    }
    const alert = await this.alertCtrl.create({
      header: 'Delete Expense',
      message: `Delete "${expense.title}"? This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            const loading = await this.loadingCtrl.create({
              message: 'Deleting...',
              spinner: 'crescent'
            });
            await loading.present();
            try {
              await this.expenseService.deleteExpense(expense.id!);
              await loading.dismiss();
              this.showToast('Expense deleted', 'success');
            } catch (err) {
              await loading.dismiss();
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

    const alert = await this.alertCtrl.create({
      header: 'Export Report',
      message: 'Would you like to save the report to your documents or share it?',
      buttons: [
        {
          text: 'Save to Device',
          handler: () => this.performExport('save')
        },
        {
          text: 'Share',
          handler: () => this.performExport('share')
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  private async performExport(action: 'save' | 'share') {
    try {
      await this.exportService.exportToPDF(
        this.filteredExpenses,
        {
          categoryIds: this.selectedCategoryIds.length ? [...this.selectedCategoryIds] : undefined,
          startDate: this.startDateStr ? new Date(this.startDateStr) : undefined,
          endDate: this.endDateStr ? new Date(this.endDateStr) : undefined,
          datePresetLabel: this.getActiveDateFilterLabel(),
          categoryNames: this.categories
            .filter(cat => this.selectedCategoryIds.includes(cat.id!))
            .map(cat => cat.name)
        },
        `${this.user?.firstName || ''} ${this.user?.lastName || ''}`,
        action,
        {
          workspaceType: this.user?.accountMode === 'business' ? 'business' : 'personal',
          workspaceLabel: this.user?.accountMode === 'business' ? 'Business' : 'Personal',
          shopName: this.user?.businessName || undefined
        }
      );

      const msg = action === 'save' ? 'Report saved to Documents!' : 'Report ready to share!';
      this.showToast(msg, 'success');

    } catch (err) {
      console.error(err);
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

  goToAssistant() {
    this.router.navigate(['/tabs/assistant']);
  }
  
  goToSettings() {
    this.router.navigate(['/tabs/settings']);
  }

  formatCurrency(amount: number): string {
    return this.settingsService.formatCurrency(amount);
  }

  formatDate(date: any): string {
    try {
      return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  }

  formatTime(date: any): string {
    try {
      return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'top' });
    toast.present();
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateFromInput(dateStr: string, setToEndOfDay = false): Date {
    const parts = dateStr.split('-');
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    if (setToEndOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  private getActiveDateFilterLabel(): string {
    const map: Record<string, string> = {
      today: 'Today',
      last7: 'Last 7 Days',
      thisMonth: 'This Month',
      lastMonth: 'Last Month',
      allTime: 'All Time',
      custom: 'Custom'
    };
    return map[this.activeQuickDateFilter] || 'All Time';
  }

  private getWorkspaceScope(user: User | null): WorkspaceScope {
    if (user?.accountMode === 'business') {
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
}
