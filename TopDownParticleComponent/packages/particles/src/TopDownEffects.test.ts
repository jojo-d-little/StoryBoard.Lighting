import { describe, expect, it } from "vitest";
import { ParticleContainer, Texture, TilingSprite } from "pixi.js";
import { TopDownEffects } from "./TopDownEffects.js";
import type { RegisteredRoomEffectName, RoomEffectInput } from "./TopDownEffects.js";
import type { ParticleStyledEmitterInput } from "./contracts.js";

const geometry = { widthPx: 640, heightPx: 400, cellSizePx: 40 };

function upsertRoom(effects: TopDownEffects, input: RoomEffectInput): void {
  effects.upsert({ kind: "room", input });
}

function upsertPoint(effects: TopDownEffects, input: ParticleStyledEmitterInput): void {
  effects.upsert({ kind: "point", input });
}

function makeEffects(withOverlays = true): TopDownEffects {
  return new TopDownEffects({
    textures: {
      particles: { dot: Texture.WHITE },
      ...(withOverlays ? { fog: Texture.WHITE, clouds: Texture.WHITE } : {})
    },
    seed: 7
  });
}

function registerRain(effects: TopDownEffects): RegisteredRoomEffectName {
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
      upsertRoom(effects, { id: "rain-instance", effect: rain, intensity: 1 });
      upsertRoom(effects, { id: "fog-instance", effect: "fog", intensity: 0.2, coveragePx: 420 });
      upsertRoom(effects, { id: "cloud-instance", effect: "cloud", intensity: 0.1, coveragePx: 620 });
      effects.update(0);
      effects.update(0.1);

      expect(effects.getStats().liveParticles).toBe(6);
      expect(effects.preLight.children).toHaveLength(1);
      expect(effects.postLight.children).toHaveLength(2);
    } finally {
      effects.dispose();
    }
  });

  it("reports aggregate family counts and capacity allocation failures", () => {
    const pair = { base: Texture.WHITE, detail: Texture.WHITE };
    const effects = new TopDownEffects({
      textures: {
        particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE,
        stains: { splatter: pair, patch: pair, streak: pair }
      },
      maxParticles: 1,
      maxStains: 1
    });
    try {
      effects.setRoomGeometry(geometry);
      const rain = registerRain(effects);
      upsertRoom(effects, { id: "rain-instance", effect: rain });
      upsertRoom(effects, { id: "fog-instance", effect: "fog" });
      upsertRoom(effects, { id: "cloud-instance", effect: "cloud" });
      effects.upsert({ kind: "stain", input: { id: "stain-one", style: "patch", xPx: 20, yPx: 20, sizePx: 30 } });
      expect(() => effects.upsert({
        kind: "stain", input: { id: "stain-two", style: "patch", xPx: 40, yPx: 20, sizePx: 30 }
      })).toThrow(/capacity/);
      effects.update(0);
      effects.update(0.1);

      expect(effects.getStats()).toMatchObject({
        liveParticles: 1,
        droppedParticles: 5,
        activeEmitters: 1,
        atmosphereFields: 2,
        stains: 1,
        allocationFailures: { particleCapacity: 5, stainCapacity: 1, total: 6 }
      });
      effects.clear();
      expect(effects.getStats()).toMatchObject({
        atmosphereFields: 0,
        stains: 0,
        allocationFailures: { particleCapacity: 0, stainCapacity: 0, total: 0 }
      });
    } finally {
      effects.dispose();
    }
  });

  it("exposes independent fire stream overrides through unified point upsert", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      effects.registerPointStyle({
        id: "api-fire", defaultColor: "#ffffff", defaultSmokeColor: "#888888", baseRadiusPx: 2,
        colorControlStreamIds: ["flame"], flameStreamIds: ["flame"], emberStreamIds: [], smokeStreamIds: ["smoke"],
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
      upsertPoint(effects, {
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

  it("scopes image-slot overrides to the registered recipe", () => {
    const effects = makeEffects();
    const custom = new Texture({ source: Texture.WHITE.source });
    try {
      effects.setRoomGeometry(geometry);
      const recipe = {
        id: "image-style", defaultColor: "#ffffff", defaultSmokeColor: "#888888", baseRadiusPx: 2,
        colorControlStreamIds: [], flameStreamIds: [], smokeStreamIds: [], emberStreamIds: [],
        streams: [{ id: "dots", textureId: "dot", layer: "pre-light" as const, ratePerSecond: 60,
          spawn: { kind: "point" as const, radiusPx: 2 }, lifeMinSeconds: 1, lifeMaxSeconds: 1,
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0,
          startWidthPx: 4, startHeightPx: 4, startColor: "#ffffff" }]
      };
      effects.registerPointStyle(recipe, { dot: custom });
      effects.registerPointStyle({ ...recipe, id: "default-style" });
      upsertPoint(effects, { id: "custom", style: "image-style", xPx: 100, yPx: 100 });
      upsertPoint(effects, { id: "default", style: "default-style", xPx: 120, yPx: 100 });
      effects.update(0);
      effects.update(1 / 60);
      const textures = effects.preLight.children
        .filter((group: any) => group.particleChildren)
        .map((group: any) => group.texture);
      expect(textures).toContain(custom);
      expect(textures).toContain(Texture.WHITE);
      expect(() => effects.registerPointStyle({ ...recipe, id: "invalid" }, { missing: custom })).toThrow(/Unknown image slot/);
    } finally {
      effects.dispose();
    }
  });

  it("supports four clouds, two fogs, and two rain instances through stable IDs", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      const rain = registerRain(effects);
      upsertRoom(effects, { id: "rain-a", effect: rain, intensity: 1 });
      upsertRoom(effects, { id: "rain-b", effect: rain, intensity: 1 });
      for (let index = 0; index < 4; index++) {
        upsertRoom(effects, { id: `cloud-${index}`, effect: "cloud", order: 10 + index, intensity: 0.1 + index * 0.1 });
      }
      for (let index = 0; index < 2; index++) {
        upsertRoom(effects, { id: `fog-${index}`, effect: "fog", order: index, intensity: 0.1 + index * 0.1 });
      }
      const atmosphere = effects.postLight;
      effects.update(0);
      effects.update(0.1);
      expect(effects.getStats().liveParticles).toBe(12);
      expect(atmosphere.children.filter(child => child.children.some(sprite => sprite instanceof TilingSprite))).toHaveLength(6);
      effects.remove("cloud-1");
      expect(atmosphere.children.filter(child => child.children.some(sprite => sprite instanceof TilingSprite))).toHaveLength(5);
      expect(() => upsertRoom(effects, { id: "cloud-replacement", effect: "cloud" })).not.toThrow();
    } finally {
      effects.dispose();
    }
  });

  it("routes persistent stains through the unified upsert, frame, and remove path", () => {
    const pair = { base: Texture.WHITE, detail: Texture.WHITE };
    const effects = new TopDownEffects({
      textures: {
        particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE,
        stains: { splatter: pair, patch: pair, streak: pair, "directional-spray": pair }
      }
    });
    try {
      effects.setRoomGeometry(geometry);
      effects.upsert({ kind: "stain", input: { id: "mark", style: "patch", xPx: 20, yPx: 30, sizePx: 40 } });
      effects.update(0);
      effects.update(30);
      expect(effects.preLight.children).toHaveLength(1);
      expect(effects.preLight.children[0].children).toHaveLength(2);
      effects.remove("mark");
      expect(effects.preLight.children).toHaveLength(0);
    } finally {
      effects.dispose();
    }
  });

  it("sorts particles, atmosphere, and stains together within a lighting pass", () => {
    const pair = { base: Texture.WHITE, detail: Texture.WHITE };
    const effects = new TopDownEffects({
      textures: {
        particles: { dot: Texture.WHITE }, fog: Texture.WHITE, clouds: Texture.WHITE,
        stains: { splatter: pair, patch: pair, streak: pair }
      }
    });
    try {
      effects.setRoomGeometry(geometry);
      effects.registerPointStyle({
        id: "ordered-spark", defaultColor: "#ffffff", defaultSmokeColor: "#ffffff", baseRadiusPx: 2,
        colorControlStreamIds: [], flameStreamIds: [], smokeStreamIds: [], emberStreamIds: [],
        streams: [{ id: "spark", textureId: "dot", layer: "post-light", ratePerSecond: 60,
          spawn: { kind: "point", radiusPx: 0 }, lifeMinSeconds: 1, lifeMaxSeconds: 1,
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0,
          startWidthPx: 4, startHeightPx: 4, startColor: "#ffffff" }]
      });
      upsertPoint(effects, { id: "spark", style: "ordered-spark", xPx: 20, yPx: 20, order: 30 });
      upsertRoom(effects, { id: "cloud", effect: "cloud", order: 20, intensity: 0.2 });
      effects.upsert({ kind: "stain", input: {
        id: "stain", style: "patch", xPx: 20, yPx: 20, sizePx: 40, order: 10, layer: "post-light"
      } });
      effects.update(0);
      effects.update(1 / 60);

      const particle = effects.postLight.children.find(child => child instanceof ParticleContainer)!;
      const cloud = effects.postLight.children.find(child => child.children.some(sprite => sprite instanceof TilingSprite))!;
      const stain = effects.postLight.children.find(child => child !== particle && child !== cloud)!;
      expect([stain.zIndex, cloud.zIndex, particle.zIndex]).toEqual([0, 1, 2]);

      effects.upsert({ kind: "stain", input: {
        id: "stain", style: "patch", xPx: 20, yPx: 20, sizePx: 40, order: 40, layer: "post-light"
      } });
      expect([cloud.zIndex, particle.zIndex, stain.zIndex]).toEqual([0, 1, 2]);

      upsertPoint(effects, { id: "spark", style: "ordered-spark", xPx: 20, yPx: 20, order: 20 });
      upsertRoom(effects, { id: "cloud", effect: "cloud", order: 20, intensity: 0.2 });
      effects.upsert({ kind: "stain", input: {
        id: "stain", style: "patch", xPx: 20, yPx: 20, sizePx: 40, order: 20, layer: "post-light"
      } });
      expect([cloud.zIndex, particle.zIndex, stain.zIndex]).toEqual([0, 1, 2]);
    } finally {
      effects.dispose();
    }
  });

  it("rejects unregistered recipe names and overlays without their textures", () => {
    const effects = makeEffects(false);
    try {
      effects.setRoomGeometry(geometry);
      const unknownEffect = { id: "raim" } as unknown as RegisteredRoomEffectName;
      expect(() => upsertRoom(effects, { id: "typo", effect: unknownEffect })).toThrow(/Unknown room effect recipe/);
      expect(() => upsertRoom(effects, { id: "fog", effect: "fog" })).toThrow(/require fog and cloud textures/);
    } finally {
      effects.dispose();
    }
  });

  it("clear resets time and runtime effects while keeping registered recipes usable", () => {
    const effects = makeEffects();
    try {
      effects.setRoomGeometry(geometry);
      const rain = registerRain(effects);
      upsertRoom(effects, { id: "rain-instance", effect: rain });
      effects.update(2);
      effects.clear();
      upsertRoom(effects, { id: "rain-instance", effect: rain });
      expect(() => effects.update(0)).not.toThrow();
    } finally {
      effects.dispose();
    }
  });
});
