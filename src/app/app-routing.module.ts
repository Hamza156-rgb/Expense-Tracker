import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { PublicGuard } from './guards/public.guard';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./pages/auth-loading/auth-loading.module').then(m => m.AuthLoadingPageModule)
  },
  {
    path: 'signup',
    loadChildren: () => import('./pages/signup/signup.module').then(m => m.SignupPageModule),
    canActivate: [PublicGuard]
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule),
    canActivate: [PublicGuard]
  },
  {
    path: 'tabs',
    loadChildren: () => import('./pages/tabs/tabs.module').then(m => m.TabsPageModule),
    canActivate: [AuthGuard]
  },

  {
    path: 'add-expense',
    loadChildren: () =>
      import('./pages/add-expense/add-expense.module').then(m => m.AddExpensePageModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'workspace-mode',
    loadChildren: () => import('./pages/workspace-mode/workspace-mode.module').then(m => m.WorkspaceModePageModule),
    canActivate: [AuthGuard]
  },

  {
    path: '**',
    redirectTo: ''
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
