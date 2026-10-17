# Particle Component Prototype Plan

Status: first end-to-end prototype implemented with room, point-emitter, mixed-leaf, and persistent debris effects; later phases remain planned.

## Prototype Progress (October 2026)

The first package and integrated harness are in `TopDownParticleComponent/`.
They demonstrate three independent room effect slots with Rain, Snowfall,
Hail, Ashfall, Cinderfall, Drifting Motes, Organic Motes, and four leaf-fall
recipes (oak, maple, oval, and a mix using all three silhouettes), plus
campfire, torch, and candle styles authored with the same stream schema, smoke, embers, a movable
sample light, and one cell occluder. Both particle layers use the real lighting
package in the harness. The package builds as a standalone ESM npm package,
and a programmatic consumer, focused tests, and a browser render check pass.

Producer settings contain separate room, flame, smoke, and accent emitters.
Flame, smoke, and accent lists each support one to ten independent emitters.
Accents include water spatter, electrical sparks, pipe steam, impact dust,
leaking drips, insect orbit, magic aura, and toxic cloud. Event styles can use
zero-rate surge-only streams, so particles stay quiet between seeded bursts.
A pipe-steam emitter has a tunable outlet direction and push speed; insect
particles follow circular paths around their source.
A seeded, emitter-local
surge schedule adds a configured burst count after randomized intervals.
The first persistent-effect example is a wall debris pile. Each manual hammer
strike launches a small count of fragments; a timed follow-up creates stationary
fragments where the flight ends. The settled pieces use ordinary long-lived
particles and are cleared on room replacement, so the prototype does not need
collision handling or a sprite conversion path.
The runtime also has a common `sendStimulus()` entry point. Its burst stimulus
drives surge-only streams, and its timed wind stimulus temporarily drifts
wind-responsive streams. The harness exercises both paths with hammer hits and
smoke gusts; effect-specific response details remain in style recipes.
Pollen/spore variants share the Organic Motes recipe; dust/magic variants share
the Drifting Motes recipe. Their distinct seed-like and glint sprites provide
the visual variation without turning color presets into separate styles.
Producer tuning exposes emission rate in particles per second, particle size in
room pixels, and lifetime/color-transition times in seconds. The harness groups
controls into Room, Flame, Smoke, Accents, and Lighting & Data tabs. Each effect exposes
two colors; styles with temporal color change also expose timing. The Room tab
adds emission rate, size, lifetime, lighting, and per-effect wind controls.
Technical stream recipes remain in game-owned style libraries. The harness
exports and imports producer settings version 11 and migrates earlier versions.
A producer does not need to edit blend modes, stream rates, or texture IDs.

The room is seen from directly overhead. Screen X/Y is the floor plane; height
above the floor is a separate elevation axis toward the viewer. Rain descends
in elevation at scattered floor positions and creates a timed floor ripple.
Fire smoke and embers rise in
elevation and drift only slightly in X/Y. An object's cell footprint hides
particles below its top elevation, regardless of screen Y. Earlier starter
values that treated screen Y as vertical motion were corrected.

The harness supports the representative three-room-effect/ten-object-emitter
workload, but a local frame rate is not a target-device performance signoff.
The lighting-only baseline, target-device measurements, room-area fog/haze,
sprite-mask exceptions, and final contract-overlap review remain future work.
Prototype textures are generated visual examples and need game-size preparation
before performance signoff.

## Goal

Build a reusable PixiJS 8 particle package and an integrated visual harness that
proves particles can render both before and after the existing lighting
pipeline. Keep the particle runtime independent of the lighting runtime while
using the real lighting package in the harness.

Use a separate top-level `TopDownParticleComponent/` workspace. Keep the
existing `TopDown/` workspace focused on lighting.

Package the runtime separately from lighting, provisionally as
`@jojo-d-little/storyboard-particles`. The game engine may install both
packages and own their render order. The particle package must not depend on
the lighting package; the integrated particle harness consumes both. Version
and release the two packages independently.

The package owns the effect schema, simulation, and rendering. The game owns
its authored effect definitions and particle art assets. The harness imports
and exports those definitions so tuning an effect does not require publishing
a new particle package version.

The first implementation should be a plausible shipping architecture, not a
throwaway CPU rendering prototype. Start with PixiJS `ParticleContainer` for
GPU drawing and JavaScript for emitter scheduling and particle motion. Measure
the combined game-like workload before considering custom GPU simulation.

