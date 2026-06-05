import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-auth-loading',
  templateUrl: './auth-loading.page.html',
  styleUrls: ['./auth-loading.page.scss']
})
export class AuthLoadingPage implements OnInit {
  constructor(private afAuth: AngularFireAuth, private router: Router) {}

  ngOnInit() {
    this.afAuth.authState.pipe(take(1)).subscribe(user => {
      if (user) {
        this.router.navigate(['/tabs/dashboard'], { replaceUrl: true });
        return;
      }
      // First-time visitors (who haven't completed onboarding) see the intro.
      const onboarded = this.hasCompletedOnboarding();
      this.router.navigate([onboarded ? '/login' : '/onboarding'], { replaceUrl: true });
    });
  }

  private hasCompletedOnboarding(): boolean {
    try {
      return localStorage.getItem('onboardingComplete') === 'true';
    } catch {
      return true; // If storage is unavailable, skip onboarding rather than loop.
    }
  }
}

