import { describe, expect, it } from "vitest";
import { Container, Texture, TilingSprite } from "pixi.js";
import { TopDownAtmosphereSystem } from "./TopDownAtmosphereSystem.js";

function system(): TopDownAtmosphereSystem {
  const atmosphere = new TopDownAtmosphereSystem({ fogTexture: Texture.WHITE, cloudTexture: Texture.WHITE });
  atmosphere.setRoomGeometry({ widthPx: 200, heightPx: 120 });
  return atmosphere;
}

describe("TopDownAtmosphereSystem", () => {
  it("keeps fog and clouds as independent room overlays and advances them from host time", () => {
    const atmosphere = system();
    try {
      atmosphere.setField("fog", "fog", 0, { enabled: true, opacity: 0.25, scalePx: 100, tint: "#aabbcc", windDirectionDegrees: 0, windSpeedPxPerSecond: 20 });
      atmosphere.setField("cloud", "cloud", 0, { enabled: true, opacity: 0.4, scalePx: 200, windDirectionDegrees: 90, windSpeedPxPerSecond: 10 });
      atmosphere.update(0);
      atmosphere.update(2);

      const fog = atmosphere.layer.children.find((field: any) => (field.children[0] as TilingSprite).tint === 0xaabbcc) as Container;
      const fogBase = fog.children[0] as TilingSprite;
      const fogStagger = fog.children[1] as TilingSprite;
      const fogThird = fog.children[2] as TilingSprite;
      const cloud = atmosphere.layer.children.find((field: any) => (field.children[0] as TilingSprite).tint === 0xffffff) as Container;
      const cloudSprite = cloud.children[0] as TilingSprite;
      expect(fog.visible).toBe(true);
      expect(fog.alpha).toBe(0.25);
      expect(fog.children).toHaveLength(3);
      expect(fogBase.tilePosition.x).toBeCloseTo(40);
      expect(fogBase.tilePosition.y).toBeCloseTo(0);
      expect(fogStagger.tilePosition.x).toBeCloseTo(1.5);
      expect(fogStagger.tilePosition.y).toBeCloseTo(38.5);
      expect(fogThird.tilePosition.x).toBeCloseTo(77.41);
      expect(fogThird.tilePosition.y).toBeCloseTo(86.43);
      expect(fogStagger.alpha).toBe(0.4);
      expect(fogThird.alpha).toBe(0.28);
      expect(cloud.visible).toBe(true);
      expect(cloud.alpha).toBe(0.4);
      expect(cloudSprite.tilePosition.y).toBeCloseTo(20);
      expect(atmosphere.layer.children).toHaveLength(2);
    } finally {
      atmosphere.dispose();
    }
  });

  it("validates inputs and requires an explicit clock reset before time restarts", () => {
    const atmosphere = system();
    try {
      expect(() => atmosphere.setField("f", "fog", 0, { opacity: 1 })).not.toThrow();
      expect(() => atmosphere.setField("f", "fog", 0, { opacity: 1.1 })).toThrow(RangeError);
      expect(() => atmosphere.setField("c", "cloud", 0, { enabled: true })).not.toThrow();
      atmosphere.update(3);
      expect(() => atmosphere.update(2)).toThrow(RangeError);
      atmosphere.resetClock();
      expect(() => atmosphere.update(0)).not.toThrow();
    } finally {
      atmosphere.dispose();
    }
  });

  it("supports unrestricted stable IDs, orders overlays, and changes wind without moving tiles", () => {
    const atmosphere = system();
    try {
      for (let index = 0; index < 5; index++) {
        atmosphere.setField(`cloud-${index}`, "cloud", 10 - index, { enabled: true, windSpeedPxPerSecond: 20,
          ...(index === 0 ? { tint: "#ff0000" } : {}) });
      }
      atmosphere.setField("fog-a", "fog", -1, { enabled: true, windSpeedPxPerSecond: 10 });
      atmosphere.setField("fog-b", "fog", -1, { enabled: true, windSpeedPxPerSecond: 10 });
      expect(atmosphere.getFieldCount()).toBe(7);
      expect(atmosphere.layer.children.map((field: any) => field === undefined)).not.toContain(true);
      const field = atmosphere.layer.children.find((child: any) => (child.children[0] as TilingSprite).tint === 0xff0000) as Container;
      const sprite = field.children[0] as TilingSprite;
      atmosphere.update(0);
      atmosphere.update(1);
      const before = sprite.tilePosition.x;
      atmosphere.setField("cloud-0", "cloud", 10, { enabled: true, tint: "#ff0000", windDirectionDegrees: 90, windSpeedPxPerSecond: 20 });
      expect(sprite.tilePosition.x).toBeCloseTo(before);
      atmosphere.update(2);
      expect(sprite.tilePosition.x).toBeCloseTo(before);
      expect(sprite.tilePosition.y).toBeCloseTo(20);
    } finally {
      atmosphere.dispose();
    }
  });

  it("fades removed overlays and resumes a fade without an alpha jump", () => {
    const atmosphere = system();
    try {
      const input = { enabled: true, opacity: 0.4, transitionTimeMs: 500, removalDurationMs: 1000 };
      atmosphere.setField("fade-cloud", "cloud", 0, input);
      atmosphere.update(0);
      atmosphere.update(0.1);
      let field = atmosphere.layer.children[0] as Container;
      expect(field.alpha).toBeCloseTo(0.4);

      atmosphere.setField("fade-cloud", "cloud", 0, { ...input, enabled: false });
      atmosphere.update(0.6);
      expect(field.alpha).toBeCloseTo(0.2);
      atmosphere.setField("fade-cloud", "cloud", 0, input);
      expect(field.alpha).toBeCloseTo(0.2);
      atmosphere.update(0.61);
      expect(field.alpha).toBeCloseTo(0.204, 2);
      atmosphere.update(1.1);
      expect(field.alpha).toBeCloseTo(0.4);

      atmosphere.removeField("fade-cloud");
      atmosphere.update(2.1);
      expect(atmosphere.getFieldCount()).toBe(0);
    } finally {
      atmosphere.dispose();
    }
  });
});
