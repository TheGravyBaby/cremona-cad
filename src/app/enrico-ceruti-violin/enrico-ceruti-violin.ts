import { ChangeDetectorRef, Component, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeComponentBase } from '../recipe-base/recipe-base';
import { RecipeInterface } from '../models/types';
import { renderLine} from '../helpers/renderFuncs';
import { clampParam, safeRun } from '../helpers/validators';

// =====================================================
// Types
// =====================================================

export interface EnricoCerutiParams {
  height: number;
  width: number;
}

export interface EnricoCerutiTemplate {
  key: string;
  label: string;
  recipeName: string;
  fileName: string;
  version: string;
  description?: string;
  params: EnricoCerutiParams;
  paths: any[];
  referenceImage?: any;
}

export interface EnricoCerutiData extends RecipeInterface {
  params: EnricoCerutiParams;
  options: {
    showGuideLines: boolean;
  };
}

// =====================================================
// Default template
// =====================================================

export const CERUTI_TEMPLATES: EnricoCerutiTemplate[] = [
  {
    key: 'ceruti-default',
    label: 'Ceruti Default',
    recipeName: 'enrico-ceruti-violin',
    fileName: 'ceruti-default',
    version: '0.1',
    description: 'Starting point based on Enrico Ceruti proportions.',
    params: {
      height: 356,
      width: 208,
    },
    paths: [],
  },
];

// =====================================================
// Component
// =====================================================

@Component({
  selector: 'app-enrico-ceruti-violin',
  imports: [FormsModule],
  templateUrl: './enrico-ceruti-violin.html',
  styleUrls: ['../sidebar.css', './enrico-ceruti-violin.css'],
})
export class EnricoCerutiViolin extends RecipeComponentBase {

  // ===== Static config =====

  protected readonly panelOrder = [
    { id: 'base',         label: 'Base Measurements' },
    { id: 'export',       label: 'Export' },
  ] as const;

  // ===== Constructor =====

  constructor(private readonly cdr: ChangeDetectorRef) {
    super();
    this.initializePanelFlow(this.panelOrder);
    this.initializeDebounce(() => this.refreshBoundInputs());
  }

  // ===== Component state =====

  readonly templates: EnricoCerutiTemplate[] = CERUTI_TEMPLATES;
  override openPanel = 'base';
  override d: EnricoCerutiData = {
    ...CERUTI_TEMPLATES[0],
    options: { showGuideLines: true },
  };

  showGuideLines = true;
  showAllCircles = true;

  get selectedTemplateKey(): string {
    const current = JSON.stringify(this.d.params);
    return this.templates.find(t => JSON.stringify(t.params) === current)?.key ?? '';
  }

  loadTemplate(key: string): void {
    if (!key) return;
    const template = this.templates.find(t => t.key === key);
    if (!template) return;
    this.loadFile = template;
    this.referenceImageChange.emit(template.referenceImage ?? null);
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

  // ===== Inputs & lifecycle =====

  @Input() set newFile(v: boolean) {
    if (v) {
      this.d = {
        ...CERUTI_TEMPLATES[0],
        options: { showGuideLines: true },
      };
      this.openPanel = 'base';
      this.draftChange.emit([this.firstRender]);
    }
  }

  override firstRender = (g: any, ui: any): void => {
    this.setBounds.emit({
      pt1: { x: -this.d.params.width / 2, y: 0 },
      pt2: { x:  this.d.params.width / 2, y: this.d.params.height },
    });
    this.renderBounds(g, ui);
  };

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  // ===== UI event handlers =====

  @HostListener('keydown', ['$event'])
  onHostKeyDown(e: KeyboardEvent) {
    this.debounceController?.markImmediateFromKey(e);
  }

  @HostListener('mousedown', ['$event'])
  onHostMouseDown(e: MouseEvent) {
    this.debounceController?.markImmediateFromMouse(e);
  }

  // ===== Panel system =====

  override getActivationHandlers(): Record<string, () => void> {
    return {
      base:       () => this.changeBaseMeasurements(),
    };
  }

  override canOpenPanel(panel: string): boolean {
    switch (panel) {
      case 'base':       return true;
      case 'mainBouts':  return this.hasBaseMeasurements();
      default:           return false;
    }
  }

  // ===== Guards =====

  private hasBaseMeasurements(): boolean {
    const p = this.d.params;
    return p.width > 0 && p.height > 0 // && p.inset >= 0;
  }

  // ===== Shared helpers =====

  protected override refreshBoundInputs(): void {
    queueMicrotask(() => {
      this.cdr.markForCheck();
    });
  }

  protected clamp(
    key: keyof EnricoCerutiParams,
    min: number,
    max = Infinity,
    tooSmallMsg?: string,
    tooBigMsg?: string,
  ): void {
    clampParam(this.d.params, key, min, max, tooSmallMsg, tooBigMsg);
  }

  // ===== Change pipeline =====

  changeBaseMeasurements(): void {
    this.debounce(() => safeRun(() => {
      this.clamp('height', 1);
      this.clamp('width',  1);
      this.setBounds.emit({
        pt1: { x: -this.d.params.width / 2, y: 0 },
        pt2: { x:  this.d.params.width / 2, y: this.d.params.height },
      });
      this.draftChange.emit([this.renderBounds]);
      sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    }));
  }

  renderBounds = (g: any, ui: any): void => {
    const p = this.d.params;
    const hw = p.width / 2;
    // bounding box
    renderLine({ x: -hw, y: 0 }, { x: hw, y: 0 }, '#555')(g, ui);
    renderLine({ x: -hw, y: p.height }, { x: hw, y: p.height }, '#555')(g, ui);
    renderLine({ x: -hw, y: 0 }, { x: -hw, y: p.height }, '#555')(g, ui);
    renderLine({ x:  hw, y: 0 }, { x:  hw, y: p.height }, '#555')(g, ui);
    // center axis
    renderLine({ x: 0, y: 0 }, { x: 0, y: p.height }, '#444')(g, ui);
  };

}
