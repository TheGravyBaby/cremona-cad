---
id: style
title: Writing style
kind: meta
---
How every article in this documentation is written, so a human and an agent produce the same page.

- Say what the concept *is* in luthier terms, then what the field controls. Stop.
- Full sentences, present tense. Second person only for an instruction.
- The opening paragraph is the summary: one or two sentences, what the thing is. A tooltip shows it on its own, so it has to stand alone.
- Standard figures go in the `standard` block, never in prose. Prose may say "about a third of the body stop"; it does not say "195 mm". The measurement library page is built from those blocks.
- A condition article says what is wrong and the one or two things that fix it. No reassurance, no jokes.
- Name things by their article title. If a field label and its article disagree, the label changes.
- A drawing copied from the canvas goes in `public/wiki/` as an `.svg`, and into the article as `![caption](wiki/name.svg)` on a line of its own. It floats to the right of the text in a thumbnail box, as on Wikipedia, and the test suite checks the file exists.
- Articles may be filed in folders under `articles/`; the folder is for the author and means nothing to a link, so ids are unique across the whole set.
- Link a term the first time it appears with `[[slug]]`. A link to a missing article fails the test suite, not the reader.

## Front matter

| Key | Meaning |
|---|---|
| `id` | The file name without `.md`, kebab-case, whatever folder it sits in. |
| `kind` | `concept`, `field`, `panel`, `tool`, `condition`, `howto` or `meta`. |
| `panel` | For a `field` or `panel` article, the panel id it belongs to. |
| `aliases` | Other names a search should find it under. |
| `unit`, `standard` | The measurement block. `standard` is a map of instrument or part to figure. |
| `status` | `unreviewed` while the text is a straight move from the old surfaces, `stale` once known wrong. |
