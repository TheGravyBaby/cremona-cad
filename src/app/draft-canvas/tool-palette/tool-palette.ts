import { afterNextRender, AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, inject, Injector, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DraftTool } from '../tools/draft-tool';
import { ToolRegistryService, ToolSlot } from '../tools/tool-registry';
import { isSmallViewport } from '../../helpers/viewport';
import { HOTKEY_LETTER_BY_TOOL } from '../tools/tool-hotkeys';
import { SelectionActions } from '../tools/selection-actions';

/** A button that acts on the selection once, at once — it never goes active the way a tool does.
 * Or, with `tool` set, a tool filed among the commands it belongs with (Rotate beside the quarter
 * turns), which activates instead. */
type SelectionCommand = { id: string; label: string; enabled: () => boolean; run: () => void; tool?: DraftTool };

/** One Bench-tab row: a tool slot, or a named group of commands behind one button, facing out
 * whichever was last used the way a tool flyout does. */
type ModifyRow = { slot?: ToolSlot; label?: string; commands?: SelectionCommand[] };

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
  private injector = inject(Injector);
  private cdr = inject(ChangeDetectorRef);
  private toolRegistry = inject(ToolRegistryService);
  private toolRegistryUnsub?: () => void;
  protected readonly actions = inject(SelectionActions);

  /** Which tab the dock shows: tools that draw, or tools and commands that change the selection. */
  public tab: 'draw' | 'modify' = 'draw';

  public get toolRows(): ToolSlot[][] { return this.toolRegistry.toolRows; }
  public get activeTool(): DraftTool | null { return this.toolRegistry.activeTool; }

  public openFlyout: ToolSlot | SelectionCommand[] | null = null;

  // Laid out here rather than in the registry because the commands are UI over SelectionActions,
  // not tools; the registry still owns the tools, found here by id.
  readonly modifyLayout: ModifyRow[] = (() => {
    const a = this.actions;
    const slot = (id: string): ModifyRow => ({
      slot: this.toolRegistry.modifyRows.flat().find(s => this.variantsOf(s).some(t => t.id === id))!,
    });
    const cmd = (id: string, label: string, enabled: () => boolean, run: () => void): SelectionCommand =>
      ({ id, label, enabled, run });
    const tool = (id: string): SelectionCommand => {
      const t = this.toolRegistry.modifyRows.flat().flatMap(s => this.variantsOf(s)).find(v => v.id === id)!;
      return { id, label: t.label, enabled: () => true, run: () => this.toolRegistry.selectTool(t), tool: t };
    };
    const mirror = () => a.canMirror;
    const transform = () => a.canTransform;
    const align = () => a.canAlign;
    const reorder = () => a.canReorder;
    return [
      slot('move'),
      slot('scale'),
      slot('offset'),
      slot('fillet'),
      {
        label: 'Mirror',
        commands: [
          cmd('flip-h', 'Flip Horizontal', mirror, () => a.mirror('horizontal')),
          cmd('flip-v', 'Flip Vertical', mirror, () => a.mirror('vertical')),
          cmd('flip-centreline', 'Mirror Centreline', mirror, () => a.mirror('centreline')),
          tool('mirror-line'),
        ],
      },
      {
        label: 'Rotate',
        commands: [
          tool('rotate'),
          cmd('rotate-ccw', 'Rotate Left', transform, () => a.rotate90('ccw')),
          cmd('rotate-cw', 'Rotate Right', transform, () => a.rotate90('cw')),
        ],
      },
      {
        label: 'Align & Distribute',
        commands: [
          cmd('align-left', 'Align Left', align, () => a.align('left')),
          cmd('align-centre', 'Align Centre', align, () => a.align('centre')),
          cmd('align-right', 'Align Right', align, () => a.align('right')),
          cmd('align-top', 'Align Top', align, () => a.align('top')),
          cmd('align-middle', 'Align Middle', align, () => a.align('middle')),
          cmd('align-bottom', 'Align Bottom', align, () => a.align('bottom')),
          cmd('distribute-h', 'Distribute Across', () => a.canDistribute, () => a.distribute('horizontal')),
          cmd('distribute-v', 'Distribute Down', () => a.canDistribute, () => a.distribute('vertical')),
        ],
      },
      {
        label: 'Stacking Order',
        commands: [
          cmd('front', 'To Front', reorder, () => a.reorder('front')),
          cmd('back', 'To Back', reorder, () => a.reorder('back')),
        ],
      },
      {
        label: 'Group',
        commands: [
          cmd('group', 'Group', () => a.canGroup, () => a.group()),
          cmd('ungroup', 'Ungroup', () => a.canUngroup, () => a.ungroup()),
        ],
      },
    ];
  })();

  private commandFaces = new Map<SelectionCommand[], SelectionCommand>();

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
  // a press anywhere outside the bar — the canvas above all — takes an open flyout down, as every
  // popup in the app does; presses inside it are the bar's own buttons, which close it themselves
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (this.openFlyout && !this.elRef.nativeElement.contains(event.target as Node)) this.openFlyout = null;
  }

  // captured on window so it runs ahead of the canvas's own Escape: closing a flyout is one step
  // back, and the canvas would otherwise also drop the selection or the tool with the same press
  private closeFlyoutOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.openFlyout) return;
    this.openFlyout = null;
    this.cdr.markForCheck();
    event.stopPropagation();
    event.preventDefault();
  };

  ngOnInit(): void {
    window.addEventListener('keydown', this.closeFlyoutOnEscape, { capture: true });
    this.toolRegistryUnsub = this.toolRegistry.onChange(() => {
      this.openFlyout = null;
      // a hotkey can pick a tool from the other tab; show the tab it lives on
      const tool = this.activeTool;
      const has = (rows: ToolSlot[][]) => !!tool && rows.some(row => row.some(slot => this.variantsOf(slot).includes(tool)));
      const tab = has(this.toolRegistry.modifyRows) ? 'modify' : has(this.toolRegistry.toolRows) ? 'draw' : this.tab;
      if (tab !== this.tab) this.switchTab(tab);
    });
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
    window.removeEventListener('keydown', this.closeFlyoutOnEscape, { capture: true });
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

  /** A tab's handle opens the dock on that tab, or closes it if that tab is already showing. */
  showTab(tab: 'draw' | 'modify'): void {
    if (this.open && this.tab === tab) {
      this.toggleOpen();
      return;
    }
    if (!this.open) this.toggleOpen();
    this.switchTab(tab);
  }

  // the two tabs hold different numbers of rows, so the column break is measured again
  private switchTab(tab: 'draw' | 'modify'): void {
    this.tab = tab;
    this.openFlyout = null;
    afterNextRender(() => this.layoutColumns(), { injector: this.injector });
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

  groupLabel(slot: ToolSlot): string | null { return this.toolRegistry.groupLabel(slot); }

  /** Activates whichever tool the slot's button is currently showing. */
  activateSlot(slot: ToolSlot): void {
    this.openFlyout = null;
    this.toolRegistry.selectTool(this.faceOf(slot));
  }

  /** The last used, unless only another in the group applies now — Ungroup faces out over a
   * selected group, since Group can't act on one. */
  commandFace(group: SelectionCommand[]): SelectionCommand {
    const active = group.find(c => c.tool && c.tool === this.activeTool);
    if (active) return active;
    const face = this.commandFaces.get(group) ?? group[0];
    // a tool is always enabled, so it never takes over the face just because the selection emptied
    return face.enabled() ? face : group.find(c => !c.tool && c.enabled()) ?? face;
  }

  /** Runs a command, and makes it the face of its group so the button repeats what was last done. */
  runCommand(group: SelectionCommand[], command: SelectionCommand): void {
    this.openFlyout = null;
    this.commandFaces.set(group, command);
    command.run();
  }

  toggleFlyout(slot: ToolSlot | SelectionCommand[], ev?: Event): void {
    this.openFlyout = this.openFlyout === slot ? null : slot;
    this.anchorPopup(ev);
  }

  /** Picking a variant from the flyout both activates it and becomes the slot's new default face. */
  chooseFlyoutVariant(slot: ToolSlot, tool: DraftTool): void {
    this.openFlyout = null;
    this.toolRegistry.selectVariant(slot, tool);
  }

  /** The hotkey for a tool or command id, formatted for a tooltip (e.g. " (L)"), or '' if it has none. */
  public hotkeyHint(id: string): string {
    const key = HOTKEY_LETTER_BY_TOOL[id] ?? ToolPaletteComponent.COMMAND_SHORTCUTS[id];
    return key ? ` (${key})` : '';
  }

  private static readonly COMMAND_SHORTCUTS: Record<string, string> = { group: 'Ctrl+G', ungroup: 'Ctrl+Shift+G' };
}
