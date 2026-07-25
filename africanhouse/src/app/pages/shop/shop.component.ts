import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FabricService } from '../../core/services/fabric.service';
import { FabricCardComponent } from '../../shared/fabric-card/fabric-card.component';
import { Fabric } from '../../core/models/fabric';
import { Title, Meta } from '@angular/platform-browser';

type Category = Fabric['category'] | 'all';
type Material = Fabric['material'] | 'all';

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

  activeCategory: Category = 'all';
  activeMaterial: Material = 'all';

  categories: { value: Category; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'everyday', label: 'Everyday' },
    { value: 'funeral', label: 'Funeral' },
    { value: 'kente', label: 'Kente' },
  ];

  allMaterials: { value: Material; label: string; funeralOnly?: boolean }[] = [
    { value: 'all', label: 'All Materials' },
    { value: 'gtp', label: 'GTP' },
    { value: 'holland', label: 'Holland' },
    { value: 'soso', label: 'Soso' },
    { value: 'small-material', label: 'Small Material' },
    { value: 'kente', label: 'Kente' },
    { value: 'printex', label: 'Printex', funeralOnly: true },
  ];

  get visibleMaterials() {
    return this.allMaterials.filter(m =>
      !m.funeralOnly || this.activeCategory === 'funeral'
    );
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
    this.meta.updateTag({ name: 'description', content: 'Browse GTP, Holland, Printex, Soso, Kente and small material fabrics by the yard. Filter by occasion.' });

    combineLatest([
      this.fabricService.getAll(),
      this.route.queryParams
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([fabrics, params]) => {
      this.allFabrics = fabrics;
      if (params['category']) this.activeCategory = params['category'] as Category;
      this.applyFilters();
      this.cdr.markForCheck();
    });
  }

  setCategory(category: Category): void {
    this.activeCategory = category;
    // reset printex selection if switching away from funeral
    if (category !== 'funeral' && this.activeMaterial === 'printex') {
      this.activeMaterial = 'all';
    }
    this.applyFilters();
  }

  setMaterial(material: Material): void {
    this.activeMaterial = material;
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filtered = this.allFabrics.filter(f => {
      const categoryMatch = this.activeCategory === 'all' || f.category === this.activeCategory;
      const materialMatch = this.activeMaterial === 'all' || f.material === this.activeMaterial;
      return categoryMatch && materialMatch;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
