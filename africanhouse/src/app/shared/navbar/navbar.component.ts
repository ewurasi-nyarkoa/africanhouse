import { Component, ChangeDetectionStrategy, HostListener, ChangeDetectorRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent {
  cartCount$;
  menuOpen = false;
  scrolled = false;

  constructor(
    private cartService: CartService,
    private cdr: ChangeDetectorRef
  ) {
    this.cartCount$ = this.cartService.cartCount$;
  }

  @HostListener('window:scroll')
  onScroll(): void {
    const wasScrolled = this.scrolled;
    this.scrolled = window.scrollY > 10;
    if (wasScrolled !== this.scrolled) {
      this.cdr.markForCheck();
    }
  }
}
