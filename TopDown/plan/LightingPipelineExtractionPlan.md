# Lighting Pipeline Componentization Plan

## Goal

Convert the current Pixi lighting test harness into a reusable
`TopDownLightingPipeline` package API that can be integrated into a Pixi-based
game engine without depending on HTML controls, harness globals, or
harness-specific display logic.

The final component should own lighting state, animation evaluation, render targets, shader passes, output textures, and resource cleanup. The test harness should become a thin adapter that supplies inputs and displays outputs.

## Target Integration Shape

```ts
const lighting = new TopDownLightingPipeline({
  renderer: app.renderer
});

lighting.setRoomTexture({
  texture: roomTexture,
  geometry: {
    widthPx: roomWidth,
    heightPx: roomHeight,
    cellSizePx: 40
  },
  ownership: "borrowed"
});

lighting.submitFrame(worldLightingState);

app.ticker.add(() => {
  lighting.renderFrame(gameClock.seconds);
});

const outputs = lighting.getOutputs();
displaySprite.texture = outputs.composedTexture;
```

The host engine remains responsible for asset loading, world-to-image/cell coordinate conversion, scene graph presentation, and the clock. The component remains responsible for lighting simulation and rendering.

## WebPortal Compatibility Constraints

The intended first engine consumer is the Pixi-based WebPortal renderer. A
cursory review establishes the following compatibility requirements:

- WebPortal currently uses PixiJS 8.x through Vite/ESM, so the extracted
  package should target PixiJS 8 APIs rather than preserving the PixiJS 7-only
  harness setup.
- The package must accept a host-owned Pixi renderer and must not create its
  own `Application`, canvas, ticker, or renderer lifecycle.
- The host renderer owns asynchronous Pixi initialization, viewport resizing,
  ticker registration, and final disposal. The lighting component should expose
  compatible `resize`, explicit time-driven rendering, and `dispose` behavior.
- WebPortal uses room-space pixel coordinates and applies viewport contain
  scaling separately. Lighting render targets and room geometry must remain in
  room space and must not be resized merely because the display viewport changes.
- WebPortal currently composes rooms from independent sprites and does not
  expose a dedicated room/albedo texture in its scene snapshot. The lighting
  package must remain independent of WebPortal scene contracts while allowing a
  future adapter to provide either a dedicated room texture or a captured
  composed room surface.
- WebPortal already has a Pixi container-to-texture capture pattern for room
  snapshots. That pattern may inform a future lighting adapter, but live room
  capture versus a dedicated albedo layer remains an integration decision.
- The component should account for renderer texture-size limits and quality or
  resolution scaling, consistent with WebPortal's existing bounded snapshot
  behavior.
- Point lights, blockers, and cell size are not currently present in the
  WebPortal scene contract. They must arrive through a future game-state or
  renderer adapter rather than being inferred from unrelated WebPortal UI data.

These constraints should steer the package boundary without coupling the
lighting implementation directly to WebPortal types.

## Packaging and Delivery

The extracted component should be delivered as an npm package. The package is
the reusable engine-facing product; the HTML harness remains a development and
visual-validation consumer rather than part of the runtime package.

The package should contain:

- The pipeline component and public TypeScript types.
- Compiled JavaScript and `.d.ts` declarations.
- Shader sources and rendering-pass implementation.
- Documentation for Pixi compatibility, lifecycle, coordinate spaces, and
  output texture ownership.

The package should not contain:

- HTML controls or DOM configuration.
- Harness globals or demo-only display logic.
- CDN script dependencies.
- A bundled second copy of PixiJS.

PixiJS should be declared as a peer dependency so the host engine controls the
Pixi version and the application does not load multiple Pixi instances. The
initial development package may remain private or be consumed through a local
workspace dependency before public publishing is considered.

An eventual repository layout may look like:

```text
packages/
  lighting/
    src/
    dist/
    package.json
    tsconfig.json
    README.md
TopDownLightingTestHarness.html
```

The public package entry point should expose only intentional runtime APIs and
types, for example:

```ts
import {
  TopDownLightingPipeline,
  type RoomGeometryInput,
  type LightingFrameInput
} from '@storyboard/lighting';
```

Packaging validation should include:

1. Building ESM JavaScript and declaration files.
2. Running `npm pack --dry-run` to verify package contents.
3. Installing the packed artifact into a second programmatic Pixi harness.
4. Confirming the consumer does not require the original HTML harness.
5. Publishing only after the public contract and lifecycle API are stable.

### Room Geometry Contract

Room geometry is established together with the room texture because these values
define the canonical internal coordinate system used by lights, blockers, and
render targets:

