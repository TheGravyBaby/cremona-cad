# Graph Report - .  (2026-08-03)

## Corpus Check
- 160 files · ~288,770 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1797 nodes · 4992 edges · 104 communities (73 shown, 31 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.82)
- Token cost: 133,271 input · 0 output

## Community Hubs (Navigation)
- Outline & Fluting Path Calculators
- Cross-Arch Geometry Core
- Cross-Arching Panel & Shapes
- Draft Tool Family (Arc/Image/Point)
- Export Pipeline (DXF/SVG/PDF)
- Draft Canvas Component
- Arch Surface Model & STL Export
- Ceruti Templates & View Toggles
- Beard Violin Recipe Rendering
- Angular Build Config
- Long-Arch Panel & Spline Rendering
- Tool Palette Component
- Ceruti Field Info Helpers
- Settings Bar Shape Fields
- Ceruti Bout/Corner Panel Base
- Draft Tool Factories & Registry
- Tool Activation & Registry Service
- Reference Image Asset Store
- 3D Wireframe & Contour Rendering
- Toolbox Store (Shape State)
- Bout/Corner Panel Rendering
- Tangent Arc & Biarc Math
- Kelly Violin Component
- Offset Tool & Shape Selection
- Kelly Violin Type Definitions
- Ceruti Violin Shell Component
- Toolbox Shape Type Getters
- Basic Draft Tools (Line/Circle/Dimension)
- Recipe Component Base
- Kelly Legacy Calc & Old Draft Math
- Kelly Corner Rendering & Validators
- Join-Arc Tool & Biarc Candidates
- Arching Params Panel Bindings
- Axis Grid & Snap Marker Rendering
- Message Center & Toast Service
- Arching Params Migration & Normalization
- Axis Grid Controller
- Angular Runtime Dependencies
- About Modal Changelog & Tutorials
- Snap Engine & SVG Arc Parsing
- README Project Overview
- Shape Grabbers & Endpoint Math
- Hello Recipe & Recipe Toolbar
- Angular Dev Dependencies
- Kelly Violin Panel Gating
- Camera & Scene Bounds
- Shape Renderer (Grabbers/Guides)
- Outer Trace Panel & Arc Degrees Helper
- DrawingDemo2 UI Screenshot
- Kelly Path Export & SVG Download
- Shape Hit Testing
- Render Funcs Color/Transform Utilities
- Historical Ceruti Drawing Reference
- App Root Component
- Toolbox Image Shape Ops
- Outer Trace Panel Component
- Panel Flow State Machine
- Package Metadata (Prettier)
- About Modal Component
- Hello Recipe Component
- Debounce Controller
- Recipe Base Undo/Redo
- CC_Drawing Reference Image
- Arc Tool Component
- Top Bar Component
- Cross-Arching Rotation Controller
- NPM Scripts
- Luthier Attribution (Beard/Ceruti)
- Cross-Arch Station Spec Tests
- Reference Photos (Guadagnini/Ravatin)
- Mittenwald Bass Reference Photo
- App Bootstrap Config
- Fluting Gouge Types
- Cremona CAD Logo
- Spline Curve Changelog
- Panel Flow Definitions
- Del Gesu Baltic Reference Photo
- Strad Goetz Reference Photo
- Maggini Delmas Reference Photo
- Kevin Kelly Attribution
- Angular Compiler Dependency
- Strad Davidoff Reference Photo
- F-hole Reference Image
- Kelly Violin Recipe Template
- RxJS Dependency
- svg2pdf.js Dependency
- tslib Dependency
- App Shell Bootstrap HTML
- Beard Violin Recipe Template
- GitHub Pages Deploy Workflow
- Download Icon Asset
- Bass Player Photo
- New File Icon Asset
- Upload Icon Asset
- Center Bout Panel Template
- Corners Panel Template
- Export Panel Template
- Main Bouts Panel Template
- Message Center Template

## God Nodes (most connected - your core abstractions)
1. `Pt` - 112 edges
2. `SettingsBarComponent` - 96 edges
3. `ToolboxStore` - 64 edges
4. `CrossArchingPanel` - 64 edges
5. `DraftToolHost` - 62 edges
6. `DraftCanvasComponent` - 61 edges
7. `KellyViolin` - 52 edges
8. `RecipeComponentBase` - 52 edges
9. `ToolPaletteComponent` - 48 edges
10. `DraftTool` - 44 edges

