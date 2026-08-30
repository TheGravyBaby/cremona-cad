# Open-licence template corpus — dataset

All lengths cm. B = back length, U/M/L = upper/middle/lower bout widths.
`bbox` = record publishes only overall height × width × depth, not a bout set.

## Licence tiers

| Tier | Source | Terms |
|---|---|---|
| A | Met Museum, Dept. 18 | CC0 where `isPublicDomain: true`. Keyless API. |
| A | Smithsonian NMAH | CC0 where media `usage.access == "CC0"`. API key from api.data.gov. |
| B | Library of Congress | "educational and research purposes", no warranty, no explicit CC0. Not equivalent to A. Publishes the best measurements. |

**Facts vs expression:** bout measurements are facts and carry no copyright. Images are
expression and do. Tier-B or dealer-sourced *measurements* can be paired with a tier-A
*image* without contaminating the licence. Record the two provenances separately.

## Instruments

| # | Maker | Instrument | Date | B | U | M | L | Source | ID | Imgs | Lic |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Nicolò Amati | Violin | 1669 | bbox 60.3×20.3×8.9 | | | | Met | 503057 | 7 | A |
| 2 | Nicolò Amati | Violin "Brookings" | 1654 | on record, not scraped | | | | LoC | ihas.200155592 | ~8 | B |
| 3 | A. Stradivari | Violin "Ole Bull" | 1687 | bbox 60.0×20.96×9.84 | | | | SI NMAH | nmah_739715 | ? | A |
| 4 | A. Stradivari | Violin "Betts" | 1704 | 35.5 | 16.8 | 10.8 | 20.8 | LoC | ihas.200154811 | ~8 | B |
| 5 | Guarneri del Gesù | Violin "Kreisler" | c.1730 | 35.5 | 16.8 | 11.2 | 20.5 | LoC | ihas.200154814 | ~8 | B |
| 6 | Nicolò Amati | Viola "Prof. Wirth" | 1663 | bbox 74.3×25.4×10.8 | | | | SI NMAH | nmah_833906 | 8 | A (confirmed CC0) |
| 7 | A. Stradivari | Viola "Cassavetti" | 1727 | 41.06 | 18.3 | — | 23.7 | LoC | ihas.200154813 | ~8 | B |
| 8 | Jacob Stainer | Viola (non-Cremonese control) | c.1660 | bbox 43.7×25.8×4.7 | | | | Met | 624385 | 6 | A |
| 9 | Brothers Amati | Cello "Amaryllis Fleming", 5-string | 1610–20 | 70.7 | 35.35 | 23.0 | 42.45 | Met | 898377 | 5 | A |
| 10 | A. Stradivari | Cello "Castelbarco" | 1697 | 74.9 | 34.6 | — | 44.0 | LoC | ihas.200154818 | ~8 | B |
| 11 | William Forster | Cello "Royal George" | 1782 | bbox 122.2×43.8×25.4 | | | | Met | 627897 | **37** | A |
| 12 | John Rose (attrib.) | Bass viola da gamba | c.1600 | total L 119.5 | | | | Met | 503359 | 7 | A |
| 13 | Andreas Jais (attrib.) | Bass viola da gamba | early 18c | bbox 120×37.1×24.8 | | | | Met | 503349 | 4 | A |
| 14 | unattributed | Double bass, 3-string | c.1740–60 | not published | | | | SI NMAH | nmah_605618 | ? | A |

URL patterns:
- Met record `https://www.metmuseum.org/art/collection/search/{id}`
- Met API `https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}`
- SI record `https://americanhistory.si.edu/collections/object/{id}` (403s to scrapers; use API)
- SI API `https://api.si.edu/openaccess/api/v1.0/content/edanmdm:{id}?api_key=KEY`
- LoC record `https://www.loc.gov/item/{id}/` (403s to scrapers; measurements are in page body)

## Measurement gap — the main open task