```ts
interface RoomGeometryInput {
  /** Room/image width in internal image-space pixels. */
  widthPx: number;
  /** Room/image height in internal image-space pixels. */
  heightPx: number;
  /** Grid-cell size in the same internal image-space pixels. */
  cellSizePx: number;
}
```

`setRoomTexture(texture, dimensions)` should receive this geometry (or an
equivalent dimensions object) and use it to allocate room-sized render targets
and establish cell-to-pixel conversion. These are internal room-space values,
not display canvas dimensions; presentation scaling remains outside the
lighting simulation.

`cellSizePx` should not be treated as a generic pipeline-quality setting. It
belongs with room geometry because it determines how grid-space blockers map
into image-space pixels. If the room geometry changes, the component should
revalidate dependent resources and coordinate calculations together.

## Target API Semantics

### `setRoomTexture(texture, dimensions)`

Establishes the source scene/albedo texture and room geometry, then allocates
or reallocates internal render targets for that room size. `dimensions` should
include room/image width, room/image height, and cell size.

The component should document texture ownership, room replacement behavior, and whether the supplied texture may be destroyed by the component.

### `submitFrame(frame)`

Accepts the authoritative lighting state for the next render:

- Room/global lighting configuration
- Room geometry and grid mapping are established through room setup, not as
  per-frame pipeline-quality settings.
- Point lights
- Blockers

It normalizes and stores the data, then marks affected stages dirty. It should not read from the DOM and should not require rendering immediately.

### `renderFrame(timeSeconds)`

Renders one snapshot of the current lighting state at the supplied absolute scene time.

It should:

1. Evaluate animated light state using `timeSeconds`.
2. Pack light and blocker data into GPU uniforms.
3. Render occlusion.
4. Apply optional occlusion softening.
5. Render the accumulated light map.
6. Compose the room texture with the light map.
7. Update the cached output textures.

Absolute time is used for deterministic procedural sway and flicker. It does not replay previous frames or perform work proportional to how long the scene has existed.

### `getOutputs()`

Returns the most recently rendered output textures without performing rendering:

- `composedTexture`
- `lightMapTexture`
- `occlusionTexture`
- `occlusionSoftTexture`

The component owns these resources. Consumers may display or sample them but should not destroy them directly. `dispose()` owns cleanup.

### `resize(width, height)`

Reallocates or updates resources when the internal room/render size changes. Presentation scaling should remain outside the lighting simulation coordinate space.

### `dispose()`

Destroys render textures, filters, pass objects, and other GPU resources owned by the component.

## Ordered Execution Plan

### Step 1: Lock down and export the public contract

- Export all public input, output, and options types.
- Export the room geometry contract, including room width, room height, and cell size.
- Define the canonical coordinate and unit contracts.
- Define normalization bounds and default behavior.
- Represent point-light sway and flicker configuration as explicit point-light defaults, separate from room lighting.
- Expose capacity/configuration such as maximum light and blocker counts instead of hiding it in the HTML harness.

Completion criteria:

- A consuming TypeScript project can import the component and its types.
- The contract does not mention HTML elements or harness functions.

### Step 2: Remove DOM configuration from pipeline logic

- Move room lighting values, point-light defaults, and pipeline values into explicit input groups rather than DOM-bound globals.
- Remove reads from `ambient`, `radius`, `color`, `flickerStyle`, and other HTML controls.
- Keep DOM-to-frame conversion inside the harness adapter.

Completion criteria:

- The component can be constructed and used without the test harness HTML.
- Missing values resolve to component-owned defaults rather than DOM values.

### Step 3: Make state instance-owned

Move the following from HTML globals into the component instance:

- Lights and blockers
- Room dimensions
- Render textures
- Filters and pass containers
- Packed uniform arrays
- Dirty flags and lifecycle state

Completion criteria:

- Two pipeline instances can coexist without sharing mutable state.
- External code cannot mutate internal light or blocker state accidentally.

### Step 4: Extract pure lighting behavior

Move into reusable TypeScript modules:

- Sway evaluation
- Swell flicker
- Flame flicker noise
- Color parsing and normalization
- Light uniform packing
- Blocker uniform packing

Use explicit time and per-light phase values. Avoid hidden reads from `performance.now()`.

Completion criteria:

- Motion and flicker functions can be unit-tested without Pixi or a browser.
- The same inputs and timestamp produce the same animated values.
- Room-level gradient and flicker defaults correctly apply when a light omits overrides.

### Step 5: Move shader and pass construction into the component

Extract from `TopDownLightingTestHarness.html`:

- Occlusion shader
- Occlusion blur setup
- Light accumulation shader
- Compose shader
- Preview/debug shader, if retained as a component capability
- Render-pass orchestration currently in `rebuildLightingMap`

Use explicit renderer and texture dependencies rather than global `app` or Pixi objects.

