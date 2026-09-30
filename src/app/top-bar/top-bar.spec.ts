import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopBarComponent } from './top-bar';

describe('TopBarComponent', () => {
  let component: TopBarComponent;
  let fixture: ComponentFixture<TopBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopBarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopBarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the edit menu, and closes it after an action or a press elsewhere', () => {
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(el.querySelector('.edit-popup')).toBeNull();

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    const rows = el.querySelectorAll<HTMLButtonElement>('.menu-row');
    expect([...rows].map(r => r.querySelector('.menu-label')!.textContent)).toEqual(['Cut', 'Copy', 'Paste', 'Duplicate', 'Delete']);
    expect(rows[0].disabled).toBe(true);

    rows[2].click();
    fixture.detectChanges();
    expect(el.querySelector('.edit-popup')).toBeNull();

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('.edit-popup')).toBeNull();
  });
});
