export type WorkspaceType = 'personal' | 'business' | 'tour';
export type AccountMode = WorkspaceType;

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
  accountMode?: AccountMode;
  businessName?: string;
  businessWorkspaceId?: string;
  tourName?: string;
  tourWorkspaceId?: string;
  tourMembers?: TourMember[];
  personalBudget?: number; // Monthly budget for personal mode
  businessBudget?: number; // Monthly budget for business mode
  tourBudget?: number; // Monthly budget for tour mode
}

// Tour member (a person sharing tour expenses; not necessarily an app user)
export interface TourMember {
  id: string;
  name: string;
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
  paidByMemberId?: string; // Tour mode: member who paid
  paidByName?: string;
  splitMemberIds?: string[]; // Tour mode: members sharing the cost (empty = all members)
  createdAt: Date;
}

// Filter Model
export interface ExpenseFilter {
  categoryIds?: string[];
  startDate?: Date;
  endDate?: Date;
}
