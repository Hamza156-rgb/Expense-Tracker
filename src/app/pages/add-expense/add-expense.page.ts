import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ExpenseService } from '../../services/expense.service';
import { CategoryService } from '../../services/category.service';
import { Category, Expense } from '../../models/models';

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.page.html',
  styleUrls: ['./add-expense.page.scss']
})
export class AddExpensePage implements OnInit {
  expenseForm: FormGroup;
  categories: Category[] = [];
  userId = '';
  editId: string | null = null;
  isEditMode = false;
  today: string;

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
    this.authService.getCurrentUser().then(user => {
      if (!user) return;
      this.userId = user.uid;
  
      this.categoryService.getCategories(user.uid).subscribe(cats => {
        this.categories = cats; // now correctly typed
      });
    });
  
    this.route.queryParams.subscribe(params => {
      if (params['id']) {
        this.editId = params['id'];
        this.isEditMode = true;
        this.loadExpense(params['id']);
      }
    });
  }
  
  selectCategory(catId: string) {
    if (!catId) return;
    this.expenseForm.get('categoryId')?.patchValue(catId);
    this.expenseForm.get('categoryId')?.markAsTouched();
  }

  async loadExpense(id: string) {
    const loading = await this.loadingCtrl.create({ message: 'Loading...' });
    await loading.present();
    this.expenseService.getExpenses(this.userId).subscribe(expenses => {
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
}
