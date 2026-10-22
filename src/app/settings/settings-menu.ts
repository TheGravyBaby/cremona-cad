import { Component, inject } from '@angular/core';
import { TOOLTIPS, TooltipDirective } from '../docs/tooltips';
import { Appearance, SettingsService } from './settings.service';
import { IconDirective } from '../icons/icon.directive';

// placed by the top bar under its gear button, the way it places the edit menu
@Component({
  selector: 'app-settings-menu',
  standalone: true,
  imports: [TooltipDirective, IconDirective],
  templateUrl: './settings-menu.html',
  styleUrls: ['./settings-menu.css'],
})
export class SettingsMenuComponent {
  protected readonly settings = inject(SettingsService);

  protected readonly appearances: { id: Appearance; label: string; hint: string | null }[] = [
    { id: 'day', label: 'Day', hint: null },
    { id: 'auto', label: 'Auto', hint: TOOLTIPS['prefs.appearanceAuto'] },
    { id: 'night', label: 'Night', hint: null },
  ];
}
