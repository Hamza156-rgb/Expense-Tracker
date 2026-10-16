import { AccountMode, User, WorkspaceScope } from '../models/models';

export function getAccountMode(user: User | null | undefined): AccountMode {
  if (user?.accountMode === 'business' || user?.accountMode === 'tour') {
    return user.accountMode;
  }
  return 'personal';
}

export function getWorkspaceScope(user: User | null | undefined): WorkspaceScope {
  const mode = getAccountMode(user);
  if (mode === 'business') {
    return {
      workspaceType: 'business',
      workspaceId: user!.businessWorkspaceId || toWorkspaceId('shop', user!.businessName, 'default')
    };
  }
  if (mode === 'tour') {
    return {
      workspaceType: 'tour',
      workspaceId: user!.tourWorkspaceId || toWorkspaceId('tour', user!.tourName, 'default')
    };
  }
  return { workspaceType: 'personal', workspaceId: 'personal' };
}

export function getModeLabel(user: User | null | undefined): string {
  const mode = getAccountMode(user);
  if (mode === 'business') return 'Business';
  if (mode === 'tour') return 'Tour';
  return 'Personal';
}

export function toWorkspaceId(prefix: string, name?: string, fallback = `${Date.now()}`): string {
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-${slug || fallback}`;
}
