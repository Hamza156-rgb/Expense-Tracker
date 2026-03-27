import { Component } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-change-password-modal',
  templateUrl: './change-password-modal.component.html',
  styleUrls: ['./change-password-modal.component.scss'],
})
export class ChangePasswordModalComponent {
  newPassword = '';
  showPassword = false;
  isUpdating = false;

  constructor(
    private modalCtrl: ModalController,
    private authService: AuthService,
    private toastCtrl: ToastController
  ) {}

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async updatePassword() {
    if (this.newPassword.length < 6) return;

    this.isUpdating = true;
    try {
      await this.authService.updatePassword(this.newPassword);
      await this.showToast('Password updated successfully!', 'success');
      this.modalCtrl.dismiss(true);
    } catch (error: any) {
      let msg = 'Failed to update password. Please try again.';
      if (error.code === 'auth/requires-recent-login') {
        msg = 'For security, please sign out and sign back in before changing your password.';
      } else if (error.message) {
        msg = error.message;
      }
      await this.showToast(msg, 'danger');
    } finally {
      this.isUpdating = false;
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