## Surprising Connections (you probably didn't know these)
- `About tab content` --semantically_similar_to--> `Intersecting Arcs drafting system`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `Enrico Ceruti (About tab mention)` --semantically_similar_to--> `Enrico Ceruti (historical luthier / workshop drafting document)`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `David Beard (About tab mention)` --semantically_similar_to--> `David Beard (American luthier researcher)`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `Kevin Kelly's four-circle method (Tutorial mention)` --semantically_similar_to--> `Kevin Kelly (American luthier researcher)`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `License tab (GPL-3.0)` --semantically_similar_to--> `GNU GPL v3.0 License`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Panels share onArcFocus/onArcBlur/adjustArcStart/adjustArcEnd/nearestFraction helper methods** — src_app_enrico_ceruti_violin_panels_main_bouts_panel_main_bouts_panel_cerutimainboutspanelcomponent, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel_ceruticornerspanelcomponent, src_app_enrico_ceruti_violin_panels_center_bout_panel_center_bout_panel_ceruticenterboutpanelcomponent [INFERRED 0.85]
- **Long/cross arching definition feeds export panel's STL and template outputs** — src_app_enrico_ceruti_violin_panels_export_panel_export_panel_cerutiexportpanelcomponent [INFERRED 0.85]
- **Shared params/colors/flags data flow across Ceruti Violin panels** — src_app_enrico_ceruti_violin_ceruti_violin, src_app_enrico_ceruti_violin_panels_main_bouts_panel_main_bouts_panel, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel, src_app_enrico_ceruti_violin_panels_center_bout_panel_center_bout_panel, src_app_enrico_ceruti_violin_panels_outer_trace_panel_outer_trace_panel, src_app_enrico_ceruti_violin_panels_mould_panel_mould_panel, src_app_enrico_ceruti_violin_panels_fluting_panel_fluting_panel, src_app_enrico_ceruti_violin_panels_long_arching_panel_long_arching_panel, src_app_enrico_ceruti_violin_panels_cross_arching_panel_cross_arching_panel, src_app_enrico_ceruti_violin_panels_export_panel_export_panel, src_app_enrico_ceruti_violin_render_toggles_render_toggles [EXTRACTED 1.00]
- **Tutorial topics documenting the outline/mould/arching design stages** — src_app_about_modal_about_modal_tutorial_fluting, src_app_about_modal_about_modal_tutorial_long, src_app_about_modal_about_modal_tutorial_cross, src_app_about_modal_about_modal_tutorial_mould, src_app_about_modal_about_modal_tutorial_outer, src_app_enrico_ceruti_violin_panels_fluting_panel_fluting_panel, src_app_enrico_ceruti_violin_panels_long_arching_panel_long_arching_panel, src_app_enrico_ceruti_violin_panels_cross_arching_panel_cross_arching_panel, src_app_enrico_ceruti_violin_panels_mould_panel_mould_panel, src_app_enrico_ceruti_violin_panels_outer_trace_panel_outer_trace_panel [INFERRED 0.85]
- **Reference image handling spanning tutorial docs, toolbox and settings bar** — src_app_about_modal_about_modal_tutorial_images, src_app_about_modal_about_modal_changelog_drawing_toolbox, src_app_draft_canvas_tool_palette_tool_palette, src_app_draft_canvas_settings_bar_settings_bar [INFERRED 0.80]

## Communities (104 total, 31 thin omitted)

### Community 0 - "Outline & Fluting Path Calculators"
Cohesion: 0.07
Nodes (78): calculateMainPath(), channelAreaPath(), cornerJoinAreaPath(), plateLayoutOffset(), defaultArchingParams(), calculateCenterBout(), calculateCorners(), calculateMainBouts() (+70 more)

### Community 1 - "Cross-Arch Geometry Core"
Cohesion: 0.07
Nodes (59): ArchTakeoff, buildPlateGeometry(), channelCapPath(), channelCenterlineZAt(), channelPaths, chordTrust(), cornerGougeOn(), cornerGougeZ() (+51 more)

