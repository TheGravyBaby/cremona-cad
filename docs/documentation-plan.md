# Documentation: state and plan

Written 2026-10-06, ahead of 0.9.0. The goal is one documentation corpus the app, the
Documentation tab, the field help, the condition toasts and the developer notes all read from,
written as a wiki: one article per concept, a shared vocabulary, links between them.

## Where documentation lives today

Ten places, four voices, no shared vocabulary.

| Surface | Where | Size | State |
|---|---|---|---|
| Documentation tab | `about-modal.html`, nav in `about-modal.ts` | 17 topics, ~230 lines of HTML | Hand-written. Covers canvas, outline, arching, f-holes, mould, export. **No topic for Neck, Volute, Scroll, Scroll Widths or String Setup** (5 of 17 panels). Export topic predates the f-hole, neck and scroll sheets. |
| Field help (ⓘ) | `panels/field-info.ts` → `info()` toast | 42 write-ups, 31 bound in a panel | Ten neck write-ups are unbound and already stale: `neckReadoutInfo` lists projection, string-over-board and body depth, all cut since; `bodyStopInfo` still mentions neck stop. `trochoidFactorInfo` unbound. `plateThicknessInfo` is a one-line stub. |
| Tooltips (`title=`) | 25 HTML files | 251 attributes: ~140 explanatory, ~110 UI chrome ("Zoom in", "Add layer") | The scroll panels (volute, scroll, scroll widths: 39 titles, 0 ⓘ) carry their whole documentation in tooltips, several a paragraph long. Invisible on touch, unsearchable, no formatting. Some fields carry a title *and* an ⓘ saying the same thing. |
| Condition toasts | `helpers/validators.ts`, `ceruti-paths.ts`, `main-bouts-panel.ts`, `long-arching-panel.ts`, canvas, image store, layers, storage | ~15 messages | `MessageService` already models conditions well (titled chips that refresh and expire). The prose is the problem: the viol-neck one ends "Play with it, I'm sure you'll figure it out"; `safeRun` rotates seven jokes under "An Error Occurred :["; `transitionError` is written and never raised. |
| Inline notes | `station-note`, `hint`, `viol-corner-notice`, `settings-popup-note`, `export-row__desc` | ~25 strings | Fine where they are: they report state. The 16 export descriptions are documentation, though. |
| Changelog | `about-modal.html` | 12 releases, ~150 lines of HTML | Hardcoded markup. |
| README | `README.md` | 129 lines | Project structure is stale (no `calculation/`, no `templates/`, `render-toggles` at the wrong level). Says "Tutorial tab"; the tab says "Documentation". |
| Developer notes | 4 `CLAUDE.md` (1,034 lines), `docs/open-corpus-dataset.md`, `templates/local/README.md`, file headers | | The most accurate docs in the repo, and the only place the scroll's vocabulary (poll, hips, duck tail, hang, nape, throat) is defined. None of it is user-facing. |
| Template provenance | `meta.notes` on corpus JSON | 7 entries, 1 empty | Good. Stays with the data. |
| Standard measurements | Scattered through the ⓘ prose and four code files | | Rib thickness, rib height, arch height, button, bridge, mortise, overstand, projection, neck thickness, fingerboard, stop length, body stop, gouge sweep, land edge all appear as numbers inside paragraphs. The violin/viola/cello/bass thresholds (400/500/800 mm) are repeated in `ceruti-calcs`, `ceruti-arching`, `ceruti-arch-geometry` and `ceruti-neck`. |

