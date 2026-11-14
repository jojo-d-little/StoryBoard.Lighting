import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CONTROL_MAPPINGS,
  adaptCatalogParticleEffect,
  getSupportedCatalogControls,
  mapCatalogControlValues,
  mapCatalogStreamOverrides,
  resolveBurstCount,
  resolveCatalogRecipe,
  resolveWindVector
} from "./catalog-adapter.js";
import type { CatalogFamilyTuningContract, CatalogParticleEffect, CatalogRecipe, CatalogTuningContractFixture } from "./catalog-adapter.js";

function fixture<T>(path: string): T {
  const text = readFileSync(new URL(path, import.meta.url), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text) as T;
}

const catalog = fixture<{ effects: CatalogParticleEffect[] }>("../../../effects/presentation-effects.catalog.json");
const tuningContract = fixture<CatalogTuningContractFixture>("../../../effects/particle-effect-authoring.contract.json");
const stage01 = fixture<{
  catalogEffects: Array<Omit<CatalogParticleEffect, "category"> & { category: string }>;
  familyContracts: CatalogFamilyTuningContract[];
}>("../../../effects/directional-particle-stage-01.fixture.json");
const stage01Effects: CatalogParticleEffect[] = stage01.catalogEffects.map(effect => ({ ...effect, category: "ParticleEffect" }));
const particleEffects = [...catalog.effects.filter(effect => effect.category === "ParticleEffect"), ...stage01Effects];
tuningContract.particleEffectFamilyTuningContracts.push(...stage01.familyContracts);

function directionalRecipe(family: string): CatalogRecipe {
  return {
    renderingMode: "point",
    family,
    streams: [{
      id: "stream", textureId: "slot", layer: "pre-light", ratePerSecond: 60,
      spawn: { kind: "point", radiusPx: 0 }, lifeMinSeconds: 1, lifeMaxSeconds: 1,
      velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
      velocityYMinPxPerSecond: -10, velocityYMaxPxPerSecond: -10,
      startWidthPx: 2, startHeightPx: 2, startColor: "#ffffff"
    }]
  };
}

function directionalEffect(family: string, effectKey = `particle.${family}`, textureId = "rain-ripple"): CatalogParticleEffect {
  return {
    category: "ParticleEffect", effectKey, displayName: family,
    particleEffect: { recipe: directionalRecipe(family, textureId), imageSlots: { slot: textureId } }
  };
}

