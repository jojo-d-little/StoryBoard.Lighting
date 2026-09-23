# Lighting Pipeline Componentization Plan

## Goal

Convert the current Pixi lighting test harness into a reusable `TopDownLightingPipelineComponent` that can be integrated into a Pixi-based game engine without depending on HTML controls, harness globals, or harness-specific display logic.

The final component should own lighting state, animation evaluation, render targets, shader passes, output textures, and resource cleanup. The test harness should become a thin adapter that supplies inputs and displays outputs.

## Target Integration Shape

```ts
const lighting = new TopDownLightingPipelineComponent({
  renderer: app.renderer
});

lighting.setRoomTexture(roomTexture, {
  width: roomWidth,
  height: roomHeight
});

lighting.submitFrame(worldLightingState);

app.ticker.add(() => {
  lighting.renderFrame(gameClock.seconds);
});

const outputs = lighting.getOutputs();
displaySprite.texture = outputs.composedTexture;
```

The host engine remains responsible for asset loading, world-to-image/cell coordinate conversion, scene graph presentation, and the clock. The component remains responsible for lighting simulation and rendering.

## Target API Semantics

### `setRoomTexture(texture, dimensions)`

Establishes the source scene/albedo texture and allocates or reallocates internal render targets for that room size.

The component should document texture ownership, room replacement behavior, and whether the supplied texture may be destroyed by the component.

### `submitFrame(frame)`

Accepts the authoritative lighting state for the next render:

- Room/global lighting configuration
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
- Define the canonical coordinate and unit contracts.
- Define normalization bounds and default behavior.
- Include global sway and flicker configuration in `RoomGlobalsInput` where global fallback behavior is supported.
- Expose capacity/configuration such as maximum light and blocker counts instead of hiding it in the HTML harness.

Completion criteria:

- A consuming TypeScript project can import the component and its types.
- The contract does not mention HTML elements or harness functions.

### Step 2: Remove DOM configuration from pipeline logic

- Move all UI values into `RoomGlobalsInput` or pipeline options.
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

## Expected Engine Integration Effort After Extraction

For a Pixi-based engine using a compatible renderer, integration should be relatively small:

1. Construct the component with the renderer.
2. Provide the room texture and dimensions.
3. Convert world data into image/cell coordinates.
4. Submit lighting state.
5. Render with the engine clock.
6. Display the composed output or another exposed stage.

The remaining effort should be engine-specific coordination rather than reimplementing lighting behavior.
