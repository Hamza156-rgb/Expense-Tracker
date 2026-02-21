import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss']
})
export class SignupPage {
  signupForm: FormGroup;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.signupForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatch });
  }

  passwordMatch(group: FormGroup) {
    const pass = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return pass === confirm ? null : { passwordMismatch: true };
  }

  async onSignup() {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Creating account...' });
    await loading.present();

    try {
      const { firstName, lastName, email, password } = this.signupForm.value;
      await this.authService.signUp(firstName, lastName, email, password);
      await loading.dismiss();
      await this.showToast('Account created successfully! Please log in.', 'success');
      await this.router.navigate(['/login']);
    } catch (error: any) {
      await loading.dismiss();
      await this.showToast(this.getErrorMessage(error.code), 'danger');
    }
  }

  private getErrorMessage(code: string): string {
    const messages: { [key: string]: string } = {
      'auth/email-already-in-use': 'This email is already registered.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
    };
    return messages[code] || 'An error occurred. Please try again.';
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  getFieldError(field: string): string {
    const control = this.signupForm.get(field);
    if (control?.errors && control.touched) {
      if (control.errors['required']) return `${this.getFieldName(field)} is required`;
      if (control.errors['email']) return 'Please enter a valid email';
      if (control.errors['minlength']) return `Must be at least ${control.errors['minlength'].requiredLength} characters`;
    }
    return '';
  }

  getFieldName(field: string): string {
    const names: { [key: string]: string } = {
      firstName: 'First name', lastName: 'Last name', email: 'Email', password: 'Password', confirmPassword: 'Confirm password'
    };
    return names[field] || field;
  }
}