describe("Stage 08 catalog boundary", () => {
  it("adapts all catalog point and room stream recipes and resolves logical image slots", () => {
    const streamEffects = particleEffects.filter(effect => effect.particleEffect.recipe.renderingMode === "point" || effect.particleEffect.recipe.renderingMode === "room");
    expect(streamEffects.length).toBeGreaterThan(20);
    for (const effect of streamEffects) {
      const adapted = adaptCatalogParticleEffect(effect);
      expect(adapted.effect.id).toBe(effect.effectKey);
      expect(adapted.effect.streams.length).toBe(effect.particleEffect.recipe.streams.length);
      for (const stream of adapted.effect.streams) {
        expect(adapted.imageSlotMap[effect.particleEffect.recipe.streams.find(source => source.id === stream.id)!.textureId])
          .toBe(stream.textureId);
        if (stream.surgeOnly) {
          expect(stream.burstCount).toBe(effect.particleEffect.recipe.streams.find(source => source.id === stream.id)!.burstCount ?? 1);
        }
      }
      if (effect.particleEffect.recipe.renderingMode === "room") expect(adapted.roomStyle).toBeDefined();
      else expect(adapted.pointStyle).toBeDefined();
    }
  });

  it("preserves authored catalog burst baselines and defaults eligible streams to one", () => {
    const source = structuredClone(particleEffects.find(effect => effect.effectKey === "particle.electrical-sparks")!);
    if (source.particleEffect.recipe.renderingMode !== "point") throw new Error("Sparks fixture must use the point route.");
    source.particleEffect.recipe.streams[0].burstCount = 12;

    const adapted = adaptCatalogParticleEffect(source);
    expect(adapted.recipe.streams[0].burstCount).toBe(12);
    expect(adapted.effect.streams[0].burstCount).toBe(12);

    const omitted = structuredClone(source);
    if (omitted.particleEffect.recipe.renderingMode !== "point") throw new Error("Sparks fixture must use the point route.");
    delete omitted.particleEffect.recipe.streams[0].burstCount;
    expect(adaptCatalogParticleEffect(omitted).recipe.streams[0].burstCount).toBe(1);
  });

  it("resolves catalog burst quantities with nonnegative half-up rounding", () => {
    expect(resolveBurstCount(12, 0.5)).toBe(6);
    expect(resolveBurstCount(12, 2)).toBe(24);
    expect(resolveBurstCount(3, 0.5)).toBe(2);
    expect(resolveBurstCount(1, 0.4)).toBe(0);
    expect(resolveBurstCount(12, 0)).toBe(0);
    expect(resolveBurstCount(undefined, undefined)).toBe(1);
    expect(resolveBurstCount(undefined, 2)).toBe(2);
    expect(resolveBurstCount(12)).toBe(12);
  });

  it("rejects invalid burst baselines, multipliers, and unsafe results", () => {
    for (const multiplier of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => resolveBurstCount(12, multiplier)).toThrow(/finite and nonnegative/);
    }
    for (const baseline of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => resolveBurstCount(baseline)).toThrow(/positive safe integer/);
    }
    expect(() => resolveBurstCount(Number.MAX_SAFE_INTEGER, 2)).toThrow(/safe whole-particle/);
  });

  it("rejects authored burst counts on streams outside the surge-only path", () => {
    const source = structuredClone(particleEffects.find(effect => effect.effectKey === "particle.electrical-sparks")!);
    if (source.particleEffect.recipe.renderingMode !== "point") throw new Error("Sparks fixture must use the point route.");
    source.particleEffect.recipe.streams[0].surgeOnly = false;
    source.particleEffect.recipe.streams[0].burstCount = 2;
    expect(() => adaptCatalogParticleEffect(source)).toThrow(/only when surgeOnly is true/);
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

  it("maps all five established controls for both Stage 01 directional families, including transition colors on continuous and surge streams", () => {
    const establishedControls = ["EmissionRateMultiplier", "LifetimeMultiplier", "SizeMultiplier", "SpawnRadiusMultiplier", "Colors"];
    const sharedControls = [...establishedControls, "DirectionDegrees", "EmissionTimingJitterPercent"];
    const tuning = {
      EmissionRateMultiplier: 1.5,
      LifetimeMultiplier: 2,
      SizeMultiplier: 1.25,
      SpawnRadiusMultiplier: 3,
      Colors: { primary: "#112233", secondary: "#445566" }
    };

    for (const effectKey of ["particle.water-fountain", "particle.electrical-arcing"]) {
      const source = particleEffects.find(effect => effect.effectKey === effectKey)!;
      const recipe = source.particleEffect.recipe;
      if (recipe.renderingMode !== "point") throw new Error(`${effectKey} must use point rendering.`);
      expect(getSupportedCatalogControls(recipe, tuningContract).map(control => control.name)).toEqual([
        ...sharedControls,
        "AccelerationXPxPerSecond2", "AccelerationYPxPerSecond2"
      ]);

      const continuous = recipe.streams.find(stream => stream.ratePerSecond > 0)!;
      const surge = recipe.streams.find(stream => stream.surgeOnly)!;
      expect(continuous).toBeDefined();
      expect(surge).toBeDefined();
      for (const stream of [continuous, surge]) {
        expect(stream.colorBinding).toEqual({ control: "Colors", mode: "transition" });
      }

      const effective = resolveCatalogRecipe(recipe, tuning);
      if (effective.renderingMode !== "point") throw new Error(`${effectKey} must resolve as a point recipe.`);
      const overrides = mapCatalogStreamOverrides(recipe, effective, tuning);
      for (const stream of [continuous, surge]) {
        const resolved = effective.streams.find(candidate => candidate.id === stream.id)!;
        expect(resolved.ratePerSecond).toBe(stream.ratePerSecond * tuning.EmissionRateMultiplier);
        expect(resolved.lifeMinSeconds).toBe(stream.lifeMinSeconds * tuning.LifetimeMultiplier);
        expect(resolved.lifeMaxSeconds).toBe(stream.lifeMaxSeconds * tuning.LifetimeMultiplier);
        expect(resolved.startWidthPx).toBe(stream.startWidthPx * tuning.SizeMultiplier);
        expect(resolved.endWidthPx).toBe(stream.endWidthPx! * tuning.SizeMultiplier);
        expect(resolved.spawn.radiusPx).toBe(stream.spawn.radiusPx! * tuning.SpawnRadiusMultiplier);
        expect(resolved.startColor).toBe(tuning.Colors.primary);
        expect(resolved.endColor).toBe(tuning.Colors.secondary);
        expect(overrides[stream.id]).toMatchObject({
          ratePerSecond: resolved.ratePerSecond,
          lifetimeScale: tuning.LifetimeMultiplier,
          sizeScale: tuning.SizeMultiplier,
          spawnExtentScale: tuning.SpawnRadiusMultiplier,
          startColor: tuning.Colors.primary,
          endColor: tuning.Colors.secondary
        });
      }
      expect(surge.ratePerSecond).toBe(0);
      expect(overrides[surge.id].ratePerSecond).toBe(0);
    }
  });

  it("maps signed screen-space acceleration on both fountain streams, preserving omissions and applying zero", () => {
    const source = particleEffects.find(effect => effect.effectKey === "particle.water-fountain")!.particleEffect.recipe;
    if (source.renderingMode !== "point") throw new Error("Fountain fixture must use point rendering.");
    const continuous = source.streams.find(stream => stream.ratePerSecond > 0)!;
    const surge = source.streams.find(stream => stream.surgeOnly)!;
    expect(continuous.accelerationXPxPerSecond2).toBeUndefined();
    expect(continuous.accelerationYPxPerSecond2).toBe(170);
    expect(surge.accelerationYPxPerSecond2).toBe(170);

    const omitted = mapCatalogStreamOverrides(source, resolveCatalogRecipe(source, { DirectionDegrees: 0 }), { DirectionDegrees: 0 });
    expect(omitted[continuous.id]).not.toHaveProperty("accelerationXPxPerSecond2");
    expect(omitted[continuous.id]).not.toHaveProperty("accelerationYPxPerSecond2");
    expect(omitted[surge.id]).not.toHaveProperty("accelerationXPxPerSecond2");
    expect(omitted[surge.id]).not.toHaveProperty("accelerationYPxPerSecond2");

    const tuning = { DirectionDegrees: 0, AccelerationXPxPerSecond2: -28, AccelerationYPxPerSecond2: 0 };
    const mapped = mapCatalogStreamOverrides(source, resolveCatalogRecipe(source, tuning), tuning);
    for (const stream of [continuous, surge]) {
      expect(mapped[stream.id]).toMatchObject({
        velocityRotationRadians: expect.any(Number),
        accelerationXPxPerSecond2: -28,
        accelerationYPxPerSecond2: 0
      });
    }
    expect(() => resolveCatalogRecipe(source, { AccelerationXPxPerSecond2: 90.1 })).toThrow(/-90\.\.90/);
    expect(() => resolveCatalogRecipe(source, { AccelerationYPxPerSecond2: Number.NaN })).toThrow(/-90\.\.90/);

    const sparks = directionalRecipe("electrical-sparks");
    const arcing = directionalRecipe("electrical-arcing");
    expect(mapCatalogStreamOverrides(arcing, arcing, tuning).stream).toMatchObject({
      accelerationXPxPerSecond2: -28, accelerationYPxPerSecond2: 0
    });
    const isolated = mapCatalogStreamOverrides(sparks, sparks, tuning);
    expect(isolated.stream.accelerationXPxPerSecond2).toBeUndefined();
    expect(isolated.stream.accelerationYPxPerSecond2).toBeUndefined();
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

  it("maps directional family headings to shortest rotations and normalizes 360 degrees", () => {
    const expected = new Map([[0, Math.PI / 2], [90, Math.PI], [180, -Math.PI / 2], [270, 0], [360, Math.PI / 2]]);
    for (const family of ["water-fountain", "electrical-arcing"]) {
      const source = directionalRecipe(family);
      for (const [degrees, radians] of expected) {
        const overrides = mapCatalogStreamOverrides(source, source, { DirectionDegrees: degrees });
        expect(overrides.stream.velocityRotationRadians).toBeCloseTo(radians);
      }
      expect(mapCatalogStreamOverrides(source, source, {}).stream.velocityRotationRadians).toBeUndefined();
      expect(() => resolveCatalogRecipe(source, { DirectionDegrees: 360.1 })).toThrow(/0\.\.360/);
    }
  });

  it("keeps direction mapping isolated to fountain and electrical-arcing families", () => {
    for (const family of ["water-spatter", "electrical-sparks", "surface-mark"]) {
      const recipe = directionalRecipe(family);
      const overrides = mapCatalogStreamOverrides(recipe, recipe, { DirectionDegrees: 0 });
      expect(overrides.stream.velocityRotationRadians).toBeUndefined();
    }
  });

  it("uses a fountain droplet default while preserving explicit image-slot texture overrides", () => {
    const defaulted = adaptCatalogParticleEffect(directionalEffect("water-fountain"));
    expect(defaulted.imageSlotMap.slot).toBe("fountain-droplet");
    expect(defaulted.recipe.streams[0].textureId).toBe("fountain-droplet");

    const custom = adaptCatalogParticleEffect(directionalEffect("water-fountain", "particle.water-fountain", "my-project-droplet"));
    expect(custom.imageSlotMap.slot).toBe("my-project-droplet");
    expect(custom.recipe.streams[0].textureId).toBe("my-project-droplet");
  });

  it("validates jitter bounds without treating it as an emission-rate multiplier", () => {
    const source = directionalRecipe("water-fountain");
    expect(resolveCatalogRecipe(source, { EmissionTimingJitterPercent: 0 }).streams[0].ratePerSecond).toBe(60);
    expect(resolveCatalogRecipe(source, { EmissionTimingJitterPercent: 90 }).streams[0].ratePerSecond).toBe(60);
    for (const value of [-0.1, 90.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveCatalogRecipe(source, { EmissionTimingJitterPercent: value })).toThrow(/0\.\.90/);
    }
  });
});
