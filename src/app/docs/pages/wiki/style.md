---
id: style
title: Writing style
kind: meta
---
How every page in the info booth is written, so a human and an agent produce the same page.

- Say what the concept *is* in luthier terms, then what the field controls. Stop.
- Full sentences, present tense. Second person only for an instruction.
- A wiki article's opening paragraph is the summary: one or two sentences, what the thing is. A tooltip shows it on its own, so it has to stand alone.
- Standard figures go in the `standard` block, never in prose. Prose may say "about a third of the body stop"; it does not say "195 mm". The measurement library page is built from those blocks.
- A condition article says what is wrong and the one or two things that fix it. No reassurance, no jokes.
- Name things by their article title. If a field label and its article disagree, the label changes.
- A drawing copied from the canvas goes in `public/wiki/` as an `.svg`, and into the article as `![caption](wiki/name.svg)` on a line of its own. It floats to the right of the text in a thumbnail box, as on Wikipedia, and the test suite checks the file exists.
- Every page is one file under `src/app/docs/pages/`: `booth/` for a tab of its own, `history/` for a release, `wiki/` for the rest, in whatever folders suit the author. Each gets a line in `pages/index.ts`, and a new booth tab also goes in `BOOTH_TABS` there. The folder means nothing to a link, so ids are unique across the whole set and a link reaches any page, whichever tab shows it.
- Link a term the first time it appears with `[[slug]]`. A link to a missing article fails the test suite, not the reader.

## Components

A component is a tag on a line of its own, opened and closed, with markdown inside. Only these exist; any other tag fails the test suite.

| Tag | Holds | Shows |
|---|---|---|
| `<carousel>` | Images, one per line, each `![caption](path)`. | One thumbnail at a time, floated right, with arrows to step through them. |

## Linking from outside

Every page has an address: the app's address with `#doc/<id>` on the end, the same as a `[[link]]` inside the booth. The address bar follows the page shown, so copy it from there.

## Front matter

| Key | Meaning |
|---|---|
| `id` | The file name without `.md`, kebab-case, whatever folder it sits in. A release keeps its dots: `v0.8.3`. |
| `kind` | `concept`, `field`, `panel`, `tool`, `condition`, `howto` or `meta` in the wiki; `booth` for a tab of its own, whose title is the tab's label; `release` for a page in the history. |
| `panel` | For a `field` or `panel` article, the panel id it belongs to. |
| `aliases` | Other names a search should find it under. |
| `unit`, `standard` | The measurement block. `standard` is a map of instrument or part to figure. |
| `status` | `unreviewed` while the text is a straight move from the old surfaces, `stale` once known wrong. |
| `date` | For a release, the day it shipped, `YYYY-MM-DD`. A release without one is unreleased. |
