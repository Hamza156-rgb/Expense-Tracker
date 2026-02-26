import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { AuthLoadingPage } from './auth-loading.page';

const routes: Routes = [{ path: '', component: AuthLoadingPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [AuthLoadingPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AuthLoadingPageModule {}

