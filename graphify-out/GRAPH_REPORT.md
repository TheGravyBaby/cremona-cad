# Graph Report - .  (2026-07-29)

## Corpus Check
- 158 files · ~248,699 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1652 nodes · 4426 edges · 89 communities (67 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.82)
- Token cost: 111,958 input · 0 output

## Community Hubs (Navigation)
- Cross-Arch Station & Asymmetric Spline Math
- Reference Image Controller
- Arc/Tangent Drawing Tools
- Cross Arching Panel & Station State
- Ceruti Panel Rendering (Bouts/Corners)
- Recipe Base Lifecycle & Undo/Redo
- Draft Canvas Shape-Creation Tools
- Angular CLI Workspace Config
- Ceruti Path & Calc Builders
- Toolbox Layer Store
- Draft Canvas Core (Camera/Snap/Angle-Lock)
- Tool Palette Component
- Project README & About-Modal Concepts
- Ceruti Panel Arc Editing UI
- Settings Bar Field Setters
- Ceruti Measurement Info Helpers
- SVG Path Math (Arcs/Catenary/Spline/Boolean)
- Long Arching Curve Types & Panel
- Beard Violin Component (Archived)
- Kelly Violin Component (Archived)
- Draft Canvas Component
- Arc Geometry & Shape Renderer
- Export Panel & Mould/Template Export
- Kelly Violin Calcs (Archived)
- Kelly Violin Types & Templates (Archived)
- Ceruti Templates & Core Types
- CerutiViolin Component
- Draft Tool Base Classes & Registry
- Axis Grid Controller
- Mould Panel & Cross-Arch Rendering
- Kelly Outer Trace & Path Calcs (Archived)
- Selected Shape Type Accessors
- Panel Flow & Reference Image Utilities
- Snap Engine & SVG Path Parsing
- Draft Math Core (Biarc/Spline Geometry)
- PDF/SVG File Exporter
- Angular Framework Dependencies
- Join-Arc Tool & Biarc Resolution
- About Modal & Top Bar Components
- Offset Tool
- Draft Canvas Pointer/Selection Handling
- Angular Build Tooling Dependencies
- Hello Recipe & Toolbar
- Center Bout Panel Screenshot
- Shape Hit-Testing
- Historical Ceruti Construction Drawing
- Outer Trace Panel UI
- Message Center Component
- Message Service & App Bootstrap
- DXF File Exporter
- Panel Flow State Machine
- Package.json Metadata
- App Root Component
- Hello Recipe Component
- CC Outline Construction Diagram
- Path Download Handlers
- Debounce Controller
- Camera Zoom/Pan
- Legacy Draft Math & Polygon Clipper
- NPM Scripts
- Draft Canvas Camera Bindings
- Reference Instrument Photos (Cello/Violin)
- Mittenwald Double Bass Reference
- App Config & Routing
- Base Panel UI
- CremonaCad Logo & Branding
- Del Gesu Baltic Reference Image
- Strad Goetz Reference Image
- Maggini Delmas Reference Image
- Angular Compiler Dependency
- Strad Davidoff Reference Image
- F-hole Reference Image
- Kelly Recipe Upper Bout Section (Archived)
- RxJS Dependency
- svg2pdf.js Dependency
- tslib Dependency
- Top Bar & App Shell Templates
- Beard Violin Recipe (Archived)
- Download Icon Asset
- HesMe Photo (Unrelated Personal Image)
- New File Icon Asset
- Upload Icon Asset
- Ceruti Base Panel Template
- Ceruti Mould Panel Template
- Message Center Template

## God Nodes (most connected - your core abstractions)
1. `Pt` - 122 edges
2. `SettingsBarComponent` - 84 edges
3. `DraftCanvasComponent` - 73 edges
4. `RecipeComponentBase` - 58 edges
5. `KellyViolin` - 52 edges
6. `DraftToolHost` - 49 edges
7. `ToolboxStore` - 48 edges
8. `CrossArchingPanel` - 45 edges
9. `ToolPaletteComponent` - 42 edges
10. `DraftTool` - 36 edges