## Expected Workload

- One to three simultaneous room effects: rain, snow, drifting dust, smoke,
  haze, or fog.
- One to ten simultaneous object effects: fire, smoke, sparks, or magic
  particles attached to objects.
- The deciding performance variables are **live particle count, screen area
  covered by transparent particles, texture changes, and total frame time**;
  emitter count alone is insufficient.
- Fog and haze support both covering and patchy looks through a room-area
  effect. Their broad visual field need not be made of individual sprites;
  optional drifting wisps can add local detail.

## Existing Boundaries to Preserve

- Lighting source: [`TopDown/packages/lighting/src/`](../TopDown/packages/lighting/src/).
- Lighting harness: [`TopDown/TopDownLightingTestHarness.html`](../TopDown/TopDownLightingTestHarness.html).
- Lighting integration contract: [`TopDown/plan/WebPortalLightingIntegrationHandover.md`](../TopDown/plan/WebPortalLightingIntegrationHandover.md).
- The engine owns the Pixi renderer, clock, room surface, asset loading, and
  final presentation. The particle package owns its emitter state, live
  particles, Pixi particle containers, and cleanup of resources it creates.
- Room-space pixels remain independent of viewport and camera scaling.
- Room X/Y is the floor plane. Elevation above the floor is a separate axis;
  neither positive nor negative screen Y represents falling or rising.
- The current game displays one room at a time with a fixed view. Room effects
  are placed and simulated in room-space pixels; the prototype needs no camera
  input or camera-following emitter mode.
- On a room transition, discard that room's living particles and runtime
  emitter state. The game retains authored effect definitions and recreates
  emitters when the room is entered again; offscreen rooms do not keep
  simulating particles in the initial MVP.
- Particle assets supplied by the host are borrowed unless ownership is
  explicitly agreed in the particle contract.
- Neither runtime package imports the other. The host orchestrates both.

## Rendering Order

```text
Host draws the unlit room
  + particle package draws its pre-light layer into the same room surface
  -> lighting package renders that surface
  -> host displays the lighting package's composed output
  + particle package draws its post-light layer
  -> viewport presentation
```

One particle update feeds both layers. An effect preset may have streams in
both: for example, lit fire smoke before lighting and bright embers after it.
The layers must never cause the same particle to advance twice in one frame.

Point lights and particle emitters are separate game concepts. A fire may have
both, but particle effect definitions contain no point-light settings and the
particle package makes no lighting requests. The host configures each
independently. Particles drawn after lighting do not illuminate the room by
themselves. The particle package should expose no dependency on
`TopDownLightingPipeline`.

## Visual Occlusion Direction

Use simple room-cell occluders as the default for object effects. The host can
derive them from the same game objects that supply lighting blockers, while
the particle package keeps its own contract. Visual occlusion does not imply
particle collision or shadow casting. The initial MVP excludes particle
collisions and physical responses; the host may trigger authored impact bursts
at known locations. Room-wide ambient effects may ignore occluders.

