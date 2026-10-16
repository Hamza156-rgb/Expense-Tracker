import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ExpenseService } from '../../services/expense.service';
import { CategoryService } from '../../services/category.service';
import { Category, Expense, TourMember, User } from '../../models/models';
import { getWorkspaceScope } from '../../utils/workspace.util';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.page.html',
  styleUrls: ['./add-expense.page.scss']
})
export class AddExpensePage implements OnInit, OnDestroy {
  expenseForm: FormGroup;
  categories: Category[] = [];
  userId = '';
  editId: string | null = null;
  isEditMode = false;
  today: string;
  suggestedCategory: Category | null = null;
  isTourMode = false;
  tourMembers: TourMember[] = [];
  paidByMemberId = '';
  splitMemberIds: string[] = [];
  showMemberErrors = false;
  private titleSub?: Subscription;
  private authSub?: Subscription;
  private categoriesSub?: Subscription;
  private loadExpenseSub?: Subscription;
  private currentUser: User | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private route: ActivatedRoute,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private settingsService: SettingsService
  ) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    this.today = `${year}-${month}-${day}`;
    this.expenseForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      categoryId: ['', Validators.required],
      date: [this.today, Validators.required],
      notes: ['']
    });
  }

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      this.currentUser = user;
      this.categoriesSub?.unsubscribe();
      this.categories = [];
      if (!user) return;
      this.userId = user.uid;
      this.setTourMembers(user);

      this.categoriesSub = this.categoryService.getCategories(user.uid, getWorkspaceScope(user)).subscribe(cats => {
        this.categories = cats;
        this.updateSuggestionFromTitle(this.expenseForm.get('title')?.value || '');
      });

      // If user is ready and we have an editId from queryParams, load it
      if (this.editId) {
        this.loadExpense(this.editId);
      }
    });

    const titleControl = this.expenseForm.get('title');
    if (titleControl) {
      this.titleSub = titleControl.valueChanges
        .pipe(debounceTime(120), distinctUntilChanged())
        .subscribe(value => this.updateSuggestionFromTitle(value));
    }
  
    this.route.queryParams.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.editId = id;
        this.isEditMode = true;
        // If user is already loaded, we can call loadExpense immediately
        if (this.userId) {
          this.loadExpense(id);
        }
      } else {
        this.resetForm();
      }
    });
  }

  private setTourMembers(user: User) {
    this.isTourMode = getWorkspaceScope(user).workspaceType === 'tour';
    this.tourMembers = this.isTourMode ? (user.tourMembers || []) : [];
    if (!this.isTourMode) return;

    const memberIds = this.tourMembers.map(m => m.id);
    // Drop selections for members that were removed from the tour.
    this.splitMemberIds = this.splitMemberIds.filter(id => memberIds.includes(id));
    if (this.paidByMemberId && !memberIds.includes(this.paidByMemberId) && !this.isEditMode) {
      this.paidByMemberId = '';
    }
    if (!this.isEditMode && this.splitMemberIds.length === 0) {
      this.splitMemberIds = [...memberIds];
    }
  }

  selectPaidBy(memberId: string) {
    this.paidByMemberId = memberId;
  }

  toggleSplitMember(memberId: string) {
    this.splitMemberIds = this.splitMemberIds.includes(memberId)
      ? this.splitMemberIds.filter(id => id !== memberId)
      : [...this.splitMemberIds, memberId];
  }

  get splitShareLabel(): string {
    const amount = Number(this.expenseForm.get('amount')?.value) || 0;
    const count = this.splitMemberIds.length;
    if (!amount || !count) return '';
    return `${this.settingsService.formatCurrency(amount / count)} each`;
  }

  private get tourSelectionValid(): boolean {
    return !this.isTourMode || this.tourMembers.length === 0 ||
      (!!this.paidByMemberId && this.splitMemberIds.length > 0);
  }

  private resetForm() {
    this.editId = null;
    this.isEditMode = false;
    this.paidByMemberId = '';
    this.splitMemberIds = this.tourMembers.map(m => m.id);
    this.showMemberErrors = false;
    this.expenseForm.reset({
      title: '',
      amount: '',
      categoryId: '',
      date: this.today,
      notes: ''
    });
  }

  ngOnDestroy(): void {
    this.titleSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.categoriesSub?.unsubscribe();
    this.loadExpenseSub?.unsubscribe();
  }
  
  selectCategory(catId: string) {
    if (!catId) return;
    this.expenseForm.get('categoryId')?.patchValue(catId);
    this.expenseForm.get('categoryId')?.markAsTouched();
    if (this.suggestedCategory?.id === catId) {
      this.suggestedCategory = null;
    }
  }

  setAmount(amount: number) {
    this.expenseForm.patchValue({ amount });
    this.expenseForm.get('amount')?.markAsTouched();
  }

  applySuggestedCategory() {
    if (!this.suggestedCategory?.id) return;
    this.selectCategory(this.suggestedCategory.id);
  }

  async loadExpense(id: string) {
    if (!this.userId || !this.currentUser) return;
    const loading = await this.loadingCtrl.create({ message: 'Loading...' });
    await loading.present();
    this.loadExpenseSub?.unsubscribe();
    this.loadExpenseSub = this.expenseService
      .getExpenses(this.userId, getWorkspaceScope(this.currentUser!))
      .subscribe(expenses => {
        const expense = expenses.find(e => e.id === id);
        if (expense) {
          // Unsubscribe immediately once found to prevent background updates overwriting user edits
          this.loadExpenseSub?.unsubscribe();
          
          this.expenseForm.patchValue({
            title: expense.title,
            amount: expense.amount,
            categoryId: expense.categoryId,
            date: this.formatToDateInput(expense.date),
            notes: expense.notes || ''
          });
          this.paidByMemberId = expense.paidByMemberId || '';
          this.splitMemberIds = expense.splitMemberIds?.length
            ? [...expense.splitMemberIds]
            : this.tourMembers.map(m => m.id);
          this.updateSuggestionFromTitle(this.expenseForm.get('title')?.value || '');
        }
        loading.dismiss();
      });
  }

  private formatToDateInput(date: any): string {
    if (!date) return this.today;
    const d = new Date(date);
    if (isNaN(d.getTime())) return this.today;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async onSubmit() {
    if (this.expenseForm.invalid || !this.tourSelectionValid) {
      this.expenseForm.markAllAsTouched();
      this.showMemberErrors = true;
      return;
    }

    const loading = await this.loadingCtrl.create({ message: this.isEditMode ? 'Updating...' : 'Saving...' });
    await loading.present();

    try {
      const { title, amount, categoryId, date, notes } = this.expenseForm.value;
      const selectedCategory = this.categories.find(c => c.id === categoryId);

      // Create a local Date object from the YYYY-MM-DD string to avoid UTC shifts
      const dateParts = date.split('-');
      const localDate = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10)
      );

      // Set the current time for new expenses
      if (!this.isEditMode) {
        const now = new Date();
        localDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
      }

      const expenseData: any = {
        title: title.trim(),
        amount: Number(amount),
        categoryId,
        categoryName: selectedCategory?.name,
        categoryIcon: selectedCategory?.icon,
        categoryColor: selectedCategory?.color,
        date: localDate,
        notes: notes.trim(),
        userId: this.userId,
        workspaceType: getWorkspaceScope(this.currentUser).workspaceType,
        workspaceId: getWorkspaceScope(this.currentUser).workspaceId
      };

      if (this.isTourMode && this.paidByMemberId) {
        const paidBy = this.tourMembers.find(m => m.id === this.paidByMemberId);
        expenseData.paidByMemberId = this.paidByMemberId;
        expenseData.paidByName = paidBy?.name || '';
        expenseData.splitMemberIds = [...this.splitMemberIds];
      }

      if (this.isEditMode && this.editId) {
        await this.expenseService.updateExpense(this.editId, expenseData);
      } else {
        expenseData.createdAt = new Date();
        await this.expenseService.addExpense(expenseData);
      }

      await loading.dismiss();
      const toast = await this.toastCtrl.create({
        message: this.isEditMode ? 'Expense updated!' : 'Expense added!',
        duration: 2000, color: 'success', position: 'top'
      });
      toast.present();
      this.router.navigate(['/tabs/dashboard']);
    } catch (err) {
      await loading.dismiss();
      const toast = await this.toastCtrl.create({ message: 'Failed to save expense', duration: 2000, color: 'danger', position: 'top' });
      toast.present();
    }
  }

  cancel() {
    this.router.navigate(['/tabs/dashboard']);
  }

  getFieldError(field: string): string {
    const control = this.expenseForm.get(field);
    if (control?.errors && control.touched) {
      if (control.errors['required']) return 'This field is required';
      if (control.errors['min']) return 'Amount must be greater than 0';
      if (control.errors['minlength']) return 'Must be at least 2 characters';
    }
    return '';
  }

  private updateSuggestionFromTitle(rawTitle: string) {
    const title = String(rawTitle || '').trim().toLowerCase();
    if (!title || this.categories.length === 0) {
      this.suggestedCategory = null;
      return;
    }

    const keywordMap: Record<string, string[]> = {
      'Food & Dining': ['food', 'lunch', 'dinner', 'breakfast', 'meal', 'pizza', 'burger', 'restaurant', 'cafe', 'tea', 'coffee', 'kfc', 'mcd', 'biryani'],
      Transportation: ['uber', 'careem', 'fuel', 'petrol', 'diesel', 'bus', 'taxi', 'train', 'metro', 'rickshaw', 'transport'],
      Shopping: ['mall', 'shopping', 'cloth', 'shirt', 'shoe', 'amazon', 'daraz', 'store', 'purchase', 'buy'],
      Entertainment: ['movie', 'cinema', 'netflix', 'spotify', 'game', 'concert', 'entertainment'],
      Health: ['doctor', 'hospital', 'clinic', 'medicine', 'pharmacy', 'health', 'dental'],
      'Bills & Utilities': ['bill', 'electricity', 'gas', 'internet', 'wifi', 'mobile', 'utility', 'rent', 'water'],
      Education: ['book', 'course', 'tuition', 'school', 'college', 'university', 'exam', 'education']
    };

    const best = this.categories
      .map(category => {
        const keywords = keywordMap[category.name] || [];
        const score = keywords.reduce((sum, keyword) => sum + (title.includes(keyword) ? 1 : 0), 0);
        return { category, score };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (best && best.score > 0 && this.expenseForm.get('categoryId')?.value !== best.category.id) {
      this.suggestedCategory = best.category;
      return;
    }

    const titleWords = title.split(/\s+/).filter(Boolean);
    const fuzzy = this.categories.find(category =>
      titleWords.some(word => category.name.toLowerCase().includes(word) && word.length > 3)
    );

    if (fuzzy && this.expenseForm.get('categoryId')?.value !== fuzzy.id) {
      this.suggestedCategory = fuzzy;
      return;
    }

    this.suggestedCategory = null;
  }



  get currencyCode(): string {
    return this.settingsService.getCurrentCurrency().code;
  }

  get currencySymbol(): string {
    return this.settingsService.getCurrentCurrency().symbol;
  }
}