## Surprising Connections (you probably didn't know these)
- `CremonaCad (application)` --references--> `DraftCanvasComponent`  [EXTRACTED]
  README.md → src/app/draft-canvas/draft-canvas.ts
- `CremonaCad (application, about-modal description)` --semantically_similar_to--> `CremonaCad (application)`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `Intersecting Arcs design system (about-modal description)` --semantically_similar_to--> `Intersecting Arcs design system`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `Enrico Ceruti workshop drafting document` --semantically_similar_to--> `Enrico Ceruti drafting document`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md
- `GNU GPL-3.0 License (about-modal description)` --semantically_similar_to--> `GNU GPL-3.0 License`  [INFERRED] [semantically similar]
  src/app/about-modal/about-modal.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ceruti recipe panels share d.params/colors/viewFlags state via CerutiViolinComponent** — src_app_enrico_ceruti_violin_ceruti_violin_cerutiviolincomponent, src_app_enrico_ceruti_violin_panels_main_bouts_panel_main_bouts_panel_cerutimainboutspanelcomponent, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel_ceruticornerspanelcomponent, src_app_enrico_ceruti_violin_panels_center_bout_panel_center_bout_panel_ceruticenterboutpanelcomponent, src_app_enrico_ceruti_violin_panels_outer_trace_panel_outer_trace_panel_cerutioutertracepanelcomponent, src_app_enrico_ceruti_violin_panels_long_arching_panel_long_arching_panel_cerutilongarchingpanelcomponent, src_app_enrico_ceruti_violin_panels_cross_arching_panel_cross_arching_panel_ceruticrossarchingpanelcomponent, src_app_enrico_ceruti_violin_render_toggles_render_toggles_cerutirendertogglescomponent [EXTRACTED 1.00]
- **Panels share onArcFocus/onArcBlur/adjustArcStart/adjustArcEnd/nearestFraction helper methods** — src_app_enrico_ceruti_violin_panels_main_bouts_panel_main_bouts_panel_cerutimainboutspanelcomponent, src_app_enrico_ceruti_violin_panels_corners_panel_corners_panel_ceruticornerspanelcomponent, src_app_enrico_ceruti_violin_panels_center_bout_panel_center_bout_panel_ceruticenterboutpanelcomponent, src_app_enrico_ceruti_violin_panels_outer_trace_panel_outer_trace_panel_cerutioutertracepanelcomponent [INFERRED 0.85]
- **Long/cross arching definition feeds export panel's STL and template outputs** — src_app_enrico_ceruti_violin_panels_long_arching_panel_long_arching_panel_cerutilongarchingpanelcomponent, src_app_enrico_ceruti_violin_panels_cross_arching_panel_cross_arching_panel_ceruticrossarchingpanelcomponent, src_app_enrico_ceruti_violin_panels_export_panel_export_panel_cerutiexportpanelcomponent [INFERRED 0.85]

## Communities (89 total, 22 thin omitted)

### Community 0 - "Cross-Arch Station & Asymmetric Spline Math"
Cohesion: 0.05
Nodes (99): archFromLoweredTakeoff(), buildCycloidPathAcrossAsym(), calculateCrossArchTop(), calculateLongArch(), contourSampleSteps(), crossArchEdgeSlopeAt(), CrossArchResolver, CrossArchSides (+91 more)

### Community 1 - "Reference Image Controller"
Cohesion: 0.07
Nodes (5): ReferenceImageController, ReferenceImageStore, Injectable, NamedReferenceImage, ReferenceImage

### Community 2 - "Arc/Tangent Drawing Tools"
Cohesion: 0.11
Nodes (7): ArcTool, ChainedTangentArcTool, DraftToolHost, JoinArcTool, supportedShapes(), TangentArcTool, Pt

