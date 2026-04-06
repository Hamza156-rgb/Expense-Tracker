import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { CategoryService } from '../../services/category.service';
import { Category, User, WorkspaceScope } from '../../models/models';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.page.html',
  styleUrls: ['./categories.page.scss']
})
export class CategoriesPage implements OnInit, OnDestroy {
  categories: Category[] = [];
  userId = '';
  private user: User | null = null;
  private authSub?: Subscription;
  private categoriesSub?: Subscription;

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
    private loadingCtrl: LoadingController,
    private router: Router
  ) {}

  ngOnInit() {
    this.authSub = this.authService.user$.subscribe(user => {
      this.user = user;
      this.categoriesSub?.unsubscribe();
      this.categories = [];
      if (!user) return;

      this.userId = user.uid;
      this.categoriesSub = this.categoryService.getCategories(user.uid, this.getWorkspaceScope(user)).subscribe(cats => {
        this.categories = cats;
      });
    });
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
            const loading = await this.loadingCtrl.create({
              message: isEdit ? 'Updating...' : 'Creating...',
              spinner: 'crescent'
            });
            await loading.present();
            try {
              if (isEdit && category?.id) {
                await this.categoryService.updateCategory(category.id, { name: data.name.trim() });
                await loading.dismiss();
                const toast = await this.toastCtrl.create({ message: 'Category updated!', duration: 2000, color: 'success', position: 'top' });
                toast.present();
              } else {
                const newCat: Omit<Category, 'id'> = {
                  name: data.name.trim(),
                  icon: this.availableIcons[Math.floor(Math.random() * 8)],
                  color: this.availableColors[Math.floor(Math.random() * this.availableColors.length)],
                  userId: this.userId,
                  workspaceType: this.getWorkspaceScope(this.user).workspaceType,
                  workspaceId: this.getWorkspaceScope(this.user).workspaceId,
                  isDefault: false,
                  createdAt: new Date()
                };
                await this.categoryService.addCategory(newCat);
                await loading.dismiss();
                const toast = await this.toastCtrl.create({ message: 'Category created!', duration: 2000, color: 'success', position: 'top' });
                toast.present();
              }
              return true;
            } catch (error: any) {
              await loading.dismiss();
              let message = 'Failed to save category';
              let color = 'danger';

              if (error.message === 'DUPLICATE_CATEGORY_NAME') {
                message = `A category named "${data.name.trim()}" already exists in this profile.`;
                color = 'warning';
              }

              const toast = await this.toastCtrl.create({
                message,
                duration: 3000,
                color: color as any,
                position: 'top'
              });
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
            const loading = await this.loadingCtrl.create({
              message: 'Deleting...',
              spinner: 'crescent'
            });
            await loading.present();
            try {
              await this.categoryService.deleteCategory(category.id!);
              await loading.dismiss();
              const toast = await this.toastCtrl.create({ message: 'Category deleted', duration: 2000, color: 'success', position: 'top' });
              toast.present();
            } catch {
              await loading.dismiss();
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

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.categoriesSub?.unsubscribe();
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
