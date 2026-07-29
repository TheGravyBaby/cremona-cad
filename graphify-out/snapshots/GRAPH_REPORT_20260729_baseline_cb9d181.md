# Graph Report - .  (2026-07-21)

## Corpus Check
- 16 files · ~210,648 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1101 nodes · 2304 edges · 63 communities (50 shown, 13 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 42 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Ceruti Bout/Corner Rendering
- Draft Canvas Component
- Canvas Viewport, Camera & Axis Grid
- Project README & Archived Recipes
- Angular Build Tooling Dependencies
- Angular Framework Dependencies
- Message Service & Hello Recipe
- Angular CLI Workspace Config
- Recipe Base Interfaces
- Ceruti Measurement Info Helpers
- Ceruti Surface Model
- CerutiViolin Component
- Ceruti Panel View Flags
- Beard Violin Recipe (Archived)
- KellyViolin Component (Archived)
- Center Bout Panel UI
- Kelly Violin Types & Templates (Archived)
- Arch Spline/Cycloid Path Math
- Kelly Path Calculations (Archived)
- Ceruti Types
- Kelly Change Handlers (Archived)
- Arching & Fluting Profile System
- Long Arching Curve Types
- Axis Grid Controller
- Outline Solvers & Arching Defaults
- App Root Component
- Mould & Export Panel
- Path/Contour Builders
- Draft Math Core (Arcs & Boolean Ops)
- Panel Flow & Reference Images
- Center Bout Panel Screenshot
- Historical Ceruti Construction Drawing
- Ceruti Reference Templates
- Validators & Message Emitter
- DXF File Exporter
- Panel Flow State Machine
- CC Outline Construction Diagram
- Debounce Controller
- SVG Path Utilities
- Corners Panel UI
- Main Bouts Panel UI
- Outer Trace Panel UI
- Draft Math Intersections & Corners
- Reference Instrument Photos (Cello/Violin)
- Mittenwald Double Bass Reference
- App Config & Routing
- Base Panel UI
- Mould Panel UI
- STL Exporter
- CremonaCad Logo & Branding
- Recipe Base Spec Tests
- Del Gesu Baltic Reference Image
- Strad Goetz Reference Image
- Maggini Delmas Reference Image
- Catenary Arch Math
- Strad Davidoff Reference Image
- F-hole Reference Image
- Stray HostListener Import
- Download Icon Asset
- HesMe Photo (Unrelated Personal Image)
- New File Icon Asset
- Upload Icon Asset
- Stray ViewChild Import

## God Nodes (most connected - your core abstractions)
1. `DraftCanvasComponent` - 59 edges
2. `KellyViolin` - 51 edges
3. `RecipeComponentBase` - 49 edges
4. `CerutiViolin` - 44 edges
5. `ReferenceImageController` - 36 edges
6. `Pt` - 34 edges
7. `info()` - 34 edges
8. `EnricoCerutiParams` - 30 edges
9. `CerutiColors` - 26 edges
10. `BeardViolinComponent` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Enrico Ceruti (README mention)` --semantically_similar_to--> `Enrico Ceruti (About Modal mention)`  [INFERRED] [semantically similar]
  README.md → src/app/about-modal/about-modal.html
- `David Beard (README mention)` --semantically_similar_to--> `David Beard (About Modal mention)`  [INFERRED] [semantically similar]
  README.md → src/app/about-modal/about-modal.html
- `Kevin Kelly (README mention)` --semantically_similar_to--> `Kevin Kelly (About Modal mention)`  [INFERRED] [semantically similar]
  README.md → src/app/about-modal/about-modal.html
- `GPL-3.0 License (README mention)` --semantically_similar_to--> `GPL-3.0 License (About Modal mention)`  [INFERRED] [semantically similar]
  README.md → src/app/about-modal/about-modal.html
- `Deploy to GitHub Pages Workflow` --references--> `CremonaCad (Project Overview)`  [INFERRED]
  .github/workflows/deploy-pages.yml → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Historical Luthiers Inspiring CremonaCad's Arc System** — readme_enrico_ceruti, readme_david_beard, readme_kevin_kelly, examples_beard_violin_beard_violin_beard_recipe, examples_kelly_violin_kelly_violin_kelly_recipe [INFERRED 0.85]
- **Ceruti Violin Recipe Panel Sequence** — src_app_enrico_ceruti_violin_ceruti_violin_ceruti_violin_component, src_app_enrico_ceruti_violin_panels_base_panel_base_panel_base_panel_component, src_app_enrico_ceruti_violin_panels_main_bouts_panel_main_bouts_panel_main_bouts_panel_component, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel_corners_panel_component, src_app_enrico_ceruti_violin_panels_center_bout_panel_center_bout_panel_center_bout_panel_component, src_app_enrico_ceruti_violin_panels_outer_trace_panel_outer_trace_panel_outer_trace_panel_component, src_app_enrico_ceruti_violin_panels_mould_panel_mould_panel_mould_panel_component, src_app_enrico_ceruti_violin_panels_long_arching_panel_long_arching_panel_long_arching_panel_component, src_app_enrico_ceruti_violin_panels_cross_arching_panel_cross_arching_panel_cross_arching_panel_component, src_app_enrico_ceruti_violin_panels_export_panel_export_panel_export_panel_component [EXTRACTED 1.00]
- **Purfling & Fluting Feature Documented in Tutorial and Implemented in Panels** — src_app_about_modal_about_modal_purfling, src_app_about_modal_about_modal_fluting, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel_purfling_fields, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel_fluting_fields, src_app_enrico_ceruti_violin_panels_cross_arching_panel_cross_arching_panel_flat_platform_toggle [INFERRED 0.85]

## Communities (63 total, 13 thin omitted)

### Community 0 - "Ceruti Bout/Corner Rendering"
Cohesion: 0.07
Nodes (50): CenterBoutViewFlags, renderCenterBout(), CornersViewFlags, renderCorners(), MainBoutsViewFlags, renderMainBouts(), OuterTraceViewFlags, renderOuterTraceGuides() (+42 more)

### Community 1 - "Draft Canvas Component"
Cohesion: 0.07
Nodes (5): DraftCanvasComponent, Component, Input, Output, ViewChild

### Community 2 - "Canvas Viewport, Camera & Axis Grid"
Cohesion: 0.09
Nodes (8): AxisGridPreferences, CanvasViewport, PersistedAxisGridPreferences, Bounds, Camera, ReferenceImageController, Pt, ReferenceImage

### Community 3 - "Project README & Archived Recipes"
Cohesion: 0.06
Nodes (47): Beard Violin Recipe (Archived), Kelly Violin Recipe (Archived, Four-Circle Method), Kelly Recipe Upper Bout Panel Section, Deploy to GitHub Pages Workflow, CremonaCad (Project Overview), David Beard (README mention), Enrico Ceruti (README mention), GPL-3.0 License (README mention) (+39 more)

### Community 4 - "Angular Build Tooling Dependencies"
Cohesion: 0.05
Nodes (33): @angular/build, @angular/compiler-cli, jsdom, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jsdom (+25 more)

### Community 5 - "Angular Framework Dependencies"
Cohesion: 0.06
Nodes (40): @angular/common, @angular/compiler, @angular/core, @angular/forms, allowedCommonJsDependencies, @angular/platform-browser, @angular/router, d3 (+32 more)

### Community 6 - "Message Service & Hello Recipe"
Cohesion: 0.07
Nodes (18): Injectable, DEFAULTS, HelloParams, HelloRecipe, Component, RecipeToolbarComponent, Component, Input (+10 more)

### Community 7 - "Angular CLI Workspace Config"
Cohesion: 0.05
Nodes (40): build, serve, test, builder, configurations, defaultConfiguration, options, analytics (+32 more)

### Community 8 - "Recipe Base Interfaces"
Cohesion: 0.07
Nodes (7): NamedConstant, RecipeInterface, RecipeComponentBase, Component, HostListener, Input, Output

### Community 9 - "Ceruti Measurement Info Helpers"
Cohesion: 0.14
Nodes (29): archContoursInfo(), archHeightInfo(), bitDiameterInfo(), boutWidthInfo(), buttonInfo(), centerBoutWidthInfo(), channelDepthInfo(), compoundArcInfo() (+21 more)

### Community 10 - "Ceruti Surface Model"
Cohesion: 0.12
Nodes (28): ArchContourLevel, buildPlateStl(), calculateFlutingSectionTop(), computeArchContourRings(), computeArchContourRingsRaw(), computeArchContours(), insideCrossings(), maxAbsCrossingAtY() (+20 more)

### Community 11 - "CerutiViolin Component"
Cohesion: 0.10
Nodes (3): CerutiViolin, Component, Input

### Community 12 - "Ceruti Panel View Flags"
Cohesion: 0.14
Nodes (19): cornerPositionInfo(), CerutiViewFlags, RenderToggles, Component, Input, Output, adjustArcEnd(), adjustArcStart() (+11 more)

### Community 13 - "Beard Violin Recipe (Archived)"
Cohesion: 0.18
Nodes (5): BeardViolinComponent, BeardViolinParams, BeardViolinRecipe, Component, arcPathByAngleAboutTheta()

### Community 14 - "KellyViolin Component (Archived)"
Cohesion: 0.14
Nodes (4): KellyViolin, Component, Input, HostListener

### Community 15 - "Center Bout Panel UI"
Cohesion: 0.15
Nodes (19): CerutiColors, EnricoCerutiParams, CenterBoutPanel, Component, Input, Output, renderCrossSection(), renderPlateEdges() (+11 more)

### Community 16 - "Kelly Violin Types & Templates (Archived)"
Cohesion: 0.10
Nodes (24): BLANK_PARAMS, createKellyIntersects(), createKellyShapes(), DelGesu_Baltic_Params, KELLY_DEFAULT_RATIOS, KELLY_TEMPLATES, KellyBlockIntersects, KellyCornerIntersects (+16 more)

### Community 17 - "Arch Spline/Cycloid Path Math"
Cohesion: 0.09
Nodes (17): makeNaturalSpline(), buildCycloidPath(), buildCycloidPathAcross(), buildSplinePath(), cycloidZAt(), flutingArc(), flutingProfileZ(), makeArchSplineZOf() (+9 more)

### Community 18 - "Kelly Path Calculations (Archived)"
Cohesion: 0.14
Nodes (16): calculateMainPath(), calculateMainPathsSegmented(), calculateMainPathsUnified(), calculateMouldPath(), calculateOffsetPathsSegments(), calculatePrimaryShapes(), calculateTopPath(), initializeTopAndBottomTrace() (+8 more)

### Community 19 - "Ceruti Types"
Cohesion: 0.10
Nodes (12): ArchingParams, ArchPlate, ArchSplinePoint, CrossArchParams, DEFAULT_CERUTI_VIEW_FLAGS, FlutingChannelParams, PathEntry, PlateViewMode (+4 more)

### Community 20 - "Kelly Change Handlers (Archived)"
Cohesion: 0.14
Nodes (6): calculateMainBouts(), initializeBlocks(), initializeCornerCircles(), initializeCornerPlacement(), initializeMainBouts(), initializeMinorBouts()

### Community 21 - "Arching & Fluting Profile System"
Cohesion: 0.23
Nodes (17): buildArchPath(), calculateCrossArchTop(), calculateLongArch(), contourSampleSteps(), crossArchEdgeSlopeAt(), defineTroughPath(), flutingHalfWidthAtY(), flutingOuterHalfWidthAtY() (+9 more)

### Community 22 - "Long Arching Curve Types"
Cohesion: 0.14
Nodes (8): ArchCatenary, ArchCurve, ArchCycloid, ArchSpline, LongArchingPanel, Component, Input, Output

### Community 24 - "Outline Solvers & Arching Defaults"
Cohesion: 0.35
Nodes (11): defaultArchingParams(), defaultCrossArchParams(), defaultFlutingChannelParams(), calculateCenterBout(), calculateCorners(), calculateMainBouts(), calculateOuterArcs(), defineInnerPath() (+3 more)

### Community 25 - "App Root Component"
Cohesion: 0.19
Nodes (5): App, Component, EnricoCerutiTemplate, NamedReferenceImage, setGlobalEmitter()

### Community 26 - "Mould & Export Panel"
Cohesion: 0.35
Nodes (6): calculateCornerBlocks(), calculateMould(), ExportPanel, Component, Input, Output

### Community 27 - "Path/Contour Builders"
Cohesion: 0.29
Nodes (10): angleBeforeEnd(), cutoffEndAtOffset(), defineFlutingAreaPath(), defineFlutingPath(), defineInsetPath(), defineOuterCornerArcs(), defineOuterPath(), defineOuterPurflingPath() (+2 more)

### Community 28 - "Draft Math Core (Arcs & Boolean Ops)"
Cohesion: 0.18
Nodes (13): angleFromCenter(), arcPathFrom3Points(), booleanOpFromPaths(), ccwSpan(), classifyPoint(), differenceFromManyPaths(), differenceFromTwoPaths(), distanceToBoundedSegment() (+5 more)

### Community 29 - "Panel Flow & Reference Images"
Cohesion: 0.24
Nodes (6): DEFAULT_NAMED_CONSTANTS, PanelDefinition, PanelProgress, makeReferenceImageId(), normalizeReferenceImages(), toNamedReferenceImage()

### Community 30 - "Center Bout Panel Screenshot"
Cohesion: 0.23
Nodes (12): Canvas Fit/zoom/Reference/Axis controls (bottom toolbar), Center Bout parameter panel (Total Width, CBW to LBW, C0 Radius, C0 Y, C0 to LBW, Fit C0 to Bouts), Center Bout recipe step, Colored corner/bout construction curves (upper red, lower yellow, center blue/green) with dashed guide lines and handle points, Lower Corner parameter panel (C1 Radius, Compound, C1 to LBW, C11 Radius, Split Angle), Select Recipe Step control, Reference violin body photograph (background image), Show Module/All Arcs, Circles, Guides, Outer Path toggle buttons (+4 more)

### Community 31 - "Historical Ceruti Construction Drawing"
Cohesion: 0.24
Nodes (11): C-bouts (waist curves) with concentration of small dashes suggesting f-hole placement zone on right side, Central vertical axis line running through the body length, Dashed diagonal/triangular construction lines forming a geometric layout grid, Lower bout (rounded bottom of violin body), "Mezzo" (Italian for "middle") handwritten label near center bout point, Sequential numbered tick marks (approx. 1-71) along left margin and axes used as a measurement scale, CerutiDrawing.png (historical violin construction drawing), Handwritten radius/measurement annotations (e.g. "R 6 1", "18 1/2", "9 3/4") marking compass radii for bout curves (+3 more)

### Community 32 - "Ceruti Reference Templates"
Cohesion: 0.18
Nodes (9): CERUTI_TEMPLATES, DelGesuBaltic, GuadagniniPiacenza, MagginiDelmas, MittenwaldBass, RavatinMans, StradDavidoff, StradGoetz (+1 more)

### Community 33 - "Validators & Message Emitter"
Cohesion: 0.29
Nodes (8): clampParam(), errorMessages, safeRun(), emitGlobal(), error(), message(), UserMessage, warn()

### Community 34 - "DXF File Exporter"
Cohesion: 0.36
Nodes (9): buildDxfFile(), cubicBezierPoint(), downloadDxfFile(), DxfEntity, normalizeRad(), pathToDxfEntities(), quadraticBezierPoint(), toDeg() (+1 more)

### Community 36 - "CC Outline Construction Diagram"
Cohesion: 0.57
Nodes (8): Cremona-CAD outline geometry (classical stringed-instrument body shape construction), Arc center points (cross markers) defining construction circles, C-bout corner curves (waist, red/orange/yellow, both sides), Vertical center axis / symmetry line of instrument body, Dashed construction/guide lines connecting arc centers, Lower bout curve (bottom rounded lobe, blue), CC_Drawing.png — violin/cello outline construction diagram, Upper bout curve (top rounded lobe, green)

### Community 38 - "SVG Path Utilities"
Cohesion: 0.29
Nodes (6): svg-path-properties, combinePathStrings(), samplePathToPolyline(), unifyConnectedSvgPaths(), unifyTwoConnectedPaths(), svg-path-properties

### Community 39 - "Corners Panel UI"
Cohesion: 0.29
Nodes (4): CornersPanel, Component, Input, Output

### Community 40 - "Main Bouts Panel UI"
Cohesion: 0.29
Nodes (4): MainBoutsPanel, Component, Input, Output

### Community 41 - "Outer Trace Panel UI"
Cohesion: 0.29
Nodes (4): OuterTracePanel, Component, Input, Output

### Community 42 - "Draft Math Intersections & Corners"
Cohesion: 0.33
Nodes (7): intersectLines(), lineCircleIntersection(), arcSweepSign(), exactIntersection(), pathFromCornerBezier(), pathFromCornerCubic(), snapRunBoundaries()

### Community 43 - "Reference Instrument Photos (Cello/Violin)"
Cohesion: 0.40
Nodes (5): Cello top plate (belly) with f-holes and arching, Reference image feature (multiple reference images for CAD comparison), Guadagnini Piacenza violin front view (reference image), Violin body top plate (front, spruce, with f-holes, purfling, bridge, tailpiece, strings, fingerboard), Ravatin Mans cello front reference photo

### Community 44 - "Mittenwald Double Bass Reference"
Cohesion: 0.50
Nodes (5): Top plate arching/carved contour visible via shading, Antique Mittenwald-school Double Bass (front view), F-hole soundholes visible on bass top plate, Mittenwald c.1900 Double Bass Reference Photo, Tailpiece and saddle assembly

### Community 46 - "Base Panel UI"
Cohesion: 0.40
Nodes (4): BasePanel, Component, Input, Output

### Community 47 - "Mould Panel UI"
Cohesion: 0.40
Nodes (4): MouldPanel, Component, Input, Output

### Community 48 - "STL Exporter"
Cohesion: 0.50
Nodes (3): buildHeightFieldStl(), HeightFieldStlOptions, writeBinaryStl()

### Community 49 - "CremonaCad Logo & Branding"
Cohesion: 0.50
Nodes (4): CremonaCadLogo.svg (application logo), Decorative flourished 'C' letterform motif (dark gray #333333, calligraphic serif swash), Cremona (Italian city famed for violin-making, e.g. Stradivari) — implied brand reference, CremonaCad wordmark (stylized decorative 'C' + REMONA + decorative 'C' + AD)

### Community 51 - "Del Gesu Baltic Reference Image"
Cohesion: 0.67
Nodes (3): 'Baltic' Guarneri del Gesù violin (historical instrument), Reference image feature (multiple reference images for CAD comparison), DelGesuBaltic.png - Violin front reference photo

### Community 52 - "Strad Goetz Reference Image"
Cohesion: 0.67
Nodes (3): 1695 'Goetz' violin (attributed Stradivari) reference instrument, Jost Thöne Verlag - publisher, source of the violin photograph (copyright watermark), StradGoetz.jpg - Photo of the 1695 'Goetz' Stradivari violin front plate

### Community 53 - "Maggini Delmas Reference Image"
Cohesion: 0.67
Nodes (3): Top plate (belly/soundboard) with f-holes, bridge, tailpiece, strings, Maggini-style double bass (attributed instrument, 'Delmas'), Maggini_Delmas.png reference photo

### Community 54 - "Catenary Arch Math"
Cohesion: 0.67
Nodes (3): solveCatenaryA(), buildCatenaryPath(), catenaryZAt()

## Knowledge Gaps
- **157 isolated node(s):** `$schema`, `version`, `packageManager`, `analytics`, `newProjectRoot` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Pt` connect `Canvas Viewport, Camera & Axis Grid` to `Ceruti Bout/Corner Rendering`, `Draft Canvas Component`, `Message Service & Hello Recipe`, `SVG Path Utilities`, `Recipe Base Interfaces`, `Ceruti Surface Model`, `Ceruti Panel View Flags`, `Center Bout Panel UI`, `Arch Spline/Cycloid Path Math`, `Ceruti Types`, `App Root Component`, `Panel Flow & Reference Images`?**
  _High betweenness centrality (0.263) - this node is a cross-community bridge._
- **Why does `polygon-clipping` connect `Angular Framework Dependencies` to `Arch Spline/Cycloid Path Math`, `Kelly Path Calculations (Archived)`, `Ceruti Surface Model`?**
  _High betweenness centrality (0.243) - this node is a cross-community bridge._
- **Why does `DraftCanvasComponent` connect `Draft Canvas Component` to `App Root Component`, `Canvas Viewport, Camera & Axis Grid`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Ceruti Bout/Corner Rendering` be split into smaller, more focused modules?**
  _Cohesion score 0.0684931506849315 - nodes in this community are weakly interconnected._
- **Should `Draft Canvas Component` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Canvas Viewport, Camera & Axis Grid` be split into smaller, more focused modules?**
  _Cohesion score 0.09098039215686274 - nodes in this community are weakly interconnected._