The voices: the original hand-written register ("IRL", ":D", "^_^", "Oh wow, you found this
hidden section"), the dense agent-written luthier register on the scroll panels ("The poll, the
back of the head: where the back reaches furthest back, its tangent running straight up the
neck, on S2 or S1"), and a middle one in the arching infos. A user meets all three on one
panel.

The vocabulary: "Center Bout" beside "centreline"; "Land Edge" in the UI, `gougeCenterline` in
code, "where the flat land ends" in a tooltip; the field "Neck Projection °" next to a write-up
titled "Neck Angle" that uses *projection* for the 27 mm figure; the field "Stop" next to "Body
Stop"; "Crown Curve", "Cycloid Crown", "Cross-Arch Shape" for three parts of one thing; top/back
in the UI, `'top' | 'bottom'` in `transitionError`.

Nothing checks coverage. A new field gets a tooltip, an ⓘ, both or neither by whoever wrote it.

## The concept

**One corpus of Markdown articles in the repo, imported as text, read by every surface.**

```
src/app/docs/
  articles/
    body-stop.md
    overstand.md
    panel-neck.md
    tool-join-arc.md
    ...
  articles/index.ts      one import per article; a test fails if a file is missing from it
  docs-registry.ts       parses front matter, resolves [[links]], serves summary/brief/full
  docs-markdown.ts       renders the markdown subset the articles use
  style.md               the voice rules, as an article itself
```

An article:

```markdown
---
id: body-stop
title: Body stop
kind: concept
panel: stringSetup
aliases: [stop, bridge line]
standard:
  violin: 195
  viola: 220–230
  cello: 400
---
The distance from the top plate's upper edge down to the bridge line, where the
f-hole notches are cut.

The [[neck-stop]] and [[string-length]] follow from the neck's own length rather
than being entered; this is the one the maker measures.
```

The first paragraph is the **summary**: one or two sentences, what the thing *is*. It is what a
tooltip shows and what a link's hover shows. The whole body is the **full** article, what the
Documentation tab renders. The ⓘ shows the full article in the existing info toast, the way it
does now.

`kind` is one of `concept`, `field`, `panel`, `tool`, `condition`, `howto`. `panel` articles are
the Documentation tab's navigation, in `panelOrder`. `condition` articles are what a titled error
chip's ⓘ opens, so the explanation leaves the code and the code keeps only the sentence that
carries the numbers. `standard` is the measurement library: the library page is generated by
walking every article that carries one, so a figure lives beside the concept that explains it and
is never typed twice.

`[[slug]]` links resolve to in-modal navigation in the tab and to plain text everywhere else.
A link to a missing article fails a test, not a reader.

### How each surface changes

- **ⓘ button** → `(click)="doc.show('body-stop')"`. `field-info.ts` is deleted.
- **Tooltips.** Every `title=` is triaged into one of three bins, and no fourth exists:
  - *Chrome*: a button or control's name, under a sentence long ("Zoom in", "Add layer",
    "Fit to view (F)"). Stays a literal string. About 110 of the 251.
  - *Summary*: a field or toggle's one-sentence definition. Becomes the first paragraph of the
    field's article and is bound as `[title]="doc.summary('s2')"`. The attribute never holds
    prose of its own again, so a tooltip and its article cannot disagree.
  - *Article*: anything longer than a sentence. The text becomes the article body, the field
    gets an ⓘ, and the tooltip shows the summary. Writing a second sentence into a `title`
    becomes a lint failure.

  The scroll panel is the worked example: 15 tooltips and no ⓘ. "The head's height, from the
  nut up to the top of the crown" is a summary. The nape-circle toggle's tooltip is 70 words
  explaining three regimes, which is an article (`nape`) with the toggle's ⓘ opening it. "Where
  the arc ends, as the angle round its own centre from the front: 180° the back" appears on
  three arcs and becomes one `concept` article (`scroll-arc-angles`) each of them links.

  Coverage runs the other way too: every number field in a panel either binds a summary or is
  listed as a deliberate exception, so a new field without one fails the test rather than
  shipping bare, as the neck panel's eight fields do today.
- **Documentation tab** → one component rendering the registry: nav from `kind: panel` in panel
  order, a Concepts group, a Tools group, the measurement library, a search box over titles and
  aliases. `about-modal.html` loses ~230 lines.
- **Condition toasts** → `error(msg, title, { doc: 'rib-taper' })`; the chip shows ⓘ when a doc is
  attached. Prose stays terse and in one voice; the joke rotation goes.
- **Export rows** → each export's description is its article summary.
- **Changelog** → `CHANGELOG.md` at the repo root, rendered in the modal. Standard place,
  readable on GitHub, ~150 lines of HTML gone.
- **CLAUDE.md** → keeps its decisions and traps, but where it currently defines a term it links
  the article (`see docs: duck-tail`) instead. Agents then read the same definition users do.
- **Code constants** → post-0.9.0, `standardFingerboardLength` and the 400/500/800 thresholds
  read the library rather than restating it.

### Why this shape

- **Markdown in the repo, not a hosted wiki.** It ships offline with the app, it is GPL with the
  code, it is diffed and reviewed with the code, and agents read and write it like code. The
  CLAUDE.md files already prove this works for the developer side.
- **No build tooling.** `@angular/build:application` takes a `loader` option in `angular.json`
  mapping `.md` to `text`, so `import body from './articles/body-stop.md'` is a string with no
  plugin, and vitest handles the same import natively. An explicit `index.ts` rather than a glob
  import, since esbuild has no `import.meta.glob`; a node-environment test walks the directory
  and fails on an unlisted file.
- **Summary is the first paragraph, not a second field.** One thing to write, and the tooltip is
  guaranteed to open the article it summarises.
