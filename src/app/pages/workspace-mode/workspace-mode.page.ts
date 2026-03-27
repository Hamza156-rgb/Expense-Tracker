import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-workspace-mode',
  templateUrl: './workspace-mode.page.html',
  styleUrls: ['./workspace-mode.page.scss']
})
export class WorkspaceModePage implements OnInit {
  selectedMode: 'personal' | 'business' = 'personal';
  businessName = '';
  userId = '';
  existingBusinessWorkspaceId = '';

  constructor(
    private authService: AuthService,
    private afs: AngularFirestore,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.userId = user.uid;

    const doc = await this.afs.doc(`users/${user.uid}`).ref.get();
    const data = doc.data() as any;
    if (data?.accountMode) {
      this.selectedMode = data.accountMode;
    }
    if (data?.businessName) {
      this.businessName = data.businessName;
    }
    if (data?.businessWorkspaceId) {
      this.existingBusinessWorkspaceId = data.businessWorkspaceId;
    }
  }

  async saveMode() {
    if (!this.userId) return;

    if (this.selectedMode === 'business' && !this.businessName.trim()) {
      this.showToast('Please enter a shop name for business mode.', 'warning');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Saving mode...' });
    await loading.present();

    try {
      const shopName = this.businessName.trim();
      const payload: any = {
        accountMode: this.selectedMode,
        updatedAt: new Date()
      };

      // Preserve business profile values when user temporarily switches to personal mode.
      if (this.selectedMode === 'business') {
        payload.businessName = shopName;
        payload.businessWorkspaceId = this.existingBusinessWorkspaceId || this.toWorkspaceId(shopName);
      }

      await this.afs.doc(`users/${this.userId}`).set(payload, { merge: true });

      await loading.dismiss();
      await this.showToast('Mode updated successfully!', 'success');
      this.router.navigate(['/tabs/profile']);
    } catch {
      await loading.dismiss();
      await this.showToast('Failed to update mode. Try again.', 'danger');
    }
  }

  goBack() {
    this.router.navigate(['/tabs/profile']);
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color, position: 'top' });
    await toast.present();
  }

  private toWorkspaceId(input: string): string {
    const slug = input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug ? `shop-${slug}` : `shop-${Date.now()}`;
  }
}