Neither the Met nor the Smithsonian publishes bout sets. Met 898377 is the sole exception.
Both give bounding boxes, which are object height/width/depth including neck and are **not**
usable for scaling. Only 5 of 14 rows above have a real B/U/M/L set, all from LoC or Met 898377.

Three ways to close it, in order of preference:
1. LoC pages carry full bout sets in the body text — 403 to `curl`, readable in a browser.
   Manual pass over the ~8 LoC items yields complete sets including middle bouts.
2. Cozio/Tarisio measurement listings. Measurements are facts; transcribing them is not
   infringement. The images are the thing to avoid, not the numbers.
3. Derive from the CC0 photograph itself. Requires one known reference length per photo,
   which is what the bounding-box `height` can legitimately supply.

## Not available publicly

- **Strad "Goetz"** and **del Gesù "Baltic"** — privately held, Cozio-only, no open images.
  The Betts and Kreisler above are the LoC substitutes.
- Museo del Violino (Cremona) — no open-access programme found.
- Philharmonie de Paris — 1,240 technical drawings at 1:1, in-person consultation only.
- National Music Museum (Vermillion), incl. the Andrea Amati "King" cello — fee + conditions.

## Verification still owed

Image *counts* are confirmed via API; that a set contains a true rib/profile view is not.
Met 503359 (7) and 503057 (7) have the deepest sets and should be checked first.
Forster 627897 at 37 photographs is the deepest documentation found anywhere.

## Proposal 1 — fetch templates instead of committing images

Keep no image binaries in the repo. Commit a manifest; resolve pixels at runtime.

Per template, a JSON entry: source (`met` | `si` | `loc`), object id, image id, licence
string, attribution, the measured B/U/M/L, and a content hash. The tracing underlay is
fetched from the institution's IIIF or image endpoint on demand and cached in the browser
(IndexedDB — note `helpers/workingStorage.ts` is sessionStorage and is the wrong layer for
a multi-MB binary cache).

- Repo stays text-only and diffable; a manifest edit is reviewable, a PNG diff is not.
- Licence and attribution travel *with* the geometry rather than living in a README.
- Cost: offline builds break, and an institution re-issuing an id breaks a template. The
  content hash detects the second case; it does not fix it.
- Since templates already carry pure geometry with zero embedded image data
  (`ceruti-templates.ts` has no base64 payloads — verified), the underlay is only ever
  needed at authoring time, never at render time. Fetch failure degrades to "can't trace
  a new template", not "can't open the app".

## Proposal 2 — clearing the old image data

Eight tracked files in `public/` are third-party instrument photographs, 1.5 MB of the
3.4 MB image total:

    DelGesuBaltic.png  Guadagnini_Piacenza.png  Maggini_Delmas.png  Ravatin_Mans.jpg
    StradGoetz.jpg     Strad_Davidoff.jpg       mittenwald_c1900.jpg  fhole.jpeg

The remainder (`CerutiDrawing.png`, `DrawingDemo2.png`, `CC_Drawing.png`, `HesMe.jpg`,
the UI icons) is original work and stays.

Two levels, and they are genuinely different operations:

**Tip only** — `git rm --cached` the eight, add a `.gitignore` rule, keep them locally as
underlays. Takes them off the default branch. Reclaims no `.git` space: every commit from
2026-01-03 (`fhole.jpeg`) forward still carries the blobs, and `git clone` still transfers
them. ~5 minutes, breaks nothing.

**History** — `git filter-repo --path public/<each> --invert-paths`. Rewrites every commit
SHA from Jan 2026 forward, which is most of 467 commits across 13 remote branches, and
requires a force-push that breaks every existing clone. GitHub additionally retains
unreachable objects addressable by SHA until Support runs gc, and forks keep them in the
fork network. Reclaims ~1.5 MB.

The same `filter-repo` pass can rewrite the one commit authored as
`andrew.argraves@gohealthuc.com` (1 of 467; the bulk is `aargraves@berkeley.edu`). If the
history rewrite happens at all, do both in a single pass.

Recommendation: tip-only now, history rewrite treated as a separate decision driven by the
email question rather than by copyright.
