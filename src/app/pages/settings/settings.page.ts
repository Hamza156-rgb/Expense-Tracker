import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController, AlertController } from '@ionic/angular';
import { SettingsService, Currency } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { ChangePasswordModalComponent } from '../profile/change-password-modal/change-password-modal.component';
import { User } from '../../models/models';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
  user: User | null = null;
  isDarkMode = false;
  currencies: Currency[] = [];
  selectedCurrencyCode = '';

  constructor(
    private settingsService: SettingsService,
    private authService: AuthService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private router: Router
  ) { }

  ngOnInit() {
    this.authService.user$.subscribe(u => this.user = u);
    this.isDarkMode = this.settingsService.getStoredTheme() === 'dark';
    this.currencies = this.settingsService.getCurrencies();
    this.selectedCurrencyCode = this.settingsService.getCurrentCurrency().code;
  }

  toggleDarkMode(event: any) {
    const isDark = event.detail.checked;
    this.isDarkMode = isDark;
    this.settingsService.setTheme(isDark ? 'dark' : 'light');
  }

  onCurrencyChange(event: any) {
    const code = event.detail.value;
    this.settingsService.setCurrency(code);
    this.showToast(`Currency updated to ${code}`);
  }

  async changePassword() {
    const modal = await this.modalCtrl.create({
      component: ChangePasswordModalComponent,
      cssClass: 'change-password-modal',
      breakpoints: [0, 0.45],
      initialBreakpoint: 0.45
    });
    await modal.present();
  }

  goToWorkspaceMode() {
    this.router.navigate(['/workspace-mode']);
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

  goBack() {
    this.router.navigate(['/tabs/dashboard']);
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color: 'success',
      position: 'top'
    });
    toast.present();
  }
}
