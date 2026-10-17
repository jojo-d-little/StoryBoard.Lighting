# @jojo-d-little/storyboard-particles

Host-driven effects for PixiJS 8 top-down room scenes. The caller requests
effects such as rain, fog, clouds, and fire by name and supplies their visual
settings. `TopDownEffects` routes each request internally. The host owns the
renderer, textures, clock, room capture, and final presentation.

## Integration contract

The host creates the Pixi renderer and loads textures, then constructs one
`TopDownEffects` controller. The package does not create a renderer, load
assets, own the game loop, or destroy borrowed textures. Add `preLight` to the
unlit room pass and `postLight` after the lighting result.

All positions, sizes, velocities, and room dimensions use pixels in the room
image, before camera scaling. Time inputs use one monotonic game-time clock in
seconds. Call `effects.update(timeSeconds)` once per frame. On a room
transition, set the new geometry and re-submit the authored effects. Call
`dispose()` when the host removes the controller. The host remains responsible
for its renderer and textures.

```ts
const effects = new TopDownEffects({
  textures: { particles: particleTextures, fog: fogTexture, clouds: cloudTexture },
  seed: 7
});
effects.setRoomGeometry({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
const rain = effects.registerRoomEffect(rainRecipe);

// Same request shape for weather particles and texture overlays.
effects.setRoomEffect({
  id: "room-rain", effect: rain, intensity: 0.7,
  sizePx: 6, colors: ["#dceeff", "#91b9dd"],
  wind: { directionDegrees: 25, speedPxPerSecond: 12 }
});
effects.setRoomEffect({
  id: "room-fog", effect: "fog", intensity: 0.2,
  coveragePx: 520, tint: "#b6c8d8",
  wind: { directionDegrees: 25, speedPxPerSecond: 5 }
});
effects.setRoomEffect({
  id: "room-clouds", effect: "cloud", intensity: 0.18,
  coveragePx: 720, tint: "#ffffff"
});

// Every frame: update once, then render these containers in the host passes.
effects.update(gameTimeSeconds);
// host draws effects.preLight into the unlit room surface
// host applies lighting, then draws effects.postLight over the result
```

`intensity` scales a particle recipe's authored emission density or sets an
overlay's opacity. `sizePx` sets particle size; `coveragePx` sets overlay
texture coverage. `colors`, `tint`, and `wind` describe the visible effect in
room-space terms. Rain can also set `rain.dropSizePx` and
`rain.rippleSizePx`. Register recipe definitions once; ordinary callers do not
construct or choose particle and overlay systems.
Fog and cloud textures are optional constructor assets when those effects are
not used; provide both to enable the built-in overlays.

Each cloud layer is a separate room effect with its own ID, coverage, opacity,
and wind speed. Submit multiple cloud requests to create the parallax look; the
controller supports up to three active cloud layers. Fog has one active room
slot. Updating a request with the same ID updates that layer.

```ts
effects.setRoomEffect({
  id: "clouds-far", effect: "cloud", coveragePx: 900,
  intensity: 0.12, wind: { directionDegrees: 0, speedPxPerSecond: 3 }
});
effects.setRoomEffect({
  id: "clouds-near", effect: "cloud", coveragePx: 620,
  intensity: 0.2, wind: { directionDegrees: 0, speedPxPerSecond: 9 }
});
```

The package root exports the caller-facing API and recipe types. Direct access
to `TopDownParticleSystem` and `TopDownAtmosphereSystem` is available from the
explicit `@jojo-d-little/storyboard-particles/advanced` entry point.

The root API includes these contracts:

- **Effect requests:** `RoomEffectInput`, `ParticleStyledEmitterInput`, and
  `TopDownStainInput` describe room, point, and surface effects.
- **Recipe contracts:** `ParticleStyleDefinition`,
  `ParticleRoomStyleDefinition`, and `ParticleEffectDefinition` let the game
  register its named effect recipes.

Style and stream definitions are serializable data; runtime options containing
Pixi textures are host objects and should not be persisted.

`effects.clear()` removes active runtime instances and resets its clock while
keeping registered recipes. Re-submit the room's active effects after clearing.
Use `remove(id)` to remove one point or room effect.

## Advanced particle recipe authoring

The sections below describe stream-level recipe authoring and direct system
access. Most consumers only need `TopDownEffects` and the named recipes supplied
by their game. Import direct particle and atmosphere systems from
`@jojo-d-little/storyboard-particles/advanced` when building engine-level tools.