### Community 2 - "Cross-Arching Panel & Shapes"
Cohesion: 0.08
Nodes (13): nearestCrossArchShape(), CrossArchCycloidShape, CrossArchPoint, CrossArchShape, CrossArchSplineShape, CrossArchStation, cloneCrossArchShape(), CrossArchingPanel (+5 more)

### Community 3 - "Draft Tool Family (Arc/Image/Point)"
Cohesion: 0.11
Nodes (7): ChainedTangentArcTool, DraftToolHost, ImageTool, TangentArcTool, makeShapeId(), TwoPointTool, Pt

### Community 4 - "Export Pipeline (DXF/SVG/PDF)"
Cohesion: 0.08
Nodes (36): allowedCommonJsDependencies, jspdf, jspdf, jspdf, polygon-clipping, svg2pdf.js, calculateCornerBlocks(), TemplateShape (+28 more)

### Community 5 - "Draft Canvas Component"
Cohesion: 0.08
Nodes (5): DraftCanvasComponent, Component, Input, ViewChild, moveGrabberPosition()

### Community 6 - "Arch Surface Model & STL Export"
Cohesion: 0.12
Nodes (38): defaultCrossArchParams(), defaultFlutingParams(), bodyLandmarks(), normalizeCrossArchStations(), buildPlateStl(), buildPlateSurfaceModel(), calculateCrossArchTemplates(), calculateCrossArchTemplatesForSide() (+30 more)

### Community 7 - "Ceruti Templates & View Toggles"
Cohesion: 0.07
Nodes (31): CERUTI_TEMPLATES, DelGesuBaltic, GuadagniniPiacenza, MagginiDelmas, MittenwaldBass, RavatinMans, StradDavidoff, StradGoetz (+23 more)

### Community 8 - "Beard Violin Recipe Rendering"
Cohesion: 0.12
Nodes (14): BeardViolinComponent, BeardViolinParams, BeardViolinRecipe, Component, arcPathByAngleAboutTheta(), interceptCirclesAndPoint(), intersectLines(), solveInscribedCircleAlongAxis() (+6 more)

### Community 9 - "Angular Build Config"
Cohesion: 0.05
Nodes (40): build, serve, test, builder, configurations, defaultConfiguration, options, analytics (+32 more)

### Community 10 - "Long-Arch Panel & Spline Rendering"
Cohesion: 0.10
Nodes (16): LongArchSolve, ArchCurve, ArchSpline, ArchSplinePoint, LongArchingPanel, Component, Input, archGuideKnots() (+8 more)

### Community 11 - "Tool Palette Component"
Cohesion: 0.07
Nodes (4): ToolPaletteComponent, Component, Output, ToolSlot

### Community 12 - "Ceruti Field Info Helpers"
Cohesion: 0.11
Nodes (35): archContoursInfo(), archHeightInfo(), bitDiameterInfo(), boutWidthInfo(), buttonInfo(), centerBoutWidthInfo(), channelDepthInfo(), compoundArcInfo() (+27 more)

### Community 13 - "Settings Bar Shape Fields"
Cohesion: 0.05
Nodes (3): SettingsBarComponent, Component, Input

### Community 14 - "Ceruti Bout/Corner Panel Base"
Cohesion: 0.07
Nodes (14): CenterBoutPanel, Component, Input, CornersPanel, Component, Input, MainBoutsPanel, Component (+6 more)

### Community 15 - "Draft Tool Factories & Registry"
Cohesion: 0.11
Nodes (23): models/types.ts vs toolbox-shape.ts deliberate split, ArcStage, createArcStartFirstTool(), createArcTool(), RootGroup, createChainedTangentArcTool(), RootGroup, createImageTool() (+15 more)

### Community 16 - "Tool Activation & Registry Service"
Cohesion: 0.08
Nodes (5): DraftTool, PointTool, TextTool, ToolRegistryService, Injectable

### Community 17 - "Reference Image Asset Store"
Cohesion: 0.11
Nodes (15): ImageAsset, ImageAssetStore, loadImage(), makeAssetRef(), smoothstep(), Injectable, imageShapesFromRecipe(), imageShapesToRecipe() (+7 more)

