import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { FabricService } from '../../core/services/fabric.service';
import { FabricCardComponent } from '../../shared/fabric-card/fabric-card.component';
import { SubscribeFormComponent } from '../../shared/subscribe-form/subscribe-form.component';
import { Fabric } from '../../core/models/fabric';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  imports: [AsyncPipe, RouterLink, FabricCardComponent, SubscribeFormComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit {
  featured$!: Observable<Fabric[]>;
  private destroy$ = new Subject<void>();

  constructor(
    private fabricService: FabricService,
    private title: Title,
    private meta: Meta
  ) {}

  ngOnInit(): void {
    this.title.setTitle('African House — Premium African Fabrics Ghana');
    this.meta.addTags([
      { name: 'description', content: 'Buy GTP, Ankara, Kente, damask, voile and brocade fabric by the yard in Ghana. Church, wedding, work, everyday and funeral collections. African House fabric store.' },
      { name: 'keywords', content: 'GTP fabric Ghana, Ankara fabric Ghana, kente fabric, abrokyiri kente, buy fabric Ghana, damask fabric, funeral cloth Ghana, voile fabric, brocade fabric, fabric by the yard, church fabric Ghana, wedding fabric Ghana' },
      { property: 'og:title', content: 'African House — Premium African Fabrics' },
      { property: 'og:description', content: 'GTP, Ankara, Kente, damask, voile and brocade sold unsewn by the yard. Church, wedding, work, everyday and funeral collections.' },
      { property: 'og:type', content: 'website' }
    ]);
    this.featured$ = this.fabricService.getAll().pipe(
      map(f => f.slice(0, 3)),
      takeUntil(this.destroy$)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