The room image is a floor seen from directly above. X and Y locate a particle
over that floor; increasing screen Y does not mean falling downward. A stream's
`startElevationCells` and `endElevationCells` describe height above the floor:
rain can descend from a high value to zero, while smoke can rise from zero to a
higher value. Wind controls add independent drift across the floor plane.
Authored size and opacity over life provide the visible depth cue. Cell
occluders use their floor footprint and `elevationCells` to hide particles
below the object's top.
An optional `onDeathStreamId` starts one sibling stream at the ending
particle's X/Y position. The rain preset uses this timed handoff for a floor
ripple; it does not perform physical collision detection.

For producer-facing effects, register a game-owned style recipe with
`registerStyle(styleDefinition)`.
Then call `upsertStyledEmitter({ id, style, xPx, yPx, colors,
emissionRatePerSecond, sizePx, lifetimeSeconds, radiusPx })`. The `style` is a named recipe such as `campfire` or
`torch`. The primary controls adjust the selected recipe while its stream
layout, blend modes, and textures stay hidden from the producer. Optional
`smokeAmount`, `smokeSizeScale`, and `smokeColor` tune smoke.
`streamGroup: "flame"` emits flame and embers; `streamGroup: "smoke"` emits only
smoke. Use separate emitter IDs and positions to place them independently.
Smoke emitters can use `clearRadiusPx` to spawn in a ring around their source,
and `windDirectionDegrees` plus `windStrengthPxPerSecond` to drift smoke over
the floor. The clear radius must not exceed `radiusPx`.
Omitting `streamGroup` emits the full style for existing consumers.
Styled and room emitters accept `colors: string[]`, an ordered palette. Two
colors remain the common case; effects can accept more without changing the
producer interface. Each style's documentation defines the order and meaning.
The first two palette entries retain the usual primary/secondary behavior,
including transitions and flips. A style can bind a stream to a numbered
palette entry for an additional role such as a flame tip. `streamColors` on a
room emitter can provide a different palette for each stream, as with oak,
maple, and oval leaves. `colorTransitionSeconds` remains independent of
particle lifetime. Existing single-color `color` and `smokeColor` inputs remain
supported.

## Stationary surface stains

`TopDownStainSystem` renders static translucent sprite marks for blood,
grime, and similar surface details. Stains are not simulated particles and do
not move after placement. The package includes four named shapes: `splatter`
for droplets, `patch` for an irregular soiled area, `streak` for a dragged mark,
and `directional-spray` for direct paint streaks fanning outward. Spray uses
individual single-streak textures, placing 4–10 independently selected, angled,
and sized marks. Its `amount` control sets streak density. The spray streak
textures are optional for hosts that do not use that style, so existing hosts
can keep their original three texture pairs while upgrading.
The first palette color tints the base marks; the second tints details or some
of the spray streaks. For other styles, `amount` controls the detail layer, while
`opacity` controls the complete mark. `sizePx` is the mark footprint. For
directional spray, it sets typical streak length along the selected direction;
streak thickness is independent of that length. Other styles scale uniformly. For splatter, `directionDegrees` points the
droplets; for streak, it sets the long axis. A directional spray's x/y position
is its source point, and `directionDegrees` points the fan away from that point.
Patch ignores direction.

Each stain also gets a deterministic shape variation derived from its
`id`: patches rotate independently, while directional styles keep their chosen
heading and vary their internal flips, detail scale, and detail placement. The variation stays
the same when settings are tuned or the scene is reloaded with the same IDs;
there is no extra producer control to manage. Hosts can also provide additional
base/detail texture pairs under a style's `variants`; the system selects among
them deterministically from the same stain ID.

Omitting `lifetimeSeconds` keeps a stain until `removeStain` or `clear` is
called. A finite lifetime removes it automatically; `fadeOutSeconds` can fade
the final portion. `onExpire` lets the host remove the matching scene cue when a
timed stain expires. The host supplies its game clock and chooses whether stains
render before or after lighting:

```ts
const stains = new TopDownStainSystem({
  textures: {
    splatter: {
      base: splatterBase, detail: splatterDetail,
      variants: [
        { base: splatterAltBaseA, detail: splatterAltDetailA },
        { base: splatterAltBaseB, detail: splatterAltDetailB }
      ]
    },
    patch: { base: patchBase, detail: patchDetail },
    streak: { base: streakBase, detail: streakDetail },
    "directional-spray": {
      base: sprayStreakA, detail: sprayStreakB,
      streakVariants: [sprayStreakA, sprayStreakB, sprayStreakC]
    }
  }
});
stains.upsertStain({
  id: "pillow-blood", style: "splatter", xPx: 240, yPx: 160,
  sizePx: 115, colors: ["#8b2635", "#d38b72"],
  opacity: 0.65, amount: 0.6, directionDegrees: 25,
  layer: "pre-light"
});
stains.update(gameTimeSeconds);
// Render stains.preLight into the unlit room image, or stains.postLight
// over the lit composition, following the layer on each mark.
```

