import { Component, Input, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Fabric, isAvailableForPurchase } from '../../core/models/fabric';
import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-fabric-card',
  imports: [RouterLink],
  templateUrl: './fabric-card.component.html',
  styleUrl: './fabric-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FabricCardComponent implements OnChanges {
  @Input({ required: true }) fabric!: Fabric;

  yards = 0;

  get remainingAvailable(): number {
    return this.fabric.availableYards - this.cartService.yardsInCart(this.fabric.id);
  }

  get canIncrement(): boolean {
    return this.yards + this.fabric.minYards <= this.remainingAvailable;
  }

  get canDecrement(): boolean {
    return this.yards > this.fabric.minYards;
  }

  get isSoldOut(): boolean {
    return !this.fabric.inStock || !isAvailableForPurchase(this.fabric.minYards, this.fabric.availableYards);
  }

  ngOnChanges(): void {
    this.yards = this.fabric.minYards;
  }

  increment(): void {
    if (this.canIncrement) {
      this.yards += this.fabric.minYards;
    }
  }

  decrement(): void {
    if (this.canDecrement) {
      this.yards -= this.fabric.minYards;
    }
  }

  constructor(private cartService: CartService) {}

  addToCart(): void {
    if (this.isSoldOut) return;
    this.cartService.addToCart(this.fabric, this.yards);
    this.yards = this.fabric.minYards;
  }
}
