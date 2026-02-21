import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { AngularFireAuth } from '@angular/fire/compat/auth';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html'
})
export class AppComponent implements OnInit {
  constructor(
    private platform: Platform,
    private afAuth: AngularFireAuth,
    private router: Router
  ) {}

  ngOnInit() {
    this.platform.ready().then(() => {
      this.afAuth.authState.subscribe(user => {
        if (user) {
          if (this.router.url === '/login' || this.router.url === '/signup' || this.router.url === '/') {
            this.router.navigate(['/tabs/dashboard']);
          }
        } else {
          if (!this.router.url.startsWith('/signup')) {
            this.router.navigate(['/login']);
          }
        }
      });
    });
  }
}
