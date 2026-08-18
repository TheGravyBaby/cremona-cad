import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DraftTool } from '../tools/draft-tool';
import { ToolRegistryService, ToolSlot } from '../tools/tool-registry';
import { isSmallViewport } from '../../helpers/viewport';
import { HOTKEY_LETTER_BY_TOOL } from '../tools/tool-hotkeys';

/**
 * The docked drafting toolbox: nothing but tool selection. Per-shape-type settings live in the
 * bottom bar (settings-bar.ts), and so do layers and reference images (layer-controls.ts) — what
 * is left here is what you draw with. All of its state is display state: which flyout is open,
 * and which variant faces out of a multi-variant slot. draft-canvas.ts keeps ownership of the
 * actual tool instances/pointer routing and only needs to know which tool is active.
 */
@Component({
  selector: 'app-tool-palette',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './tool-palette.html',
  styleUrls: ['./tool-palette.css'],
})
export class ToolPaletteComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly OPEN_KEY = 'draft-canvas-tool-palette-open';

  private elRef = inject(ElementRef<HTMLElement>);
  private toolRegistry = inject(ToolRegistryService);
  private toolRegistryUnsub?: () => void;

  public get toolRows(): ToolSlot[][] { return this.toolRegistry.toolRows; }
  public get activeTool(): DraftTool | null { return this.toolRegistry.activeTool; }

  public openFlyout: ToolSlot | null = null;

  /** Whether the bar is pushed open. Collapsed it's just the chevron rail — there's no hover-peek
   * any more, since a phone has no hover to peek with. */
  public open = true;

  @ViewChild('palette') private palette?: ElementRef<HTMLElement>;
  @ViewChild('dockBody') private dockBody?: ElementRef<HTMLElement>;
  private resizeObs?: ResizeObserver;
  /** Rows per column, as last written onto the grid — see layoutColumns(). */
  private rowsPerColumn = 0;

  /** Inline placement for whichever popup is open, written by positionPopup(). Null leaves the
   * stylesheet's fallback — the top of the bar — which is what jsdom gets, having no layout. */
  public popupTop: string | null = null;
  public popupBottom: string | null = null;
  public popupMaxHeight: string | null = null;
  /** The button the open popup belongs to. Kept as an element rather than a measurement because
   * the rows are centred, so every button moves whenever the bar's height changes. */
  private popupAnchor: HTMLElement | null = null;

  constructor() {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(ToolPaletteComponent.OPEN_KEY);
    } catch {
      // ignore blocked sessionStorage
    }
    // Same test the recipe panel uses (helpers/viewport.ts), so a small screen opens with neither
    // bar over the drawing rather than one of them.
    this.open = stored === null ? !isSmallViewport() : stored === 'true';
  }

  toggleOpen(): void {
    this.open = !this.open;
    // a flyout left open behind a collapsed bar would reappear on the next expand
    if (!this.open) this.openFlyout = null;
    try {
      sessionStorage.setItem(ToolPaletteComponent.OPEN_KEY, String(this.open));
    } catch {
      // ignore storage errors
    }
  }

  /** Reacts to the active tool changing for reasons outside this component (e.g. a hotkey) —
   * mirrors what activateSlot()/chooseFlyoutVariant() already do locally, so both paths close
   * an open flyout identically. */
  ngOnInit(): void {
    this.toolRegistryUnsub = this.toolRegistry.onChange(() => { this.openFlyout = null; });
  }

  /** Runs before the first paint, so the bar is never briefly laid out at the CSS fallback. */
  ngAfterViewInit(): void {
    this.layoutColumns();
    if (typeof ResizeObserver === 'undefined') return;
    // the bar, not the body: the body's width is what layoutColumns() ends up changing, and
    // observing that would feed it back in. Height is what the column count actually depends on.
    this.resizeObs = new ResizeObserver(() => { this.layoutColumns(); this.positionPopup(); });
    this.resizeObs.observe(this.elRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.toolRegistryUnsub?.();
    this.resizeObs?.disconnect();
  }

  /** How many rows fit in one column at the bar's current height, written onto the grid. See the
   * .tool-dock-body comment for why the layout engine can't work this out for itself. Padding and
   * gap are read back rather than restated here, so the stylesheet stays the one place they're set.
   * Silent when the bar is collapsed or under jsdom — nothing has a height to measure, and the
   * count from the last time it did is still the right one to keep. */
  private layoutColumns(): void {
    const body = this.dockBody?.nativeElement;
    if (!body) return;
    const rows = body.querySelectorAll<HTMLElement>('.tool-row');
    const rowHeight = rows[0]?.offsetHeight ?? 0;
    if (!rowHeight) return;

    const style = getComputedStyle(body);
    const gap = parseFloat(style.rowGap) || 0;
    const inner = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    // n rows stand n-1 gaps tall, so the last row needs no gap after it to fit
    const fits = Math.floor((inner + gap) / (rowHeight + gap));
    const perColumn = Math.min(rows.length, Math.max(1, fits));
    if (perColumn === this.rowsPerColumn) return;

    this.rowsPerColumn = perColumn;
    body.style.gridAutoFlow = 'column';
    body.style.gridTemplateRows = `repeat(${perColumn}, auto)`;
  }

  /** Remembers which button a popup was opened from, then places the popup there. */
  private anchorPopup(ev?: Event): void {
    const target = ev?.currentTarget as HTMLElement | undefined;
    this.popupAnchor = target ? target.closest<HTMLElement>('.tool-flyout') : null;
    this.positionPopup();
  }

  /** Puts the open popup level with the button that opened it. The popup is a child of the bar
   * rather than of its button (see .tool-flyout-popup), so the offset has to be written on. It
   * anchors by its top from a button in the bar's upper half and by its bottom from one in the
   * lower half, so there is always at least half the bar's height to grow into — a Layers popup
   * hung off the bottom-most button would otherwise scroll inside a 40px sliver. */
  private positionPopup(): void {
    const bar = this.palette?.nativeElement;
    if (!bar || !this.popupAnchor) return;
    const barBox = bar.getBoundingClientRect();
    const btnBox = this.popupAnchor.getBoundingClientRect();
    if (!barBox.height || !btnBox.height) return;

    const top = Math.max(0, btnBox.top - barBox.top);
    const bottom = Math.max(0, barBox.bottom - btnBox.bottom);
    if (top + btnBox.height / 2 <= barBox.height / 2) {
      this.popupTop = `${top}px`;
      this.popupBottom = 'auto';
      this.popupMaxHeight = `${barBox.height - top}px`;
    } else {
      this.popupTop = 'auto';
      this.popupBottom = `${bottom}px`;
      this.popupMaxHeight = `${barBox.height - bottom}px`;
    }
  }

  /** Pass null for the Select button — back to no active drafting tool. */
  selectTool(tool: DraftTool | null): void {
    this.toolRegistry.selectTool(tool);
  }

  // The three slot shape questions the template asks, delegated to the registry so the palette
  // never has to know whether a slot is a lone tool or an array of variants.

  faceOf(slot: ToolSlot): DraftTool { return this.toolRegistry.faceOf(slot); }

  variantsOf(slot: ToolSlot): DraftTool[] { return this.toolRegistry.variantsOf(slot); }

  hasVariants(slot: ToolSlot): boolean { return this.toolRegistry.hasVariants(slot); }

  /** Activates whichever tool the slot's button is currently showing. */
  activateSlot(slot: ToolSlot): void {
    this.openFlyout = null;
    this.toolRegistry.selectTool(this.faceOf(slot));
  }

  toggleFlyout(slot: ToolSlot, ev?: Event): void {
    this.openFlyout = this.openFlyout === slot ? null : slot;
    this.anchorPopup(ev);
  }

  /** Picking a variant from the flyout both activates it and becomes the slot's new default face. */
  chooseFlyoutVariant(slot: ToolSlot, tool: DraftTool): void {
    this.openFlyout = null;
    this.toolRegistry.selectVariant(slot, tool);
  }

  /** The hotkey letter for a tool id, formatted for a tooltip (e.g. " (L)"), or '' if it has none. */
  public hotkeyHint(toolId: string): string {
    const letter = HOTKEY_LETTER_BY_TOOL[toolId];
    return letter ? ` (${letter})` : '';
  }
}
