import { isScopeNowhere, scopeLabel, scopeOnly, scopeShows, scopeWith, SCOPE_NOWHERE } from './panel-scope';

describe('panel scope', () => {
  it('shows everywhere when absent, nowhere when only is empty', () => {
    expect(scopeShows(undefined, 'base')).toBe(true);
    expect(scopeShows(undefined, null)).toBe(true);
    expect(scopeShows(SCOPE_NOWHERE, 'base')).toBe(false);
    expect(scopeShows(SCOPE_NOWHERE, null)).toBe(false);
  });

  it('filters nothing on a null panel unless scoped to nowhere', () => {
    expect(scopeShows({ only: ['crossArching'] }, null)).toBe(true);
    expect(scopeShows({ except: ['crossArching'] }, null)).toBe(true);
  });

  it('turning a panel off everywhere starts an exception list, and emptying it goes back to absence', () => {
    const off = scopeWith(undefined, 'crossArching', false);
    expect(off).toEqual({ except: ['crossArching'] });
    expect(scopeShows(off, 'crossArching')).toBe(false);
    expect(scopeShows(off, 'base')).toBe(true);
    expect(scopeWith(off, 'crossArching', true)).toBeUndefined();
  });

  it('turning panels on from here-only grows the list, and turning the last one off is nowhere', () => {
    const here = scopeOnly('longArching');
    const two = scopeWith(here, 'neck', true);
    expect(two).toEqual({ only: ['longArching', 'neck'] });
    expect(scopeWith(scopeWith(two, 'neck', false), 'longArching', false)).toEqual(SCOPE_NOWHERE);
    expect(isScopeNowhere(scopeWith(here, 'longArching', false))).toBe(true);
  });

  it('is a no-op when the panel is already in the wanted state', () => {
    const scope = { except: ['mould'] };
    expect(scopeWith(scope, 'mould', false)).toBe(scope);
    expect(scopeWith(scope, 'base', true)).toBe(scope);
  });

  it('with no panel open, only nowhere turns on, and anything showing turns off to nowhere', () => {
    const only = { only: ['base'] };
    expect(scopeWith(only, null, true)).toBe(only);
    expect(scopeWith(SCOPE_NOWHERE, null, true)).toBeUndefined();
    expect(scopeWith(undefined, null, false)).toEqual(SCOPE_NOWHERE);
    expect(scopeWith(only, null, false)).toEqual(SCOPE_NOWHERE);
  });

  it('labels from the open panel\'s point of view', () => {
    expect(scopeLabel(undefined, 'base')).toBe('everywhere');
    expect(scopeLabel(SCOPE_NOWHERE, 'base')).toBe('nowhere');
    expect(scopeLabel({ only: ['base'] }, 'base')).toBe('here only');
    expect(scopeLabel({ only: ['base'] }, 'mould')).toBe('1 panel');
    expect(scopeLabel({ only: ['base', 'mould'] }, 'base')).toBe('2 panels');
    expect(scopeLabel({ except: ['base', 'mould', 'neck'] }, 'base')).toBe('all but 3');
  });
});
