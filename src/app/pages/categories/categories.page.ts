import { Component, OnInit } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/models';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.page.html',
  styleUrls: ['./categories.page.scss']
})
export class CategoriesPage implements OnInit {
  categories: Category[] = [];
  userId = '';

  readonly availableIcons = [
    'restaurant', 'car', 'bag-handle', 'game-controller', 'medical',
    'receipt', 'book', 'home', 'airplane', 'fitness', 'cafe', 'beer',
    'gift', 'heart', 'laptop', 'phone-portrait', 'shirt', 'paw',
    'bus', 'bicycle', 'flash', 'wifi', 'card', 'wallet', 'ellipsis-horizontal'
  ];

  readonly availableColors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#f97316', '#06b6d4', '#ec4899', '#14b8a6', '#84cc16',
    '#6366f1', '#a855f7', '#e11d48', '#0284c7', '#64748b'
  ];

  constructor(
    private authService: AuthService,
    private categoryService: CategoryService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    if (user) {
      this.userId = user.uid;
      this.categoryService.getCategories(user.uid).subscribe(cats => {
        this.categories = cats;
      });
    }
  }

  async addCategory() {
    await this.showCategoryDialog();
  }

  async editCategory(category: Category) {
    await this.showCategoryDialog(category);
  }

  async showCategoryDialog(category?: Category) {
    const isEdit = !!category;
    const alert = await this.alertCtrl.create({
      header: isEdit ? 'Edit Category' : 'New Category',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Category name',
          value: category?.name || ''
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: isEdit ? 'Update' : 'Create',
          handler: async (data) => {
            if (!data.name?.trim()) {
              const toast = await this.toastCtrl.create({ message: 'Please enter a name', duration: 2000, color: 'warning', position: 'top' });
              toast.present();
              return false;
            }
            try {
              if (isEdit && category?.id) {
                await this.categoryService.updateCategory(category.id, { name: data.name.trim() });
                const toast = await this.toastCtrl.create({ message: 'Category updated!', duration: 2000, color: 'success', position: 'top' });
                toast.present();
              } else {
                const newCat: Omit<Category, 'id'> = {
                  name: data.name.trim(),
                  icon: this.availableIcons[Math.floor(Math.random() * 8)],
                  color: this.availableColors[Math.floor(Math.random() * this.availableColors.length)],
                  userId: this.userId,
                  isDefault: false,
                  createdAt: new Date()
                };
                await this.categoryService.addCategory(newCat);
                const toast = await this.toastCtrl.create({ message: 'Category created!', duration: 2000, color: 'success', position: 'top' });
                toast.present();
              }
              return true;
            } catch {
              const toast = await this.toastCtrl.create({ message: 'Failed to save category', duration: 2000, color: 'danger', position: 'top' });
              toast.present();
              return false;
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteCategory(category: Category) {
    if (category.isDefault) {
      const toast = await this.toastCtrl.create({ message: 'Default categories cannot be deleted', duration: 2000, color: 'warning', position: 'top' });
      toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Delete Category',
      message: `Delete "${category.name}"? Expenses in this category will still exist.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.categoryService.deleteCategory(category.id!);
              const toast = await this.toastCtrl.create({ message: 'Category deleted', duration: 2000, color: 'success', position: 'top' });
              toast.present();
            } catch {
              const toast = await this.toastCtrl.create({ message: 'Failed to delete', duration: 2000, color: 'danger', position: 'top' });
              toast.present();
            }
          }
        }
      ]
    });
    await alert.present();
  }

  goBack() {
    this.router.navigate(['/tabs/dashboard']);
  }
}
