import { describe, expect, it } from "vitest";
import {
  evaluatePointLight,
  normalizeBlockerInput,
  normalizeLightColor01,
  normalizePointLightDefaultsInput,
  normalizePointLightInput,
  normalizeRoomGeometryInput,
  normalizeRoomLightingInput,
  type NormalizedPointLightDefaults,
  type NormalizedRoomLighting
} from "./LightingCore";

const roomLighting: NormalizedRoomLighting = normalizeRoomLightingInput({
  ambient: 0.25,
  radiusPx: 220,
  intensity: 1.6,
  lightColorHex: "#ffd9a6",
  lightOuterColorHex: "#ff7f5f",
  lightGradientExponent: 1.4,
  lightHeightCells: 2
});

const pointLightDefaults: NormalizedPointLightDefaults = normalizePointLightDefaultsInput({
  swayAmountPx: 18,
  swayHz: 0.8,
  swayDirectionDeg: 90,
  flickerAmount: 0.35,
  flickerHz: 7.8,
  flickerStyle: "flame"
});

describe("lighting core normalization", () => {
  it("normalizes malformed point-light values while preserving fallback omissions", () => {
    const light = normalizePointLightInput({
      x: "420",
      y: Number.NaN,
      coneAngleDeg: 500,
      intensityScale: -2,
      gradientExponent: undefined,
      flickerStyle: undefined
    } as never);

    expect(light.x).toBe(420);
    expect(light.y).toBe(0);
    expect(light.coneAngleDeg).toBe(360);
    expect(light.intensityScale).toBe(0);
    expect(light.gradientExponent).toBeUndefined();
    expect(light.flickerStyle).toBeUndefined();
  });

  it("normalizes blockers to bounded grid-space values", () => {
    expect(normalizeBlockerInput({
      cellX: 3.9,
      cellY: -2.2,
      sizeCells: 9,
      shapeMode: 1,
      heightCells: -1,
      strength: 2
    })).toEqual({
      cellX: 3,
      cellY: -3,
      sizeCells: 2,
      shapeMode: 1,
      heightCells: 0,
      strength: 1
    });
  });

  it("normalizes room geometry independently from viewport dimensions", () => {
    expect(normalizeRoomGeometryInput({
      widthPx: 800.9,
      heightPx: 600.2,
      cellSizePx: 0
    })).toEqual({
      widthPx: 800,
      heightPx: 600,
      cellSizePx: 1
    });
  });

  it("applies room-lighting and point-light defaults without animating ambient", () => {
    const normalizedRoom = normalizeRoomLightingInput({ ambient: 4 });
    const normalizedDefaults = normalizePointLightDefaultsInput({ flickerStyle: "flame" });

    expect(normalizedRoom.ambient).toBe(1);
    expect(normalizedDefaults.flickerStyle).toBe("flame");
    expect(normalizedRoom).not.toHaveProperty("flickerStyle");
  });
});

describe("lighting core color handling", () => {
  it("accepts hex, normalized channels, byte channels, and fallback colors", () => {
    expect(normalizeLightColor01("#ff8000", [0, 0, 0])).toEqual([1, 128 / 255, 0]);
    expect(normalizeLightColor01([0.25, 0.5, 1], [0, 0, 0])).toEqual([0.25, 0.5, 1]);
    expect(normalizeLightColor01({ r: 255, g: 128, b: 0 }, [0, 0, 0])).toEqual([1, 128 / 255, 0]);
    expect(normalizeLightColor01("invalid", [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
  });
});

describe("lighting core animation", () => {
  it("evaluates the same animated light deterministically", () => {
    const light = normalizePointLightInput({
      x: 100,
      y: 200,
      motionMode: "sway-flicker",
      phase: 1.25,
      swayDirectionDeg: 45,
      intensityScale: 1.2,
      lightHeightCells: undefined
    });

    const first = evaluatePointLight(light, roomLighting, pointLightDefaults, 2.5);
    const second = evaluatePointLight(light, roomLighting, pointLightDefaults, 2.5);

    expect(second).toEqual(first);
    expect(first.x).not.toBe(100);
    expect(first.y).not.toBe(200);
    expect(first.intensity).toBeGreaterThanOrEqual(0);
    expect(first.intensity).toBeLessThanOrEqual(1.2);
    expect(first.lightHeightCells).toBe(2);
  });

  it("uses per-light overrides over point-light defaults and room lighting", () => {
    const light = normalizePointLightInput({
      x: 10,
      y: 20,
      motionMode: "static",
      color: "#0000ff",
      outerColor: { r: 255, g: 0, b: 0 },
      gradientExponent: 2.5,
      lightHeightCells: 4,
      flickerStyle: "swell"
    });

    const evaluated = evaluatePointLight(light, roomLighting, pointLightDefaults, 1);

    expect(evaluated.x).toBe(10);
    expect(evaluated.y).toBe(20);
    expect(evaluated.color).toEqual([0, 0, 1]);
    expect(evaluated.outerColor).toEqual([1, 0, 0]);
    expect(evaluated.gradientExponent).toBe(2.5);
    expect(evaluated.lightHeightCells).toBe(4);
    expect(evaluated.intensity).toBe(1);
  });

  it("produces distinct deterministic swell and flame profiles", () => {
    const light = normalizePointLightInput({
      x: 0,
      y: 0,
      motionMode: "flicker",
      phase: 0.4,
      flickerAmount: 0.8,
      flickerHz: 5
    });
    const swellDefaults = normalizePointLightDefaultsInput({ flickerStyle: "swell" });
    const flameDefaults = normalizePointLightDefaultsInput({ flickerStyle: "flame" });
    const swell = evaluatePointLight(light, roomLighting, swellDefaults, 0.37);
    const flame = evaluatePointLight(light, roomLighting, flameDefaults, 0.37);

    expect(swell.intensity).not.toBe(flame.intensity);
    expect(swell.intensity).toBeGreaterThanOrEqual(0.2);
    expect(flame.intensity).toBeGreaterThanOrEqual(0.2);
  });
});
