import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { FabricService } from '../../core/services/fabric.service';
import { CartService } from '../../core/services/cart.service';
import { Fabric, isAvailableForPurchase } from '../../core/models/fabric';
import { Title, Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-fabric-detail',
  imports: [RouterLink],
  templateUrl: './fabric-detail.component.html',
  styleUrl: './fabric-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FabricDetailComponent implements OnInit, OnDestroy {
  fabric: Fabric | undefined;
  yards = 0;
  added = false;
  relatedFabrics: Fabric[] = [];
  private destroy$ = new Subject<void>();

  get isSoldOut(): boolean {
    if (!this.fabric) return true;
    return !this.fabric.inStock || !isAvailableForPurchase(this.fabric.minYards, this.fabric.availableYards);
  }

  get remainingAvailable(): number {
    if (!this.fabric) return 0;
    return this.fabric.availableYards - this.cartService.yardsInCart(this.fabric.id);
  }

  get canIncrement(): boolean {
    if (!this.fabric) return false;
    return this.yards + this.fabric.minYards <= this.remainingAvailable;
  }

  get canDecrement(): boolean {
    if (!this.fabric) return false;
    return this.yards > this.fabric.minYards;
  }

  get subtotal(): number {
    return this.fabric ? this.fabric.pricePerYard * this.yards : 0;
  }

  constructor(
    private route: ActivatedRoute,
    private fabricService: FabricService,
    private cartService: CartService,
    private cdr: ChangeDetectorRef,
    private title: Title,
    private meta: Meta
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(
      switchMap(params => this.fabricService.getById(params['id'])),
      takeUntil(this.destroy$)
    ).subscribe(fabric => {
      this.fabric = fabric;
      if (fabric) {
        this.yards = fabric.minYards;
        this.title.setTitle(`${fabric.name} — African House`);
        this.meta.updateTag({
          name: 'description',
          content: `${fabric.description} Buy ${fabric.material} fabric by the yard at African House, Nsawam Ghana.`
        });
        this.loadRelated(fabric);
      }
      this.cdr.markForCheck();
    });
  }

  private loadRelated(current: Fabric): void {
    this.fabricService.getByCategory(current.category)
      .pipe(takeUntil(this.destroy$))
      .subscribe(all => {
        this.relatedFabrics = all
          .filter(f => f.id !== current.id && f.inStock && f.imageUrl)
          .slice(0, 6);
        this.cdr.markForCheck();
      });
  }

  increment(): void {
    if (this.canIncrement) {
      this.yards += this.fabric!.minYards;
    }
  }

  decrement(): void {
    if (this.canDecrement) {
      this.yards -= this.fabric!.minYards;
    }
  }

  addToCart(): void {
    if (!this.fabric || this.isSoldOut) return;
    if (this.remainingAvailable < this.fabric.minYards) return;
    this.cartService.addToCart(this.fabric, this.yards);
    this.added = true;
    this.yards = this.fabric.minYards;
    setTimeout(() => { this.added = false; this.cdr.markForCheck(); }, 2000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
