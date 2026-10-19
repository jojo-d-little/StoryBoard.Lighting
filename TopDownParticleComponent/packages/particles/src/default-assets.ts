import { Assets, Rectangle, Texture } from "pixi.js";
import type { TopDownStainTextures } from "./contracts.js";

const imageUrls = {
  smokePuff: new URL("../assets/default-images/smoke-puff.png", import.meta.url).href,
  sparkGlow: new URL("../assets/default-images/spark-glow.png", import.meta.url).href,
  rainRipple: new URL("../assets/default-images/rain-ripple.svg", import.meta.url).href,
  snowflake: new URL("../assets/default-images/snowflake.svg", import.meta.url).href,
  fragment: new URL("../assets/default-images/fragment.svg", import.meta.url).href,
  rubbleChip: new URL("../assets/default-images/rubble-chip.svg", import.meta.url).href,
  softMote: new URL("../assets/default-images/soft-mote.svg", import.meta.url).href,
  driftingMote: new URL("../assets/default-images/drifting-mote.svg", import.meta.url).href,
  organicMote: new URL("../assets/default-images/organic-mote.svg", import.meta.url).href,
  torchFlame: new URL("../assets/default-images/torch-flame.png", import.meta.url).href,
  candleFlame: new URL("../assets/default-images/candle-flame.png", import.meta.url).href,
  flameTip: new URL("../assets/default-images/flame-tip.svg", import.meta.url).href,
  candleSmoke: new URL("../assets/default-images/candle-smoke.svg", import.meta.url).href,
  leafOak: new URL("../assets/default-images/leaf-oak.svg", import.meta.url).href,
  leafMaple: new URL("../assets/default-images/leaf-maple.svg", import.meta.url).href,
  leafOval: new URL("../assets/default-images/leaf-oval.svg", import.meta.url).href,
  fogField: new URL("../assets/default-images/fog-field.svg", import.meta.url).href,
  cloudField: new URL("../assets/default-images/cloud-field.svg", import.meta.url).href,
  stainSplatterBase: new URL("../assets/default-images/stain-splatter-base.svg", import.meta.url).href,
  stainSplatterDetail: new URL("../assets/default-images/stain-splatter-detail.svg", import.meta.url).href,
  stainPatchBase: new URL("../assets/default-images/stain-patch-base.svg", import.meta.url).href,
  stainPatchDetail: new URL("../assets/default-images/stain-patch-detail.svg", import.meta.url).href,
  stainStreakBase: new URL("../assets/default-images/stain-streak-base.svg", import.meta.url).href,
  stainStreakDetail: new URL("../assets/default-images/stain-streak-detail.svg", import.meta.url).href,
  stainSplatterBaseA: new URL("../assets/default-images/stain-splatter-base-variant-a.svg", import.meta.url).href,
  stainSplatterDetailA: new URL("../assets/default-images/stain-splatter-detail-variant-a.svg", import.meta.url).href,
  stainSplatterBaseB: new URL("../assets/default-images/stain-splatter-base-variant-b.svg", import.meta.url).href,
  stainSplatterDetailB: new URL("../assets/default-images/stain-splatter-detail-variant-b.svg", import.meta.url).href,
  stainPatchBaseA: new URL("../assets/default-images/stain-patch-base-variant-a.svg", import.meta.url).href,
  stainPatchDetailA: new URL("../assets/default-images/stain-patch-detail-variant-a.svg", import.meta.url).href,
  stainPatchBaseB: new URL("../assets/default-images/stain-patch-base-variant-b.svg", import.meta.url).href,
  stainPatchDetailB: new URL("../assets/default-images/stain-patch-detail-variant-b.svg", import.meta.url).href,
  stainStreakBaseA: new URL("../assets/default-images/stain-streak-base-variant-a.svg", import.meta.url).href,
  stainStreakDetailA: new URL("../assets/default-images/stain-streak-detail-variant-a.svg", import.meta.url).href,
  stainStreakBaseB: new URL("../assets/default-images/stain-streak-base-variant-b.svg", import.meta.url).href,
  stainStreakDetailB: new URL("../assets/default-images/stain-streak-detail-variant-b.svg", import.meta.url).href,
  stainSprayStreakA: new URL("../assets/default-images/stain-spray-streak-a.svg", import.meta.url).href,
  stainSprayStreakB: new URL("../assets/default-images/stain-spray-streak-b.svg", import.meta.url).href,
  stainSprayStreakC: new URL("../assets/default-images/stain-spray-streak-c.svg", import.meta.url).href
} as const;

async function loadTexture(url: string): Promise<Texture> {
  return Assets.load<Texture>(url);
}