### Community 3 - "Cross Arching Panel & Station State"
Cohesion: 0.07
Nodes (13): CrossArchParams, CrossArchShape, CrossArchStation, FlutingChannelParams, PlateViewMode, CrossArchingPanel, round2(), seedCrossArchSides() (+5 more)

### Community 4 - "Ceruti Panel Rendering (Bouts/Corners)"
Cohesion: 0.12
Nodes (35): CenterBoutViewFlags, renderCenterBout(), CornersViewFlags, renderCorners(), MainBoutsViewFlags, renderMainBouts(), renderOuterTraceGuides(), RenderLayer (+27 more)

### Community 5 - "Recipe Base Lifecycle & Undo/Redo"
Cohesion: 0.07
Nodes (8): BeardViolinRecipe, NamedConstant, RecipeInterface, RecipeComponentBase, Component, HostListener, Input, Output

### Community 6 - "Draft Canvas Shape-Creation Tools"
Cohesion: 0.10
Nodes (28): createBoxLineTool(), RootGroup, createChainedTangentArcTool(), createCircleTool(), radiusOf(), createDimensionTool(), previewDimension(), RootGroup (+20 more)

### Community 7 - "Angular CLI Workspace Config"
Cohesion: 0.05
Nodes (40): build, serve, test, builder, configurations, defaultConfiguration, options, analytics (+32 more)

### Community 8 - "Ceruti Path & Calc Builders"
Cohesion: 0.21
Nodes (36): calculateMainPath(), calculateCenterBout(), calculateCorners(), calculateMainBouts(), ensureCenterBoutInnerPath(), ensureOuterTracePaths(), upsertPathEntry(), angleBeforeEnd() (+28 more)

### Community 9 - "Toolbox Layer Store"
Cohesion: 0.11
Nodes (3): Layer, ToolboxStore, Injectable

### Community 10 - "Draft Canvas Core (Camera/Snap/Angle-Lock)"
Cohesion: 0.11
Nodes (20): Bounds, ANGLE_LOCK_DEG, normalizeDeltaDeg(), snapToLockedAngle(), RootGroup, makeLayerId(), arcMidpoint(), EndpointGrabber (+12 more)

### Community 11 - "Tool Palette Component"
Cohesion: 0.06
Nodes (4): ToolPaletteComponent, Component, Output, ToolSlot

### Community 12 - "Project README & About-Modal Concepts"
Cohesion: 0.07
Nodes (37): Deploy to GitHub Pages Workflow, Andrew Argraves (author), Angular 21, Beard violin recipe (archived example), CremonaCad (application), D3.js, Enrico Ceruti drafting document, GNU GPL-3.0 License (+29 more)

### Community 13 - "Ceruti Panel Arc Editing UI"
Cohesion: 0.07
Nodes (14): CenterBoutPanel, Component, Input, CornersPanel, Component, Input, MainBoutsPanel, Component (+6 more)

### Community 14 - "Settings Bar Field Setters"
Cohesion: 0.06
Nodes (3): SettingsBarComponent, Component, Input

### Community 15 - "Ceruti Measurement Info Helpers"
Cohesion: 0.13
Nodes (31): archContoursInfo(), archHeightInfo(), asymmetricCrossArchInfo(), bitDiameterInfo(), boutWidthInfo(), buttonInfo(), centerBoutWidthInfo(), channelDepthInfo() (+23 more)

### Community 16 - "SVG Path Math (Arcs/Catenary/Spline/Boolean)"
Cohesion: 0.10
Nodes (31): buildArchPath(), intersectLines(), solveCatenaryA(), ArchSplineControlPoint, arcSweepSign(), booleanOpFromPaths(), buildCatenaryPath(), buildCycloidPath() (+23 more)

### Community 17 - "Long Arching Curve Types & Panel"
Cohesion: 0.11
Nodes (16): normalizeArchCurve(), ArchCatenary, ArchCurve, ArchCycloid, ArchingParams, ArchSpline, ArchSplinePoint, LongArchingPanel (+8 more)

