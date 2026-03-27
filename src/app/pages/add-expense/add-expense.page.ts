import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ExpenseService } from '../../services/expense.service';
import { CategoryService } from '../../services/category.service';
import { Category, Expense, User, WorkspaceScope } from '../../models/models';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subscription } from 'rxjs';

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
    private toastCtrl: ToastController
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
      this.loadExpenseSub?.unsubscribe();
      this.categories = [];
      if (!user) return;
      this.userId = user.uid;

      this.categoriesSub = this.categoryService.getCategories(user.uid, this.getWorkspaceScope(user)).subscribe(cats => {
        this.categories = cats; // now correctly typed
        this.updateSuggestionFromTitle(this.expenseForm.get('title')?.value || '');
      });

      if (this.isEditMode && this.editId) {
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
      if (params['id']) {
        this.editId = params['id'];
        this.isEditMode = true;
      }
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

  applySuggestedCategory() {
    if (!this.suggestedCategory?.id) return;
    this.selectCategory(this.suggestedCategory.id);
  }

  async loadExpense(id: string) {
    if (!this.userId || !this.currentUser) return;
    const loading = await this.loadingCtrl.create({ message: 'Loading...' });
    await loading.present();
    this.loadExpenseSub?.unsubscribe();
    this.loadExpenseSub = this.expenseService.getExpenses(this.userId, this.getWorkspaceScope(this.currentUser!)).subscribe(expenses => {
      const expense = expenses.find(e => e.id === id);
      if (expense) {
        const d = new Date(expense.date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;
        this.expenseForm.patchValue({
          title: expense.title,
          amount: expense.amount,
          categoryId: expense.categoryId,
          date: dateStr,
          notes: expense.notes || ''
        });
      }
      loading.dismiss();
      this.updateSuggestionFromTitle(this.expenseForm.get('title')?.value || '');
    });
  }

  async onSubmit() {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const loading = await this.loadingCtrl.create({ message: this.isEditMode ? 'Updating...' : 'Saving...' });
    await loading.present();

    try {
      const { title, amount, categoryId, date, notes } = this.expenseForm.value;
      const selectedCategory = this.categories.find(c => c.id === categoryId);

      const expenseData = {
        title: title.trim(),
        amount: Number(amount),
        categoryId,
        categoryName: selectedCategory?.name,
        categoryIcon: selectedCategory?.icon,
        categoryColor: selectedCategory?.color,
        date: new Date(date),
        notes: notes.trim(),
        userId: this.userId,
        workspaceType: this.getWorkspaceScope(this.currentUser).workspaceType,
        workspaceId: this.getWorkspaceScope(this.currentUser).workspaceId,
        createdAt: new Date()
      };

      if (this.isEditMode && this.editId) {
        await this.expenseService.updateExpense(this.editId, expenseData);
      } else {
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
