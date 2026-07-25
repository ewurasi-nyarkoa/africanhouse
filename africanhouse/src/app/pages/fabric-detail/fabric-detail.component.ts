import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { FabricService } from '../../core/services/fabric.service';
import { CartService } from '../../core/services/cart.service';
import { Fabric } from '../../core/models/fabric';
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
  yards = 2;
  added = false;
  private destroy$ = new Subject<void>();

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
        this.meta.updateTag({ name: 'description', content: `${fabric.description} Buy ${fabric.material} fabric by the yard at African House, Nsawam Ghana.` });
      }
      this.cdr.markForCheck();
    });
  }

  increment(): void {
    if (this.fabric) this.yards += this.fabric.yardStep;
  }

  decrement(): void {
    if (this.fabric && this.yards > this.fabric.minYards) {
      this.yards -= this.fabric.yardStep;
    }
  }

  get subtotal(): number {
    return this.fabric ? this.fabric.pricePerYard * this.yards : 0;
  }

  addToCart(): void {
    if (!this.fabric) return;
    this.cartService.addToCart(this.fabric, this.yards);
    this.added = true;
    setTimeout(() => { this.added = false; this.cdr.markForCheck(); }, 2000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
