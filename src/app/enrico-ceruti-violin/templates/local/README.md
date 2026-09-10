# templates/local

Drop-in space for templates you're actively tracing or theorizing about — no provenance, no
credit, no `meta`, no licence to check. Unlike `../corpus/`, nothing here goes into source control
(see the root `.gitignore`) and nothing here ships in a production build.

## One-time setup, per clone

`generated-index.ts` in this folder is committed (so a fresh checkout always builds) but is
regenerated locally every time you sync — without this, git would show it modified constantly.
Run once per clone:

    git update-index --skip-worktree src/app/enrico-ceruti-violin/templates/local/generated-index.ts

## Using it

1. Put a recipe JSON file straight in this folder — the loose, pasted-session-storage shape
   `templateFromRecipeJson` (`../recipe-json.ts`) normalizes, not the strict `corpus/` one. Put
   any reference-image files it points at in here too, referenced as `/local/<file>`.
2. Run `npm run sync-local-templates` (or just start the dev server — `npm start` runs it first
   automatically) to regenerate `generated-index.ts`.
3. It shows up in the "New instrument" picker, marked with a `/ ` prefix — only when running on
   localhost. A deployed build never offers it and never carries its images: `angular.json` only
   serves this folder's images under the `development` configuration, and `npm run build` clears
   `generated-index.ts` back to empty first regardless of what's sitting in this folder.

Nothing here is swept by the test suite the way `corpus/` is — this is scratch space, not a
quality bar to clear. If a template graduates into something worth keeping, move its JSON (and
image, credited properly) into `corpus/` by hand.
