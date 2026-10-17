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
      atmosphere.setFog({ enabled: true, opacity: 0.25, scalePx: 100, tint: "#aabbcc", windDirectionDegrees: 0, windSpeedPxPerSecond: 20 });
      atmosphere.setCloudLayer(0, { enabled: true, opacity: 0.4, scalePx: 200, windDirectionDegrees: 90, windSpeedPxPerSecond: 10 });
      atmosphere.update(2);

      const fog = atmosphere.layer.children[0] as Container;
      const fogBase = fog.children[0] as TilingSprite;
      const fogStagger = fog.children[1] as TilingSprite;
      const fogThird = fog.children[2] as TilingSprite;
      const cloud = atmosphere.layer.children[1] as Container;
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
      expect((atmosphere.layer.children[2] as Container).visible).toBe(false);
    } finally {
      atmosphere.dispose();
    }
  });

  it("validates inputs and requires an explicit clock reset before time restarts", () => {
    const atmosphere = system();
    try {
      expect(() => atmosphere.setFog({ opacity: 1 })).not.toThrow();
      expect(() => atmosphere.setFog({ opacity: 1.1 })).toThrow(RangeError);
      expect(() => atmosphere.setCloudLayer(3, { enabled: true })).toThrow(RangeError);
      atmosphere.update(3);
      expect(() => atmosphere.update(2)).toThrow(RangeError);
      atmosphere.resetClock();
      expect(() => atmosphere.update(0)).not.toThrow();
    } finally {
      atmosphere.dispose();
    }
  });
});
