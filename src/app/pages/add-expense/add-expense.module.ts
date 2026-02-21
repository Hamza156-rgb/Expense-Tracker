import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { AddExpensePage } from './add-expense.page';

const routes: Routes = [{ path: '', component: AddExpensePage }];

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [AddExpensePage]
})
export class AddExpensePageModule {}