Completion criteria:

- `TopDownLightingTestHarness.html` contains no lighting shader source.
- `TopDownLightingTestHarness.html` contains no implementation of `rebuildLightingMap`.
- The component can execute all production passes from its own methods.

### Step 6: Implement resource lifecycle

- Add `setRoomTexture` and room replacement behavior.
- Add `resize` where required by the rendering design.
- Add `dispose` and explicitly destroy owned GPU resources.
- Define behavior for calls before room initialization.
- Define behavior after disposal.

Completion criteria:

- Replacing rooms does not retain obsolete pass resources.
- Repeated initialization and disposal are safe and testable.

### Step 7: Separate submission from rendering

- Make `submitFrame` update state and dirty flags.
- Make `renderFrame(timeSeconds)` the explicit render boundary.
- Allow static scenes to render only when dirty.
- Allow animated scenes to render with new timestamps without resubmitting unchanged world state.

Completion criteria:

- A static scene can submit and render once.
- An animated scene can render repeatedly using only updated time.
- No component-owned animation loop or browser ticker is required.

### Step 8: Reduce the HTML to a test harness adapter

Retain in the test harness:

- Pixi application creation
- File/image loading
- UI controls
- Pointer placement
- Blocker/light editing tools
- Debug overlays
- Output/display-mode selection

Remove from the test harness:

- Lighting math
- Flicker noise
- Uniform packing
- Shader definitions
- Render-target allocation
- Lighting pass execution
- Pipeline resource cleanup

Completion criteria:

- The test harness only translates UI/game-like state into the public component API and presents outputs.

### Step 9: Validate with a second non-UI harness

Create a minimal programmatic harness that has:

- No HTML controls
- No harness globals
- No pointer placement
- No debug overlays
- Programmatically supplied room, lights, blockers, and clock

Use it to verify that the component is genuinely reusable outside the original page.

Completion criteria:

- The second harness can create, render, display, replace, resize, and dispose a pipeline instance.

### Step 10: Package and document engine integration

- Export the component and public types.
- Document the Pixi version/API expectations.
- Document coordinate conversion responsibilities.
- Document output texture ownership.
- Document render cadence for static and animated scenes.
- Add a short integration example independent of the test harness.
- Build a package with compiled JavaScript and declaration files.
- Declare PixiJS as a peer dependency rather than bundling it.
- Keep the HTML harness outside the runtime package.
- Validate the packed artifact with a separate programmatic consumer.

### Step 11: Produce WebPortal Integration Handover

After the package API, renderer lifecycle, room geometry, and room-surface
strategy are stable, produce a WebPortal-specific handover document.

The handover should include:

- The compatible package version and PixiJS peer-dependency requirement.
- Installation or workspace-consumption instructions.
- The exact construction point inside the WebPortal renderer.
- How the host renderer is injected and how Pixi initialization timing is handled.
- How WebPortal room bounds map to `RoomGeometryInput`.
- How cell size, point lights, blockers, and room lighting are sourced.
- Whether the first integration uses a dedicated albedo texture or a composed
  room-surface capture.
- How active/staging room surfaces and transitions interact with lighting.
- How `submitFrame`, `renderFrame(timeSeconds)`, `resize`, and `dispose` are
  wired into the renderer lifecycle.
- Texture ownership, GPU limits, quality settings, and failure behavior.
- A minimal WebPortal code example and an integration checklist.

The handover is a delivery artifact for the WebPortal project, not a reason to
make the lighting package depend on WebPortal source contracts.

## Final Definition of Done

The pipeline is considered truly componentized when all of the following are true:

- It has no DOM or HTML-global dependencies.
- It has no dependency on the test harness’s global arrays or renderer variables.
- It owns its state and GPU resources per instance.
- Its shaders and pass orchestration are part of the component implementation.
- Sway and flicker behavior are reusable and testable outside the browser harness.
- The host controls time and render cadence.
- Outputs are exposed through a documented ownership contract.
- Room replacement, resizing, and disposal are explicit and safe.
- A second programmatic Pixi harness can use it without copying test-harness logic.
- The component can be consumed from a packed npm artifact without the original
  HTML harness or CDN script setup.
- A WebPortal-specific handover document provides a tested, step-by-step
  integration path without requiring WebPortal developers to reverse-engineer
  the prototype or its internal rendering passes.

## Expected Engine Integration Effort After Extraction

For a Pixi-based engine using a compatible renderer, integration should be relatively small:

1. Construct the component with the renderer.
2. Provide the room texture and dimensions.
3. Convert world data into image/cell coordinates.
4. Submit lighting state.
5. Render with the engine clock.
6. Display the composed output or another exposed stage.

The remaining effort should be engine-specific coordination rather than reimplementing lighting behavior.
