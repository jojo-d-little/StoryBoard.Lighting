import type {
  ParticleColorBinding,
  ParticleEffectDefinition,
  ParticleLayer,
  ParticleRoomStyleDefinition,
  ParticleSpawnShape,
  ParticleStreamDefinition,
  ParticleStyleDefinition,
  TopDownStainStyle
} from "./contracts.js";

export type CatalogRenderingMode = "point" | "room" | "overlay" | "stain";
export type CatalogColorMode = "transition" | "flip" | "role" | "value";

export interface CatalogColorBinding {
  control: string;
  mode: CatalogColorMode;
  role?: "primary" | "secondary";
}

/** Catalog-authored stream fields that drive renderer behavior are kept together. */
export interface CatalogParticleStream extends ParticleStreamDefinition {
  role?: "flame" | "smoke" | "ember";
  isWindBlown?: boolean;
  isWindStretched?: boolean;
  windEdgeFlow?: boolean;
  windMotionMixEnabled?: boolean;
  lifetimeTuningApplicable?: boolean;
  colorBinding?: CatalogColorBinding;
  colorTransitionSeconds?: number;
  colorTransitionFraction?: number;
}

/**
 * Resolves one eligible stream's absolute particle count for a burst occurrence.
 * An omitted recipe baseline or quantity multiplier defaults to one.
 */
export function resolveBurstCount(burstCount: number | undefined, quantityMultiplier = 1): number {
  const baseline = burstCount ?? 1;
  if (!Number.isSafeInteger(baseline) || baseline < 1) {
    throw new RangeError("burstCount must be a positive safe integer when supplied.");
  }
  if (!Number.isFinite(quantityMultiplier) || quantityMultiplier < 0) {
    throw new RangeError("quantityMultiplier must be finite and nonnegative.");
  }
  const resolvedCount = Math.floor(baseline * quantityMultiplier + 0.5);
  if (!Number.isSafeInteger(resolvedCount)) {
    throw new RangeError("Resolved burst count must be a safe whole-particle count.");
  }
  return resolvedCount;
}

export interface CatalogRecipeBase {
  renderingMode: CatalogRenderingMode;
  family: string;
  lifecycle?: { transitionTimeMs?: number; removalDurationMs?: number | null };
  presentation?: { colorChangeMode?: "birth-snapshot" | "retint"; layer?: ParticleLayer; order?: number };
}

interface CatalogParticleRecipeFields {
  streams: CatalogParticleStream[];
  wind?: {
    nudgeFadeOutSeconds?: number;
    motionMix?: {
      maxWindSpeedPxPerSecond: number;
      lowWindSkitterFraction: number;
      highWindSkitterFraction: number;
    };
  };
}

export type CatalogParticleRecipe =
  | (CatalogRecipeBase & CatalogParticleRecipeFields & { renderingMode: "point" })
  | (CatalogRecipeBase & CatalogParticleRecipeFields & { renderingMode: "room" });

export interface CatalogOverlayRecipe extends CatalogRecipeBase {
  renderingMode: "overlay";
  overlay: "fog" | "cloud";
  coveragePx: number;
  opacity: number;
  tint: string;
  windSpeedPxPerSecond: number;
  windDirectionDegrees: number;
  windSpeedMultiplier: number;
  windDirectionOffsetDegrees: number;
}

export interface CatalogStainRecipe extends CatalogRecipeBase {
  renderingMode: "stain";
  style: TopDownStainStyle;
  sizePx: number;
  opacity: number;
  amount: number;
  colors: { primary: string; secondary: string };
  directionDegrees: number;
}

export type CatalogRecipe = CatalogParticleRecipe | CatalogOverlayRecipe | CatalogStainRecipe;

export interface CatalogParticleEffect {
  category: "ParticleEffect";
  effectKey: string;
  displayName: string;
  particleEffect: {
    recipe: CatalogRecipe;
    /** Logical recipe texture slot to package texture ID. */
    imageSlots?: Record<string, string>;
  };
}

