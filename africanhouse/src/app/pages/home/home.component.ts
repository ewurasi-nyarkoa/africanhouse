import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FabricService } from '../../core/services/fabric.service';
import { FabricCardComponent } from '../../shared/fabric-card/fabric-card.component';
import { SubscribeFormComponent } from '../../shared/subscribe-form/subscribe-form.component';
import { Fabric } from '../../core/models/fabric';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  imports: [TitleCasePipe, RouterLink, FabricCardComponent, SubscribeFormComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy {
  heroFabrics: Fabric[] = [];
  featured: Fabric[] = [];
  activeIndex = 0;
  animating = false;
  heroLoaded = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fabricService: FabricService,
    private title: Title,
    private meta: Meta,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.title.setTitle('AfriLoom Fabrics — Premium African Fabrics Ghana');
    this.meta.addTags([
      {
        name: 'description',
        content:
          'Buy GTP, Ankara, Kente, damask, voile and brocade fabric by the yard in Ghana. Church, wedding, work, everyday and funeral collections. AfriLoom Fabrics.',
      },
      {
        name: 'keywords',
        content:
          'GTP fabric Ghana, Ankara fabric Ghana, kente fabric, buy fabric Ghana, funeral cloth Ghana',
      },
      { property: 'og:title', content: 'AfriLoom Fabrics — Premium African Fabrics' },
      {
        property: 'og:description',
        content:
          'GTP, Ankara, Kente, damask, voile and brocade sold unsewn by the yard. Church, wedding, work, everyday and funeral collections.',
      },
      { property: 'og:type', content: 'website' },
    ]);

    this.fabricService
      .getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe((fabrics) => {
        this.heroFabrics = this.selectHeroFabrics(fabrics);
        this.featured = fabrics.slice(0, 3);
        setTimeout(() => {
          this.heroLoaded = true;
          this.cdr.markForCheck();
        }, 80);
        this.cdr.markForCheck();
      });
  }

  private selectHeroFabrics(fabrics: Fabric[]): Fabric[] {
    const inStock = fabrics.filter(f => f.inStock && f.availableYards >= f.minYards);

    const pick = (predicate: (f: Fabric) => boolean): Fabric | undefined =>
      inStock.find(predicate) ?? fabrics.find(predicate);

    const everyday = pick(f => f.category === 'everyday');
    const funeral  = pick(f => f.category === 'funeral');
    const kente    = pick(f => f.category === 'kente');
    const whiteBlack = pick(
      f => f.subcategory === 'White and Black'
        || f.colourPairing === 'white-black'
        || f.subcategory.toLowerCase().includes('white')
    );

    const chosen = [everyday, funeral, kente, whiteBlack];
    const seen   = new Set<string>();
    const result: Fabric[] = [];

    for (const f of chosen) {
      if (f && !seen.has(f.id)) {
        seen.add(f.id);
        result.push(f);
      }
    }

    return result;
  }

  get activeFabric(): Fabric | undefined {
    return this.heroFabrics[this.activeIndex];
  }

  getCardState(index: number): string {
    const len = this.heroFabrics.length;
    if (len === 0) return 'hidden';
    const diff = ((index - this.activeIndex) % len + len) % len;
    const states: Record<number, string> = {
      0: 'center',
      1: 'right-1',
      2: 'right-2',
    };
    const backDiff = ((this.activeIndex - index) % len + len) % len;
    if (backDiff === 1) return 'left-1';
    if (backDiff === 2) return 'left-2';
    return states[diff] ?? 'hidden';
  }

  navigate(direction: 1 | -1): void {
    if (this.animating || this.heroFabrics.length < 2) return;
    this.animating = true;
    const len = this.heroFabrics.length;
    this.activeIndex = ((this.activeIndex + direction) % len + len) % len;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.animating = false;
      this.cdr.markForCheck();
    }, 700);
  }

  goTo(index: number): void {
    if (this.animating || index === this.activeIndex) return;
    this.animating = true;
    this.activeIndex = index;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.animating = false;
      this.cdr.markForCheck();
    }, 700);
  }

  trackById(_: number, f: Fabric): string {
    return f.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
