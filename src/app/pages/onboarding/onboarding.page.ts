import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface OnboardingSlide {
  icon: string;
  title: string;
  text: string;
}

@Component({
  selector: 'app-onboarding',
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss']
})
export class OnboardingPage {
  static readonly STORAGE_KEY = 'onboardingComplete';

  readonly slides: OnboardingSlide[] = [
    {
      icon: 'wallet-outline',
      title: 'Track every expense',
      text: 'Log what you spend in seconds and always know where your money goes.'
    },
    {
      icon: 'analytics-outline',
      title: 'Insights & reports',
      text: 'See spending trends, set budgets, get AI insights, and export PDF reports.'
    },
    {
      icon: 'briefcase-outline',
      title: 'Personal, business & tour',
      text: 'Switch between personal, business and tour workspaces, each with its own categories. Split tour costs with your group.'
    }
  ];

  current = 0;
  private touchStartX = 0;

  constructor(private router: Router) {}

  get isLast(): boolean {
    return this.current === this.slides.length - 1;
  }

  goTo(index: number) {
    this.current = index;
  }

  next() {
    if (this.isLast) {
      this.getStarted();
      return;
    }
    this.current++;
  }

  back() {
    if (this.current > 0) {
      this.current--;
    }
  }

  skip() {
    this.finish('/login');
  }

  getStarted() {
    this.finish('/signup');
  }

  signIn() {
    this.finish('/login');
  }

  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].clientX;
  }

  onTouchEnd(event: TouchEvent) {
    const deltaX = event.changedTouches[0].clientX - this.touchStartX;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0 && !this.isLast) {
      this.current++;
    } else if (deltaX > 0) {
      this.back();
    }
  }

  trackBySlide(index: number) {
    return index;
  }

  private finish(target: string) {
    try {
      localStorage.setItem(OnboardingPage.STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable; onboarding will simply show again.
    }
    this.router.navigate([target], { replaceUrl: true });
  }
}