async function loadTextures<const K extends keyof typeof imageUrls>(keys: readonly K[]): Promise<Record<K, Texture>> {
  const entries = await Promise.all(keys.map(async key => [key, await loadTexture(imageUrls[key])] as const));
  return Object.fromEntries(entries) as Record<K, Texture>;
}

export interface DefaultParticleAssetOverrides {
  /** Supplied textures override matching packaged IDs; omitted IDs use the defaults. */
  particles?: Record<string, Texture>;
  fog?: Texture;
  clouds?: Texture;
}

export interface DefaultStainTextureOverrides {
  /** Supplied style sets replace the matching packaged stain defaults. */
  stains?: Partial<TopDownStainTextures>;
}

/** Loaded default art for `TopDownEffects`; matching custom texture IDs override the defaults. */
export interface DefaultParticleAssets {
  particles: Record<string, Texture>;
  fog: Texture;
  clouds: Texture;
}

/** Load the default particle and atmosphere textures shipped with this package. */
export async function loadDefaultParticleAssets(
  overrides: DefaultParticleAssetOverrides = {}
): Promise<DefaultParticleAssets> {
  const loaded = await loadTextures([
    "smokePuff", "sparkGlow", "rainRipple", "snowflake", "fragment", "rubbleChip",
    "softMote", "driftingMote", "organicMote", "torchFlame", "candleFlame",
    "flameTip", "candleSmoke", "leafOak", "leafMaple", "leafOval", "fogField", "cloudField"
  ]);
  const spark = loaded.sparkGlow;
  const rainDrop = new Texture({
    source: spark.source,
    frame: new Rectangle(470, 460, 340, 340)
  });
  const particles: Record<string, Texture> = {
    "smoke-puff": loaded.smokePuff,
    "spark-glow": spark,
    "rain-drop": rainDrop,
    "rain-ripple": loaded.rainRipple,
    snowflake: loaded.snowflake,
    fragment: loaded.fragment,
    "rubble-chip": loaded.rubbleChip,
    "soft-mote": loaded.softMote,
    "drifting-mote": loaded.driftingMote,
    "organic-mote": loaded.organicMote,
    "torch-flame": loaded.torchFlame,
    "candle-flame": loaded.candleFlame,
    "flame-tip": loaded.flameTip,
    "candle-smoke": loaded.candleSmoke,
    "leaf-oak": loaded.leafOak,
    "leaf-maple": loaded.leafMaple,
    "leaf-oval": loaded.leafOval,
    ...(overrides.particles ?? {})
  };
  return {
    particles,
    fog: overrides.fog ?? loaded.fogField,
    clouds: overrides.clouds ?? loaded.cloudField
  };
}

/** Load default surface-mark textures; style-level custom sets replace defaults. */
export async function loadDefaultStainTextures(
  overrides: DefaultStainTextureOverrides = {}
): Promise<TopDownStainTextures> {
  const loaded = await loadTextures([
    "stainSplatterBase", "stainSplatterDetail", "stainPatchBase", "stainPatchDetail",
    "stainStreakBase", "stainStreakDetail", "stainSplatterBaseA", "stainSplatterDetailA",
    "stainSplatterBaseB", "stainSplatterDetailB", "stainPatchBaseA", "stainPatchDetailA",
    "stainPatchBaseB", "stainPatchDetailB", "stainStreakBaseA", "stainStreakDetailA",
    "stainStreakBaseB", "stainStreakDetailB", "stainSprayStreakA", "stainSprayStreakB",
    "stainSprayStreakC"
  ]);
  const defaults: TopDownStainTextures = {
    splatter: {
      base: loaded.stainSplatterBase,
      detail: loaded.stainSplatterDetail,
      variants: [
        { base: loaded.stainSplatterBaseA, detail: loaded.stainSplatterDetailA },
        { base: loaded.stainSplatterBaseB, detail: loaded.stainSplatterDetailB }
      ]
    },
    patch: {
      base: loaded.stainPatchBase,
      detail: loaded.stainPatchDetail,
      variants: [
        { base: loaded.stainPatchBaseA, detail: loaded.stainPatchDetailA },
        { base: loaded.stainPatchBaseB, detail: loaded.stainPatchDetailB }
      ]
    },
    streak: {
      base: loaded.stainStreakBase,
      detail: loaded.stainStreakDetail,
      variants: [
        { base: loaded.stainStreakBaseA, detail: loaded.stainStreakDetailA },
        { base: loaded.stainStreakBaseB, detail: loaded.stainStreakDetailB }
      ]
    },
    "directional-spray": {
      base: loaded.stainSprayStreakA,
      detail: loaded.stainSprayStreakB,
      streakVariants: [loaded.stainSprayStreakA, loaded.stainSprayStreakB, loaded.stainSprayStreakC]
    }
  };
  return { ...defaults, ...overrides.stains };
}