### Community 18 - "3D Wireframe & Contour Rendering"
Cohesion: 0.14
Nodes (26): contourSampleSteps(), wireframeSampleSteps(), ArchContourLevel, PlateSurfaceModel, PlateViewMode, Cycloid cross-section curve type, PlateCache, pushStation() (+18 more)

### Community 19 - "Toolbox Store (Shape State)"
Cohesion: 0.12
Nodes (4): Layer, DraftShape, ToolboxStore, Injectable

### Community 20 - "Bout/Corner Panel Rendering"
Cohesion: 0.22
Nodes (22): CenterBoutViewFlags, renderCenterBout(), CornersViewFlags, renderCorners(), MainBoutsViewFlags, renderMainBouts(), renderOuterTraceGuides(), RenderLayer (+14 more)

### Community 21 - "Tangent Arc & Biarc Math"
Cohesion: 0.11
Nodes (21): RootGroup, Stage, createTangentArcTool(), RootGroup, Stage, angleOnDrawnArc(), arcHorizontalIntersections(), arcPathData() (+13 more)

### Community 23 - "Kelly Violin Component"
Cohesion: 0.16
Nodes (3): KellyViolin, Component, HostListener

### Community 24 - "Offset Tool & Shape Selection"
Cohesion: 0.13
Nodes (13): boundaryPoints(), computeSignByShapeId(), createOffsetTool(), nearestSignedDistance(), OffsetTool, RootGroup, samePoint(), signedOffsetMetric() (+5 more)

### Community 25 - "Kelly Violin Type Definitions"
Cohesion: 0.09
Nodes (24): BLANK_PARAMS, createKellyIntersects(), createKellyShapes(), DelGesu_Baltic_Params, KELLY_DEFAULT_RATIOS, KellyBlockIntersects, KellyCalcEntry, KellyCornerIntersects (+16 more)

### Community 26 - "Ceruti Violin Shell Component"
Cohesion: 0.12
Nodes (4): CerutiViolin, Component, Input, ViewChild

### Community 27 - "Toolbox Shape Type Getters"
Cohesion: 0.11
Nodes (11): Tutorial: Drawing Tools, Tutorial: Images, ArcShape, CircleShape, DimensionShape, LineShape, PointShape, RectShape (+3 more)

### Community 28 - "Basic Draft Tools (Line/Circle/Dimension)"
Cohesion: 0.18
Nodes (18): ANGLE_LOCK_DEG, snapToAngle(), snapToLockedAngle(), createCircleTool(), radiusOf(), createDimensionTool(), previewDimension(), RootGroup (+10 more)

### Community 29 - "Recipe Component Base"
Cohesion: 0.11
Nodes (4): NamedConstant, RecipeComponentBase, Component, Output

### Community 30 - "Kelly Legacy Calc & Old Draft Math"
Cohesion: 0.15
Nodes (19): calculateMouldPath(), calculatePrimaryShapes(), calculateTopPath(), initializeTopAndBottomTrace(), normalizeDegrees(), IMPORTANT: pass renderDensity here too, requireCorners(), calculateOffsetAlongPath() (+11 more)

### Community 31 - "Kelly Corner Rendering & Validators"
Cohesion: 0.14
Nodes (16): calculateMainBouts(), initializeBlocks(), initializeCornerCircles(), initializeCornerPlacement(), initializeMainBouts(), initializeMinorBouts(), KELLY_TEMPLATES, renderCircleAngleIndicator() (+8 more)

### Community 32 - "Join-Arc Tool & Biarc Candidates"
Cohesion: 0.15
Nodes (13): arcSpan(), BiarcCandidate, computeBiarcCandidates(), computeJoint(), createJoinArcTool(), JoinArcTool, logJoinDebug(), preferMinorSweep() (+5 more)

### Community 33 - "Arching Params Panel Bindings"
Cohesion: 0.17
Nodes (4): ArchingParams, FlutingPanel, Component, Input

### Community 34 - "Axis Grid & Snap Marker Rendering"
Cohesion: 0.14
Nodes (13): AxisGridPreferences, CanvasViewport, PersistedAxisGridPreferences, RootGroup, measureImage(), readFileAsDataUrl(), shiftPt(), translateShape() (+5 more)