### Community 18 - "Beard Violin Component (Archived)"
Cohesion: 0.16
Nodes (9): BeardViolinComponent, BeardViolinParams, Component, arcPathByAngleAboutTheta(), lineCircleIntersection(), solveInscribedCircleAlongAxis(), renderBoxLine(), arcPathFrom3Points() (+1 more)

### Community 19 - "Kelly Violin Component (Archived)"
Cohesion: 0.12
Nodes (4): KellyViolin, Component, HostListener, renderDashLine()

### Community 20 - "Draft Canvas Component"
Cohesion: 0.08
Nodes (4): DraftCanvasComponent, Component, Output, ViewChild

### Community 21 - "Arc Geometry & Shape Renderer"
Cohesion: 0.13
Nodes (22): arcPathData(), fitTangentArc(), normalizeAngle(), pickArcOrientation(), pointOnCircle(), TangentArcFit, ArcStage, createArcStartFirstTool() (+14 more)

### Community 22 - "Export Panel & Mould/Template Export"
Cohesion: 0.19
Nodes (16): calculateCornerBlocks(), calculateMould(), TemplateShape, ExportPanel, ExportType, Component, Input, Output (+8 more)

### Community 23 - "Kelly Violin Calcs (Archived)"
Cohesion: 0.14
Nodes (22): calculateMainBouts(), calculateMainPathsUnified(), calculateMouldPath(), calculatePrimaryShapes(), initializeBlocks(), initializeCornerCircles(), initializeCornerPlacement(), initializeMainBouts() (+14 more)

### Community 24 - "Kelly Violin Types & Templates (Archived)"
Cohesion: 0.08
Nodes (26): BLANK_PARAMS, createKellyIntersects(), createKellyShapes(), DelGesu_Baltic_Params, KELLY_DEFAULT_RATIOS, KELLY_TEMPLATES, KellyBlockIntersects, KellyCalcEntry (+18 more)

### Community 25 - "Ceruti Templates & Core Types"
Cohesion: 0.10
Nodes (20): CERUTI_TEMPLATES, DelGesuBaltic, GuadagniniPiacenza, MagginiDelmas, MittenwaldBass, RavatinMans, StradDavidoff, StradGoetz (+12 more)

### Community 26 - "CerutiViolin Component"
Cohesion: 0.12
Nodes (4): CerutiViolin, Component, Input, ViewChild

### Community 28 - "Draft Tool Base Classes & Registry"
Cohesion: 0.10
Nodes (5): DraftTool, PointTool, TextTool, ToolRegistryService, Injectable

### Community 29 - "Axis Grid Controller"
Cohesion: 0.12
Nodes (5): AxisGridController, AxisGridPreferences, CanvasViewport, PersistedAxisGridPreferences, RootGroup

### Community 30 - "Mould Panel & Cross-Arch Rendering"
Cohesion: 0.17
Nodes (15): CerutiColors, EnricoCerutiParams, PathEntry, CrossArchingSceneInput, MouldPanel, renderMould(), Component, Input (+7 more)

### Community 31 - "Kelly Outer Trace & Path Calcs (Archived)"
Cohesion: 0.17
Nodes (8): Input, calculateMainPathsSegmented(), calculateOffsetPathsSegments(), calculateTopPath(), initializeTopAndBottomTrace(), normalizeDegrees(), upsertCalc(), renderCircleAngleIndicator()

### Community 32 - "Selected Shape Type Accessors"
Cohesion: 0.13
Nodes (8): ArcShape, BoxLineShape, CircleShape, DimensionShape, LineShape, PointShape, RectShape, TextShape

### Community 33 - "Panel Flow & Reference Image Utilities"
Cohesion: 0.14
Nodes (10): HelloRecipeComponent (Template), RecipeComponentBase Sidebar Pattern (documented), DEFAULT_NAMED_CONSTANTS, PanelDefinition, PanelProgress, makeReferenceImageId(), normalizeReferenceImages(), toNamedReferenceImage() (+2 more)

