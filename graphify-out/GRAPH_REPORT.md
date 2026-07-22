# Graph Report - .  (2026-07-21)

## Corpus Check
- 119 files · ~210,293 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1100 nodes · 2678 edges · 67 communities (51 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 53 edges (avg confidence: 0.82)
- Token cost: 0 input · 434,043 output

## Community Hubs (Navigation)
- Arching & Fluting Geometry Calculations
- Draft Canvas Component
- Canvas Viewport, Camera & Axis Grid
- Project README & Archived Recipes
- Angular Build Tooling Dependencies
- Angular CLI Workspace Config
- Ceruti Calculations (Mould/Fluting)
- Ceruti Bout/Corner Rendering
- Arch Path & Spline Math
- Ceruti Panel View Flags
- Ceruti Measurement Info Helpers
- Recipe Base Interfaces
- CerutiViolin Model
- Beard Violin Recipe
- Kelly Violin Recipe & Types
- Draft Math (Arcs & Intersections)
- KellyViolin Component
- Ceruti Types & Cross-Arching Panel
- Ceruti Change Handlers
- Long Arching Curve Types
- Angular Framework Dependencies
- Axis Grid Controller
- Cross/Long Arching Rendering
- Ceruti Panel Capability Checks
- Kelly Path Calculations
- Export Panel & Downloads
- PDF File Exporter
- App Root Component
- Center Bout Panel UI
- Panel Flow & Reference Images
- Ceruti Change Handlers (Mould/Corners)
- Hello Recipe Toolbar
- Center Bout Panel Screenshot
- Message Service
- Ceruti Reference Templates
- Historical Ceruti Construction Drawing
- Message Center Component
- DXF File Exporter
- Panel Flow State Machine
- Validators & Message Emitter
- HelloRecipe Component
- CC Outline Construction Diagram
- Debounce Controller
- Undo/Redo History
- Legacy Draft Math & SVG Path Libs
- Corners Panel UI
- Main Bouts Panel UI
- Outer Trace Panel UI
- Reference Instrument Photos (Cello/Violin)
- Mittenwald Double Bass Reference
- App Config & Routing
- Base Panel UI
- PDF/Polygon Export Dependencies
- CremonaCad Logo & Branding
- Recipe Base Spec Tests
- Del Gesu Baltic Reference Image
- Strad Goetz Reference Image
- Maggini Delmas Reference Image
- Angular Compiler Dependency
- Strad Davidoff Reference Image
- F-hole Reference Image
- D3 Dependency
- D3 Type Definitions
- Download Icon Asset
- HesMe Photo (Unrelated Personal Image)
- New File Icon Asset
- Upload Icon Asset

## God Nodes (most connected - your core abstractions)
1. `DraftCanvasComponent` - 59 edges
2. `KellyViolin` - 51 edges
3. `RecipeComponentBase` - 51 edges
4. `CerutiViolin` - 50 edges
5. `Pt` - 40 edges
6. `EnricoCerutiParams` - 37 edges
7. `ReferenceImageController` - 36 edges
8. `info()` - 34 edges
9. `CerutiColors` - 30 edges
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

## Communities (67 total, 16 thin omitted)

### Community 0 - "Arching & Fluting Geometry Calculations"
Cohesion: 0.08
Nodes (60): calculateCrossArchTop(), calculateOuterArcs(), contourSampleSteps(), crossArchEdgeSlopeAt(), defaultArchingParams(), defaultCrossArchParams(), defaultFlutingChannelParams(), flutingHalfWidthAtY() (+52 more)

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

### Community 5 - "Angular CLI Workspace Config"
Cohesion: 0.05
Nodes (40): build, serve, test, builder, configurations, defaultConfiguration, options, analytics (+32 more)

### Community 6 - "Ceruti Calculations (Mould/Fluting)"
Cohesion: 0.17
Nodes (35): angleBeforeEnd(), calculateMould(), cutoffEndAtOffset(), defineFlutingArcs(), defineFlutingAreaPath(), defineFlutingPath(), defineInnerArcs(), defineInnerPath() (+27 more)

### Community 7 - "Ceruti Bout/Corner Rendering"
Cohesion: 0.13
Nodes (25): CenterBoutViewFlags, renderCenterBout(), CornersViewFlags, renderCorners(), MainBoutsViewFlags, OuterTraceViewFlags, renderOuterTraceGuides(), HighlightedArc (+17 more)

### Community 8 - "Arch Path & Spline Math"
Cohesion: 0.09
Nodes (34): buildArchPath(), calculateLongArch(), makeNaturalSpline(), solveCatenaryA(), arcPathFrom3Points(), booleanOpFromPaths(), buildCatenaryPath(), buildCycloidPath() (+26 more)

### Community 9 - "Ceruti Panel View Flags"
Cohesion: 0.14
Nodes (20): cornerPositionInfo(), CerutiViewFlags, RenderToggles, Component, Input, Output, adjustArcEnd(), adjustArcStart() (+12 more)

### Community 10 - "Ceruti Measurement Info Helpers"
Cohesion: 0.14
Nodes (29): archContoursInfo(), archHeightInfo(), bitDiameterInfo(), boutWidthInfo(), buttonInfo(), centerBoutWidthInfo(), channelDepthInfo(), compoundArcInfo() (+21 more)

### Community 11 - "Recipe Base Interfaces"
Cohesion: 0.09
Nodes (6): NamedConstant, RecipeInterface, RecipeComponentBase, Component, Input, Output

### Community 12 - "CerutiViolin Model"
Cohesion: 0.10
Nodes (5): CerutiViolin, Component, Input, normalizeDegrees(), ColorTransform

### Community 13 - "Beard Violin Recipe"
Cohesion: 0.19
Nodes (4): BeardViolinComponent, BeardViolinParams, BeardViolinRecipe, Component

### Community 14 - "Kelly Violin Recipe & Types"
Cohesion: 0.10
Nodes (24): BLANK_PARAMS, createKellyIntersects(), createKellyShapes(), DelGesu_Baltic_Params, KELLY_DEFAULT_RATIOS, KELLY_TEMPLATES, KellyBlockIntersects, KellyCornerIntersects (+16 more)

### Community 15 - "Draft Math (Arcs & Intersections)"
Cohesion: 0.15
Nodes (21): calculateCenterBout(), calculateCorners(), calculateMainBouts(), angleOnDrawnArc(), arcHorizontalIntersections(), circleCircleIntersections(), dist(), findJoiningCircleFromCircleAndPoint() (+13 more)

### Community 16 - "KellyViolin Component"
Cohesion: 0.12
Nodes (3): KellyViolin, Component, HostListener

### Community 17 - "Ceruti Types & Cross-Arching Panel"
Cohesion: 0.12
Nodes (10): ArchingParams, ArchPlate, ArchSplinePoint, CrossArchParams, FlutingChannelParams, PlateViewMode, CrossArchingPanel, Component (+2 more)

### Community 18 - "Ceruti Change Handlers"
Cohesion: 0.15
Nodes (6): calculateMainBouts(), initializeBlocks(), initializeCornerCircles(), initializeCornerPlacement(), initializeMainBouts(), initializeMinorBouts()

### Community 19 - "Long Arching Curve Types"
Cohesion: 0.14
Nodes (8): ArchCatenary, ArchCurve, ArchCycloid, ArchSpline, LongArchingPanel, Component, Input, Output

### Community 20 - "Angular Framework Dependencies"
Cohesion: 0.11
Nodes (19): @angular/common, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, dependencies, @angular/common, @angular/core (+11 more)

### Community 22 - "Cross/Long Arching Rendering"
Cohesion: 0.28
Nodes (13): EnricoCerutiParams, renderCrossSection(), renderPlateEdges(), renderBoutBouts(), renderCycloidGuide(), renderLongArchBoxes(), renderSplineGuide(), renderMould() (+5 more)

### Community 23 - "Ceruti Panel Capability Checks"
Cohesion: 0.30
Nodes (4): Input, calculateMainPathsSegmented(), calculateOffsetPathsSegments(), calculateTopPath()

### Community 24 - "Kelly Path Calculations"
Cohesion: 0.21
Nodes (10): calculateMainPath(), calculateMainPathsUnified(), calculateMouldPath(), calculatePrimaryShapes(), initializeTopAndBottomTrace(), normalizeDegrees(), IMPORTANT: pass renderDensity here too, requireCorners() (+2 more)

### Community 25 - "Export Panel & Downloads"
Cohesion: 0.30
Nodes (7): calculateCornerBlocks(), ExportPanel, Component, Input, Output, renderFilledPath(), combinePathStrings()

### Community 26 - "PDF File Exporter"
Cohesion: 0.23
Nodes (13): jspdf, jspdf, buildMirroredSvg(), buildScaledSvg(), downloadFullPlanPdf(), downloadSvgAsPdf(), downloadSvgFile(), drawDraftingFrame() (+5 more)

### Community 27 - "App Root Component"
Cohesion: 0.21
Nodes (4): App, Component, NamedReferenceImage, setGlobalEmitter()

### Community 28 - "Center Bout Panel UI"
Cohesion: 0.15
Nodes (9): CerutiColors, CenterBoutPanel, Component, Input, Output, MouldPanel, Component, Input (+1 more)

### Community 29 - "Panel Flow & Reference Images"
Cohesion: 0.22
Nodes (6): DEFAULT_NAMED_CONSTANTS, PanelDefinition, PanelProgress, makeReferenceImageId(), normalizeReferenceImages(), toNamedReferenceImage()

### Community 30 - "Ceruti Change Handlers (Mould/Corners)"
Cohesion: 0.32
Nodes (4): renderBounds(), renderCornerGuides(), renderMainBouts(), safeRun()

### Community 31 - "Hello Recipe Toolbar"
Cohesion: 0.15
Nodes (7): DEFAULTS, HelloParams, RecipeToolbarComponent, Component, Input, Output, ViewChild

### Community 32 - "Center Bout Panel Screenshot"
Cohesion: 0.23
Nodes (12): Canvas Fit/zoom/Reference/Axis controls (bottom toolbar), Center Bout parameter panel (Total Width, CBW to LBW, C0 Radius, C0 Y, C0 to LBW, Fit C0 to Bouts), Center Bout recipe step, Colored corner/bout construction curves (upper red, lower yellow, center blue/green) with dashed guide lines and handle points, Lower Corner parameter panel (C1 Radius, Compound, C1 to LBW, C11 Radius, Split Angle), Select Recipe Step control, Reference violin body photograph (background image), Show Module/All Arcs, Circles, Guides, Outer Path toggle buttons (+4 more)

### Community 33 - "Message Service"
Cohesion: 0.24
Nodes (6): Injectable, makeMessage(), MessageInput, MessageService, newId(), Severity

### Community 34 - "Ceruti Reference Templates"
Cohesion: 0.17
Nodes (10): CERUTI_TEMPLATES, DelGesuBaltic, GuadagniniPiacenza, MagginiDelmas, MittenwaldBass, RavatinMans, StradDavidoff, StradGoetz (+2 more)

### Community 35 - "Historical Ceruti Construction Drawing"
Cohesion: 0.24
Nodes (11): C-bouts (waist curves) with concentration of small dashes suggesting f-hole placement zone on right side, Central vertical axis line running through the body length, Dashed diagonal/triangular construction lines forming a geometric layout grid, Lower bout (rounded bottom of violin body), "Mezzo" (Italian for "middle") handwritten label near center bout point, Sequential numbered tick marks (approx. 1-71) along left margin and axes used as a measurement scale, CerutiDrawing.png (historical violin construction drawing), Handwritten radius/measurement annotations (e.g. "R 6 1", "18 1/2", "9 3/4") marking compass radii for bout curves (+3 more)

### Community 36 - "Message Center Component"
Cohesion: 0.31
Nodes (3): MessageCenterComponent, Component, Message

### Community 37 - "DXF File Exporter"
Cohesion: 0.36
Nodes (9): buildDxfFile(), cubicBezierPoint(), downloadDxfFile(), DxfEntity, normalizeRad(), pathToDxfEntities(), quadraticBezierPoint(), toDeg() (+1 more)

### Community 39 - "Validators & Message Emitter"
Cohesion: 0.31
Nodes (7): clampParam(), errorMessages, emitGlobal(), error(), message(), UserMessage, warn()

### Community 41 - "CC Outline Construction Diagram"
Cohesion: 0.57
Nodes (8): Cremona-CAD outline geometry (classical stringed-instrument body shape construction), Arc center points (cross markers) defining construction circles, C-bout corner curves (waist, red/orange/yellow, both sides), Vertical center axis / symmetry line of instrument body, Dashed construction/guide lines connecting arc centers, Lower bout curve (bottom rounded lobe, blue), CC_Drawing.png — violin/cello outline construction diagram, Upper bout curve (top rounded lobe, green)

### Community 44 - "Legacy Draft Math & SVG Path Libs"
Cohesion: 0.33
Nodes (5): svg-path-properties, calculateOffsetAlongPath(), findClosestPointOnPathToCircle(), polygonClipper, svg-path-properties

### Community 45 - "Corners Panel UI"
Cohesion: 0.29
Nodes (4): CornersPanel, Component, Input, Output

### Community 46 - "Main Bouts Panel UI"
Cohesion: 0.29
Nodes (4): MainBoutsPanel, Component, Input, Output

### Community 47 - "Outer Trace Panel UI"
Cohesion: 0.29
Nodes (4): OuterTracePanel, Component, Input, Output

### Community 48 - "Reference Instrument Photos (Cello/Violin)"
Cohesion: 0.40
Nodes (5): Cello top plate (belly) with f-holes and arching, Reference image feature (multiple reference images for CAD comparison), Guadagnini Piacenza violin front view (reference image), Violin body top plate (front, spruce, with f-holes, purfling, bridge, tailpiece, strings, fingerboard), Ravatin Mans cello front reference photo

### Community 49 - "Mittenwald Double Bass Reference"
Cohesion: 0.50
Nodes (5): Top plate arching/carved contour visible via shading, Antique Mittenwald-school Double Bass (front view), F-hole soundholes visible on bass top plate, Mittenwald c.1900 Double Bass Reference Photo, Tailpiece and saddle assembly

### Community 51 - "Base Panel UI"
Cohesion: 0.40
Nodes (4): BasePanel, Component, Input, Output

### Community 52 - "PDF/Polygon Export Dependencies"
Cohesion: 0.50
Nodes (4): allowedCommonJsDependencies, jspdf, polygon-clipping, svg2pdf.js

### Community 53 - "CremonaCad Logo & Branding"
Cohesion: 0.50
Nodes (4): CremonaCadLogo.svg (application logo), Decorative flourished 'C' letterform motif (dark gray #333333, calligraphic serif swash), Cremona (Italian city famed for violin-making, e.g. Stradivari) — implied brand reference, CremonaCad wordmark (stylized decorative 'C' + REMONA + decorative 'C' + AD)

### Community 55 - "Del Gesu Baltic Reference Image"
Cohesion: 0.67
Nodes (3): 'Baltic' Guarneri del Gesù violin (historical instrument), Reference image feature (multiple reference images for CAD comparison), DelGesuBaltic.png - Violin front reference photo

### Community 56 - "Strad Goetz Reference Image"
Cohesion: 0.67
Nodes (3): 1695 'Goetz' violin (attributed Stradivari) reference instrument, Jost Thöne Verlag - publisher, source of the violin photograph (copyright watermark), StradGoetz.jpg - Photo of the 1695 'Goetz' Stradivari violin front plate

### Community 57 - "Maggini Delmas Reference Image"
Cohesion: 0.67
Nodes (3): Top plate (belly/soundboard) with f-holes, bridge, tailpiece, strings, Maggini-style double bass (attributed instrument, 'Delmas'), Maggini_Delmas.png reference photo

## Knowledge Gaps
- **150 isolated node(s):** `$schema`, `version`, `packageManager`, `analytics`, `newProjectRoot` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Pt` connect `Canvas Viewport, Camera & Axis Grid` to `Arching & Fluting Geometry Calculations`, `Draft Canvas Component`, `Ceruti Calculations (Mould/Fluting)`, `Ceruti Bout/Corner Rendering`, `Arch Path & Spline Math`, `Ceruti Panel View Flags`, `Recipe Base Interfaces`, `CerutiViolin Model`, `Legacy Draft Math & SVG Path Libs`, `Draft Math (Arcs & Intersections)`, `Ceruti Types & Cross-Arching Panel`, `Cross/Long Arching Rendering`, `App Root Component`, `Panel Flow & Reference Images`, `Hello Recipe Toolbar`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `KellyViolin` connect `KellyViolin Component` to `Kelly Path Calculations`, `Ceruti Change Handlers`, `Kelly Violin Recipe & Types`, `Ceruti Panel Capability Checks`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `DraftCanvasComponent` connect `Draft Canvas Component` to `Canvas Viewport, Camera & Axis Grid`, `App Root Component`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Arching & Fluting Geometry Calculations` be split into smaller, more focused modules?**
  _Cohesion score 0.07737874861162532 - nodes in this community are weakly interconnected._
- **Should `Draft Canvas Component` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Canvas Viewport, Camera & Axis Grid` be split into smaller, more focused modules?**
  _Cohesion score 0.09098039215686274 - nodes in this community are weakly interconnected._