export interface CatalogControlContract {
  name: string;
  kind: "number" | "colorPair" | "string";
  unit?: string;
  minimum?: number;
  maximum?: number;
  zeroBehavior: "apply" | "omit" | "notApplicable";
  roleLabels?: { primary: string; secondary: string };
  options?: string[];
}

export interface CatalogFamilyTuningContract {
  family: string;
  description: string;
  controls: CatalogControlContract[];
  imageSlots: Array<{ name: string; unit: string }>;
}

export interface CatalogTuningContractFixture {
  schemaVersion: "3.0";
  particleEffectFamilyTuningContracts: CatalogFamilyTuningContract[];
}

/** Sparse values already resolved and validated by GameEngine. */
export interface CatalogResolvedTuning {
  EmissionRateMultiplier?: number;
  LifetimeMultiplier?: number;
  SizeMultiplier?: number;
  SpawnRadiusMultiplier?: number;
  CoverageMultiplier?: number;
  OpacityMultiplier?: number;
  WindSpeedMultiplier?: number;
  WindDirectionOffsetDegrees?: number;
  WindSpeedPxPerSecond?: number;
  WindDirectionDegrees?: number;
  Colors?: { primary: string; secondary: string };
  Tint?: string;
  DirectionDegrees?: number;
}

export interface CatalogMappedStream extends CatalogParticleStream {
  /** Resolved package texture ID; logical image-slot names remain on the source recipe. */
  textureId: string;
}

export interface CatalogParticleAdaptation {
  effectId: string;
  family: string;
  recipe: CatalogParticleRecipe;
  effect: ParticleEffectDefinition;
  pointStyle?: ParticleStyleDefinition;
  roomStyle?: ParticleRoomStyleDefinition;
  imageSlotMap: Record<string, string>;
}

const COLOR_BINDING_MAP: Record<CatalogColorMode, ParticleColorBinding> = {
  transition: "transition",
  flip: "flip",
  role: "primary",
  value: "primary"
};

export const CATALOG_CONTROL_MAPPINGS = {
  EmissionRateMultiplier: "uniformly multiplies each authored stream ratePerSecond",
  LifetimeMultiplier: "multiplies both authored lifetime endpoints only when lifetimeTuningApplicable is not false",
  SizeMultiplier: "multiplies start and optional end dimensions by one shared factor",
  SpawnRadiusMultiplier: "scales point radius/innerRadius and rectangle width/height without moving centers",
  CoverageMultiplier: "scales overlay coverage; zero is represented as a disabled zero-coverage request",
  OpacityMultiplier: "scales overlay/stain opacity and clamps to 0..1",
  WindSpeedMultiplier: "scales resolved environmental wind magnitude for wind-responsive streams or overlays",
  WindDirectionOffsetDegrees: "adds a relative angle to a valid resolved wind direction; calm remains calm",
  WindSpeedPxPerSecond: "passes the resolved environmental wind speed, including zero calm input",
  WindDirectionDegrees: "passes the resolved environmental direction; -1 denotes calm and 0 is rightward",
  Colors: "applies primary/secondary roles through each stream colorBinding or the stain palette",
  Tint: "replaces the overlay tint",
  DirectionDegrees: "sets stain travel/orientation direction"
} as const;

export function getSupportedCatalogControls(
  recipe: CatalogRecipe,
  fixture: CatalogTuningContractFixture
): CatalogControlContract[] {
  const family = fixture.particleEffectFamilyTuningContracts.find(item => item.family === recipe.family);
  if (!family) throw new Error(`No tuning contract exists for catalog family '${recipe.family}'.`);
  for (const control of family.controls) {
    if (!(control.name in CATALOG_CONTROL_MAPPINGS)) {
      throw new Error(`No Lighting mapping exists for '${control.name}' in family '${family.family}'.`);
    }
  }
  return family.controls;
}