### Community 35 - "Message Center & Toast Service"
Cohesion: 0.17
Nodes (9): MessageCenterComponent, Component, makeMessage(), Message, MessageInput, MessageService, newId(), Severity (+1 more)

### Community 36 - "Arching Params Migration & Normalization"
Cohesion: 0.19
Nodes (16): archZAt(), legacySpline(), paramsWith(), BodyLandmark, clampSplinePointHeights(), isCurrentCrossArch(), longArchHeightAt(), normalizeArchCurve() (+8 more)

### Community 39 - "Angular Runtime Dependencies"
Cohesion: 0.12
Nodes (17): @angular/common, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, d3, dependencies, @angular/common (+9 more)

### Community 40 - "About Modal Changelog & Tutorials"
Cohesion: 0.13
Nodes (15): Changelog v0.8.1: Fluting channel refinements — deeper ends shaped by long arch, Changelog v0.8.0: Long and cross arching, Changelog v0.7.2: Purfling and fluting introduced, Tutorial: Base Measurements, Tutorial: Basics, Tutorial: Main Bouts, Tutorial: Corners, Tutorial: Cross Arching (+7 more)

### Community 41 - "Snap Engine & SVG Arc Parsing"
Cohesion: 0.17
Nodes (11): collectFromElement(), KIND_PRIORITY, RootGroup, SnapEngine, SnapKind, tangentAt(), arcCenterFromEndpoints(), ARG_COUNTS (+3 more)

### Community 42 - "README Project Overview"
Cohesion: 0.13
Nodes (15): Cremona CAD (README), Andrew Argraves (author), examples/ — archived Beard & Kelly recipes, Geometry math centralization (draftMath / svgPathMath / renderFuncs), GNU GPL v3.0 License, hello-recipe (minimal working recipe), Angular 21, D3.js (+7 more)

### Community 43 - "Shape Grabbers & Endpoint Math"
Cohesion: 0.31
Nodes (11): arcMidpoint(), EndpointGrabber, endpointGrabbers(), EndpointKey, withEndpoint(), withImageHandle(), imageCenter(), imageCorners() (+3 more)

### Community 44 - "Hello Recipe & Recipe Toolbar"
Cohesion: 0.15
Nodes (7): DEFAULTS, HelloParams, RecipeToolbarComponent, Component, Input, Output, ViewChild

### Community 45 - "Angular Dev Dependencies"
Cohesion: 0.15
Nodes (13): @angular/build, @angular/compiler-cli, jsdom, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jsdom (+5 more)

### Community 47 - "Camera & Scene Bounds"
Cohesion: 0.19
Nodes (4): Bounds, Camera, groupBox(), unionRenderedBounds()

### Community 48 - "Shape Renderer (Grabbers/Guides)"
Cohesion: 0.21
Nodes (12): GrabberKind, appendTextLines(), drawArcCenterGuides(), drawAreaSelectBox(), drawDimension(), drawEndpointGrabber(), drawImageShape(), drawMoveGrabber() (+4 more)

### Community 49 - "Outer Trace Panel & Arc Degrees Helper"
Cohesion: 0.19
Nodes (11): Button (neck-joint tab on back plate), Corner cutoff angles (viol vs standard corners), OuterTraceViewFlags, adjustArcEnd(), adjustArcStart(), getArcEndDeg(), getArcStartDeg(), setArcEndDeg() (+3 more)

### Community 50 - "DrawingDemo2 UI Screenshot"
Cohesion: 0.23
Nodes (12): Canvas Fit/zoom/Reference/Axis controls (bottom toolbar), Center Bout parameter panel (Total Width, CBW to LBW, C0 Radius, C0 Y, C0 to LBW, Fit C0 to Bouts), Center Bout recipe step, Colored corner/bout construction curves (upper red, lower yellow, center blue/green) with dashed guide lines and handle points, Lower Corner parameter panel (C1 Radius, Compound, C1 to LBW, C11 Radius, Split Angle), Select Recipe Step control, Reference violin body photograph (background image), Show Module/All Arcs, Circles, Guides, Outer Path toggle buttons (+4 more)

### Community 51 - "Kelly Path Export & SVG Download"
Cohesion: 0.36
Nodes (7): calculateMainPathsSegmented(), calculateMainPathsUnified(), calculateOffsetPathsSegments(), upsertCalc(), buildMirroredSvg(), downloadSvgFile(), safeRun()

