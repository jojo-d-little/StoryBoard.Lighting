import { Texture } from "pixi.js";
import { TopDownEffects } from "../packages/particles/dist/index.js";

const stainPair = { base: Texture.WHITE, detail: Texture.WHITE };

const effects = new TopDownEffects({
  textures: {
    particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE,
    stains: { splatter: stainPair, patch: stainPair, streak: stainPair, "directional-spray": stainPair }
  },
  seed: 7
});
effects.setRoomGeometry({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
const sampleRain = effects.registerRoomEffect({
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
effects.upsert({ kind: "room", input: { id: "rain", effect: sampleRain, intensity: 1, colors: ["#f0f0ff", "#8899ff"] } });
effects.upsert({ kind: "room", input: { id: "fog", effect: "fog", intensity: 0.2, coveragePx: 420 } });
effects.upsert({ kind: "room", input: { id: "clouds", effect: "cloud", intensity: 0.15, coveragePx: 520 } });
effects.upsert({ kind: "stain", input: { id: "surface-mark", style: "patch", xPx: 100, yPx: 100, sizePx: 48, layer: "pre-light" } });
effects.update(0);
effects.update(0.1);
if (effects.getStats().liveParticles !== 6 || effects.preLight.children.length !== 2 || effects.postLight.children.length !== 2 ||
    effects.preLight.children[1].children.length !== 2) {
  throw new Error("Expected room particles, overlays, and a stain from the public effects API.");
}
effects.remove("surface-mark");
effects.dispose();
console.log("Programmatic particle consumer smoke test passed.");