- **Lint it like code.** Node-environment specs: every `[[link]]` resolves; every id in
  `CERUTI_PANEL_IDS` has a `panel` article; every `doc(...)` id used in a template exists; every
  `standard` has a unit; no `concept` article is orphaned. Coverage stops being a human's memory.
- **Markdown renderer.** The articles use paragraphs, lists, `code`, tables and `[[links]]`. Hand-
  rolling that subset is ~80 lines and avoids a dependency; `marked` is the alternative if the
  subset grows. Decision for the user. Either way the output goes through `[innerHTML]`, which
  Angular sanitises.

### Voice

One register, written down in `style.md` so a human and an agent produce the same thing:

- Say what the concept *is* in luthier terms, then what the field controls. Stop.
- Full sentences, present tense, second person only for an instruction.
- British *centre* or American *center*: pick one and apply it to the UI as well as the docs
  (the UI currently mixes; the panel is "Center Bout" and the code says "centreline").
- Standard figures in a `standard` block, never in prose. Prose may say "about a third of the
  body stop"; it does not say "195 mm".
- A condition message says what is wrong and the one or two things that fix it. No reassurance,
  no jokes, no emoticons.
- Name things by the article title. If a field label and its article disagree, the label changes.

## Phases

The order matters: build the registry before writing 0.9.0's new documentation, or the neck and
scroll docs get written into `about-modal.html`, `field-info.ts` and `title=` attributes now and
migrated a month later.

### Phase 1: framework (before 0.9.0 docs)

Registry, loader, article type, renderer, the `doc` service, the ⓘ and tooltip bindings, the
Documentation tab reading the registry, the lint specs. No prose changes: every existing string
moves as-is into an article with `status: unreviewed` in its front matter. The UI looks the same
afterwards. One focused session.

### Phase 2: extraction and consolidation

Mechanical, and the bulk of the work:

- 42 `field-info.ts` write-ups → `field` and `concept` articles. Delete the file.
- 17 Documentation topics → `panel` articles.
- ~140 explanatory tooltips → summaries on the articles their fields belong to. Where a field has
  both a tooltip and an ⓘ, merge; the tooltip becomes the summary.
- 16 export descriptions → summaries.
- Condition explanations → `condition` articles; the code keeps the numbers.
- Changelog → `CHANGELOG.md`.
- Every standard figure found in prose → a `standard` block, library page generated.
- Scroll vocabulary (poll, hips, duck tail, hang, nape, throat, foot, round, crown, turns) → stub
  `concept` articles from the CLAUDE.md definitions, since nothing user-facing defines them.

Stale text is marked `status: stale`, not fixed yet. The outcome is one place where every piece
of documentation can be read in a row, which is what makes the rewrite possible.

### Phase 3: 0.9.0 documentation (release scope)

What 0.9.0 actually needs written, and nothing more:

- `panel` articles for Neck, Volute, Scroll, Scroll Widths, String Setup.
- The ten neck `field` articles corrected against the current neck (the string-length readout,
  the `length` field, no neck stop, no projection readout) and bound in the panel. CLAUDE.md
  reserves ⓘ binding for a human pass; with a coverage test in place that rule can become "the
  binding is enforced, the prose is reviewed by hand".
- Export article updated for the f-hole, neck, scroll front/back, strip and compass sheets.
- Drawing Tools article updated for the tools added since it was written.
- `plateThicknessInfo`, `trochoidFactor` and `transitionError` finished or deleted.
- README structure refreshed, "Tutorial" renamed throughout.
- 0.9.0 changelog entry.

### Phase 4: the wiki (after 0.9.0)

- Concept articles for the whole vocabulary: bout, corner, purfling, land, channel, crown,
  station, takeoff, mould, block, button, mortise, overstand, projection, body stop, and the
  scroll set. Each linked from every field that uses it.
- The voice pass: every `unreviewed` and `stale` article rewritten to `style.md`, status cleared.
- The measurement library filled out per instrument, with sources where there are any.
- Search in the Documentation tab.
- CLAUDE.md domain prose replaced by links to articles.
- Code constants pointed at the library.
- Possibly a docs drawer beside the panel in place of the info toast, once the content earns it.

## Decisions to make

1. Markdown subset by hand, or `marked`. Recommendation: by hand, until an article needs more.
2. *Centre* or *center*. Applies to field labels, not just prose.
3. Keep the info toast as the ⓘ surface for 0.9.0. Recommendation: yes; a drawer is phase 4.
4. Whether the measurement library is front matter per concept (recommended) or one table.
5. Whether the "ⓘ added by hand, not by an agent" rule becomes a coverage test plus human review
   of prose.