### Community 52 - "Shape Hit Testing"
Cohesion: 0.33
Nodes (11): distanceToArc(), distanceToBoxInterior(), distanceToImage(), distanceToRect(), distanceToShape(), distanceToText(), shapeBounds, textFootprint() (+3 more)

### Community 53 - "Render Funcs Color/Transform Utilities"
Cohesion: 0.24
Nodes (8): applyOneTransform(), applyTransforms(), greyOut(), hslToRgb(), parsedColor(), renderDashedLineLong(), renderPointLabel(), rgbToHsl()

### Community 54 - "Historical Ceruti Drawing Reference"
Cohesion: 0.24
Nodes (11): C-bouts (waist curves) with concentration of small dashes suggesting f-hole placement zone on right side, Central vertical axis line running through the body length, Dashed diagonal/triangular construction lines forming a geometric layout grid, Lower bout (rounded bottom of violin body), "Mezzo" (Italian for "middle") handwritten label near center bout point, Sequential numbered tick marks (approx. 1-71) along left margin and axes used as a measurement scale, CerutiDrawing.png (historical violin construction drawing), Handwritten radius/measurement annotations (e.g. "R 6 1", "18 1/2", "9 3/4") marking compass radii for bout curves (+3 more)

### Community 55 - "App Root Component"
Cohesion: 0.27
Nodes (3): App, Component, setGlobalEmitter()

### Community 57 - "Outer Trace Panel Component"
Cohesion: 0.24
Nodes (3): OuterTracePanel, Component, Input

### Community 59 - "Package Metadata (Prettier)"
Cohesion: 0.22
Nodes (8): name, packageManager, prettier, overrides, printWidth, singleQuote, private, version

### Community 60 - "About Modal Component"
Cohesion: 0.22
Nodes (3): AboutModalComponent, Component, ViewChild

### Community 64 - "CC_Drawing Reference Image"
Cohesion: 0.57
Nodes (8): Cremona-CAD outline geometry (classical stringed-instrument body shape construction), Arc center points (cross markers) defining construction circles, C-bout corner curves (waist, red/orange/yellow, both sides), Vertical center axis / symmetry line of instrument body, Dashed construction/guide lines connecting arc centers, Lower bout curve (bottom rounded lobe, blue), CC_Drawing.png — violin/cello outline construction diagram, Upper bout curve (top rounded lobe, green)

### Community 67 - "Top Bar Component"
Cohesion: 0.29
Nodes (4): TopBarComponent, Component, Input, Output

### Community 70 - "NPM Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, ng, start, test, watch

### Community 71 - "Luthier Attribution (Beard/Ceruti)"
Cohesion: 0.40
Nodes (6): David Beard (American luthier researcher), Enrico Ceruti (historical luthier / workshop drafting document), Intersecting Arcs drafting system, About tab content, David Beard (About tab mention), Enrico Ceruti (About tab mention)

### Community 74 - "Reference Photos (Guadagnini/Ravatin)"
Cohesion: 0.40
Nodes (5): Cello top plate (belly) with f-holes and arching, Reference image feature (multiple reference images for CAD comparison), Guadagnini Piacenza violin front view (reference image), Violin body top plate (front, spruce, with f-holes, purfling, bridge, tailpiece, strings, fingerboard), Ravatin Mans cello front reference photo

### Community 75 - "Mittenwald Bass Reference Photo"
Cohesion: 0.50
Nodes (5): Top plate arching/carved contour visible via shading, Antique Mittenwald-school Double Bass (front view), F-hole soundholes visible on bass top plate, Mittenwald c.1900 Double Bass Reference Photo, Tailpiece and saddle assembly

### Community 77 - "Fluting Gouge Types"
Cohesion: 0.40
Nodes (3): PlateGeometry, FlutingParams, PolylineIndex

