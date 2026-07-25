import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FabricCardComponent } from './fabric-card.component';

describe('FabricCardComponent', () => {
  let component: FabricCardComponent;
  let fixture: ComponentFixture<FabricCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FabricCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FabricCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
