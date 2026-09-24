# Lighting Pipeline Execution Plan

This is the working execution plan for converting the current lighting
prototype into a reusable PixiJS component and package.

The architectural rationale and long-term target shape remain in
`LightingPipelineExtractionPlan.md`. This companion plan is organized around
implementation order, review gates, and manual validation.

## Working Rules

- Preserve the current harness as the visual reference until parity is proven.
- Keep TypeScript as the source of truth; generated JavaScript is rebuilt, not hand-edited.
- Keep the lighting package independent of HTML, React, WebPortal contracts, and harness globals.
- Stop at each review gate before starting the next major extraction phase.
- Do not combine visual redesign with structural extraction unless explicitly agreed.

## Phase 0: Baseline and Contract Review

### Key work

- Confirm the reviewed public concepts:
  - `RoomGeometryInput`
  - `RoomLightingInput`
  - `PointLightDefaultsInput`
  - `LightingPipelineInput`
  - `LightingFrameInput`
  - `PointLightInput`
  - `NormalizedPointLight`
- Confirm room/image dimensions and cell size are established together.
- Confirm room-space pixels remain separate from viewport/display scaling.
- Confirm PixiJS 8 is the eventual package target.
- Keep current changes available for review before further extraction.

### Stop gate A — contract approval

Pause for manual review of names, ownership, defaults, units, optionality, and
the lifecycle API before moving implementation into new modules.

## Phase 1: Extract Pure Lighting Logic

### Key work

- Move input normalization into pure modules.
- Extract color parsing and normalization.
- Extract sway evaluation.
- Extract swell and flame flicker evaluation.
- Extract light and blocker uniform packing.
- Make all animation functions accept explicit time and phase values.
- Remove hidden reads from DOM controls and `performance.now()` in pure logic.

### Automated validation

- Use Vitest as the pure-core test runner with a repository-local `npm test` command.
- Typecheck the lighting project.
- Typecheck the pure lighting modules separately from the current browser-harness script.
- Add unit tests for valid, partial, malformed, and over-capacity inputs.
- Verify the same input and timestamp produce the same evaluated result.
- Verify per-light radius overrides fall back to room radius when omitted.

### Manual validation

- Static light remains static.
- Sway amount, speed, direction, and phase behave correctly.
- Both flicker styles behave distinctly and consistently.
- Per-light overrides take precedence over defaults.
- Omitted per-light values use point-light or room-light defaults as documented.
- Harness controls can edit the selected light live without changing other lights.
- With no light selected, controls change only the next-light template.
- Blocker clicks snap to the containing room cell, and blocker cell coordinates
  represent the top-left occupied cell.
- Blocker overlays and GPU blocker centers derive from the same room-cell bounds.

### Stop gate B — behavior approval

Pause and compare the pure-module behavior against the current harness before
moving shaders and GPU resources.

## Phase 2: Establish the PixiJS 8 Package Foundation

### Key work

- Create the package source and build structure.
- Use ESM output and emit declaration files.
- Declare PixiJS as a peer dependency.
- Define the host-owned renderer boundary.
- Define room texture ownership and room replacement behavior.
- Define `resize()`, `dispose()`, and pre-initialization behavior.
- Keep the package free of DOM and harness-global dependencies.

### Automated validation

- Build the package.
- Verify declaration output.
- Verify the public export list.
- Confirm no HTML or harness files are required by the package build.

### Stop gate C — package boundary approval

Pause and review the package entry point, PixiJS version policy, resource
ownership, and lifecycle contract.

## Phase 3: Extract the Rendering Pipeline

### Key work

- Move shader source out of the HTML harness.
- Move render-texture allocation into the component.
- Move occlusion, occlusion softening, light accumulation, and composition passes.
- Add explicit room geometry setup using width, height, and cell size.
- Add renderer texture-limit and quality/resolution safeguards.
- Implement host-supplied `renderFrame(timeSeconds)`.
- Ensure viewport resizing does not alter room-space lighting coordinates.

### Manual visual validation

