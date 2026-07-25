import { Component, Input, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Fabric } from '../../core/models/fabric';
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

  get yards(): number { return this._yards; }
  private _yards = 0;

  ngOnChanges(): void {
    this._yards = this.fabric.minYards;
  }

  increment(): void { this._yards += this.fabric.yardStep; }

  decrement(): void {
    if (this._yards > this.fabric.minYards) {
      this._yards -= this.fabric.yardStep;
    }
  }

  constructor(private cartService: CartService) {}

  addToCart(): void {
    this.cartService.addToCart(this.fabric, this._yards);
    this._yards = this.fabric.minYards;
  }
}
