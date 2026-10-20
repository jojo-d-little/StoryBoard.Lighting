# @jojo-d-little/storyboard-particles

Host-driven effects for PixiJS 8 top-down room scenes. The caller requests
effects such as rain, fog, clouds, and fire by name and supplies their visual
settings. `TopDownEffects` routes each request internally. The host owns the
renderer, textures, clock, room capture, and final presentation.

## Integration contract

The host creates the Pixi renderer, then awaits `TopDownEffects.create()` to
load the package's default effect images and construct one controller. The
host can override selected images; it does not need to provide its own art.
The package does not create the renderer or own the game loop. Add `preLight`
to the unlit room pass and `postLight` after the lighting result.

All positions, sizes, velocities, and room dimensions use pixels in the room
image, before camera scaling. Time inputs use one monotonic game-time clock in
seconds. Call `effects.update(timeSeconds)` once per frame. On a room
transition, set the new geometry and re-submit the authored effects. Call
`dispose()` when the host removes the controller. The host remains responsible
for its renderer and any custom textures it supplies.

The following is a complete host-side example. `gameEffects` supplies the
game's rain, fire, and sparks recipes, typed as
`ParticleRoomStyleDefinition` or `ParticleStyleDefinition`. Those recipes use
the packaged default texture IDs. The host owns the application, lighting
pipeline, room capture, and frame loop.

```ts
import * as PIXI from "pixi.js";
import { TopDownLightingPipeline } from "@jojo-d-little/storyboard-lighting";
import { TopDownEffects } from "@jojo-d-little/storyboard-particles";
import { gameEffects } from "./gameEffects.js";

const widthPx = 640;
const heightPx = 400;
const geometry = { widthPx, heightPx, cellSizePx: 40 };

// The host creates Pixi and the lighting pipeline.
const app = new PIXI.Application();
await app.init({ width: widthPx, height: heightPx, background: 0x202a35 });
document.body.appendChild(app.canvas);

const roomSurface = PIXI.RenderTexture.create({ width: widthPx, height: heightPx });
const lighting = new TopDownLightingPipeline({
  renderer: app.renderer,
  maxLights: 1,
  maxBlockers: 1
});
lighting.setRoomTexture({ texture: roomSurface, geometry, ownership: "borrowed" });

// Create the particle controller and register game-authored recipes once.
const effects = await TopDownEffects.create({ seed: 7 });
effects.setRoomGeometry(geometry);
const rain = effects.registerRoomEffect(gameEffects.roomRecipes.rain);
effects.registerPointStyle(gameEffects.pointRecipes.fire);
effects.registerPointStyle(gameEffects.pointRecipes.sparks);

// Request room effects. Each cloud ID controls one independently moving layer.
effects.upsert({ kind: "room", input: {
  id: "rain", effect: rain, intensity: 0.7, sizePx: 5,
  colors: ["#dceeff", "#91b9dd"],
  wind: { directionDegrees: 20, speedPxPerSecond: 12 }
}});
effects.upsert({ kind: "room", input: {
  id: "fog", effect: "fog", intensity: 0.18, coveragePx: 520,
  tint: "#b6c8d8"
}});
effects.upsert({ kind: "room", input: {
  id: "clouds-far", effect: "cloud", intensity: 0.12, coveragePx: 900,
  wind: { directionDegrees: 0, speedPxPerSecond: 3 }
}});
effects.upsert({ kind: "room", input: {
  id: "clouds-near", effect: "cloud", intensity: 0.2, coveragePx: 620,
  wind: { directionDegrees: 0, speedPxPerSecond: 9 }
}});

// Request object-attached effects in room-space pixels.
effects.upsert({ kind: "point", input: {
  id: "hearth-flame", style: "fire", streamGroup: "flame",
  xPx: 320, yPx: 220, emissionRatePerSecond: 28, sizePx: 12,
  flameLayer: "post-light"
}});
effects.upsert({ kind: "point", input: {
  id: "hearth-smoke", style: "fire", streamGroup: "smoke",
  xPx: 326, yPx: 216, emissionRatePerSecond: 5, sizePx: 16,
  smokeLayer: "pre-light"
}});
effects.upsert({ kind: "point", input: {
  id: "torch-sparks", style: "sparks",
  xPx: 480, yPx: 150, emissionRatePerSecond: 3, sizePx: 5,
  layer: "post-light"
}});

// Fine-tune a recipe's streams independently; shared controls remain fallbacks.
effects.upsert({ kind: "point", input: {
  id: "campfire", style: "campfire", streamGroup: "flame",
  xPx: 320, yPx: 220,
  streamOverrides: {
    flame: { ratePerSecond: 24, lifeMinSeconds: 0.7, lifeMaxSeconds: 1.4, sizeScale: 1.1 },
    tip: { ratePerSecond: 8, lifeMinSeconds: 0.25, lifeMaxSeconds: 0.5,
      startColor: "#fff3b0", startAlpha: 1, endAlpha: 0, layer: "post-light" },
    embers: { ratePerSecond: 2, speedScale: 1.3, layer: "pre-light" }
  }
}});
// Smoke remains a separate stream group and cannot be enabled by these overrides.

// Put pre-light effects into the room capture rendered by the lighting system.
const roomContents = new PIXI.Container();
roomContents.addChild(
  new PIXI.Graphics().rect(0, 0, widthPx, heightPx).fill(0x766c5e)
);
roomContents.addChild(effects.preLight);

// Put post-light effects above the lighting system's composed room image.
const display = new PIXI.Container();
const composedRoom = new PIXI.Sprite(lighting.getOutputs().composedTexture);
display.addChild(composedRoom);
display.addChild(effects.postLight);
app.stage.addChild(display);

// Update once per frame, render the unlit room, then apply and display lighting.
let gameTimeSeconds = 0;
app.ticker.add((ticker) => {
  gameTimeSeconds += ticker.deltaMS / 1000;
  effects.update(gameTimeSeconds);

  app.renderer.render({
    container: roomContents,
    target: roomSurface,
    clear: true
  });

  lighting.submitFrame({
    roomLighting: { ambient: 0.25 },
    pointLightDefaults: { radiusPx: 230, intensityScale: 1.15 },
    pointLights: [{ x: 440, y: 220 }],
    blockers: []
  });
  lighting.renderFrame(gameTimeSeconds);
  composedRoom.texture = lighting.getOutputs().composedTexture;
  // Pixi renders app.stage after the ticker callback; postLight is above the room.
});
```