For example, a mixed-leaf emitter can give each shape its own upper-surface and
underside colors:

```ts
streamColors: {
  oak: ["#9a4b24", "#d19a56"],
  maple: ["#b93225", "#ef9b48"],
  oval: ["#75803a", "#c3ad54"]
}
```

The campfire, torch, and candle flame palettes use `[body/core, edge, tip]`.
The third color affects a separate, small tip stream, so omitting it preserves
the recipe's warm default. The first two entries keep their existing color
transition behavior.
`flameLayer`, `smokeLayer`, and `embersLayer` route new particles before or
after lighting for that emitter. `sizePx` controls particle width in room
pixels, `emissionRatePerSecond` controls particles emitted per second,
`lifetimeSeconds` controls their lifetime, and `radiusPx` sets floor-plane
spread. Styles can limit that control to selected streams with
`lifetimeStreamIds`; wall debris uses it for flying chips while settled rubble
keeps its long authored lifetime. Legacy scale controls remain available. A `surge` adds an exact
`burstCount` at seeded random intervals between `intervalMinSeconds` and
`intervalMaxSeconds`. The raw
`registerEffect` and `upsertEmitter` methods remain available to engine code.
Styled emitters can also add a directional planar push with `directionDegrees`
and `directionStrengthPxPerSecond` (0° is right, 90° is down-screen). A point
stream can author `orbitAngularSpeedRadiansPerSecond` to keep spawned particles
circling their emitter; the style recipe owns that motion choice.

Zero-rate streams marked `surgeOnly: true` have no continuous emission. They
can be emitted by configured random surges or by a `burst` stimulus. This
supports sparse accents such as water spatter, electrical sparks, and impact
dust without a hidden baseline rate.

Room effects use `registerRoomStyle(roomStyleDefinition)` and
`upsertRoomEmitter({ id, style, emissionRatePerSecond, sizePx,
lifetimeSeconds, streamSizesPx, colors, streamColors, colorTransitionSeconds, layer, windXPxPerSecond,
windYPxPerSecond })`. A
stream with `spawn.kind: "room"` samples the current room geometry. The style
marks which streams respond to wind, which have a temporal color change, and
which stretch along the wind direction; impact streams can retain their own lighting pass. Wind offsets are supplied
per emitter, so room effects can drift in different directions and at different
speeds. One to three independent room emitters can run together without special
renderer code. Styles can also mark `edgeFlowStreamIds`: those streams spawn
just outside the upwind room edge and use their travel time to pass beyond the
downwind edge. They emit only while wind is configured; other room streams keep
their authored spawn and lifetime behavior. `windMotionMix` can keep the
airborne versus near-floor motion split inside the style recipe, with wind
strength adjusting the share and skitter behavior. `streamSizesPx` optionally sets starting widths in pixels by
stream ID, overriding the shared `sizePx` value only for those streams. This
supports effects such as smaller falling rain drops and larger landing ripples.
`lifetimeSeconds` is the actual lifetime of ordinary room-spawned particles.
Edge-flow streams derive their lifetime from travel time across the room.
Point-spawned impact streams keep their authored lifetimes. For falling styles, it is also the
exact duration of the fall animation and determines when landing effects trigger.
Wind stretch is opt-in per style stream, capped at 6×, and leaves unmarked
streams such as rain splashes unchanged.

Register serializable effects, create persistent emitters, then call
`update(timeSeconds)` once per game frame. Render `preLight` into the unlit room
surface before lighting. Display the lighting result and draw `postLight` over
it. Point lights are configured independently through the lighting package.

