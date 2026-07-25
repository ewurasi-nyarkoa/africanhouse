import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FabricDetailComponent } from './fabric-detail.component';

describe('FabricDetailComponent', () => {
  let component: FabricDetailComponent;
  let fixture: ComponentFixture<FabricDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FabricDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FabricDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