### Community 34 - "Snap Engine & SVG Path Parsing"
Cohesion: 0.15
Nodes (14): collectFromElement(), KIND_PRIORITY, RootGroup, SnapCandidate, SnapEngine, SnapKind, tangentAt(), drawSnapMarker() (+6 more)

### Community 35 - "Draft Math Core (Biarc/Spline Geometry)"
Cohesion: 0.16
Nodes (14): biarcFromRoot(), distPointToPolyline(), distPointToPolylineIndexed(), distPointToSegment(), endSlope(), findAllJoiningArcsFromTangents(), findJoiningArcs(), findJoiningArcsFromTangents() (+6 more)

### Community 36 - "PDF/SVG File Exporter"
Cohesion: 0.18
Nodes (17): allowedCommonJsDependencies, jspdf, jspdf, jspdf, polygon-clipping, svg2pdf.js, buildPathMarkup(), buildScaledSvg() (+9 more)

### Community 37 - "Angular Framework Dependencies"
Cohesion: 0.12
Nodes (17): @angular/common, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, d3, dependencies, @angular/common (+9 more)

### Community 38 - "Join-Arc Tool & Biarc Resolution"
Cohesion: 0.17
Nodes (12): arcSpan(), BiarcCandidate, computeBiarcCandidates(), computeJoint(), createJoinArcTool(), logJoinDebug(), preferMinorSweep(), rankedBiarcCandidates() (+4 more)

### Community 39 - "About Modal & Top Bar Components"
Cohesion: 0.14
Nodes (6): AboutModalComponent, Component, TopBarComponent, Component, Input, Output

### Community 40 - "Offset Tool"
Cohesion: 0.22
Nodes (10): boundaryPoints(), computeSignByShapeId(), createOffsetTool(), nearestSignedDistance(), OffsetTool, RootGroup, samePoint(), signedOffsetMetric() (+2 more)

### Community 41 - "Draft Canvas Pointer/Selection Handling"
Cohesion: 0.20
Nodes (3): drawAreaSelectBox(), drawEndpointGrabber(), drawMoveGrabber()

### Community 42 - "Angular Build Tooling Dependencies"
Cohesion: 0.15
Nodes (13): @angular/build, @angular/compiler-cli, jsdom, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jsdom (+5 more)

### Community 43 - "Hello Recipe & Toolbar"
Cohesion: 0.15
Nodes (7): DEFAULTS, HelloParams, RecipeToolbarComponent, Component, Input, Output, ViewChild

### Community 44 - "Center Bout Panel Screenshot"
Cohesion: 0.23
Nodes (12): Canvas Fit/zoom/Reference/Axis controls (bottom toolbar), Center Bout parameter panel (Total Width, CBW to LBW, C0 Radius, C0 Y, C0 to LBW, Fit C0 to Bouts), Center Bout recipe step, Colored corner/bout construction curves (upper red, lower yellow, center blue/green) with dashed guide lines and handle points, Lower Corner parameter panel (C1 Radius, Compound, C1 to LBW, C11 Radius, Split Angle), Select Recipe Step control, Reference violin body photograph (background image), Show Module/All Arcs, Circles, Guides, Outer Path toggle buttons (+4 more)

### Community 45 - "Shape Hit-Testing"
Cohesion: 0.33
Nodes (10): distanceToArc(), distanceToBoxInterior(), distanceToRect(), distanceToSegment(), distanceToShape(), distanceToText(), isAngleWithinSweep(), normalizeAngle() (+2 more)

