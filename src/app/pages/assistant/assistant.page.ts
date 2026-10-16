import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, combineLatest } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { ExpenseService } from '../../services/expense.service';
import { CategoryService } from '../../services/category.service';
import { AIAssistantService, AssistantContextPayload } from '../../services/ai-assistant.service';
import { Expense, Category, User } from '../../models/models';
import { getWorkspaceScope } from '../../utils/workspace.util';

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
  createdAt: Date;
}

@Component({
  selector: 'app-assistant',
  templateUrl: './assistant.page.html',
  styleUrls: ['./assistant.page.scss']
})
export class AssistantPage implements OnInit, OnDestroy {
  user: User | null = null;
  expenses: Expense[] = [];
  categories: Category[] = [];
  prompt = '';
  isSending = false;

  messages: ChatMessage[] = [
    {
      role: 'assistant',
      text: 'Hi! I am your Money Map assistant. Ask me about your spending trends, saving ideas, or budget planning.',
      createdAt: new Date()
    }
  ];

  quickPrompts: string[] = [
    'Summarize my spending this month',
    'Where can I reduce expenses?',
    'Which category is highest and why?',
    'Give me a simple weekly budget plan'
  ];

  private sub?: Subscription;
  private dataSub?: Subscription;

  constructor(
    private authService: AuthService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private aiAssistantService: AIAssistantService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.sub = this.authService.user$.subscribe(user => {
      this.user = user;
      this.dataSub?.unsubscribe();
      this.expenses = [];
      this.categories = [];
      if (!user) return;

      this.dataSub = combineLatest([
        this.expenseService.getExpenses(user.uid, getWorkspaceScope(user)),
        this.categoryService.getCategories(user.uid, getWorkspaceScope(user))
      ]).subscribe(([expenses, categories]) => {
        this.expenses = expenses;
        this.categories = categories;
      });
    });
  }

  ngOnDestroy(): void {
    this.dataSub?.unsubscribe();
    this.sub?.unsubscribe();
  }

  useQuickPrompt(value: string) {
    this.prompt = value;
    this.sendMessage();
  }

  async sendMessage() {
    const question = this.prompt.trim();
    if (!question || this.isSending) return;

    this.messages.push({
      role: 'user',
      text: question,
      createdAt: new Date()
    });

    this.prompt = '';
    this.isSending = true;

    try {
      const result = await this.aiAssistantService.ask(question, this.buildContextPayload());
      this.messages.push({
        role: 'assistant',
        text: result.answer,
        createdAt: new Date()
      });
    } catch {
      this.messages.push({
        role: 'assistant',
        text: 'Assistant is unavailable right now. Please try again.',
        createdAt: new Date()
      });
    } finally {
      this.isSending = false;
    }
  }

  private buildContextPayload(): AssistantContextPayload {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalSpend = this.expenses.reduce((sum, e) => sum + e.amount, 0);
    const thisMonthSpend = this.expenses
      .filter(e => new Date(e.date) >= monthStart)
      .reduce((sum, e) => sum + e.amount, 0);

    const categoryMap = new Map<string, number>();
    this.expenses.forEach(expense => {
      const categoryName = this.categories.find(c => c.id === expense.categoryId)?.name || 'Uncategorized';
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + expense.amount);
    });

    const topCategories = Array.from(categoryMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      userName: `${this.user?.firstName || ''} ${this.user?.lastName || ''}`.trim() || 'User',
      totalExpenses: this.expenses.length,
      totalSpend,
      thisMonthSpend,
      topCategories
    };
  }



  goBack() {
    this.router.navigate(['/tabs/profile']);
  }
}