`intensity` scales a particle recipe's authored emission density or sets an
overlay's opacity. `sizePx` sets particle size; `coveragePx` sets overlay
texture coverage. `colors`, `tint`, and `wind` describe the visible effect in
room-space terms. Rain can also set `rain.dropSizePx` and
`rain.rippleSizePx`. Register recipe definitions once; ordinary callers do not
construct or choose particle and overlay systems.
Fog, cloud, and particle images are included in the package and loaded by the
factory. To replace selected art, pass overrides; omitted IDs keep their
packaged defaults:

```ts
const effects = await TopDownEffects.create({
  textures: {
    particles: { "spark-glow": gameSparkTexture },
    clouds: gameCloudTexture
  }
});
```

`TopDownEffects.create()` also loads packaged stain images. Add an optional
`stainTextures` override to replace selected stain styles, or pass complete
`textures.stains` to the synchronous constructor. Stains use the same
`effects.upsert({ kind: "stain", input })`, `remove(id)`, `update(timeSeconds)`,
and lighting-pass containers as particles and overlays. Attached stains have
no package expiry timer; remove the owning effect to clear them.

Each fog or cloud field is a separate room effect with its own ID, order,
coverage, opacity, and wind speed. Any number can coexist. Updating a request
with the same ID updates that field, and removing the ID removes only that
field. Overlay offsets accumulate from frame-to-frame velocity, so changing
wind direction or speed does not reposition a tile.

The package root exports the caller-facing API and recipe types. Direct access
to `TopDownParticleSystem` and `TopDownAtmosphereSystem` is available from the
explicit `@jojo-d-little/storyboard-particles/advanced` entry point.

The root API includes these contracts:

- **Effect requests:** `TopDownEffectInput` discriminates point, room, and
  persistent stain requests for the shared ID lifecycle. The focused
  `RoomEffectInput` and `ParticleStyledEmitterInput` methods remain available.
- **Recipe contracts:** `ParticleStyleDefinition`,
  `ParticleRoomStyleDefinition`, and `ParticleEffectDefinition` let the game
  register its named effect recipes.

Style and stream definitions are serializable data; runtime options containing
Pixi textures are host objects and should not be persisted.

Set optional `removalDurationMs` on a registered recipe to choose how an
instance stops: omitted or `null` stops emission and lets living particles
finish their authored lifetimes, `0` clears its particles immediately, and a
positive value fades its surviving particles over that duration. Re-upserting
the same stable ID as enabled during a fade eases its existing particles back
from their current alpha while emission resumes.

Palette edits default to birth-snapshot behavior: existing particles keep the
colors they were emitted with. Set `colorChangeMode: "retint"` on a point or
particle-room request to update living particles too. Retinting preserves each
particle's current color-over-life progress and affects later particles from
the updated palette.

`effects.clear()` removes active runtime instances and resets its clock while
keeping registered recipes. Re-submit the room's active effects after clearing.
Use `remove(id)` to remove one point, room, overlay, or stain effect.

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

The caller-facing `TopDownEffects` controller routes stains through the same
upsert, remove, frame, and lighting-pass API as other effects. The lower-level
`TopDownStainSystem` (available from the `advanced` entry point) renders static
translucent sprite marks for blood, grime, and similar surface details. Stains are not simulated particles and do
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
`lifetimeControlStreamIds`; wall debris uses it for flying chips while settled rubble
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
speeds. Any number of independently identified room emitters can run together;
their optional numeric `order` is sorted per lighting pass, with stable IDs
breaking ties. Styles can also mark `windEdgeFlowStreamIds`: those streams spawn
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
not read or modify lights. Fog and cloud fields are keyed by caller IDs, with
explicit order and no fixed instance limit.

```ts
const atmosphere = new TopDownAtmosphereSystem({ fogTexture, cloudTexture });
atmosphere.setRoomGeometry({ widthPx: 640, heightPx: 400 });
atmosphere.setField("fog-main", "fog", 10, { enabled: true, opacity: 0.18, scalePx: 520 });
atmosphere.setField("cloud-far", "cloud", 20, {
  enabled: true, opacity: 0.22, scalePx: 650,
  windDirectionDegrees: 35, windSpeedPxPerSecond: 8
});
atmosphere.update(gameTimeSeconds);
// host draws atmosphere.layer at the chosen point in final composition
```

Atmosphere inputs are room pixels, seconds, degrees, and opacity from 0 to 1.
Fog opacity 1 uses the texture at its authored strength; the texture's soft
transparent edges remain, while overlapping dense areas approach full cover.

Point, room, overlay, and stain requests accept an optional numeric `order`
(default `0`). The facade sorts all instances together in each lighting pass
by that value, then by stable instance ID; authored stream `drawOrder` remains
inside its particle instance. This lets a stain, cloud, or particle render
above or below an instance from another effect family.
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
spawned particles from streams listed in the style's `windBlownStreamIds`, then
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

The harness Flame tab includes an **Advanced fire streams** panel generated
from the selected style's flame and ember stream IDs. It shows recipe defaults,
supports independent live tuning and per-stream reset, and stores overrides per
fire and style in scene export/import. Unset fields continue to follow the
simple Fire controls. Explicit per-stream lifetime minimum/maximum replaces the
shared lifetime scale for that stream. The panel also exposes color timing,
opacity scale, and planar velocity offsets. Smoke stays in its separate panel.
Texture, blend mode, draw order, spawn shape, and authored motion ranges require
rebuilding the technical recipe.

`TopDownEffects.getStats()` reports particle counts plus active atmosphere-field
and stain counts. Its `allocationFailures` total combines particle drops at
`maxParticles` with stain requests rejected at `maxStains`, with a per-family
breakdown. These capacity counters reset when `clear()` starts a new room runtime.