export function adaptCatalogParticleEffect(source: CatalogParticleEffect): CatalogParticleAdaptation {
  const { effectKey, particleEffect } = source;
  const { recipe } = particleEffect;
  if (recipe.renderingMode !== "point" && recipe.renderingMode !== "room") {
    throw new TypeError(`Catalog effect '${effectKey}' is not a particle-stream recipe.`);
  }
  if (!effectKey.trim() || !recipe.family.trim() || recipe.streams.length === 0) {
    throw new TypeError("Catalog particle effects require an effect key, family, and at least one stream.");
  }
  const imageSlotMap = { ...(particleEffect.imageSlots ?? {}) };
  const streams: CatalogMappedStream[] = recipe.streams.map(stream => {
    const textureId = imageSlotMap[stream.textureId];
    if (!textureId) throw new Error(`Catalog effect '${effectKey}' has no image mapping for slot '${stream.textureId}'.`);
    if (stream.colorBinding && stream.colorBinding.control.length === 0) {
      throw new TypeError(`Catalog stream '${stream.id}' has an empty color-binding control.`);
    }
    if (stream.burstCount !== undefined && !stream.surgeOnly) {
      throw new TypeError(`Catalog stream '${stream.id}' may define burstCount only when surgeOnly is true.`);
    }
    const burstCount = stream.surgeOnly ? resolveBurstCount(stream.burstCount) : undefined;
    return { ...stream, ...(burstCount === undefined ? {} : { burstCount }), textureId };
  });
  const adaptedRecipe: CatalogParticleRecipe = { ...recipe, streams };
  const effect: ParticleEffectDefinition = {
    id: effectKey,
    removalDurationMs: recipe.lifecycle?.removalDurationMs,
    streams
  };
  const bindings = Object.fromEntries(streams
    .filter(stream => stream.colorBinding)
    .map(stream => [stream.id, stream.colorBinding!.mode === "role"
      ? stream.colorBinding!.role === "secondary" ? "secondary" : "primary"
      : COLOR_BINDING_MAP[stream.colorBinding!.mode]]));
  const defaultPalette = findPalette(streams);
  const baseStyle = {
    ...effect,
    defaultColor: defaultPalette.primary,
    defaultSmokeColor: findSmokeColor(streams, defaultPalette.primary),
    baseRadiusPx: streams.find(stream => stream.spawn.radiusPx !== undefined)?.spawn.radiusPx ?? 1,
    colorControlStreamIds: streams.filter(stream => stream.colorBinding).map(stream => stream.id),
    flameStreamIds: streams.filter(stream => stream.role === "flame").map(stream => stream.id),
    smokeStreamIds: streams.filter(stream => stream.role === "smoke").map(stream => stream.id),
    emberStreamIds: streams.filter(stream => stream.role === "ember").map(stream => stream.id),
    defaultColors: defaultPalette,
    defaultSmokeColors: findSmokePalette(streams, defaultPalette),
    colorBindings: bindings,
    windBlownStreamIds: streams.filter(stream => stream.isWindBlown).map(stream => stream.id),
    windNudgeFadeOutSeconds: recipe.wind?.nudgeFadeOutSeconds,
    lifetimeControlStreamIds: streams.filter(stream => stream.lifetimeTuningApplicable !== false).map(stream => stream.id)
  };
  if (recipe.renderingMode === "point") return { effectId: effectKey, family: recipe.family, recipe: adaptedRecipe, effect, pointStyle: baseStyle, imageSlotMap };

  const roomStreams = streams.filter(stream => stream.spawn.kind === "room");
  const sizeStreams = roomStreams.length > 0 ? roomStreams : streams;
  const transitionStreams = streams.filter(stream => stream.colorBinding?.mode === "transition");
  const roomStyle: ParticleRoomStyleDefinition = {
    ...baseStyle,
    defaultColors: defaultPalette,
    colorBindings: bindings,
    defaultEmissionRatePerSecond: Math.max(1, roomStreams.reduce((sum, stream) => sum + stream.ratePerSecond, 0)),
    defaultSizePx: Math.max(1, sizeStreams[0]?.startWidthPx ?? 1),
    defaultLifetimeSeconds: Math.max(0.001, roomStreams.length > 0
      ? roomStreams.reduce((sum, stream) => sum + (stream.lifeMinSeconds + stream.lifeMaxSeconds) / 2, 0) / roomStreams.length
      : 1),
    windEdgeFlowStreamIds: streams.filter(stream => stream.windEdgeFlow).map(stream => stream.id),
    windStretchStreamIds: streams.filter(stream => stream.isWindStretched).map(stream => stream.id),
    colorTransitionControlStreamIds: transitionStreams.map(stream => stream.id),
    defaultColorTransitionSeconds: transitionStreams.find(stream => stream.colorTransitionSeconds !== undefined)?.colorTransitionSeconds ?? 1,
    defaultColorTransitionFraction: transitionStreams.find(stream => stream.colorTransitionFraction !== undefined)?.colorTransitionFraction ?? 1,
    windMotionMix: recipe.wind?.motionMix ? {
      ...recipe.wind.motionMix,
      streamIds: streams.filter(stream => stream.windMotionMixEnabled).map(stream => stream.id)
    } : undefined
  };
  return { effectId: effectKey, family: recipe.family, recipe: adaptedRecipe, effect, pointStyle: undefined, roomStyle, imageSlotMap };
}