Compare extracted output with the current harness for:

- Static point lights.
- Omni and cone lights.
- Inner and outer gradient colors.
- Ambient contribution.
- Blockers with rectangular footprints and square or rounded corners.
- Blocker elevation and strength.
- Blocker footprints receive their own light while casting shadows only onto
  room pixels behind them relative to the light.
- Shadow softening.
- Sway and both flicker styles.
- Multiple lights and blocker limits.
- Different room aspect ratios.
- Viewport resizing and presentation scaling.

### Stop gate D — visual parity approval

Pause after visual comparison. Do not continue until major coordinate, color,
shadow, and animation differences are understood and accepted.

## Phase 4: Convert the HTML into a Consumer Harness

### Key work

- Keep image loading and UI controls in the harness.
- Convert UI values into the public lighting payload.
- Display package outputs and debug stages.
- Remove lighting math, shader definitions, render-target allocation, and pass
  execution from the HTML.
- Keep the generated browser artifact synchronized through the build process.

### Manual validation

- Load a room image.
- Place and clear lights.
- Place and clear blockers.
- Adjust room lighting and point-light defaults.
- Adjust per-light direction, cone, motion, and flicker settings.
- Inspect light-map and occlusion previews.
- Replace the room image.
- Resize the browser window.

### Stop gate E — harness approval

Pause and confirm the harness is now an adapter and visual test tool rather
than a second implementation of the pipeline.

## Phase 5: Add the Programmatic Consumer

### Key work

- Create a minimal consumer with no DOM controls.
- Supply room texture, `RoomGeometryInput`, frame data, and time in code.
- Display or inspect the composed output.
- Verify room replacement and resource reallocation.
- Verify repeated resize behavior.
- Verify two component instances do not share mutable state.
- Verify disposal releases owned resources and is safe to call repeatedly.

### Stop gate F — reusability approval

Pause when the programmatic consumer demonstrates that the component no longer
depends on the original harness.

## Phase 6: Package Validation and Delivery

### Key work

- Build ESM JavaScript and declaration files.
- Run `npm pack --dry-run`.
- Install the packed artifact into the programmatic consumer.
- Confirm PixiJS is supplied by the consumer and is not duplicated.
- Confirm package contents exclude the HTML harness and local tooling.
- Document supported PixiJS versions and browser/runtime assumptions.

### Validation

- Clean package build from a fresh install.
- Packed artifact imports successfully.
- Public types resolve in a consuming TypeScript project.
- Programmatic consumer runs without DOM controls or CDN scripts.

## Phase 7: WebPortal Integration Handover

### Key work

- Produce the WebPortal-specific handover document.
- Document PixiJS 8 compatibility and package installation.
- Identify the construction point inside the WebPortal renderer.
- Document renderer injection and asynchronous Pixi initialization.
- Map WebPortal room bounds to `RoomGeometryInput`.
- Define the source of cell size, point lights, blockers, and room lighting.
- Explain the selected dedicated-albedo or composed-surface strategy.
- Explain active/staging room surfaces and transition behavior.
- Show `submitFrame`, `renderFrame(timeSeconds)`, `resize`, and `dispose` wiring.
- Document texture ownership, GPU limits, quality settings, and failure paths.
- Include a minimal code example and integration checklist.

### Stop gate G — handover approval

Pause for review of the handover document before any WebPortal integration work
begins.

## Final Completion Checklist

- Public contracts are explicit, typed, commented, and approved.
- Pure lighting behavior is deterministic and unit-testable.
- The component owns its state and GPU resources per instance.
- The component has no DOM or harness-global dependencies.
- The package targets PixiJS 8 and exposes ESM plus declarations.
- The HTML harness consumes the package boundary.
- A programmatic consumer works without the HTML harness.
- Room geometry and viewport presentation remain separate.
- Resize, room replacement, and disposal are explicit and tested.
- Manual visual parity checks are complete.
- The packed npm artifact is consumable.
- The WebPortal handover document is complete and reviewed.
