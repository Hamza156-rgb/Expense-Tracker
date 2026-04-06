import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly CURRENCY_KEY = 'app_currency';
  private readonly THEME_KEY = 'theme';

  private currencies: Currency[] = [
    { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', locale: 'en-PK' },
    { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
    { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
    { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
    { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', locale: 'ar-SA' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  ];

  private currentCurrencySubject = new BehaviorSubject<Currency>(this.getStoredCurrency());
  currentCurrency$ = this.currentCurrencySubject.asObservable();

  constructor() { }

  getCurrencies(): Currency[] {
    return this.currencies;
  }

  getCurrentCurrency(): Currency {
    return this.currentCurrencySubject.value;
  }

  setCurrency(code: string) {
    const currency = this.currencies.find(c => c.code === code);
    if (currency) {
      localStorage.setItem(this.CURRENCY_KEY, JSON.stringify(currency));
      this.currentCurrencySubject.next(currency);
    }
  }

  private getStoredCurrency(): Currency {
    const stored = localStorage.getItem(this.CURRENCY_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return this.currencies[0]; // Default to PKR
      }
    }
    return this.currencies[0]; // Default to PKR
  }

  formatCurrency(amount: number): string {
    const currency = this.getCurrentCurrency();
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }

  // Theme management
  setTheme(theme: 'light' | 'dark') {
    localStorage.setItem(this.THEME_KEY, theme);
    if (theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }
  }

  getStoredTheme(): 'light' | 'dark' {
    const stored = localStorage.getItem(this.THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    
    // Auto-detect if no preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
}
