import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  loginForm: FormGroup;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async onLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Signing in...' });
    await loading.present();

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.login(email, password);
      await loading.dismiss();
      await this.router.navigate(['/tabs/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      await loading.dismiss();
      await this.showToast(this.getErrorMessage(error.code), 'danger');
    }
  }

  async onForgotPassword() {
    const emailControl = this.loginForm.get('email');
    emailControl?.markAsTouched();
    emailControl?.updateValueAndValidity();

    if (!emailControl || emailControl.invalid) {
      await this.showToast('Enter a valid email first to reset your password.', 'warning');
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Sending reset link...' });
    await loading.present();

    try {
      await this.authService.resetPassword(emailControl.value);
      await loading.dismiss();
      await this.showToast('Password reset email sent. Check your inbox.', 'success');
    } catch (error: any) {
      await loading.dismiss();
      await this.showToast(this.getResetErrorMessage(error.code), 'danger');
    }
  }

  private getErrorMessage(code: string): string {
    const messages: { [key: string]: string } = {
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/invalid-credential': 'Invalid email or password.'
    };
    return messages[code] || 'Login failed. Please try again.';
  }

  private getResetErrorMessage(code: string): string {
    const messages: { [key: string]: string } = {
      'auth/user-not-found': 'No account found with this email.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/missing-email': 'Please enter your email address.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.'
    };
    return messages[code] || 'Could not send reset email. Please try again.';
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }

  goToSignup() {
    this.router.navigate(['/signup']);
  }

  getFieldError(field: string): string {
    const control = this.loginForm.get(field);
    if (control?.errors && control.touched) {
      if (control.errors['required']) return `${field === 'email' ? 'Email' : 'Password'} is required`;
      if (control.errors['email']) return 'Please enter a valid email';
      if (control.errors['minlength']) return 'Password must be at least 6 characters';
    }
    return '';
  }
}
