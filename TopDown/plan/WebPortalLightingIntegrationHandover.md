# WebPortal Lighting Integration Handover

This document describes how WebPortal should consume the released
`@jojo-d-little/storyboard-lighting` package. It is an integration guide, not a
request to link WebPortal to this repository or to use unpublished source.

## Prerequisites

- A published, approved package version is available from the private GitHub
  npm registry.
- WebPortal uses PixiJS 8 and a WebGL renderer.
- The WebPortal build environment has access to the private
  `@jojo-d-little` package scope.

The package does not create a Pixi application, renderer, canvas, ticker, or
DOM elements. WebPortal owns those resources and injects its renderer into the
lighting pipeline.

## Install the package

In the WebPortal project, configure the private scope using the project’s
existing GitHub Packages authentication convention. The scope must resolve to
GitHub Packages:

```ini
@jojo-d-little:registry=https://npm.pkg.github.com
```

Then install the approved version:

```powershell
npm install @jojo-d-little/storyboard-lighting@<approved-version>
```

Do not commit a GitHub token. CI should provide package-read authentication
through its existing secret or token mechanism.

## Ownership and coordinate model

The lighting pipeline uses room coordinates, not viewport coordinates:

- Room coordinate `(0, 0)` is the top-left of the room/image.
- `widthPx` and `heightPx` are the internal room/image dimensions.
- `cellSizePx` is the room grid-cell size in those same pixels.
- Point-light `x` and `y` values are room-space pixels.
- Blocker `cellX` and `cellY` are integer room-cell coordinates for the
  top-left occupied cell.
- Blocker `sizeXCells` and `sizeYCells` describe the rectangular footprint.

Viewport scaling, letterboxing, camera placement, and browser canvas offsets
must not be included in these values.

## Create the pipeline

Create the pipeline after Pixi has asynchronously initialized its renderer:

```ts
import * as PIXI from "pixi.js";
import { TopDownLightingPipeline } from "@jojo-d-little/storyboard-lighting";

const app = new PIXI.Application();
await app.init({
  resizeTo: window,
  preference: "webgl"
});

document.body.appendChild(app.canvas);

const lighting = new TopDownLightingPipeline({
  renderer: app.renderer,
  maxLights: 64,
  maxBlockers: 64
});
```

The maximum counts are fixed-size shader capacities. Inputs beyond those
limits are truncated, so WebPortal should choose capacities appropriate for
its scenes.

## Supply the room surface

The pipeline accepts a host-owned Pixi `Texture` representing the room/albedo
surface in room coordinates. The recommended ownership mode is `borrowed`:
WebPortal remains responsible for destroying the texture.

```ts
const roomTexture = PIXI.Texture.from(roomImage);

lighting.setRoomTexture({
  texture: roomTexture,
  geometry: {
    widthPx: roomWidthPx,
    heightPx: roomHeightPx,
    cellSizePx: 40
  },
  ownership: "borrowed"
});
```

For a dynamic room, use a stable host-owned `PIXI.RenderTexture`. Render the
current room surface into it before calling `lighting.renderFrame()`:

```ts
app.renderer.render({
  container: roomContainer,
  target: roomTexture,
  clear: true
});
```

Do not use the lighting pipeline’s composed output as the next frame’s room
input. The room/albedo surface and the composed lighting output should remain
separate.

## Submit and render each frame

Submit the current lighting state, then render with an absolute clock value:

```ts
const outputSprite = new PIXI.Sprite();
app.stage.addChild(outputSprite);

app.ticker.add((ticker) => {
  const timeSeconds = ticker.lastTime / 1000;

  lighting.submitFrame({
    roomLighting: {
      ambient: 0.35,
      ambientColor: "#ffffff"
    },
    pointLightDefaults: {
      radiusPx: 180,
      intensityScale: 1.5,
      color: "#fff1c2",
      outerColor: "#ff9b45",
      gradientExponent: 1.2,
      lightHeightCells: 1,
      swayAmountPx: 0,
      swayHz: 0,
      flickerAmount: 0,
      flickerHz: 0,
      flickerStyle: "swell"
    },
    pipeline: {
      shadowSoften: 1.5
    },
    pointLights: [
      {
        x: 240,
        y: 160,
        radiusPx: 180,
        intensityScale: 1,
        motionMode: "static"
      }
    ],
    blockers: [
      {
        cellX: 4,
        cellY: 3,
        sizeXCells: 2,
        sizeYCells: 2,
        cornerStyle: "square",
        elevationCells: 1,
        strength: 1
      }
    ]
  });

  lighting.renderFrame(timeSeconds);
  const outputs = lighting.getOutputs();
  if (outputs) outputSprite.texture = outputs.composedTexture;
});
```

`renderFrame()` must not be called before `setRoomTexture()`. Before room setup,
`getOutputs()` returns `null` and `renderFrame()` throws a descriptive error.

`ambient` and the optional `ambientColor` are the room-wide illumination
settings. Point-light radius,
intensity, colors, gradient, height, and animation settings belong in
`pointLightDefaults` or are overridden on an individual `PointLightInput`.
There is no global point-light intensity multiplier.

## Render output and resize

Use `outputs.composedTexture` as the final lit room surface. The other outputs
are diagnostic/intermediate textures:

- `lightMapTexture`: generated light contribution.
- `occlusionTexture`: hard blocker occlusion.
- `occlusionSoftTexture`: blurred occlusion.
- `composedTexture`: room surface with lighting applied.

Call `lighting.resize()` only when the internal room/image geometry changes:

```ts
lighting.resize({
  widthPx: roomWidthPx,
  heightPx: roomHeightPx,
  cellSizePx: 40
});
```

A browser or viewport resize is handled by WebPortal’s Pixi renderer, camera,
and presentation sprite. It normally does not require `lighting.resize()`.

## Room transitions and texture ownership

For a room transition:

1. Create or obtain the next room surface.
2. Call `setRoomTexture()` with the new texture and geometry.
3. Submit the next room’s lights and blockers.
4. Render the next frame.

With `ownership: "borrowed"`, WebPortal must destroy the old texture when it
is no longer needed. With `ownership: "owned"`, the lighting pipeline destroys
the supplied texture when it is replaced or disposed. Do not use `owned` for a
texture also managed by WebPortal.

## Shutdown

Dispose the lighting pipeline before destroying the renderer or its host-owned
room texture:

```ts
lighting.dispose();
```

`dispose()` is safe to call more than once. The pipeline owns its intermediate
render textures and output resources.

## Integration checklist

- [ ] Install an approved published package version from GitHub Packages.
- [ ] Confirm WebPortal uses PixiJS 8 and WebGL for this integration.
- [ ] Create the pipeline after Pixi renderer initialization.
- [ ] Supply a room-space texture and matching room geometry.
- [ ] Keep room coordinates independent of viewport/camera coordinates.
- [ ] Render dynamic room content into a separate host-owned texture first.
- [ ] Submit current lights and blockers every frame.
- [ ] Pass absolute seconds to `renderFrame()`.
- [ ] Display `composedTexture`.
- [ ] Call `lighting.resize()` only when room geometry changes.
- [ ] Dispose the pipeline during scene teardown.
- [ ] Verify static lights, animated lights, blockers, room replacement, and
      viewport resizing in WebPortal.

## Reference implementation

The repository’s `programmatic-consumer` is the minimal code-only reference.
The `TopDownLightingTestHarness.html` file is a visual diagnostic tool, not a
required integration dependency.
