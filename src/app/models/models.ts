// User Model
export interface User {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
}

// Category Model
export interface Category {
  id?: string;
  name: string;
  icon: string;
  color: string;
  userId: string;
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
  createdAt: Date;
}

// Filter Model
export interface ExpenseFilter {
  categoryIds?: string[];
  startDate?: Date;
  endDate?: Date;
}
