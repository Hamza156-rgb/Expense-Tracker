import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-auth-loading',
  templateUrl: './auth-loading.page.html',
  styleUrls: ['./auth-loading.page.scss']
})
export class AuthLoadingPage implements OnInit {
  constructor(private afAuth: AngularFireAuth, private router: Router) {}

  ngOnInit() {
    this.afAuth.authState.pipe(take(1)).subscribe(user => {
      this.router.navigate([user ? '/tabs/dashboard' : '/login'], { replaceUrl: true });
    });
  }
}

