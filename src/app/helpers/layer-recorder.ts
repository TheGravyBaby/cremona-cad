// A stand-in for the two d3 selections a render layer draws into.
//
// A render layer is an opaque `(g, ui) => void`, so the only way to find out
// what one drew is to run it and watch. Running it against the real canvas needs
// a DOM and tells you nothing you can assert on; running it against this tells
// you exactly which primitives came out and with what geometry.
//
// The render functions use a narrow slice of d3 — `append`, `attr`, `text`,
// `style` and one `on`, all chainable — so faking that is enough, and cheap
// enough not to need jsdom.

/** What panels and the recipe pipeline both emit. Structurally identical to `RenderLayer`. */
export type RecordableLayer = (g: any, ui: any) => void;

export interface RecordedElement {
  /** Which selection it was drawn into — world geometry, or the UI overlay. */
  layer: 'g' | 'ui';
  /** SVG tag name: 'path', 'circle', 'line', 'text'… */
  tag: string;
  attrs: Record<string, unknown>;
  text?: string;
}

class FakeSelection {
  constructor(
    private readonly sink: RecordedElement[],
    private readonly layer: 'g' | 'ui',
    private readonly element?: RecordedElement,
  ) {}

  append(tag: string): FakeSelection {
    const element: RecordedElement = { layer: this.layer, tag, attrs: {} };
    this.sink.push(element);
    return new FakeSelection(this.sink, this.layer, element);
  }

  attr(key: string, value: unknown): FakeSelection {
    if (this.element) this.element.attrs[key] = value;
    return this;
  }

  style(key: string, value: unknown): FakeSelection {
    if (this.element) this.element.attrs[`style:${key}`] = value;
    return this;
  }

  text(value: unknown): FakeSelection {
    if (this.element) this.element.text = String(value);
    return this;
  }

  on(): FakeSelection {
    return this;
  }
}

export interface Recording {
  elements: RecordedElement[];
  /** Tag counts across both selections — usually what an assertion wants. */
  countByTag: Record<string, number>;
  /** Every `d` emitted, for asserting on path geometry. */
  paths: string[];
}

/**
 * Runs a layer stack against fake selections and reports what it drew.
 *
 * ```ts
 * const drawn = recordLayers(panel.buildRun());
 * expect(drawn.countByTag['path']).toBeGreaterThan(0);
 * ```
 */
export function recordLayers(layers: RecordableLayer[]): Recording {
  const elements: RecordedElement[] = [];
  const g = new FakeSelection(elements, 'g');
  const ui = new FakeSelection(elements, 'ui');
  for (const layer of layers) layer(g, ui);

  const countByTag: Record<string, number> = {};
  const paths: string[] = [];
  for (const el of elements) {
    countByTag[el.tag] = (countByTag[el.tag] ?? 0) + 1;
    if (typeof el.attrs['d'] === 'string') paths.push(el.attrs['d'] as string);
  }
  return { elements, countByTag, paths };
}
