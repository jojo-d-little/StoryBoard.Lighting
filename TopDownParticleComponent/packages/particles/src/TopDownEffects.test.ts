import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { TopDownEffects } from "./TopDownEffects.js";
import type { RegisteredRoomEffectName } from "./TopDownEffects.js";

const geometry = { widthPx: 640, heightPx: 400, cellSizePx: 40 };

function makeEffects(withOverlays = true): TopDownEffects {
  return new TopDownEffects({
    textures: {
      particles: { dot: Texture.WHITE },
      ...(withOverlays ? { fog: Texture.WHITE, clouds: Texture.WHITE } : {})
    },
    seed: 7
  });
}

function registerRain(effects: TopDownEffects): RoomEffectName {
  return effects.registerRoomEffect({
    id: "rain",
    defaultColors: { primary: "#ffffff", secondary: "#808080" },
    colorBindings: { drops: "primary" },
    streams: [{
      id: "drops", textureId: "dot", layer: "pre-light", ratePerSecond: 60,
      spawn: { kind: "room" }, lifeMinSeconds: 1, lifeMaxSeconds: 1,
      velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
      velocityYMinPxPerSecond: 20, velocityYMaxPxPerSecond: 20,
      startWidthPx: 3, startHeightPx: 3, startColor: "#ffffff"
    }]
  });
}

describe("TopDownEffects public facade", () => {
  it("routes a registered room recipe and overlays through one room request API", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      const rain = registerRain(effects);
      effects.setRoomEffect({ id: "rain-instance", effect: rain, intensity: 1 });
      effects.setRoomEffect({ id: "fog-instance", effect: "fog", intensity: 0.2, coveragePx: 420 });
      effects.setRoomEffect({ id: "cloud-instance", effect: "cloud", intensity: 0.1, coveragePx: 620 });
      effects.update(0);
      effects.update(0.1);

      expect(effects.getStats().liveParticles).toBe(6);
      expect(effects.preLight.children).toHaveLength(1);
      expect(effects.postLight.children).toHaveLength(2);
    } finally {
      effects.dispose();
    }
  });

  it("exposes independent fire stream overrides through setPointEffect", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      effects.registerPointStyle({
        id: "api-fire", defaultColor: "#ffffff", defaultSmokeColor: "#888888", baseRadiusPx: 2,
        colorStreamIds: ["flame"], flameStreamIds: ["flame"], emberStreamIds: [], smokeStreamIds: ["smoke"],
        streams: [
          { id: "flame", textureId: "dot", layer: "pre-light", ratePerSecond: 60,
            spawn: { kind: "point", radiusPx: 2 }, lifeMinSeconds: 1, lifeMaxSeconds: 2,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
            velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0,
            startWidthPx: 4, startHeightPx: 4, startColor: "#ffffff" },
          { id: "smoke", textureId: "dot", layer: "pre-light", ratePerSecond: 0,
            spawn: { kind: "point", radiusPx: 2 }, lifeMinSeconds: 1, lifeMaxSeconds: 2,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
            velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0,
            startWidthPx: 4, startHeightPx: 4, startColor: "#888888" }
        ]
      });
      effects.setPointEffect({
        id: "fire", style: "api-fire", streamGroup: "flame", xPx: 100, yPx: 100,
        streamOverrides: {
          flame: { ratePerSecond: 12, lifeMinSeconds: 0.5, lifeMaxSeconds: 0.9,
            startColor: "#ff0000", layer: "post-light" },
          smoke: { ratePerSecond: 500, layer: "post-light" }
        }
      });
      effects.update(0);
      effects.update(0.25);
      expect(effects.getStats().emittedParticles).toBe(3);
    } finally {
      effects.dispose();
    }
  });

  it("allocates three independent cloud slots and frees a slot when a layer is removed", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      for (let index = 0; index < 3; index++) {
        effects.setRoomEffect({ id: `cloud-${index}`, effect: "cloud", intensity: 0.1 + index * 0.1 });
      }
      expect(() => effects.setRoomEffect({ id: "cloud-overflow", effect: "cloud" })).toThrow(/three cloud/);
      effects.remove("cloud-1");
      expect(() => effects.setRoomEffect({ id: "cloud-replacement", effect: "cloud" })).not.toThrow();
    } finally {
      effects.dispose();
    }
  });

  it("rejects unregistered recipe names and overlays without their textures", () => {
    const effects = makeEffects(false);
    try {
      effects.setRoomGeometry(geometry);
      const unknownEffect = { id: "raim" } as unknown as RegisteredRoomEffectName;
      expect(() => effects.setRoomEffect({ id: "typo", effect: unknownEffect })).toThrow(/Unknown room effect recipe/);
      expect(() => effects.setRoomEffect({ id: "fog", effect: "fog" })).toThrow(/require fog and cloud textures/);
    } finally {
      effects.dispose();
    }
  });

  it("clear resets time and runtime effects while keeping registered recipes usable", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      const rain = registerRain(effects);
      effects.setRoomEffect({ id: "rain-instance", effect: rain });
      effects.update(2);
      effects.clear();
      effects.setRoomEffect({ id: "rain-instance", effect: rain });
      expect(() => effects.update(0)).not.toThrow();
    } finally {
      effects.dispose();
    }
  });
});
