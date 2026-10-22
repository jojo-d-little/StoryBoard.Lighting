import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CONTROL_MAPPINGS,
  adaptCatalogParticleEffect,
  getSupportedCatalogControls,
  mapCatalogControlValues,
  mapCatalogStreamOverrides,
  resolveCatalogRecipe,
  resolveWindVector
} from "./catalog-adapter.js";
import type { CatalogParticleEffect, CatalogTuningContractFixture } from "./catalog-adapter.js";

function fixture<T>(path: string): T {
  const text = readFileSync(new URL(path, import.meta.url), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text) as T;
}

const catalog = fixture<{ effects: CatalogParticleEffect[] }>("../../../effects/presentation-effects.catalog.json");
const tuningContract = fixture<CatalogTuningContractFixture>("../../../effects/particle-effect-authoring.contract.json");
const particleEffects = catalog.effects.filter(effect => effect.category === "ParticleEffect");

describe("Stage 08 catalog boundary", () => {
  it("adapts all catalog point and room stream recipes and resolves logical image slots", () => {
    const streamEffects = particleEffects.filter(effect => effect.particleEffect.recipe.renderingMode === "point" || effect.particleEffect.recipe.renderingMode === "room");
    expect(streamEffects.length).toBeGreaterThan(20);
    for (const effect of streamEffects) {
      const adapted = adaptCatalogParticleEffect(effect);
      expect(adapted.effect.id).toBe(effect.effectKey);
      expect(adapted.effect.streams.length).toBe(effect.particleEffect.recipe.streams.length);
      for (const stream of adapted.effect.streams) {
        expect(effect.particleEffect.imageSlots?.[effect.particleEffect.recipe.streams.find(source => source.id === stream.id)!.textureId])
          .toBe(stream.textureId);
      }
      if (effect.particleEffect.recipe.renderingMode === "room") expect(adapted.roomStyle).toBeDefined();
      else expect(adapted.pointStyle).toBeDefined();
    }
  });

  it("derives smoke and wind classifications from every catalog stream recipe", () => {
    const streamEffects = particleEffects.filter(effect => effect.particleEffect.recipe.renderingMode === "point" || effect.particleEffect.recipe.renderingMode === "room");
    for (const source of streamEffects) {
      const adapted = adaptCatalogParticleEffect(source);
      const style = adapted.pointStyle ?? adapted.roomStyle;
      expect(style).toBeDefined();
      expect(style!.smokeStreamIds).toEqual(source.particleEffect.recipe.streams.filter(stream => stream.role === "smoke").map(stream => stream.id));
      expect(style!.windBlownStreamIds).toEqual(source.particleEffect.recipe.streams.filter(stream => stream.isWindBlown).map(stream => stream.id));
      if (adapted.roomStyle) {
        expect(adapted.roomStyle.windStretchStreamIds).toEqual(source.particleEffect.recipe.streams.filter(stream => stream.isWindStretched).map(stream => stream.id));
        expect(adapted.roomStyle.windEdgeFlowStreamIds).toEqual(source.particleEffect.recipe.streams.filter(stream => stream.windEdgeFlow).map(stream => stream.id));
        expect(adapted.roomStyle.windMotionMix?.streamIds ?? []).toEqual(source.particleEffect.recipe.streams.filter(stream => stream.windMotionMixEnabled).map(stream => stream.id));
      }
    }

    const smoke = particleEffects.find(effect => effect.effectKey === "particle.campfire.smoke")!;
    const adaptedSmoke = adaptCatalogParticleEffect(smoke);
    expect(adaptedSmoke.pointStyle?.smokeStreamIds).toEqual(["smoke"]);
    expect(adaptedSmoke.pointStyle?.windBlownStreamIds).toEqual(["smoke"]);

    const rain = particleEffects.find(effect => effect.effectKey === "particle.rain")!;
    const adaptedRain = adaptCatalogParticleEffect(rain);
    expect(adaptedRain.roomStyle?.windBlownStreamIds).toEqual(["drops"]);
    expect(adaptedRain.roomStyle?.windStretchStreamIds).toEqual(["drops"]);
    const windOverrides = mapCatalogStreamOverrides(rain.particleEffect.recipe, rain.particleEffect.recipe, {
      WindSpeedPxPerSecond: 12,
      WindDirectionDegrees: 90
    });
    expect(windOverrides.drops.velocityOffsetXPxPerSecond).toBeCloseTo(0);
    expect(windOverrides.drops.velocityOffsetYPxPerSecond).toBeCloseTo(12);
    expect(windOverrides.drops.windStretchScale).toBeCloseTo(2.5);
    expect(windOverrides.splash.velocityOffsetXPxPerSecond).toBeUndefined();
    expect(windOverrides.splash.windStretchScale).toBeUndefined();

    const leafEffect = particleEffects.find(effect => effect.effectKey === "particle.oak-leaves")!;
    const adaptedLeaves = adaptCatalogParticleEffect(leafEffect);
    expect(adaptedLeaves.roomStyle?.windBlownStreamIds).toEqual(["leaves"]);
    expect(adaptedLeaves.roomStyle?.windEdgeFlowStreamIds).toEqual(["leaves"]);
    expect(adaptedLeaves.roomStyle?.windMotionMix?.streamIds).toEqual(["leaves"]);
  });

  it("maps every declared family control and exposes only controls supported by that family", () => {
    const recipeFamilies = new Set(particleEffects.map(effect => effect.particleEffect.recipe.family));
    const declaredFamilies = new Set(tuningContract.particleEffectFamilyTuningContracts.map(contract => contract.family));
    expect([...recipeFamilies].every(family => declaredFamilies.has(family))).toBe(true);
    for (const effect of particleEffects) {
      const controls = getSupportedCatalogControls(effect.particleEffect.recipe, tuningContract);
      expect(controls.every(control => control.name in CATALOG_CONTROL_MAPPINGS)).toBe(true);
    }
    expect(getSupportedCatalogControls(particleEffects.find(effect => effect.effectKey === "particle.fog")!.particleEffect.recipe, tuningContract)
      .map(control => control.name)).toEqual(expect.arrayContaining(["CoverageMultiplier", "OpacityMultiplier", "Tint"]));
    expect(getSupportedCatalogControls(particleEffects.find(effect => effect.effectKey === "particle.stain.splatter")!.particleEffect.recipe, tuningContract)
      .map(control => control.name)).toEqual(["SizeMultiplier", "OpacityMultiplier", "Colors", "DirectionDegrees"]);
  });

  it("preserves rain follow-up lifetime while proportionally tuning eligible streams", () => {
    const rain = particleEffects.find(effect => effect.effectKey === "particle.rain")!.particleEffect.recipe;
    if (rain.renderingMode !== "room") throw new Error("Rain fixture must use the room route.");
    const resolved = resolveCatalogRecipe(rain, {
      EmissionRateMultiplier: 0,
      LifetimeMultiplier: 2,
      SizeMultiplier: 1.5,
      SpawnRadiusMultiplier: 0,
      Colors: { primary: "#112233", secondary: "#445566" }
    });
    if (resolved.renderingMode !== "room") throw new Error("Resolved rain must use the room route.");
    expect(resolved.streams[0].ratePerSecond).toBe(0);
    expect(resolved.streams[0].lifeMinSeconds).toBe(rain.streams[0].lifeMinSeconds * 2);
    expect(resolved.streams[1].lifeMinSeconds).toBe(rain.streams[1].lifeMinSeconds);
    expect(resolved.streams[0].startWidthPx).toBe(rain.streams[0].startWidthPx * 1.5);
    expect(resolved.streams[0].endHeightPx).toBe(rain.streams[0].endHeightPx! * 1.5);
    expect(resolved.streams[1].spawn.radiusPx).toBe(0);
    expect(resolved.streams[0].startColor).toBe("#112233");
    expect(resolved.streams[1].startColor).toBe("#445566");
    const overrides = mapCatalogStreamOverrides(rain, resolved, { LifetimeMultiplier: 2, SizeMultiplier: 1.5, SpawnRadiusMultiplier: 0 });
    expect(overrides.drops.lifetimeScale).toBe(2);
    expect(overrides.splash.lifetimeScale).toBeUndefined();
    expect(overrides.drops.spawnExtentScale).toBeUndefined();
    expect(overrides.splash.spawnExtentScale).toBe(0);
  });

  it("applies overlay zeros safely and resolves calm, neutral, and transformed wind", () => {
    const fog = particleEffects.find(effect => effect.effectKey === "particle.fog")!.particleEffect.recipe;
    const resolved = resolveCatalogRecipe(fog, { CoverageMultiplier: 0, OpacityMultiplier: 0, WindSpeedPxPerSecond: 0, WindDirectionDegrees: 0, WindDirectionOffsetDegrees: 0 });
    expect(resolved.renderingMode).toBe("overlay");
    if (resolved.renderingMode !== "overlay") throw new Error("Fog fixture must use overlay route.");
    expect(resolved.coveragePx).toBe(0);
    expect(resolved.opacity).toBe(0);
    expect(mapCatalogControlValues(fog, { CoverageMultiplier: 0 }).coveragePx).toBe(0);
    expect(resolveWindVector(fog, { WindSpeedPxPerSecond: 0, WindDirectionDegrees: 0 })).toEqual({ x: 0, y: 0 });
    expect(resolveWindVector(fog, { WindSpeedPxPerSecond: 10, WindDirectionDegrees: 0, WindDirectionOffsetDegrees: 0 })).toEqual({ x: 10, y: 0 });
    expect(resolveWindVector(fog, { WindSpeedPxPerSecond: 10, WindDirectionDegrees: -1 })).toEqual({ x: 0, y: 0 });
    expect(resolveWindVector(fog, { WindSpeedPxPerSecond: 10, WindDirectionDegrees: 90, WindSpeedMultiplier: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("does not reinterpret zero values whose sidecar policy is omit", () => {
    const fire = particleEffects.find(effect => effect.effectKey === "particle.campfire")!.particleEffect.recipe;
    expect(() => resolveCatalogRecipe(fire, { LifetimeMultiplier: 0 })).toThrow(/must be omitted/);
    expect(() => resolveCatalogRecipe(fire, { SizeMultiplier: 0 })).toThrow(/must be omitted/);
  });
});