### Community 78 - "Cremona CAD Logo"
Cohesion: 0.50
Nodes (4): CremonaCadLogo.svg (application logo), Decorative flourished 'C' letterform motif (dark gray #333333, calligraphic serif swash), Cremona (Italian city famed for violin-making, e.g. Stradivari) — implied brand reference, CremonaCad wordmark (stylized decorative 'C' + REMONA + decorative 'C' + AD)

### Community 79 - "Spline Curve Changelog"
Cohesion: 0.67
Nodes (4): Changelog: Drawing toolbox (Aug 2 2026), Spline cross-section curve type (asymmetric, mirrorable points), Cross-arching Station system — each station holds its own shape, surface flows between them, Spline long-arch curve (asymmetric, mirrorable points)

### Community 81 - "Del Gesu Baltic Reference Photo"
Cohesion: 0.67
Nodes (3): 'Baltic' Guarneri del Gesù violin (historical instrument), Reference image feature (multiple reference images for CAD comparison), DelGesuBaltic.png - Violin front reference photo

### Community 82 - "Strad Goetz Reference Photo"
Cohesion: 0.67
Nodes (3): 1695 'Goetz' violin (attributed Stradivari) reference instrument, Jost Thöne Verlag - publisher, source of the violin photograph (copyright watermark), StradGoetz.jpg - Photo of the 1695 'Goetz' Stradivari violin front plate

### Community 83 - "Maggini Delmas Reference Photo"
Cohesion: 0.67
Nodes (3): Top plate (belly/soundboard) with f-holes, bridge, tailpiece, strings, Maggini-style double bass (attributed instrument, 'Delmas'), Maggini_Delmas.png reference photo

### Community 84 - "Kevin Kelly Attribution"
Cohesion: 0.67
Nodes (3): Kevin Kelly (American luthier researcher), Kevin Kelly's four-circle method (Tutorial mention), Tutorial: Center Bout

## Knowledge Gaps
- **212 isolated node(s):** `$schema`, `version`, `packageManager`, `analytics`, `newProjectRoot` (+207 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Pt` connect `Draft Tool Family (Arc/Image/Point)` to `Outline & Fluting Path Calculators`, `Cross-Arch Geometry Core`, `Export Pipeline (DXF/SVG/PDF)`, `Draft Canvas Component`, `Arch Surface Model & STL Export`, `Ceruti Templates & View Toggles`, `Beard Violin Recipe Rendering`, `Long-Arch Panel & Spline Rendering`, `Ceruti Field Info Helpers`, `Draft Tool Factories & Registry`, `Tool Activation & Registry Service`, `Reference Image Asset Store`, `3D Wireframe & Contour Rendering`, `Tangent Arc & Biarc Math`, `Offset Tool & Shape Selection`, `Kelly Violin Type Definitions`, `Basic Draft Tools (Line/Circle/Dimension)`, `Kelly Legacy Calc & Old Draft Math`, `Join-Arc Tool & Biarc Candidates`, `Axis Grid & Snap Marker Rendering`, `Snap Engine & SVG Arc Parsing`, `Shape Grabbers & Endpoint Math`, `Camera & Scene Bounds`, `Shape Renderer (Grabbers/Guides)`, `Shape Hit Testing`, `Render Funcs Color/Transform Utilities`, `Arc Tool Component`, `Fluting Gouge Types`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `SettingsBarComponent` connect `Settings Bar Shape Fields` to `Settings Bar Numeric Setters`, `Axis Grid & Snap Marker Rendering`, `Settings Bar Point Setters`, `Tool Activation & Registry Service`, `Toolbox Store (Shape State)`, `Settings Bar Numeric Getters`, `Toolbox Shape Type Getters`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `ToolPaletteComponent` connect `Tool Palette Component` to `Axis Grid & Snap Marker Rendering`, `Draft Tool Factories & Registry`, `Tool Activation & Registry Service`, `Toolbox Store (Shape State)`, `Toolbox Image Shape Ops`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _212 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Outline & Fluting Path Calculators` be split into smaller, more focused modules?**
  _Cohesion score 0.0678451982799809 - nodes in this community are weakly interconnected._
- **Should `Cross-Arch Geometry Core` be split into smaller, more focused modules?**
  _Cohesion score 0.074034902168165 - nodes in this community are weakly interconnected._
- **Should `Cross-Arching Panel & Shapes` be split into smaller, more focused modules?**
  _Cohesion score 0.07683000604960677 - nodes in this community are weakly interconnected._