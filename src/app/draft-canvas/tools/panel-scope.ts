// Where a layer or a reference image shows, by recipe panel id. Absent means every panel;
// `{ only: [] }` means nowhere. Which form is stored follows the verb the user chose, so "all but
// these" keeps admitting a panel the recipe grows later and "just these" keeps it out — no
// shorter-list heuristic deciding for them. Strings only: the canvas never learns what a panel is.
export type PanelScope = { only: string[] } | { except: string[] };

export const SCOPE_EVERYWHERE: PanelScope | undefined = undefined;
export const SCOPE_NOWHERE: PanelScope = { only: [] };

export function scopeOnly(panel: string | null): PanelScope {
  return { only: panel === null ? [] : [panel] };
}

/** A null panel (nothing pushed yet) filters nothing, so a missed push shows too much rather
 * than hiding something with no indication why. */
export function scopeShows(scope: PanelScope | undefined, panel: string | null): boolean {
  if (!scope) return true;
  if ('only' in scope) return panel === null ? scope.only.length > 0 : scope.only.includes(panel);
  return panel === null || !scope.except.includes(panel);
}

/** The scope after turning `panel` on or off, keeping the form it was in. With no panel open, on
 * means everywhere and off means nowhere. An emptied exception list goes back to plain absence. */
export function scopeWith(scope: PanelScope | undefined, panel: string | null, shown: boolean): PanelScope | undefined {
  if (scopeShows(scope, panel) === shown) return scope;
  if (panel === null) return shown ? SCOPE_EVERYWHERE : SCOPE_NOWHERE;
  if (!scope) return { except: [panel] };
  if ('only' in scope) return { only: shown ? [...scope.only, panel] : scope.only.filter(p => p !== panel) };
  const except = shown ? scope.except.filter(p => p !== panel) : [...scope.except, panel];
  return except.length ? { except } : SCOPE_EVERYWHERE;
}

export function isScopeNowhere(scope: PanelScope | undefined): boolean {
  return !!scope && 'only' in scope && scope.only.length === 0;
}

export function isScopeOnly(scope: PanelScope | undefined, panel: string | null): boolean {
  return !!scope && 'only' in scope && scope.only.length === 1 && scope.only[0] === panel;
}

/** The chip's word for a scope, from the open panel's point of view. */
export function scopeLabel(scope: PanelScope | undefined, panel: string | null): string {
  if (!scope) return 'everywhere';
  if ('only' in scope) {
    if (scope.only.length === 0) return 'nowhere';
    if (isScopeOnly(scope, panel)) return 'here only';
    return `${scope.only.length} ${scope.only.length === 1 ? 'panel' : 'panels'}`;
  }
  return `all but ${scope.except.length}`;
}

/** The chip's tooltip: the same scope with the panels named. */
export function scopeDescription(scope: PanelScope | undefined, labelFor: (id: string) => string): string {
  if (!scope) return 'Shown on every panel';
  if ('only' in scope) return scope.only.length ? `Shown on ${scope.only.map(labelFor).join(', ')}` : 'Shown nowhere';
  return `Shown everywhere except ${scope.except.map(labelFor).join(', ')}`;
}
