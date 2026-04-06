import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export interface AssistantContextPayload {
  userName: string;
  totalExpenses: number;
  totalSpend: number;
  thisMonthSpend: number;
  topCategories: Array<{ name: string; amount: number }>;
}

@Injectable({ providedIn: 'root' })
export class AIAssistantService {
  constructor(private settingsService: SettingsService) {}

  async ask(question: string, context: AssistantContextPayload): Promise<{ answer: string; mode: 'local' }> {
    return { answer: this.getLocalAnswer(question, context), mode: 'local' };
  }

  private getLocalAnswer(question: string, context: AssistantContextPayload): string {
    const q = question.toLowerCase();
    const monthBudget = Math.max(30000, Math.round((context.thisMonthSpend || 0) * 1.1));
    const top = context.topCategories[0];
    const second = context.topCategories[1];
    const avgPerExpense = context.totalExpenses > 0 ? context.totalSpend / context.totalExpenses : 0;

    if (q.includes('summarize') || q.includes('summary') || q.includes('month')) {
      return `This month you spent ${this.settingsService.formatCurrency(context.thisMonthSpend)} across ${context.totalExpenses} tracked expenses. ${
        top ? `${top.name} is your top category at ${this.settingsService.formatCurrency(top.amount)}.` : ''
      } Keep watching high-frequency small expenses.`;
    }

    if (q.includes('reduce') || q.includes('save') || q.includes('cut')) {
      return `A practical saving plan: target a 10% reduction in ${
        top?.name || 'your top category'
      } this month. If achieved, you can save about ${this.settingsService.formatCurrency((top?.amount || context.thisMonthSpend) * 0.1)}. Also cap impulse spends to ${this.settingsService.formatCurrency((avgPerExpense || 1000) * 0.8)} per transaction.`;
    }

    if (q.includes('highest') || q.includes('top category') || q.includes('category')) {
      if (!top) {
        return 'I need more expense data to identify your top category. Add a few records and ask again.';
      }
      return `${top.name} is currently your highest category at ${this.settingsService.formatCurrency(top.amount)}. ${
        second ? `${second.name} follows at ${this.settingsService.formatCurrency(second.amount)}.` : ''
      }`;
    }

    if (q.includes('budget') || q.includes('weekly')) {
      const weekly = Math.round(monthBudget / 4);
      return `Suggested budget: Monthly ${this.settingsService.formatCurrency(monthBudget)} and weekly ${this.settingsService.formatCurrency(weekly)}. Split weekly target as 60% needs, 25% lifestyle, 15% buffer/savings.`;
    }

    return `Based on your current data: total spend is ${this.settingsService.formatCurrency(context.totalSpend)} with ${context.totalExpenses} entries. ${
      top ? `${top.name} is your main spend area.` : ''
    } Ask me for \"summary\", \"saving tips\", or \"weekly budget\" for specific guidance.`;
  }
}
