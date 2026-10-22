# Top-Down Particle Component

This workspace contains the reusable particle package, its integrated
particle-and-lighting test harness, and a programmatic consumer. The existing
lighting package and lighting-only harness remain under `../TopDown/`.

The particle runtime is a standalone npm package named
`@jojo-d-little/storyboard-particles`. The harness consumes that package
and the lighting package together.

The package README includes a [complete host integration example](packages/particles/README.md#integration-contract)
covering recipe registration, room and point effect requests, and pre-light /
post-light rendering order.

Implementation starts with the [particle component prototype plan](../plans/ParticleComponentPrototypePlan.md).

The package ships its [default effect images](packages/particles/assets/default-images/README.md)
and loads them automatically through the `TopDownEffects.create()` factory,
including stain art. Callers can override
selected textures and manage stains through the shared effects controller.

The harness **Catalog alignment** tab loads the current runtime catalog and
authoring tuning-contract fixtures. It lets you inspect and edit raw recipes,
generates only the controls declared for each recipe family, and previews sparse
resolved values through the same catalog adapter used by the package.

Stage 08.5 implementation and validation notes are recorded in the
[particle package boundary documentation](packages/particles/README.md#stage-085-implementation-checkpoint--2026-10-20).

## Run the prototype

Install dependencies in both workspaces (`TopDown` and this directory), then
from this directory run:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/TopDownParticleTestHarness.html`. The dev command
builds both packages before starting Vite. Rebuild the particle package after
changing its TypeScript source; Vite serves the built `dist` output.

The starter scene opens with particle, atmosphere, point-light, and blocker
effects disabled. Use **Room background** to load a local image and choose
contain, cover, or stretch; the image stays local to the current harness
session and is not included in exported producer settings. The test grid can be
toggled independently.

The `Surface stains` tab prototypes stationary translucent marks with splatter,
patch, streak, and directional spray shapes. They remain until removed unless an optional lifetime
and fade are configured; they do not run as moving particle streams.

Useful checks: `npm run typecheck`, `npm test`, `npm run consumer:smoke`,
`npm run consumer:packed-smoke`, and `npm run pack:package`.

Particle package releases use a separate `particles-v<version>` tag. See
[`Scripts/Release.ps1`](Scripts/Release.ps1) for the version, validation, and
tagging workflow.

The harness loads game-owned style recipes from
[`effects/starter-effects.json`](effects/starter-effects.json) and producer
settings from [`effects/starter-scene.json`](effects/starter-scene.json).
It shows the original campfire beside a focused torch and a small candle flame. Controls are grouped in
Room, Flame, Smoke, Accents, Surface Stains, Fog & Clouds, and Lighting & Data tabs. Room effects can be added as independent instances
that can each select Rain, Snowfall, Hail, Ashfall, Cinderfall, Drifting Motes,
Organic Motes, or one of four falling-leaf recipes. Leaves enter from the upwind
room edge and cross the room; other room effects retain their usual room
spawning. Wind also adjusts the hidden mix between airborne leaves and low,
gently drifting skitters. Leaves occasionally flip to show their configured
underside color. Oak, maple, and oval leaf shapes can be selected individually
or mixed together; each effect has independent wind direction and strength. Drifting
Motes has a distinct glint sprite and covers dust and magic-colored motes.
Organic Motes has a seed-like sprite and covers pollen and spores.
Each room instance tunes emission rate in particles per second, render order, size in room pixels,
lifetime and color transition in seconds, two colors, and lighting treatment.
Rain has separate pixel controls for falling drops and landing ripples.
Increasing Rain's wind strength also lengthens the drops along the wind; the
landing ripples remain unchanged.
Flame and Smoke each have an independent list of up to ten emitters. Add and
remove controls support load testing. Their tunables use particles per second,
pixels, and seconds. Smoke also has an inner clear radius and per-emitter wind
direction and strength. Each point emitter can schedule seeded random surges
with a chosen extra particle count and minimum/maximum interval. The Accents tab
adds water spatter, electrical sparks, pipe steam, impact dust, leaking drips,
insect orbit, magic aura, toxic cloud, and a wall debris pile. The debris test
has a manual hammer-strike button: each hit launches fragments, then leaves
stationary pieces where they land until reset or room replacement. Other
accents support continuous rates or seeded bursts, two colors, particle size,
spread, lifetime, and lighting layer. Pipe Steam exposes outlet direction and push speed; Insect Orbit uses a
circular path around its source. Clicking the room places the selected point emitter; Lighting & Data
moves the sample point light.
The Smoke tab and opted-in Accents can send a temporary wind stimulus to the
selected emitter; it moves responsive particles at full strength for the chosen
duration, then eases back to authored motion. The Toxic Cloud and Insect Orbit
accents expose this control; the cloud uses a longer 0.8-second return fade.
debris strike and wind nudges use the shared `sendStimulus()` path.
Stream recipes, textures, and blend modes remain in the style library.
Export/import uses the producer settings. The sample light is configured
independently.

The Fog & Clouds tab prototypes separately identified fog and cloud overlays.
Add layers to check independent opacity, scale, tint, order, and wind; they
render after the light composition and do not cast shadows or alter lighting.
These continuous overlays share the particle npm package but do not use its
particle streams. Atmosphere configuration is saved with the producer scene.

The harness can also add room-effect instances, including multiple instances of
the same recipe. Its live setting transition control eases supported manual
edits from the displayed value; set it to 0 for immediate changes. Color edit
behavior selects birth-snapshot or living-particle retint.

The producer scene format is version 15 with `roomEffects`, `fires`, `smokes`, `accents`, `atmosphere`, and `stains`
arrays. The harness migrates older versions, converting the old rain setting
to the first room slot, copying legacy shared wind settings into each room slot,
and converting old scalar controls to explicit units. Rain stores separate
starting sizes for its drops and splashes. The secondary color comes
from the selected style's default when an older scene has one color. Version 11
adds the wall debris example to imported scenes.

The room is viewed straight down. Rain dots descend along an elevation axis
through the screen toward the floor; smoke and embers rise out of the screen.
Their X/Y motion is only drift across the floor plane. The example stream
definitions store elevation separately from screen Y.