### Community 46 - "Historical Ceruti Construction Drawing"
Cohesion: 0.24
Nodes (11): C-bouts (waist curves) with concentration of small dashes suggesting f-hole placement zone on right side, Central vertical axis line running through the body length, Dashed diagonal/triangular construction lines forming a geometric layout grid, Lower bout (rounded bottom of violin body), "Mezzo" (Italian for "middle") handwritten label near center bout point, Sequential numbered tick marks (approx. 1-71) along left margin and axes used as a measurement scale, CerutiDrawing.png (historical violin construction drawing), Handwritten radius/measurement annotations (e.g. "R 6 1", "18 1/2", "9 3/4") marking compass radii for bout curves (+3 more)

### Community 47 - "Outer Trace Panel UI"
Cohesion: 0.22
Nodes (4): OuterTracePanel, Component, Input, renderFilledPath()

### Community 48 - "Message Center Component"
Cohesion: 0.29
Nodes (3): MessageCenterComponent, Component, Message

### Community 49 - "Message Service & App Bootstrap"
Cohesion: 0.31
Nodes (6): makeMessage(), MessageInput, MessageService, newId(), Severity, Injectable

### Community 50 - "DXF File Exporter"
Cohesion: 0.36
Nodes (9): buildDxfFile(), cubicBezierPoint(), downloadDxfFile(), DxfEntity, normalizeRad(), pathToDxfEntities(), quadraticBezierPoint(), toDeg() (+1 more)

### Community 52 - "Package.json Metadata"
Cohesion: 0.22
Nodes (8): name, packageManager, prettier, overrides, printWidth, singleQuote, private, version

### Community 53 - "App Root Component"
Cohesion: 0.28
Nodes (3): App, Component, setGlobalEmitter()

### Community 55 - "CC Outline Construction Diagram"
Cohesion: 0.57
Nodes (8): Cremona-CAD outline geometry (classical stringed-instrument body shape construction), Arc center points (cross markers) defining construction circles, C-bout corner curves (waist, red/orange/yellow, both sides), Vertical center axis / symmetry line of instrument body, Dashed construction/guide lines connecting arc centers, Lower bout curve (bottom rounded lobe, blue), CC_Drawing.png — violin/cello outline construction diagram, Upper bout curve (top rounded lobe, green)

### Community 56 - "Path Download Handlers"
Cohesion: 0.54
Nodes (3): buildMirroredSvg(), downloadSvgFile(), safeRun()

### Community 60 - "Legacy Draft Math & Polygon Clipper"
Cohesion: 0.40
Nodes (5): calculateOffsetAlongPath(), findClosestPointOnPathToCircle(), polygonClipper, svg-path-properties, svg-path-properties

### Community 61 - "NPM Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, ng, start, test, watch

### Community 64 - "Reference Instrument Photos (Cello/Violin)"
Cohesion: 0.40
Nodes (5): Cello top plate (belly) with f-holes and arching, Reference image feature (multiple reference images for CAD comparison), Guadagnini Piacenza violin front view (reference image), Violin body top plate (front, spruce, with f-holes, purfling, bridge, tailpiece, strings, fingerboard), Ravatin Mans cello front reference photo

### Community 65 - "Mittenwald Double Bass Reference"
Cohesion: 0.50
Nodes (5): Top plate arching/carved contour visible via shading, Antique Mittenwald-school Double Bass (front view), F-hole soundholes visible on bass top plate, Mittenwald c.1900 Double Bass Reference Photo, Tailpiece and saddle assembly

### Community 67 - "Base Panel UI"
Cohesion: 0.40
Nodes (4): BasePanel, Component, Input, Output

