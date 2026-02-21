import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';


@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss']
})
export class TabsPage {
  constructor(private router: Router,private navCtrl: NavController) {}

  addExpense() {
    this.navCtrl.navigateForward('/add-expense');
  }
}