```ts
const particles = new TopDownParticleSystem({ textures, seed: 7 });
particles.setRoomGeometry({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
particles.registerStyle(torchDefinition);
particles.upsertStyledEmitter({
  id: "torch-flame", style: "torch", streamGroup: "flame",
  xPx: 320, yPx: 220, flameLayer: "post-light",
  colors: ["#ff9d34", "#d94c1c", "#69baff"],
  emissionRatePerSecond: 25, sizePx: 10,
  lifetimeSeconds: 1.2, colorTransitionSeconds: 0.6,
  surge: { burstCount: 8, intervalMinSeconds: 2, intervalMaxSeconds: 5, seed: 41 }
});
particles.upsertStyledEmitter({
  id: "torch-smoke", style: "torch", streamGroup: "smoke",
  xPx: 330, yPx: 220, emissionRatePerSecond: 3, sizePx: 12,
  lifetimeSeconds: 2.4, smokeLayer: "pre-light"
});
particles.registerRoomStyle(snowfallDefinition);
particles.upsertRoomEmitter({
  id: "room-snow", style: "snowfall", emissionRatePerSecond: 45,
  sizePx: 8, lifetimeSeconds: 2.5,
  colors: ["#ffffff", "#dceaff"],
  windXPxPerSecond: 8
});

// Every frame: advance once, then place the two layers in the host's passes.
particles.update(gameTimeSeconds);
// host draws particles.preLight into the unlit room surface
// host applies lighting to that surface
// host draws particles.postLight over the lighting result
```

## Room fog and visible cloud overlays

`TopDownAtmosphereSystem` is available from the advanced entry point for
continuous room overlays that do not fit particle streams. The host supplies two borrowed,
seamless Pixi textures, chooses where `atmosphere.layer` appears in its final
composition, and advances it with the same game-time clock. The component does
not read or modify lights. Fog is one texture field; visible clouds can use up
to three independently sized, tinted, transparent, wind-driven layers.

```ts
const atmosphere = new TopDownAtmosphereSystem({ fogTexture, cloudTexture });
atmosphere.setRoomGeometry({ widthPx: 640, heightPx: 400 });
atmosphere.setFog({ enabled: true, opacity: 0.18, scalePx: 520 });
atmosphere.setCloudLayer(0, {
  enabled: true, opacity: 0.22, scalePx: 650,
  windDirectionDegrees: 35, windSpeedPxPerSecond: 8
});
atmosphere.update(gameTimeSeconds);
// host draws atmosphere.layer at the chosen point in final composition
```

Atmosphere inputs are room pixels, seconds, degrees, and opacity from 0 to 1.
Fog opacity 1 uses the texture at its authored strength; the texture's soft
transparent edges remain, while overlapping dense areas approach full cover.
Call `resetClock()` before restarting a room's time from an earlier value.
`dispose()` releases the package-owned display containers, while textures stay
owned by the host.

The first `update()` sets the clock origin. Repeating the same timestamp pauses
the simulation. Time moving backward throws; use `clear()` before restarting a
clock. A long frame advances at most 0.25 seconds to avoid a large catch-up
burst. Emitter IDs preserve emission timing when their positions or overrides
are updated. Burst IDs are one-time within the current room and reset on
`clear()`.

`setRoomGeometry()` clears living particles and emitters for a room transition.
The host retains the authored definitions and borrowed textures. `clear()`
resets the room runtime while retaining registered effects. `dispose()`
releases package-owned containers without destroying host textures.

`emitBurst()` accepts optional per-stream overrides, including overrides for a
stream's timed follow-up. A short-lived moving fragment can therefore spawn a
stationary, long-lived fragment when its flight ends. These remain ordinary
budgeted particles; no sprite swap or collision simulation is required. Room
replacement clears the settled particles along with the rest of the room state.

For event-driven effects, keep an emitter registered and deliver stimuli to its
ID with `sendStimulus()`. A `burst` stimulus emits the effect's `surgeOnly`
streams using the emitter's authored overrides; an optional direction and speed
steer the burst. A `wind` stimulus temporarily drifts existing and newly
spawned particles from streams listed in the style's `windStreamIds`, then
holds at full strength for `durationSeconds` and eases back to authored motion
over a smooth fade. Styles can set `windNudgeFadeOutSeconds` for that return;
the default is 0.35 seconds. Stimulus IDs are deduplicated for the room and
reset on `clear()`.

```ts
particles.sendStimulus({
  id: "wall-hit-83", emitterId: "wall-debris-binding",
  kind: "burst", count: 3, directionDegrees: 45, speedPxPerSecond: 65
});
particles.sendStimulus({
  id: "smoke-gust-12", emitterId: "chimney-smoke",
  kind: "wind", directionDegrees: 20,
  speedPxPerSecond: 35, durationSeconds: 0.8
});
```

The first implementation supports particle streams, fixed-step updates,
seeded variation, one-time bursts, cell-based visual occlusion, and a global
live-particle budget. It does not simulate particle collisions.