### Community 68 - "CremonaCad Logo & Branding"
Cohesion: 0.50
Nodes (4): CremonaCadLogo.svg (application logo), Decorative flourished 'C' letterform motif (dark gray #333333, calligraphic serif swash), Cremona (Italian city famed for violin-making, e.g. Stradivari) — implied brand reference, CremonaCad wordmark (stylized decorative 'C' + REMONA + decorative 'C' + AD)

### Community 70 - "Del Gesu Baltic Reference Image"
Cohesion: 0.67
Nodes (3): 'Baltic' Guarneri del Gesù violin (historical instrument), Reference image feature (multiple reference images for CAD comparison), DelGesuBaltic.png - Violin front reference photo

### Community 71 - "Strad Goetz Reference Image"
Cohesion: 0.67
Nodes (3): 1695 'Goetz' violin (attributed Stradivari) reference instrument, Jost Thöne Verlag - publisher, source of the violin photograph (copyright watermark), StradGoetz.jpg - Photo of the 1695 'Goetz' Stradivari violin front plate

### Community 72 - "Maggini Delmas Reference Image"
Cohesion: 0.67
Nodes (3): Top plate (belly/soundboard) with f-holes, bridge, tailpiece, strings, Maggini-style double bass (attributed instrument, 'Delmas'), Maggini_Delmas.png reference photo

## Knowledge Gaps
- **195 isolated node(s):** `$schema`, `version`, `packageManager`, `analytics`, `newProjectRoot` (+190 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Pt` connect `Arc/Tangent Drawing Tools` to `Cross-Arch Station & Asymmetric Spline Math`, `Reference Image Controller`, `Ceruti Panel Rendering (Bouts/Corners)`, `Recipe Base Lifecycle & Undo/Redo`, `Draft Canvas Shape-Creation Tools`, `Ceruti Path & Calc Builders`, `Draft Canvas Core (Camera/Snap/Angle-Lock)`, `SVG Path Math (Arcs/Catenary/Spline/Boolean)`, `Long Arching Curve Types & Panel`, `Beard Violin Component (Archived)`, `Draft Canvas Component`, `Arc Geometry & Shape Renderer`, `Export Panel & Mould/Template Export`, `Kelly Violin Calcs (Archived)`, `Kelly Violin Types & Templates (Archived)`, `Ceruti Templates & Core Types`, `Draft Tool Base Classes & Registry`, `Mould Panel & Cross-Arch Rendering`, `Panel Flow & Reference Image Utilities`, `Snap Engine & SVG Path Parsing`, `Draft Math Core (Biarc/Spline Geometry)`, `Join-Arc Tool & Biarc Resolution`, `Offset Tool`, `Draft Canvas Pointer/Selection Handling`, `Hello Recipe & Toolbar`, `Shape Hit-Testing`, `Message Service & App Bootstrap`, `App Root Component`, `Camera Zoom/Pan`, `Legacy Draft Math & Polygon Clipper`, `Draft Canvas Camera Bindings`?**
  _High betweenness centrality (0.270) - this node is a cross-community bridge._
- **Why does `DraftCanvasComponent` connect `Draft Canvas Component` to `Selected Shape Type Accessors`, `Reference Image Controller`, `Arc/Tangent Drawing Tools`, `Snap Engine & SVG Path Parsing`, `Draft Canvas Selection Shortcuts`, `Draft Canvas Pointer/Selection Handling`, `Draft Canvas Core (Camera/Snap/Angle-Lock)`, `Tool Palette Component`, `Project README & About-Modal Concepts`, `Shape Hit-Testing`, `Settings Bar Field Setters`, `Message Service & App Bootstrap`, `Draft Canvas Camera Bindings`, `Draft Canvas Display Preferences`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `SettingsBarComponent` connect `Settings Bar Field Setters` to `Selected Shape Type Accessors`, `Draft Canvas Core (Camera/Snap/Angle-Lock)`, `Tool Palette Component`, `Draft Canvas Component`, `Shape Point Field Setters`, `Draft Shape Field Accessors`, `Draft Tool Base Classes & Registry`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `packageManager` to the rest of the system?**
  _195 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cross-Arch Station & Asymmetric Spline Math` be split into smaller, more focused modules?**
  _Cohesion score 0.05098732684939582 - nodes in this community are weakly interconnected._
- **Should `Reference Image Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.06939890710382514 - nodes in this community are weakly interconnected._
- **Should `Arc/Tangent Drawing Tools` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._