function findPalette(streams: CatalogMappedStream[]): { primary: string; secondary: string } {
  const transition = streams.find(stream => stream.colorBinding?.mode === "transition");
  return {
    primary: transition?.startColor ?? streams[0]?.startColor ?? "#ffffff",
    secondary: transition?.endColor ?? streams[0]?.endColor ?? streams[0]?.startColor ?? "#ffffff"
  };
}

function findSmokeColor(streams: CatalogMappedStream[], fallback: string): string {
  return streams.find(stream => stream.role === "smoke")?.startColor ?? fallback;
}

function findSmokePalette(streams: CatalogMappedStream[], fallback: { primary: string; secondary: string }): { primary: string; secondary: string } {
  const smoke = streams.find(stream => stream.role === "smoke");
  return smoke ? { primary: smoke.startColor, secondary: smoke.endColor ?? smoke.startColor } : fallback;
}

function validateNonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`);
}

/** Applies sparse controls to a copy of a recipe; omitted fields preserve authored values. */
export function resolveCatalogRecipe(source: CatalogRecipe, tuning: CatalogResolvedTuning = {}): CatalogRecipe {
  const recipe = structuredClone(source) as CatalogRecipe;
  const controls = tuning as Record<string, unknown>;
  const multipliers = ["EmissionRateMultiplier", "LifetimeMultiplier", "SizeMultiplier", "SpawnRadiusMultiplier", "CoverageMultiplier", "OpacityMultiplier", "WindSpeedMultiplier"] as const;
  for (const name of multipliers) if (controls[name] !== undefined) validateNonnegative(controls[name] as number, name);
  for (const name of ["WindDirectionOffsetDegrees", "WindSpeedPxPerSecond", "WindDirectionDegrees", "DirectionDegrees"] as const) {
    const value = controls[name];
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  }
  if (controls.LifetimeMultiplier === 0 || controls.SizeMultiplier === 0) {
    throw new RangeError("LifetimeMultiplier and SizeMultiplier zero values must be omitted before component input.");
  }
  if (recipe.renderingMode === "point" || recipe.renderingMode === "room") {
    recipe.streams = recipe.streams.map(stream => {
      const next = { ...stream, spawn: { ...stream.spawn } as ParticleSpawnShape };
      if (tuning.EmissionRateMultiplier !== undefined) next.ratePerSecond *= tuning.EmissionRateMultiplier;
      if (tuning.LifetimeMultiplier !== undefined && stream.lifetimeTuningApplicable !== false) {
        next.lifeMinSeconds *= tuning.LifetimeMultiplier;
        next.lifeMaxSeconds *= tuning.LifetimeMultiplier;
      }
      if (tuning.SizeMultiplier !== undefined) {
        next.startWidthPx *= tuning.SizeMultiplier;
        next.startHeightPx *= tuning.SizeMultiplier;
        if (next.endWidthPx !== undefined) next.endWidthPx *= tuning.SizeMultiplier;
        if (next.endHeightPx !== undefined) next.endHeightPx *= tuning.SizeMultiplier;
      }
      if (tuning.SpawnRadiusMultiplier !== undefined) {
        if (next.spawn.kind === "point") {
          if (next.spawn.radiusPx !== undefined) next.spawn.radiusPx *= tuning.SpawnRadiusMultiplier;
          if (next.spawn.innerRadiusPx !== undefined) next.spawn.innerRadiusPx *= tuning.SpawnRadiusMultiplier;
        } else if (next.spawn.kind === "rectangle") {
          if (next.spawn.widthPx !== undefined) next.spawn.widthPx *= tuning.SpawnRadiusMultiplier;
          if (next.spawn.heightPx !== undefined) next.spawn.heightPx *= tuning.SpawnRadiusMultiplier;
        }
      }
      if (tuning.Colors && stream.colorBinding?.control === "Colors") {
        if (stream.colorBinding.mode === "transition") {
          next.startColor = tuning.Colors.primary;
          next.endColor = tuning.Colors.secondary;
        } else if (stream.colorBinding.mode === "role") {
          const color = tuning.Colors[stream.colorBinding.role ?? "primary"];
          next.startColor = color;
          next.endColor = color;
        } else if (stream.colorBinding.mode === "flip") {
          next.startColor = tuning.Colors.primary;
          next.endColor = tuning.Colors.secondary;
        }
      }
      return next;
    });
  } else if (recipe.renderingMode === "overlay") {
    if (tuning.CoverageMultiplier !== undefined) recipe.coveragePx *= tuning.CoverageMultiplier;
    if (tuning.OpacityMultiplier !== undefined) recipe.opacity = Math.min(1, recipe.opacity * tuning.OpacityMultiplier);
    if (tuning.Tint !== undefined) recipe.tint = tuning.Tint;
    if (tuning.WindSpeedPxPerSecond !== undefined) recipe.windSpeedPxPerSecond = tuning.WindSpeedPxPerSecond;
    if (tuning.WindDirectionDegrees !== undefined) recipe.windDirectionDegrees = tuning.WindDirectionDegrees;
    if (tuning.WindSpeedMultiplier !== undefined) recipe.windSpeedMultiplier = tuning.WindSpeedMultiplier;
    if (tuning.WindDirectionOffsetDegrees !== undefined) recipe.windDirectionOffsetDegrees = tuning.WindDirectionOffsetDegrees;
  } else {
    if (tuning.SizeMultiplier !== undefined) recipe.sizePx *= tuning.SizeMultiplier;
    if (tuning.OpacityMultiplier !== undefined) recipe.opacity = Math.min(1, recipe.opacity * tuning.OpacityMultiplier);
    if (tuning.Colors !== undefined) recipe.colors = { ...tuning.Colors };
    if (tuning.DirectionDegrees !== undefined) recipe.directionDegrees = tuning.DirectionDegrees;
  }
  return recipe;
}

/** Applies resolved environmental wind and effect-relative controls as one vector. */
export function resolveWindVector(recipe: CatalogRecipe, tuning: CatalogResolvedTuning = {}): { x: number; y: number } {
  const overlay = recipe.renderingMode === "overlay";
  const speed = tuning.WindSpeedPxPerSecond ?? (overlay ? recipe.windSpeedPxPerSecond : 0);
  const direction = tuning.WindDirectionDegrees ?? (overlay ? recipe.windDirectionDegrees : -1);
  const multiplier = tuning.WindSpeedMultiplier ?? (overlay ? recipe.windSpeedMultiplier : 1);
  const offset = tuning.WindDirectionOffsetDegrees ?? (overlay ? recipe.windDirectionOffsetDegrees : 0);
  if (direction === -1 || speed === 0 || multiplier === 0) return { x: 0, y: 0 };
  const radians = (direction + offset) * Math.PI / 180;
  return { x: Math.cos(radians) * speed * multiplier, y: Math.sin(radians) * speed * multiplier };
}

/** Produces exact stream overrides without changing the shared registered recipe. */
export function mapCatalogStreamOverrides(
  authoredSource: CatalogRecipe,
  effectiveSource: CatalogRecipe,
  tuning: CatalogResolvedTuning
): Record<string, import("./contracts.js").ParticleStreamOverrides> {
  if ((authoredSource.renderingMode !== "point" && authoredSource.renderingMode !== "room") ||
      (effectiveSource.renderingMode !== "point" && effectiveSource.renderingMode !== "room")) {
    throw new TypeError("Stream overrides require a point or room catalog recipe.");
  }
  const authored = authoredSource;
  const effective = effectiveSource;
  const wind = resolveWindVector(authored, tuning);
  const windSpeed = Math.hypot(wind.x, wind.y);
  const result: Record<string, import("./contracts.js").ParticleStreamOverrides> = {};
  for (let index = 0; index < authored.streams.length; index++) {
    const source = authored.streams[index];
    const stream = effective.streams[index];
    const override: import("./contracts.js").ParticleStreamOverrides = { ratePerSecond: stream.ratePerSecond };
    if (stream.colorTransitionSeconds !== undefined) override.colorTransitionSeconds = stream.colorTransitionSeconds;
    else if (stream.colorTransitionFraction !== undefined) override.colorTransitionFraction = stream.colorTransitionFraction;
    if (tuning.LifetimeMultiplier !== undefined && source.lifetimeTuningApplicable !== false) {
      // Scaling the sampled authored range is equivalent to scaling both
      // endpoints, and gives active particles a stable multiplier to update.
      override.lifetimeScale = tuning.LifetimeMultiplier;
    }
    if (tuning.SizeMultiplier !== undefined) override.sizeScale = tuning.SizeMultiplier;
    if (tuning.SpawnRadiusMultiplier !== undefined && (source.spawn.kind === "point" || source.spawn.kind === "rectangle")) {
      override.spawnExtentScale = tuning.SpawnRadiusMultiplier;
    }
    if (tuning.Colors && source.colorBinding?.control === "Colors") {
      if (source.colorBinding.mode === "transition" || source.colorBinding.mode === "flip") {
        override.startColor = tuning.Colors.primary;
        override.endColor = tuning.Colors.secondary;
      } else if (source.colorBinding.mode === "role") {
        const color = tuning.Colors[source.colorBinding.role ?? "primary"];
        override.startColor = color;
        override.endColor = color;
      }
    }
    if (source.isWindBlown && windSpeed > 0) {
      override.velocityOffsetXPxPerSecond = wind.x;
      override.velocityOffsetYPxPerSecond = wind.y;
    }
    if (source.isWindStretched && windSpeed > 0) {
      override.windStretchScale = 1 + Math.min(1, windSpeed / 40) * 5;
      override.windStretchRotationRadians = Math.atan2(wind.y, wind.x);
    }
    result[source.id] = override;
  }
  return result;
}

export function mapCatalogControlValues(recipe: CatalogRecipe, tuning: CatalogResolvedTuning): Record<string, unknown> {
  const effective = resolveCatalogRecipe(recipe, tuning);
  if (effective.renderingMode === "point" || effective.renderingMode === "room") {
    return { streams: effective.streams };
  }
  if (effective.renderingMode === "overlay") return {
    coveragePx: effective.coveragePx,
    opacity: effective.opacity,
    tint: effective.tint,
    wind: resolveWindVector(effective, tuning)
  };
  return {
    sizePx: effective.sizePx,
    opacity: effective.opacity,
    colors: effective.colors,
    directionDegrees: effective.directionDegrees
  };
}
