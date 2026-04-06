import { Component, OnInit } from '@angular/core';
import { Platform } from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html'
})
export class AppComponent implements OnInit {
  constructor(private platform: Platform) {}

  ngOnInit() {
    this.platform.ready().then(() => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      const storedTheme = localStorage.getItem('theme');
      
      if (storedTheme === 'dark' || (!storedTheme && prefersDark.matches)) {
        document.body.classList.add('dark');
      } else if (storedTheme === 'light') {
        document.body.classList.add('light');
        document.body.classList.remove('dark');
      }
    });
  }
}
