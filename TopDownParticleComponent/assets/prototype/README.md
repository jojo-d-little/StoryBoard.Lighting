# Prototype Particle Textures

These neutral grayscale textures are initial visual examples for the particle
harness. They have transparent backgrounds and can be tinted by an effect
definition. They are not final game art or optimized atlas entries.

| File | Intended first use |
| --- | --- |
| `smoke-puff.png` | Smoke, steam, or drifting cloud wisps; usually pre-light. |
| `spark-glow.png` | Embers or magic sparkles; usually post-light. |
| `torch-flame.png` | Soft irregular overhead flame footprint used by the torch style. |
| `candle-flame.png` | Compact, tapered overhead candle-flame footprint, kept separate from the torch texture. |
| `flame-tip.svg` | Compact, evenly bright tapered center mark designed to keep a producer tint visible without a white hotspot. |
| `candle-smoke.svg` | Thin, softly curled smoke wisp for the candle's drifting trail style. |
| `rain-ripple.svg` | Small top-down floor splash when a drop reaches the floor. |
| `cloud-field.svg` | Seamless, irregular fractal-noise cloud banks for the visible cloud overlay. |
| `stain-splatter-base.svg`, `stain-splatter-detail.svg` | Soft central stain and fine droplets for a directional spray mark. |
| `stain-patch-base.svg`, `stain-patch-detail.svg` | Irregular translucent body and mottled detail for a soiled area. |
| `stain-streak-base.svg`, `stain-streak-detail.svg` | Elongated smear and fine drag lines; the producer direction sets its axis. |
| `stain-splatter-*-variant-{a,b}.svg` | Two alternate splatter silhouettes and detail patterns for stable per-stain selection. |
| `stain-patch-*-variant-{a,b}.svg` | Two alternate irregular patch shapes and mottled details. |
| `stain-streak-*-variant-{a,b}.svg` | Two alternate dragged-mark silhouettes and broken drag details. |
| `stain-spray-streak-{a,b,c}.svg` | Individual straight paint streaks; the system randomly composes several into each directed spray. |
| `rubble-chip.svg` | Grayscale, faceted fragment for flying wall chips and settled rubble; internal marks retain texture under runtime tinting. |
| `drifting-mote.svg` | Four-point glint with a soft center for dust-like and magic-colored motes. |
| `organic-mote.svg` | Irregular seed-like grain shared by pollen and spores. |
| `leaf-oak.svg`, `leaf-maple.svg`, `leaf-oval.svg` | Three distinct falling leaf silhouettes for oak, maple, oval-leaf, and mixed-leaf room recipes. |

The source PNGs are deliberately large. The implementation should prepare
appropriately sized textures or an atlas before treating performance results
as representative of the final game.

## Generation

Generated with the built-in imagegen tool. Prompt set:

1. Smoke: "Use case: stylized-concept. Asset type: reusable 2D top-down game particle texture for a PixiJS ParticleContainer. Generate ONE isolated soft smoke puff, neutral grayscale white-to-light-gray, centered, roughly circular but organically uneven with wispy edges and internal soft texture. Genuine transparent background and clean alpha falloff all around. No scene, no ground, no cast shadow, no colored lighting, no text, no border, no other particles. Design it so it can be tinted dark, orange, or blue at runtime and scaled down substantially."
2. Spark: "Use case: stylized-concept. Asset type: reusable 2D top-down game particle texture for PixiJS. Generate ONE isolated tiny bright ember/spark particle: a compact neutral-white glowing core with a very soft translucent halo, slight irregularity, roughly circular, centered. Genuine transparent background with smooth alpha falloff. Grayscale/white only so runtime tint can make orange fire embers or blue magical sparkles. No star-shaped icon, no rays extending far away, no scene, no ground, no cast shadow, no text, no border, no other particles. Designed for substantial downscaling." An edit removed stray fragments: "Edit the most recent generated particle texture. Keep the central soft white glowing spark exactly as it is, centered and isolated. Remove the unwanted pale fragments in the upper-right and lower-right corners completely, making those corner pixels fully transparent. Preserve a genuinely transparent background everywhere outside the spark. No other changes."

The overhead rain drop uses a cropped circular region of `spark-glow.png`.
`rain-ripple.svg` is a small hand-authored ring so the timed floor contact reads
clearly from above.

The torch flame was generated with the built-in imagegen tool as a transparent
white-to-gray overhead flame footprint with an irregular radial silhouette.
The candle flame is a distinct compact tapered footprint. Both are prototype
art and should be cropped or atlased at game size before a performance signoff.
