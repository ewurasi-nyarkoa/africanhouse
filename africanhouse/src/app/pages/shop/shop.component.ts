import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FabricService } from '../../core/services/fabric.service';
import { FabricCardComponent } from '../../shared/fabric-card/fabric-card.component';
import { Fabric } from '../../core/models/fabric';
import {
  MAIN_CATEGORIES,
  getSubcategoriesForCategory,
  SubcategoryOption,
  MainCategory,
} from '../../core/models/filter-config';
import { Title, Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-shop',
  imports: [FabricCardComponent],
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShopComponent implements OnInit, OnDestroy {
  allFabrics: Fabric[] = [];
  filtered: Fabric[] = [];
  private destroy$ = new Subject<void>();

  activeCategory: MainCategory = 'all';
  activeSubcategory = '';

  readonly categories = MAIN_CATEGORIES;

  get subcategoryOptions(): SubcategoryOption[] {
    return getSubcategoriesForCategory(this.activeCategory);
  }

  constructor(
    private fabricService: FabricService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private title: Title,
    private meta: Meta
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Shop Fabrics — African House');
    this.meta.updateTag({
      name: 'description',
      content: 'Browse GTP, Holland, Printex, Soso, Kente and more fabrics by the yard. Filter by occasion and type.'
    });

    combineLatest([
      this.fabricService.getAll(),
      this.route.queryParams
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([fabrics, params]) => {
      this.allFabrics = fabrics;
      if (params['category']) {
        this.activeCategory = params['category'] as MainCategory;
        this.activeSubcategory = '';
      }
      this.applyFilters();
      this.cdr.markForCheck();
    });
  }

  setCategory(category: MainCategory): void {
    this.activeCategory = category;
    this.activeSubcategory = '';
    this.applyFilters();
  }

  setSubcategory(subcategory: string): void {
    this.activeSubcategory = subcategory;
    this.applyFilters();
  }

  clearFilters(): void {
    this.activeCategory = 'all';
    this.activeSubcategory = '';
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filtered = this.allFabrics.filter(f => {
      const categoryMatch = this.activeCategory === 'all' || f.category === this.activeCategory;
      const subcategoryMatch = !this.activeSubcategory || f.subcategory === this.activeSubcategory;
      return categoryMatch && subcategoryMatch;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
