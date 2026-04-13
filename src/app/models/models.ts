export type WorkspaceType = 'personal' | 'business';

export interface WorkspaceScope {
  workspaceType: WorkspaceType;
  workspaceId: string;
}

// User Model
export interface User {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  accountMode?: 'personal' | 'business';
  businessName?: string;
  businessWorkspaceId?: string;
  personalBudget?: number; // Monthly budget for personal mode
  businessBudget?: number; // Monthly budget for business mode
}

// Category Model
export interface Category {
  id?: string;
  name: string;
  icon: string;
  color: string;
  userId: string;
  workspaceType?: WorkspaceType;
  workspaceId?: string;
  isDefault?: boolean;
  createdAt: Date;
}

// Expense Model
export interface Expense {
  id?: string;
  title: string;
  amount: number;
  categoryId: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  date: Date;
  notes?: string;
  userId: string;
  workspaceType?: WorkspaceType;
  workspaceId?: string;
  createdAt: Date;
}

// Filter Model
export interface ExpenseFilter {
  categoryIds?: string[];
  startDate?: Date;
  endDate?: Date;
}