Prototype the cell approximation with smoke and sparks emerging from behind a
fixed object. Watch for abrupt clipping at cell edges, especially with large
soft smoke. If a particular object's visible art makes the approximation
unacceptable, allow an optional sprite/alpha-based mask or scene-ordering
exception for that object. Keep exact mask mechanics out of the baseline API
until the prototype shows a need; [PixiJS documents](https://pixijs.com/8.x/guides/concepts/performance-tips)
sprite masks as more costly than simple rectangular masks.

## Provisional Particle Contract

Define these concepts in the particle package before implementation; settle
exact names and fields in Phase 1:

- **Room geometry:** `widthPx`, `heightPx`, and `cellSizePx`, using the same
  meaning and units as the lighting contract. Particle types remain separate.
- **Effect/preset definition:** texture or atlas region, emission rate or
  one-shot count, lifetime, initial position and velocity ranges, motion,
  size/color/opacity over life, blend mode, and render layer. A named effect
  such as `fire` is data assembled from one or more independently tunable
  streams, not a hard-coded rendering mode.
- **Area effect definition:** room-space center/coverage, density, soft edge,
  patchiness/noise scale, drift, color, and render layer. A shader-driven area
  overlay can render broad fog or haze without maintaining many particle
  records. It belongs to the same package but has a distinct rendering path
  from emitted particles.
- **Persistent emitter:** stable ID, preset, room-space position, active state,
  and optional per-emitter overrides. Updating an emitter does not restart it.
  Different fires can use different sizes, colors, rates, lifetimes, and motion
  while sharing the same runtime implementation.
- **Burst event:** a one-time command with its own ID or sequence semantics so
  repeated frame submissions cannot replay the burst.
- **Host clock:** one explicit `update(timeSeconds)` per frame; document clock
  reset, pause, and large time-jump behavior. Use seeded randomness in the
  harness for repeatable tuning.
- **Render boundary:** expose pre-light and post-light Pixi containers, or an
  equivalent explicit draw interface, for host-controlled composition.
- **Lifecycle:** room setup/replacement, particle budget, `clear`, and
  idempotent `dispose`. Room replacement clears living particles and emitters;
  define behavior before setup and after disposal.

### Producer color contract decision

Every producer-facing particle effect that permits color tuning, including
room effects and the independent flame and smoke emitters, should accept two
optional color overrides: `colors.primary` and `colors.secondary`. Each named
style supplies defaults for both. The producer UI may label the slots to match
the style (for example Core/Edge, Hot/Cooling, or Drop/Impact), but the saved
instance data keeps the same two field names. Colors use six-digit `#RRGGBB`
values. Wherever producer color tuning is offered, show both pickers and
require the style recipe to define a meaningful use for both colors.

The technical style recipe owns how those colors map to its particle streams,
textures, and life stages. The two colors may describe a spatial gradient, a
change over time, or separate parts of an effect; no one interpretation is
imposed by the producer contract. The producer does not edit raw stream
`startColor` and `endColor` fields. Those existing fields interpolate one
particle's tint over its lifetime; they do not by themselves create a spatial
core-to-edge gradient. A style that needs both colors visible at once can use
two particle layers or an appropriate texture/shader.

Styles that change color over a particle's lifetime may additionally expose
`colorTransitionSeconds`, with a style-supplied default. The recipe chooses
which stream or visual element follows this timing. Room presets use these
initial mappings:

| Room style | Primary color | Secondary color |
| --- | --- | --- |
| Rain | Drop | Ripple/fade |
| Snowfall | Flake | Soft fade |
| Hail | Hailstone | Impact |
| Ashfall | Dense ash | Faded ash |
| Cinderfall | Hot core | Cooling fragment |
| Drifting Motes (dust or magic colors) | Visible mote | Fading mote |
| Organic Motes (pollen or spore colors) | Organic grain | Faded grain |

When upgrading saved producer scenes, retain an existing single flame or
smoke color as `colors.primary` and fill `colors.secondary` from that style's
default. Existing rain scenes receive both style defaults. Make the same
two-color rule available to future object and room particle styles.

The package should not model Pixi `Sprite` objects as gameplay entities or hold
references to engine objects. The host supplies their current room-space
positions. Match lighting's conventions where meanings truly overlap; do not
copy `LightingFrameInput` merely for visual similarity.

Keep authored effect definitions serializable and versionable so a tuned effect
can be saved and loaded by the game. Texture references in those definitions
resolve to host-owned assets. The first prototype need not support arbitrary
user code inside a preset.

## Prototype Harness

Create `TopDownParticleComponent/TopDownParticleTestHarness.html` as a consumer
of the built particle package and the real built lighting package. Retain the
lighting-only harness as a separate lighting regression tool.

Keep lighting controls deliberately small:

- One sample room, with optional image loading if useful for visual tuning.
- Ambient brightness control.
- One movable point light with an on/off switch; fixed defaults for its other
  properties.
- No blocker editor, cone controls, or shadow tuning in this harness.
- One fixed cell-sized foreground object for validating particle occlusion,
  with an on/off control; no general occluder editor.

Particle controls should support placing/selecting emitters and area effects,
choosing presets, tuning fog density and patchiness, switching a stream between
pre-light and post-light, firing a burst, pausing and stepping time, clearing
effects, and replaying a seeded scenario. Provide views
of the unlit room surface and final composition, plus live particle count and
frame-time measurements. Keep all effect logic in the package, not the HTML.
The harness should let a designer tune a preset's stream properties and an
individual emitter's overrides separately, then export/import the authored
configuration without copying values by hand.

## Implementation Phases and Evidence

### Phase 0 — Baseline and representative scene

- Record the lighting-only frame time at a fixed room size and viewport size.
- Define one representative combined scene: three room effects and ten object
  effects, with documented emission rates and live particle counts.
- Choose target devices and frame-rate budget before declaring performance
  success. The initial target is 60 FPS in a desktop browser with lighting and
  particles running together. Record the specific desktop hardware and browser
  used; select a representative lower-end desktop before final performance
  signoff. Mobile browsers are outside the initial performance target.
- Confirm the PixiJS version and first particle textures or atlas.
- Start visual prototyping with the transparent examples in
  `TopDownParticleComponent/assets/prototype/`; prepare game-sized textures or
  an atlas before final performance signoff.

**Exit evidence:** a repeatable scene definition and baseline measurements.

### Phase 1 — Package skeleton and contracts

- Add a package at `TopDownParticleComponent/packages/particles/`, with
  TypeScript source, ESM output, declarations, and PixiJS 8 as a peer
  dependency.
- Define room-space units, emitter IDs, burst semantics, particle streams,
  area effects, serializable definitions, per-instance overrides, resource
  ownership, limits, and lifecycle errors.
- Add pure tests for normalization, seed behavior, lifetime handling, and
  one-time burst handling where they can catch real contract mistakes.

**Exit evidence:** a buildable package with a reviewable public entry point.

### Phase 2 — Small end-to-end slice

- Implement a pooled `ParticleContainer` rendering path with only the dynamic
  properties the chosen effects need.
- Implement one pre-light stream and one post-light stream, driven by the same
  update call and explicit clock.
- Connect both layers to the real lighting package in the new harness.
- Validate room/image pixel alignment across viewport resizing and room
  replacement. Verify pause and replay do not duplicate bursts.
- Validate simple cell-based visual occlusion with a foreground object, without
  adding physical collision behavior.

**Exit evidence:** the same basic effect visibly changes when assigned to the
pre-light or post-light layer, with no duplicated simulation or resource leaks.

### Phase 3 — Representative effects

- Add rain or snow and dust as room effects.
- Add fire smoke and bright sparks or magic sparkles as object effects.
- Demonstrate at least two visibly different fires built from the same effect
  schema by changing authored size, color, emission, and motion values.
- Exercise moving object positions, stopping/restarting an emitter, simultaneous
  effects, and mixed pre/post streams.
- Add a room-area fog/haze treatment with both covering and patchy authored
  variants. Validate its alignment and compositing alongside particle streams.

**Exit evidence:** the representative scene can be authored and tuned through
the particle package and harness without editing implementation code.

### Phase 4 — Performance and consumer validation

- Run lighting-only, particles-only, and combined scenes at identical sizes.
- Record live particles, CPU update time, total frame time, and GPU timing where
  available. Include the cost of translucent overdraw and pre-light room
  capture, not just the particle update loop.
- Test the representative scene on the selected target devices. Tune particle
  budgets, atlas grouping, and effect density before changing renderer design.
- Add a small programmatic consumer and packed-package smoke check, following
  the lighting package workflow.

**Exit evidence:** measurements against the agreed frame budget and an engine-
style consumer that uses only the package entry point.

### Phase 5 — Contract overlap review

- Compare the final particle contracts with the lighting package contracts:
  geometry, clock, renderer host, color input, texture ownership, and disposal.
- Extract a shared interface package only where meanings and versioning needs
  are truly identical. A few duplicate small types may be simpler to maintain.
- Document the host integration order, ownership, coordinate model, limits,
  and room transition behavior for the engine team.

**Exit evidence:** an explicit decision on shared types and a concise engine
integration guide. Package publication remains a separate release decision.

## Initial Technical Decision

PixiJS 8 `ParticleContainer` is the default renderer for the prototype. Pixi
documents it as a GPU drawing path for lightweight particles whose selected
dynamic properties are uploaded each frame; motion remains application code.
It also expects particles within a container to share a texture source. Group
by render layer and compatible texture/blend configuration, then measure the
actual combined workload before considering custom mesh/shader simulation.

References: [PixiJS particle overview](https://pixijs.com/blog/particlecontainer-v8),
[PixiJS ParticleContainer API](https://pixijs.download/release/docs/scene.ParticleContainer.html).

## First Prototype Effect Choice

Rain and fire were selected for the first slice. The fire definition includes
flame, smoke, and ember streams so the harness can exercise both render layers.
