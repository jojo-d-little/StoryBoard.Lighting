import { Texture } from "pixi.js";
import { TopDownEffects, TopDownStainSystem } from "../packages/particles/dist/index.js";

const effects = new TopDownEffects({
  textures: { particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE },
  seed: 7
});
effects.setRoomGeometry({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
const sampleRain = effects.registerRoomEffect({
  id: "sample-rain",
  defaultColors: { primary: "#ffffff", secondary: "#808080" },
  colorBindings: { drops: "transition" },
  temporalColorStreamIds: ["drops"],
  streams: [{
    id: "drops", textureId: "dot", layer: "pre-light", ratePerSecond: 60,
    spawn: { kind: "room" }, lifeMinSeconds: 1, lifeMaxSeconds: 1,
    velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
    velocityYMinPxPerSecond: 20, velocityYMaxPxPerSecond: 20,
    startWidthPx: 3, startHeightPx: 3, startColor: "#ffffff", endColor: "#808080"
  }]
});
effects.setRoomEffect({ id: "rain", effect: sampleRain, intensity: 1, colors: ["#f0f0ff", "#8899ff"] });
effects.setRoomEffect({ id: "fog", effect: "fog", intensity: 0.2, coveragePx: 420 });
effects.setRoomEffect({ id: "clouds", effect: "cloud", intensity: 0.15, coveragePx: 520 });
effects.update(0);
effects.update(0.1);
if (effects.getStats().liveParticles !== 6 || effects.preLight.children.length !== 1 || effects.postLight.children.length !== 2) {
  throw new Error("Expected room particles and room overlays from the public effects API.");
}
effects.dispose();
const stainPair = { base: Texture.WHITE, detail: Texture.WHITE };
const stains = new TopDownStainSystem({
  textures: { splatter: stainPair, patch: stainPair, streak: stainPair, "directional-spray": stainPair }
});
stains.upsertStain({ id: "surface-mark", style: "patch", xPx: 100, yPx: 100, sizePx: 48 });
stains.update(0);
if (stains.preLight.children.length !== 1 || stains.getStainIds()[0] !== "surface-mark") {
  throw new Error("Expected a persistent stain in the pre-light layer.");
}
stains.removeStain("surface-mark");
stains.dispose();
console.log("Programmatic particle consumer smoke test passed.");
