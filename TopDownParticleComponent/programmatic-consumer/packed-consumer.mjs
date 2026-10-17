import { Texture } from "pixi.js";
import { TopDownEffects } from "@jojo-d-little/storyboard-particles";

const effects = new TopDownEffects({
  textures: { particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE },
  seed: 7
});
effects.setRoomGeometry({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
const rain = effects.registerRoomEffect({
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
effects.setRoomEffect({ id: "rain", effect: rain, intensity: 1, colors: ["#f0f0ff", "#8899ff"] });
effects.setRoomEffect({ id: "fog", effect: "fog", intensity: 0.2, coveragePx: 420 });
effects.setRoomEffect({ id: "clouds", effect: "cloud", intensity: 0.15, coveragePx: 520 });
effects.update(0);
effects.update(0.1);
if (effects.getStats().liveParticles !== 6) {
  throw new Error("Expected room particles from the installed package API.");
}
effects.dispose();
console.log("Packed package consumer smoke check passed.");
