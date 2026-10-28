import { Texture } from "pixi.js";
import { TopDownEffects, resolveBurstCount } from "@jojo-d-little/storyboard-particles";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.dirname(fileURLToPath(import.meta.resolve("@jojo-d-little/storyboard-particles")));
if (resolveBurstCount(12, 0.5) !== 6 || resolveBurstCount(12, 2) !== 24 ||
    resolveBurstCount(3, 0.5) !== 2 || resolveBurstCount(1, 0.4) !== 0 ||
    resolveBurstCount(undefined, undefined) !== 1) {
  throw new Error("The packed package did not expose the expected burst quantity resolver.");
}
for (const asset of [
  "candle-flame.png", "candle-smoke.svg", "cloud-field.svg", "drifting-mote.svg", "flame-tip.svg",
  "fog-field.svg", "fragment.svg", "leaf-maple.svg", "leaf-oak.svg", "leaf-oval.svg", "organic-mote.svg",
  "rain-ripple.svg", "rubble-chip.svg", "smoke-puff.png", "snowflake.svg", "soft-mote.svg", "spark-glow.png",
  "stain-patch-base-variant-a.svg", "stain-patch-base-variant-b.svg", "stain-patch-base.svg",
  "stain-patch-detail-variant-a.svg", "stain-patch-detail-variant-b.svg", "stain-patch-detail.svg",
  "stain-splatter-base-variant-a.svg", "stain-splatter-base-variant-b.svg", "stain-splatter-base.svg",
  "stain-splatter-detail-variant-a.svg", "stain-splatter-detail-variant-b.svg", "stain-splatter-detail.svg",
  "stain-spray-streak-a.svg", "stain-spray-streak-b.svg", "stain-spray-streak-c.svg",
  "stain-streak-base-variant-a.svg", "stain-streak-base-variant-b.svg", "stain-streak-base.svg",
  "stain-streak-detail-variant-a.svg", "stain-streak-detail-variant-b.svg", "stain-streak-detail.svg",
  "torch-flame.png"
]) {
  if (!existsSync(path.join(packageRoot, "..", "assets", "default-images", asset))) {
    throw new Error(`Expected packaged default image '${asset}'.`);
  }
}
const stainPair = { base: Texture.WHITE, detail: Texture.WHITE };
const effects = new TopDownEffects({
  textures: { particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE,
    stains: { splatter: stainPair, patch: stainPair, streak: stainPair, "directional-spray": stainPair } },
  seed: 7
});
effects.setRoomGeometry({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
const rain = effects.registerRoomEffect({
  id: "sample-rain",
  defaultColors: { primary: "#ffffff", secondary: "#808080" },
  colorBindings: { drops: "transition" },
  colorTransitionControlStreamIds: ["drops"],
  streams: [{
    id: "drops", textureId: "dot", layer: "pre-light", ratePerSecond: 60,
    spawn: { kind: "room" }, lifeMinSeconds: 1, lifeMaxSeconds: 1,
    velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
    velocityYMinPxPerSecond: 20, velocityYMaxPxPerSecond: 20,
    startWidthPx: 3, startHeightPx: 3, startColor: "#ffffff", endColor: "#808080"
  }]
});
effects.upsert({ kind: "room", input: { id: "rain", effect: rain, intensity: 1, colors: ["#f0f0ff", "#8899ff"] } });
effects.upsert({ kind: "room", input: { id: "fog", effect: "fog", intensity: 0.2, coveragePx: 420 } });
effects.upsert({ kind: "room", input: { id: "clouds", effect: "cloud", intensity: 0.15, coveragePx: 520 } });
effects.upsert({ kind: "stain", input: { id: "mark", style: "patch", xPx: 20, yPx: 30, sizePx: 40 } });
effects.update(0);
effects.update(0.1);
if (effects.getStats().liveParticles !== 6) {
  throw new Error("Expected room particles from the installed package API.");
}
if (!effects.preLight.children.some(child => child.children.length === 2)) {
  throw new Error("Expected a stain from the installed package API.");
}
effects.remove("mark");
effects.dispose();
console.log("Packed package consumer smoke check passed.");
