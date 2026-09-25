# Lighting Component Handover

> **Superseded draft:** This document describes an earlier prototype contract.
> Use [WebPortalLightingIntegrationHandover.md](plan/WebPortalLightingIntegrationHandover.md)
> for the current package API. In particular, point-light radius, intensity,
> color, gradient, and height defaults now belong to `PointLightDefaultsInput`,
> and there is no global point-light intensity multiplier.

This document describes how to integrate and operate the lighting component outside the test harness source code.

> Status: this is an earlier handover draft. Phase 3 has moved the runtime
> implementation into `packages/lighting`; the final WebPortal handover is
> intentionally scheduled for Phase 7.

## Purpose

`TopDownLightingPipeline` is the boundary between:

- Engine/game state (`pointLights`, `blockers`, room globals)
- Rendering pipeline execution (occlusion, light-map, and composition outputs)

It exists so gameplay code can hand off structured data without touching shader/pipeline internals.

## Source Of Truth

- Authoring source: `packages/lighting/src/TopDownLightingPipeline.ts`
- Runtime artifact: `packages/lighting/dist/` (generated)
- Harness script: `TopDownLightingTestHarness.html`

Do not hand-edit files under `dist/`.

## Build And Test Workflow

1. Edit package TypeScript under `packages/lighting/src/`
2. Run `npm run build` (or `npm run dev` for watch mode)
3. Refresh `TopDownLightingTestHarness.html`
4. Validate visual behavior and API contract

Commands:

- `npm run build`
- `npm run dev`
- `npm run typecheck`

## Integration Model

### Data Handoff

Per frame, provide:

- `roomLighting`
- `pointLightDefaults`
- `pipeline`
- `pointLights`
- `blockers`

and call:

- `submitFrame(input)`

### Component Responsibilities

1. Normalize incoming payloads (defaults, clamping, shape cleanup)
2. Update shared runtime state used by the rendering pipeline
3. Trigger render execution (`renderFrame`)

### Engine Responsibilities

1. Maintain authoritative game state
2. Convert world/game coordinates into the image-space/cell-space expected by the pipeline
3. Call `submitFrame` whenever state changes (or each frame)

## Coordinate And Units Contract

### Point lights

- `x`, `y`: image-space pixels
- `radiusPx`: optional per-light radius in image-space pixels; falls back to `roomLighting.radiusPx`
- `directionDeg`: degrees, where 0 points +X and 90 points +Y in screen/image coordinates
- `coneAngleDeg`: degrees in [1, 360]
- `intensityScale`: per-light multiplier applied to the room baseline intensity
- `lightHeightCells`: optional per-light elevation used for shadow evaluation; falls back to the room-level value when omitted

### Blockers

- `cellX`, `cellY`: integer room-cell coordinates for the blocker’s top-left occupied cell
- `sizeXCells`: occupied footprint count along room X
- `sizeYCells`: occupied footprint count along room Y
- `cornerStyle`: `square` for hard rectangular corners or `round` for rounded corners within the same bounds
- `elevationCells`: blocker elevation used for vertical occlusion evaluation
- `strength`: [0, 1]

Blocker occupancy is a lit receiving surface in the top-down model. A blocker
casts its shadow onto room pixels behind it relative to the light, but its own
occupied footprint is not self-shadowed.

### Room lighting and pipeline

- `ambient`: [0, 1]
- `radiusPx`: light radius in pixels
- `intensity`: scalar
- `lightHeightCells`: light height in cell units
- `cellSizePx`: pixels per grid cell; room cell `(0, 0)` begins at room-image pixel `(0, 0)`
- `shadowSoften`: [0, 4]

Point-light animation defaults are supplied separately through
`pointLightDefaults`. They are fallback values for lights that omit sway or
flicker settings; they do not animate ambient room lighting. A game engine can
update a light's authored `radiusPx` or `intensityScale` every frame to model
gameplay changes such as adding fuel to a fire.

## API Surface

### `setRoomImage(imageElement, geometry)`

Bootstraps render targets/passes for a new room image and establishes room
geometry (`widthPx`, `heightPx`, and `cellSizePx`).

### `setRoomGeometry(geometry)`

Updates the room-space geometry contract. In the current prototype this keeps
the harness cell-size mapping synchronized; the extracted component will use
the geometry to allocate and validate room resources.

### `setRoomLighting(config)`

Updates room lighting controls (ambient, baseline intensity, radius and shared
appearance defaults). Individual point lights may override the applicable
radius, intensity, colors, gradient, and height values.

### `setPointLightDefaults(config)`

Updates fallback sway and flicker settings for point lights.

### `setPipeline(config)`

Updates grid and pipeline settings such as cell size and shadow softening.

### `setPointLights(nextLights)`

Replaces active point-light list after normalization.

### `setBlockers(nextBlockers)`

Replaces active blocker list after normalization and rebuilds overlay.

### `submitFrame(input)`

Primary integration call. Normalizes all data and renders a frame.

### `getOutputs()`

Returns internal render textures:

- `composedTexture`
- `lightMapTexture`
- `occlusionTexture`
- `occlusionSoftTexture`

## Example Frame Payload

```ts
const frame = {
  roomLighting: {
    ambient: 0.25,
    radiusPx: 220,
    intensity: 1.6,
    lightColorHex: '#ffd9a6',
    lightOuterColorHex: '#ff7f5f',
    lightGradientExponent: 1.4,
    lightHeightCells: 2.0
  },
  pointLightDefaults: {
    swayAmountPx: 18,
    swayHz: 0.8,
    swayDirectionDeg: 90,
    flickerAmount: 0.35,
    flickerHz: 7.8,
    flickerStyle: 'flame'
  },
  pipeline: {
    shadowSoften: 1.3
  },
  pointLights: [
    {
      x: 420,
      y: 260,
      radiusPx: 260,
      directionDeg: 35,
      coneAngleDeg: 48,
      motionMode: 'sway-flicker',
      flickerStyle: 'flame',
      flickerAmount: 0.35,
      flickerHz: 7.8,
      lightHeightCells: 2.5,
      color: '#ffe3b8',
      outerColor: '#ff9b61',
      gradientExponent: 1.7,
      intensityScale: 1.0,
      phase: 2.1
    }
  ],
  blockers: [
    {
      cellX: 8,
      cellY: 6,
      sizeXCells: 1,
      sizeYCells: 3,
      cornerStyle: 'square',
      elevationCells: 1.2,
      strength: 1.0
    }
  ]
};

topDownLightingPipelineComponent.submitFrame(frame);
```

`lightHeightCells` may also be supplied on an individual point light. When it
is omitted, the light uses the room-level `lightHeightCells` fallback.

## Migration Notes For Game Engine

1. Keep the component in TypeScript in the engine repo.
2. Replace harness globals with an injected host adapter over time.
3. Preserve normalization behavior to keep old content stable.
4. Keep the harness as a proving ground for new effects before engine rollout.

## Known Coupling In Current Prototype

Current component still references harness-owned globals and helper functions (`ambient`, `rebuildLightingMap`, etc). This is acceptable for MVP/harness iteration.

Next extraction milestone is introducing a host interface so component logic is runtime-agnostic.

## Suggested Next Refactor

1. Define `LightingComponentHost` interface:
   - getters/setters for globals
   - setters for lights/blockers
   - `renderFrame`
2. Inject host into component constructor
3. Keep one host implementation for harness and one for engine

This will produce a clean reusable component with minimal environment assumptions.
