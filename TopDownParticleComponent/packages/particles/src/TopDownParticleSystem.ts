import { Container, Particle, ParticleContainer } from "pixi.js";
import type { Texture } from "pixi.js";
import type {
  ParticleBurstInput,
  ParticleColorBinding,
  ParticleColors,
  ParticleEffectDefinition,
  ParticleEmitterInput,
  ParticleOccluderInput,
  ParticleRoomEmitterInput,
  ParticleRoomGeometry,
  ParticleRoomStyleDefinition,
  ParticleStats,
  ParticleStimulusInput,
  ParticleStyleDefinition,
  ParticleStyledEmitterInput,
  ParticleStreamOverrides,
  TopDownParticleSystemOptions
} from "./contracts.js";
import {
  mixColor,
  normalizeEffect,
  normalizeEmitter,
  normalizeGeometry,
  normalizeOccluder,
  parseHexColor,
  recolorStyleColor
} from "./particle-core.js";
import type { NormalizedEffect, NormalizedEmitter, NormalizedStream } from "./particle-core.js";
import type { RenderOrderCoordinator } from "./RenderOrderCoordinator.js";

interface ParticleSystemRenderOptions {
  renderLayers?: { "pre-light": Container; "post-light": Container };
  orderCoordinator?: RenderOrderCoordinator;
}

interface ParticleGroup {
  key: string;
  container: ParticleContainer<Particle>;
  texture: Texture;
  free: Particle[];
  layer: "pre-light" | "post-light";
  emitterId: string;
  order: number;
  drawOrder: number;
}

interface EmitterState {
  input: NormalizedEmitter;
  remainders: Map<string, number>;
  surgeNextAt: number | null;
  surgeRandomState: number;
  windNudges: Map<string, WindNudgeState>;
  alphaFade?: { from: number; to: number; startedAtSeconds: number; durationSeconds: number };
}

interface WindNudgeState {
  velocityXPxPerSecond: number;
  velocityYPxPerSecond: number;
  startedAtSeconds: number;
  durationSeconds: number;
  fadeOutSeconds: number;
}

interface RegisteredStyle {
  defaultColor: string;
  defaultSmokeColor: string;
  baseRadiusPx: number;
  colorControlStreamIds: Set<string>;
  flameStreamIds: Set<string>;
  smokeStreamIds: Set<string>;
  emberStreamIds: Set<string>;
  defaultColors: ParticleColors;
  defaultSmokeColors: ParticleColors;
  colorBindings: Record<string, ParticleColorBinding>;
  windBlownStreamIds: Set<string>;
  windNudgeFadeOutSeconds: number;
  lifetimeControlStreamIds: Set<string>;
}

interface RegisteredRoomStyle {
  defaultColors: ParticleColors;
  colorBindings: Record<string, ParticleColorBinding>;
  windBlownStreamIds: Set<string>;
  windNudgeFadeOutSeconds: number;
  windEdgeFlowStreamIds: Set<string>;
  windMotionMix?: {
    streamIds: Set<string>;
    maxWindSpeedPxPerSecond: number;
    lowWindSkitterFraction: number;
    highWindSkitterFraction: number;
  };
  flipColorStreamIds: Set<string>;
  windStretchStreamIds: Set<string>;
  colorTransitionControlStreamIds: Set<string>;
  defaultColorTransitionFraction: number;
  defaultEmissionRatePerSecond: number;
  defaultSizePx: number;
  defaultLifetimeSeconds: number;
  defaultColorTransitionSeconds: number;
}

interface LiveParticle {
  visual: Particle;
  group: ParticleGroup;
  stream: NormalizedStream;
  emitterId?: string;
  onDeathStream?: NormalizedStream;
  onDeathOverride?: ParticleStreamOverrides;
  sizeScale: number;
  baseRotationRadians: number;
  windStretchScale: number;
  skitter?: {
    phaseRadians: number;
    frequencyRadiansPerSecond: number;
    lateralAmplitudePx: number;
    directionXPx: number;
    directionYPx: number;
  };
  leafFlip?: { firstFlipAtSeconds: number; periodSeconds: number; durationSeconds: number };
  alphaScale: number;
  startAlpha: number;
  endAlpha: number;
  startColorRgb: number;
  endColorRgb: number;
  colorTransitionFraction: number;
  colorTransitionSeconds?: number;
  xPx: number;
  yPx: number;
  velocityXPxPerSecond: number;
  velocityYPxPerSecond: number;
  windOffsetXPxPerSecond: number;
  windOffsetYPxPerSecond: number;
  orbitCenterXPx?: number;
  orbitCenterYPx?: number;
  orbitRadiusPx?: number;
  orbitAngleRadians?: number;
  orbitAngularSpeedRadiansPerSecond?: number;
  ageSeconds: number;
  lifeSeconds: number;
}

const STEP_SECONDS = 1 / 60;
const MAX_ADVANCE_SECONDS = 0.25;
const MAX_WIND_STRETCH_SCALE = 6;
const WIND_STRETCH_MAX_AT_PX_PER_SECOND = 40;
const WIND_NUDGE_FADE_OUT_SECONDS = 0.35;
const NO_WIND = { x: 0, y: 0 };
const NO_WIND_STREAMS = new Set<string>();

/**
 * Host-driven, room-space particle simulation and Pixi display boundary.
 * The host renders preLight into its unlit room surface, runs lighting, then
 * renders postLight over the composed result. This class never renders a frame
 * or owns the host's renderer and borrowed textures.
 */
export class TopDownParticleSystem {
  readonly preLight: Container;
  readonly postLight: Container;

  private readonly textures: Record<string, Texture>;
  private readonly maxParticles: number;
  private readonly initialSeed: number;
  private readonly ownsRenderLayers: boolean;
  private readonly orderCoordinator?: RenderOrderCoordinator;
  private randomState: number;
  private geometry: ParticleRoomGeometry | null = null;
  private readonly effects = new Map<string, NormalizedEffect>();
  private readonly styles = new Map<string, RegisteredStyle>();
  private readonly roomStyles = new Map<string, RegisteredRoomStyle>();
  private readonly emitters = new Map<string, EmitterState>();
  private readonly groups = new Map<string, ParticleGroup>();
  private readonly live: LiveParticle[] = [];
  private occluders: ParticleOccluderInput[] = [];
  private readonly seenEventIds = new Set<string>();
  private lastTimeSeconds: number | null = null;
  private timeRemainderSeconds = 0;
  private simulationTimeSeconds = 0;
  private emittedParticles = 0;
  private droppedParticles = 0;
  private disposed = false;

  constructor(options: TopDownParticleSystemOptions & ParticleSystemRenderOptions) {
    this.ownsRenderLayers = options.renderLayers === undefined;
    this.preLight = options.renderLayers?.["pre-light"] ?? new Container();
    this.postLight = options.renderLayers?.["post-light"] ?? new Container();
    this.orderCoordinator = options.orderCoordinator;
    this.textures = { ...options.textures };
    this.preLight.sortableChildren = true;
    this.postLight.sortableChildren = true;
    this.maxParticles = Math.max(1, Math.floor(options.maxParticles ?? 4000));
    if (!Number.isFinite(this.maxParticles)) throw new RangeError("maxParticles must be finite.");
    this.initialSeed = (options.seed ?? 1) >>> 0;
    this.randomState = this.initialSeed;
  }

  setRoomGeometry(geometry: ParticleRoomGeometry): void {
    this.assertActive();
    const next = normalizeGeometry(geometry);
    this.clear();
    this.geometry = next;
  }

  registerEffect(effect: ParticleEffectDefinition): void {
    this.assertActive();
    const normalized = normalizeEffect(effect);
    for (const stream of normalized.streams) {
      if (!this.textures[stream.textureId]) {
        throw new Error(`Missing texture '${stream.textureId}' for stream '${stream.id}'.`);
      }
    }
    this.effects.set(normalized.id, normalized);
    this.styles.delete(normalized.id);
    this.roomStyles.delete(normalized.id);
  }

  registerStyle(style: ParticleStyleDefinition, imageSlotOverrides?: Record<string, Texture>): void {
    this.assertActive();
    style = this.withScopedImages(style, imageSlotOverrides);
    parseHexColor(style.defaultColor);
    parseHexColor(style.defaultSmokeColor);
    if (!Number.isFinite(style.baseRadiusPx) || style.baseRadiusPx <= 0) {
      throw new RangeError("Style baseRadiusPx must be positive and finite.");
    }
    const streamIds = new Set(style.streams.map(stream => stream.id));
    const roleIds = (ids: string[], name: string): Set<string> => {
      if (!Array.isArray(ids)) throw new TypeError(`Style ${name} must be an array.`);
      const result = new Set(ids);
      for (const id of result) if (!streamIds.has(id)) throw new Error(`Unknown ${name} stream '${id}'.`);
      return result;
    };
    const colorControlStreamIds = roleIds(style.colorControlStreamIds, "colorControlStreamIds");
    const flameStreamIds = roleIds(style.flameStreamIds, "flameStreamIds");
    const smokeStreamIds = roleIds(style.smokeStreamIds, "smokeStreamIds");
    const emberStreamIds = roleIds(style.emberStreamIds, "emberStreamIds");
    const windBlownStreamIds = roleIds(style.windBlownStreamIds ?? [], "windBlownStreamIds");
    const lifetimeControlStreamIds = roleIds(style.lifetimeControlStreamIds ?? [...streamIds], "lifetimeControlStreamIds");
    const windNudgeFadeOutSeconds = style.windNudgeFadeOutSeconds ?? WIND_NUDGE_FADE_OUT_SECONDS;
    if (!Number.isFinite(windNudgeFadeOutSeconds) || windNudgeFadeOutSeconds < 0) {
      throw new RangeError("Style windNudgeFadeOutSeconds must be nonnegative and finite.");
    }
    const defaultColors = style.defaultColors ?? { primary: style.defaultColor, secondary: style.defaultColor };
    const defaultSmokeColors = style.defaultSmokeColors ?? { primary: style.defaultSmokeColor, secondary: style.defaultSmokeColor };
    for (const color of [defaultColors.primary, defaultColors.secondary, defaultSmokeColors.primary, defaultSmokeColors.secondary]) {
      parseHexColor(color);
    }
    if (style.defaultTipColor !== undefined) parseHexColor(style.defaultTipColor);
    this.validateColorBindings(style.colorBindings ?? {}, streamIds);
    if (Object.values(style.colorBindings ?? {}).includes("flip")) {
      throw new TypeError("Flip color bindings are only supported by room styles.");
    }
    this.registerEffect(style);
    this.styles.set(style.id.trim(), {
      defaultColor: style.defaultColor,
      defaultSmokeColor: style.defaultSmokeColor,
      baseRadiusPx: style.baseRadiusPx,
      colorControlStreamIds,
      flameStreamIds,
      smokeStreamIds,
      emberStreamIds,
      windBlownStreamIds,
      lifetimeControlStreamIds,
      defaultColors,
      defaultSmokeColors,
      colorBindings: { ...style.colorBindings },
      windNudgeFadeOutSeconds
    });
  }

  registerRoomStyle(style: ParticleRoomStyleDefinition, imageSlotOverrides?: Record<string, Texture>): void {
    this.assertActive();
    style = this.withScopedImages(style, imageSlotOverrides);
    parseHexColor(style.defaultColors.primary);
    parseHexColor(style.defaultColors.secondary);
    const streamIds = new Set(style.streams.map(stream => stream.id));
    this.validateColorBindings(style.colorBindings, streamIds);
    for (const id of streamIds) {
      if (!style.colorBindings[id]) throw new Error(`Missing color binding for room stream '${id}'.`);
    }
    const windBlownStreamIds = new Set(style.windBlownStreamIds ?? []);
    const windNudgeFadeOutSeconds = style.windNudgeFadeOutSeconds ?? WIND_NUDGE_FADE_OUT_SECONDS;
    if (!Number.isFinite(windNudgeFadeOutSeconds) || windNudgeFadeOutSeconds < 0) {
      throw new RangeError("Room style windNudgeFadeOutSeconds must be nonnegative and finite.");
    }
    const windEdgeFlowStreamIds = new Set(style.windEdgeFlowStreamIds ?? []);
    const windStretchStreamIds = new Set(style.windStretchStreamIds ?? []);
    const colorTransitionControlStreamIds = new Set(style.colorTransitionControlStreamIds ?? []);
    const flipColorStreamIds = new Set(Object.entries(style.colorBindings)
      .filter(([, binding]) => binding === "flip")
      .map(([streamId]) => streamId));
    for (const id of [...windBlownStreamIds, ...windEdgeFlowStreamIds, ...windStretchStreamIds, ...colorTransitionControlStreamIds]) {
      if (!streamIds.has(id)) throw new Error(`Unknown room style stream '${id}'.`);
    }
    for (const id of windEdgeFlowStreamIds) {
      if (!windBlownStreamIds.has(id)) throw new Error(`Edge-flow stream '${id}' must respond to wind.`);
      const stream = style.streams.find(candidate => candidate.id === id);
      if (!stream || stream.spawn.kind !== "room") {
        throw new Error(`Edge-flow stream '${id}' must spawn across room geometry.`);
      }
    }
    let windMotionMix: RegisteredRoomStyle["windMotionMix"];
    if (style.windMotionMix) {
      const motionStreamIds = new Set(style.windMotionMix.streamIds);
      if (motionStreamIds.size === 0) throw new Error("windMotionMix requires at least one stream.");
      for (const id of motionStreamIds) {
        if (!windEdgeFlowStreamIds.has(id)) throw new Error(`Wind motion mix stream '${id}' must use edge flow.`);
      }
      if (!Number.isFinite(style.windMotionMix.maxWindSpeedPxPerSecond) || style.windMotionMix.maxWindSpeedPxPerSecond <= 0) {
        throw new RangeError("windMotionMix maxWindSpeedPxPerSecond must be positive and finite.");
      }
      for (const [name, fraction] of [
        ["lowWindSkitterFraction", style.windMotionMix.lowWindSkitterFraction],
        ["highWindSkitterFraction", style.windMotionMix.highWindSkitterFraction]
      ] as const) {
        if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
          throw new RangeError(`windMotionMix ${name} must be in 0..1.`);
        }
      }
      windMotionMix = {
        streamIds: motionStreamIds,
        maxWindSpeedPxPerSecond: style.windMotionMix.maxWindSpeedPxPerSecond,
        lowWindSkitterFraction: style.windMotionMix.lowWindSkitterFraction,
        highWindSkitterFraction: style.windMotionMix.highWindSkitterFraction
      };
    }
    for (const id of colorTransitionControlStreamIds) {
      if (style.colorBindings[id] !== "transition") throw new Error(`Temporal room stream '${id}' must use transition colors.`);
    }
    const fraction = style.defaultColorTransitionFraction ?? 1;
    this.validateColorTransitionFraction(fraction);
    const roomStreams = style.streams.filter(stream => stream.spawn.kind === "room");
    const sizeStreams = roomStreams.length ? roomStreams : style.streams;
    const defaultEmissionRatePerSecond = this.positiveSetting(style.defaultEmissionRatePerSecond ?? Math.max(1, roomStreams.reduce((sum, stream) => sum + stream.ratePerSecond, 0)), "defaultEmissionRatePerSecond");
    const defaultSizePx = this.positiveSetting(style.defaultSizePx ?? sizeStreams.reduce((sum, stream) => sum + stream.startWidthPx, 0) / sizeStreams.length, "defaultSizePx");
    const defaultLifetimeSeconds = this.positiveSetting(style.defaultLifetimeSeconds ?? sizeStreams.reduce((sum, stream) => sum + (stream.lifeMinSeconds + stream.lifeMaxSeconds) / 2, 0) / sizeStreams.length, "defaultLifetimeSeconds");
    const defaultColorTransitionSeconds = style.defaultColorTransitionSeconds ?? defaultLifetimeSeconds * fraction;
    if (!Number.isFinite(defaultColorTransitionSeconds) || defaultColorTransitionSeconds < 0) {
      throw new RangeError("defaultColorTransitionSeconds must be nonnegative and finite.");
    }
    this.registerEffect(style);
    this.roomStyles.set(style.id.trim(), {
      defaultColors: { ...style.defaultColors },
      colorBindings: { ...style.colorBindings },
      windBlownStreamIds,
      windNudgeFadeOutSeconds,
      windEdgeFlowStreamIds,
      windMotionMix,
      flipColorStreamIds,
      windStretchStreamIds,
      colorTransitionControlStreamIds,
      defaultColorTransitionFraction: fraction,
      defaultEmissionRatePerSecond, defaultSizePx, defaultLifetimeSeconds, defaultColorTransitionSeconds
    });
  }

  upsertRoomEmitter(input: ParticleRoomEmitterInput): void {
    this.assertActive();
    const style = this.roomStyles.get(input.style);
    const effect = this.effects.get(input.style);
    if (!style || !effect) throw new Error(`Unknown room particle style '${input.style}'.`);
    const colors = input.colors ?? [style.defaultColors.primary, style.defaultColors.secondary];
    this.validateColorPalette(colors, "colors");
    if (input.streamColors !== undefined) {
      if (!input.streamColors || typeof input.streamColors !== "object" || Array.isArray(input.streamColors)) {
        throw new TypeError("streamColors must be a stream ID to ordered palette map.");
      }
      const streamIds = new Set(effect.streams.map(stream => stream.id));
      for (const [streamId, streamColors] of Object.entries(input.streamColors)) {
        if (!streamIds.has(streamId)) throw new Error(`Unknown room stream colors '${streamId}'.`);
        this.validateColorPalette(streamColors, `streamColors.${streamId}`);
      }
    }
    if (input.streamSizesPx !== undefined) {
      if (!input.streamSizesPx || typeof input.streamSizesPx !== "object" || Array.isArray(input.streamSizesPx)) {
        throw new TypeError("streamSizesPx must be a stream ID to pixel size map.");
      }
      const streamIds = new Set(effect.streams.map(stream => stream.id));
      for (const [streamId, sizePx] of Object.entries(input.streamSizesPx)) {
        if (!streamIds.has(streamId)) throw new Error(`Unknown room stream size '${streamId}'.`);
        if (!Number.isFinite(sizePx) || sizePx <= 0) {
          throw new RangeError(`Room stream size '${streamId}' must be positive and finite.`);
        }
      }
    }
    const densityScale = input.densityScale ?? 1;
    const sizeScale = input.sizePx === undefined ? (input.sizeScale ?? 1) : input.sizePx / style.defaultSizePx;
    const rateScale = input.emissionRatePerSecond === undefined ? densityScale : input.emissionRatePerSecond / style.defaultEmissionRatePerSecond;
    for (const [name, value] of [["densityScale", densityScale], ["sizeScale", sizeScale]] as const) {
      if (!Number.isFinite(value) || value < 0 || (name !== "densityScale" && value === 0)) {
        throw new RangeError(`${name} must be ${name === "densityScale" ? "nonnegative" : "positive"} and finite.`);
      }
    }
    const fraction = input.colorTransitionFraction ?? style.defaultColorTransitionFraction;
    const transitionSeconds = input.colorTransitionSeconds ?? style.defaultColorTransitionSeconds;
    if (!Number.isFinite(transitionSeconds) || transitionSeconds < 0) throw new RangeError("colorTransitionSeconds must be nonnegative and finite.");
    this.validateColorTransitionFraction(fraction);
    if (input.layer !== undefined && input.layer !== "style-default" && input.layer !== "pre-light" && input.layer !== "post-light") {
      throw new TypeError("Room style layer must be style-default, pre-light, or post-light.");
    }
    const windX = input.windXPxPerSecond ?? 0;
    const windY = input.windYPxPerSecond ?? 0;
    if (!Number.isFinite(windX) || !Number.isFinite(windY)) throw new RangeError("Room wind must be finite.");
    const windStrength = Math.hypot(windX, windY);
    const windStretchScale = 1 + Math.min(1, windStrength / WIND_STRETCH_MAX_AT_PX_PER_SECOND) * (MAX_WIND_STRETCH_SCALE - 1);
    const streamOverrides: Record<string, ParticleStreamOverrides> = {};
    for (const stream of effect.streams) {
      const override: ParticleStreamOverrides = {
        ratePerSecond: stream.ratePerSecond * rateScale,
        sizeScale: input.streamSizesPx?.[stream.id] === undefined
          ? sizeScale
          : input.streamSizesPx[stream.id] / stream.startWidthPx,
        lifetimeSeconds: stream.spawn.kind === "room" ? input.lifetimeSeconds : undefined,
        ...this.mapStyleColors(stream, style.colorBindings[stream.id], style.defaultColors, input.streamColors?.[stream.id] ?? colors)
      };
      if (style.windEdgeFlowStreamIds.has(stream.id)) {
        // Crossing time is computed from room dimensions and particle velocity.
        // No leaves are introduced in a calm room with no defined flow direction.
        override.lifetimeSeconds = undefined;
        if (windStrength === 0) override.ratePerSecond = 0;
      }
      if (style.windBlownStreamIds.has(stream.id)) {
        override.velocityOffsetXPxPerSecond = windX;
        override.velocityOffsetYPxPerSecond = windY;
      }
      if (style.windStretchStreamIds.has(stream.id)) {
        override.windStretchScale = windStretchScale;
        if (windStrength > 0) override.windStretchRotationRadians = Math.atan2(windY, windX);
      }
      if (style.colorTransitionControlStreamIds.has(stream.id)) {
        override.colorTransitionFraction = input.colorTransitionSeconds === undefined ? fraction : undefined;
        if (input.colorTransitionSeconds !== undefined) override.colorTransitionSeconds = transitionSeconds;
      }
      if (input.streamOverrides?.[stream.id]) Object.assign(override, input.streamOverrides[stream.id]);
      if (style.windEdgeFlowStreamIds.has(stream.id) && windStrength === 0) override.ratePerSecond = 0;
      if (input.layer && input.layer !== "style-default") override.layer = input.layer;
      streamOverrides[stream.id] = override;
    }
    this.upsertEmitter({ id: input.id, effectId: input.style, xPx: 0, yPx: 0, active: input.active, surge: input.surge,
        colorChangeMode: input.colorChangeMode, order: input.order, streamOverrides });
  }

  upsertStyledEmitter(input: ParticleStyledEmitterInput): void {
    this.assertActive();
    const style = this.styles.get(input.style);
    const effect = this.effects.get(input.style);
    if (!style || !effect) throw new Error(`Unknown particle style '${input.style}'.`);
    const color = input.color ?? style.defaultColor;
    parseHexColor(color);
    const sizeScale = input.sizeScale ?? 1;
    const speedScale = input.speedScale ?? 1;
    const smokeAmount = input.smokeAmount ?? 1;
    const smokeSizeScale = input.smokeSizeScale ?? 1;
    const smokeColor = input.smokeColor ?? style.defaultSmokeColor;
    const clearRadiusPx = input.clearRadiusPx ?? 0;
    const windDirectionDegrees = input.windDirectionDegrees ?? 0;
    const windStrengthPxPerSecond = input.windStrengthPxPerSecond ?? 0;
    parseHexColor(smokeColor);
    if (input.colors) this.validateColorPalette(input.colors, "colors");
    if (input.colorTransitionFraction !== undefined) this.validateColorTransitionFraction(input.colorTransitionFraction);
    const streamGroup = input.streamGroup ?? "all";
    if (streamGroup !== "all" && streamGroup !== "flame" && streamGroup !== "smoke") {
      throw new TypeError("Style streamGroup must be all, flame, or smoke.");
    }
    if (streamGroup !== "smoke" && (clearRadiusPx > 0 || windStrengthPxPerSecond > 0)) {
      throw new TypeError("Smoke clear radius and wind require streamGroup 'smoke'.");
    }
    if (!Number.isFinite(sizeScale) || sizeScale <= 0) throw new RangeError("Style sizeScale must be positive and finite.");
    if (!Number.isFinite(speedScale) || speedScale <= 0) throw new RangeError("Style speedScale must be positive and finite.");
    if (!Number.isFinite(smokeAmount) || smokeAmount < 0) throw new RangeError("Style smokeAmount must be nonnegative and finite.");
    if (!Number.isFinite(smokeSizeScale) || smokeSizeScale <= 0) throw new RangeError("Style smokeSizeScale must be positive and finite.");
    if (!Number.isFinite(clearRadiusPx) || clearRadiusPx < 0) throw new RangeError("Style clearRadiusPx must be nonnegative and finite.");
    if (!Number.isFinite(windDirectionDegrees) || windDirectionDegrees < 0 || windDirectionDegrees >= 360) {
      throw new RangeError("Style windDirectionDegrees must be in 0..359.");
    }
    if (!Number.isFinite(windStrengthPxPerSecond) || windStrengthPxPerSecond < 0) {
      throw new RangeError("Style windStrengthPxPerSecond must be nonnegative and finite.");
    }
    const selectedGroupIds = streamGroup === "smoke" ? style.smokeStreamIds
      : streamGroup === "flame" ? new Set([...style.flameStreamIds, ...style.emberStreamIds])
      : new Set(effect.streams.map(stream => stream.id));
    for (const streamId of Object.keys(input.streamOverrides ?? {})) {
      if (!effect.streams.some(stream => stream.id === streamId)) {
        throw new Error(`Unknown stream override '${streamId}' for style '${input.style}'.`);
      }
    }
    const sizeReferenceStreams = streamGroup === "smoke"
      ? effect.streams.filter(stream => style.smokeStreamIds.has(stream.id))
      : streamGroup === "flame" ? effect.streams.filter(stream => style.flameStreamIds.has(stream.id))
      : effect.streams;
    const radiusReferencePx = streamGroup === "smoke"
      ? effect.streams.find(stream => style.smokeStreamIds.has(stream.id))?.spawn.radiusPx ?? style.baseRadiusPx
      : style.baseRadiusPx;
    const radiusPx = input.radiusPx ?? radiusReferencePx;
    if (!Number.isFinite(radiusPx) || radiusPx < 0) throw new RangeError("Style radiusPx must be nonnegative and finite.");
    const sizeReferencePx = sizeReferenceStreams[0]?.startWidthPx ?? style.baseRadiusPx;
    const sizePxScale = input.sizePx === undefined ? sizeScale : input.sizePx / sizeReferencePx;
    const radiusScale = radiusPx / (radiusReferencePx > 0 ? radiusReferencePx : style.baseRadiusPx);
    const windRadians = windDirectionDegrees * Math.PI / 180;
    const windX = Math.cos(windRadians) * windStrengthPxPerSecond;
    const windY = Math.sin(windRadians) * windStrengthPxPerSecond;
    const directionDegrees = input.directionDegrees ?? 0;
    const directionStrength = input.directionStrengthPxPerSecond ?? 0;
    if (!Number.isFinite(directionDegrees) || directionDegrees < 0 || directionDegrees >= 360) {
      throw new RangeError("Style directionDegrees must be in 0..359.");
    }
    if (!Number.isFinite(directionStrength) || directionStrength < 0) {
      throw new RangeError("Style directionStrengthPxPerSecond must be nonnegative and finite.");
    }
    const directionRadians = directionDegrees * Math.PI / 180;
    const directionX = Math.cos(directionRadians) * directionStrength;
    const directionY = Math.sin(directionRadians) * directionStrength;
    for (const layer of [input.flameLayer, input.smokeLayer, input.embersLayer]) {
      if (layer !== undefined && layer !== "pre-light" && layer !== "post-light") {
        throw new TypeError("Style layer must be pre-light or post-light.");
      }
    }
    if (input.layer !== undefined && input.layer !== "pre-light" && input.layer !== "post-light") {
      throw new TypeError("Style layer must be pre-light or post-light.");
    }
    const streamOverrides: Record<string, ParticleStreamOverrides> = {};
    for (const stream of effect.streams) {
      const override: ParticleStreamOverrides = {
        ratePerSecond: stream.ratePerSecond * speedScale,
        sizeScale: input.sizePx === undefined ? sizeScale : sizePxScale,
        radiusScale,
        speedScale
      };
      if (color.toLowerCase() !== style.defaultColor.toLowerCase() && style.colorControlStreamIds.has(stream.id)) {
        override.startColor = recolorStyleColor(stream.startColor, style.defaultColor, color);
        override.endColor = recolorStyleColor(stream.endColor, style.defaultColor, color);
      }
      if (style.flameStreamIds.has(stream.id)) override.layer = input.flameLayer;
      if (style.emberStreamIds.has(stream.id)) override.layer = input.embersLayer;
      if (style.smokeStreamIds.has(stream.id)) {
        const streamOuterRadiusPx = (stream.spawn.radiusPx ?? 0) * radiusScale;
        const effectiveClearRadiusPx = input.clearRadiusPx ?? (stream.spawn.innerRadiusPx ?? 0) * radiusScale;
        if (effectiveClearRadiusPx > streamOuterRadiusPx) {
          throw new RangeError("Style clearRadiusPx must not exceed the smoke emitter spread radius.");
        }
        if (input.clearRadiusPx !== undefined) override.innerRadiusPx = input.clearRadiusPx;
        override.ratePerSecond = stream.ratePerSecond * speedScale * smokeAmount;
        override.sizeScale = sizeScale * smokeSizeScale;
        override.layer = input.smokeLayer;
        override.velocityOffsetXPxPerSecond = windX;
        override.velocityOffsetYPxPerSecond = windY;
        if (smokeColor.toLowerCase() !== style.defaultSmokeColor.toLowerCase()) {
          override.startColor = recolorStyleColor(stream.startColor, style.defaultSmokeColor, smokeColor);
          override.endColor = recolorStyleColor(stream.endColor, style.defaultSmokeColor, smokeColor);
        }
      }
      if (input.layer !== undefined) override.layer = input.layer;
      if (directionStrength > 0) {
        override.velocityOffsetXPxPerSecond = (override.velocityOffsetXPxPerSecond ?? 0) + directionX;
        override.velocityOffsetYPxPerSecond = (override.velocityOffsetYPxPerSecond ?? 0) + directionY;
      }
      if (input.colors) {
        const defaults = style.smokeStreamIds.has(stream.id) ? style.defaultSmokeColors : style.defaultColors;
        Object.assign(override, this.mapStyleColors(stream, style.colorBindings[stream.id] ?? "transition", defaults, input.colors));
      }
      if (input.emissionRatePerSecond !== undefined && selectedGroupIds.has(stream.id)) {
        const baseGroupRate = effect.streams.filter(candidate => selectedGroupIds.has(candidate.id)).reduce((sum, candidate) => sum + candidate.ratePerSecond, 0);
        const selectedStreamCount = effect.streams.filter(candidate => selectedGroupIds.has(candidate.id)).length;
        const relative = baseGroupRate > 0 ? input.emissionRatePerSecond / baseGroupRate : 0;
        override.ratePerSecond = baseGroupRate > 0
          ? stream.ratePerSecond * relative
          : input.emissionRatePerSecond / Math.max(1, selectedStreamCount);
      }
      if (input.lifetimeSeconds !== undefined && style.lifetimeControlStreamIds.has(stream.id)) {
        override.lifetimeScale = input.lifetimeSeconds / Math.max(0.01, (stream.lifeMinSeconds + stream.lifeMaxSeconds) / 2);
      }
      if (input.colorTransitionSeconds !== undefined && (style.colorBindings[stream.id] ?? "transition") === "transition") {
        override.colorTransitionSeconds = input.colorTransitionSeconds;
      }
      if (input.colorTransitionFraction !== undefined &&
          (style.colorBindings[stream.id] ?? "transition") === "transition") {
        override.colorTransitionFraction = input.colorTransitionFraction;
      }
      const advancedOverride = input.streamOverrides?.[stream.id];
      if (advancedOverride && selectedGroupIds.has(stream.id)) {
        Object.assign(override, advancedOverride);
        if ((advancedOverride.lifeMinSeconds !== undefined || advancedOverride.lifeMaxSeconds !== undefined) &&
            advancedOverride.lifetimeScale === undefined) {
          // Explicit endpoints replace the shared lifetime scale derived from the simple Fire control.
          delete override.lifetimeScale;
        }
      }
      if ((streamGroup === "flame" && !style.flameStreamIds.has(stream.id) && !style.emberStreamIds.has(stream.id)) ||
          (streamGroup === "smoke" && !style.smokeStreamIds.has(stream.id))) {
        // Keep group isolation last so advanced settings can never reactivate another group.
        override.ratePerSecond = 0;
      }
      streamOverrides[stream.id] = override;
    }
    this.upsertEmitter({
      id: input.id,
      effectId: input.style,
      xPx: input.xPx,
      yPx: input.yPx,
      active: input.active,
      order: input.order,
      surge: input.surge,
      colorChangeMode: input.colorChangeMode,
      streamOverrides
    });
  }

  upsertEmitter(input: ParticleEmitterInput): void {
    this.assertActive();
    const normalized = normalizeEmitter(input);
    const effect = this.effects.get(normalized.effectId);
    if (!effect) throw new Error(`Unknown particle effect '${normalized.effectId}'.`);
    for (const stream of effect.streams) {
      const override = normalized.streamOverrides[stream.id];
      const lifetimeMin = override?.lifeMinSeconds ?? stream.lifeMinSeconds;
      const lifetimeMax = override?.lifeMaxSeconds ?? stream.lifeMaxSeconds;
      if (lifetimeMax < lifetimeMin) {
        throw new RangeError(`Stream '${stream.id}' lifetime maximum must be at least its minimum.`);
      }
      if (override?.innerRadiusPx !== undefined) {
        if (stream.spawn.kind !== "point") throw new TypeError("innerRadiusPx only applies to point-spawn streams.");
        const outerRadiusPx = (stream.spawn.radiusPx ?? 0) * (override.radiusScale ?? 1);
        if (override.innerRadiusPx > outerRadiusPx) {
          throw new RangeError("innerRadiusPx must not exceed the point-spawn radius.");
        }
      }
    }
    const previous = this.emitters.get(normalized.id);
    const alphaFade = previous?.alphaFade;
    let nextAlphaFade = alphaFade;
    if (previous && previous.input.active !== normalized.active) {
      const removalDurationMs = effect.removalDurationMs;
      const from = this.emitterAlpha(previous, this.simulationTimeSeconds);
      if (!normalized.active && removalDurationMs === 0) {
        this.removeEmitterParticles(normalized.id);
        nextAlphaFade = undefined;
      } else if (removalDurationMs !== undefined && removalDurationMs !== null && removalDurationMs > 0) {
        nextAlphaFade = {
          from,
          to: normalized.active ? 1 : 0,
          startedAtSeconds: this.simulationTimeSeconds,
          durationSeconds: removalDurationMs / 1000
        };
      } else {
        nextAlphaFade = undefined;
      }
    }
    const keepSurge = previous?.input.effectId === normalized.effectId &&
      JSON.stringify(previous.input.surge) === JSON.stringify(normalized.surge);
    this.emitters.set(normalized.id, {
      input: normalized,
      remainders: previous?.input.effectId === normalized.effectId ? previous.remainders : new Map(),
      surgeNextAt: keepSurge ? previous!.surgeNextAt : null,
      surgeRandomState: keepSurge ? previous!.surgeRandomState : (normalized.surge?.seed ?? this.initialSeed) ^ this.hash(normalized.id),
      windNudges: previous?.input.effectId === normalized.effectId ? previous.windNudges : new Map(),
      alphaFade: nextAlphaFade
    });
    this.refreshParticleOrder();
    if (previous && previous.input.effectId === normalized.effectId && normalized.active) {
      for (const particle of this.live) {
        if (particle.emitterId !== normalized.id) continue;
        const streamId = particle.stream.id;
        const previousOverride = previous.input.streamOverrides[streamId];
        const nextOverride = normalized.streamOverrides[streamId];
        if (particle.onDeathStream) {
          particle.onDeathOverride = normalized.streamOverrides[particle.onDeathStream.id];
        }
        particle.sizeScale = nextOverride?.sizeScale ?? 1;
        const previousLifetimeScale = previousOverride?.lifetimeScale ?? 1;
        const nextLifetimeScale = nextOverride?.lifetimeScale ?? 1;
        if (previousLifetimeScale !== nextLifetimeScale) {
          particle.lifeSeconds *= nextLifetimeScale / previousLifetimeScale;
        }
        const nextWindOffsetX = nextOverride?.velocityOffsetXPxPerSecond ?? 0;
        const nextWindOffsetY = nextOverride?.velocityOffsetYPxPerSecond ?? 0;
        particle.velocityXPxPerSecond += nextWindOffsetX - particle.windOffsetXPxPerSecond;
        particle.velocityYPxPerSecond += nextWindOffsetY - particle.windOffsetYPxPerSecond;
        particle.windOffsetXPxPerSecond = nextWindOffsetX;
        particle.windOffsetYPxPerSecond = nextWindOffsetY;
        particle.windStretchScale = nextOverride?.windStretchScale ?? 1;
        particle.visual.rotation = nextOverride?.windStretchRotationRadians ?? particle.baseRotationRadians;
        this.updateVisual(particle);
      }
    }
    if (previous && previous.input.effectId === normalized.effectId && normalized.colorChangeMode === "retint") {
      const streams = new Map(effect.streams.map(stream => [stream.id, stream]));
      for (const particle of this.live) {
        if (particle.emitterId !== normalized.id) continue;
        const stream = streams.get(particle.stream.id);
        if (!stream) continue;
        const override = normalized.streamOverrides[stream.id];
        const nextStart = override?.startColor ? parseHexColor(override.startColor) : stream.startColorRgb;
        const nextEnd = override?.endColor ? parseHexColor(override.endColor) : stream.endColorRgb;
        if (nextStart === particle.startColorRgb && nextEnd === particle.endColorRgb) continue;
        particle.startColorRgb = nextStart;
        particle.endColorRgb = nextEnd;
        this.updateVisual(particle);
      }
    }
  }

  removeEmitter(id: string): void {
    this.assertActive();
    const emitter = this.emitters.get(id);
    if (!emitter) return;
    const effect = this.effects.get(emitter.input.effectId);
    const durationMs = effect?.removalDurationMs;
    if (durationMs === 0) {
      this.removeEmitterParticles(id);
      this.emitters.delete(id);
      this.releaseUnusedGroups(id);
      return;
    }
    if (durationMs !== undefined && durationMs !== null && durationMs > 0) {
      const from = this.emitterAlpha(emitter, this.simulationTimeSeconds);
      emitter.alphaFade = { from, to: 0, startedAtSeconds: this.simulationTimeSeconds, durationSeconds: durationMs / 1000 };
      emitter.input = { ...emitter.input, active: false };
      return;
    }
    this.emitters.delete(id);
    this.releaseUnusedGroups(id);
  }

  setOccluders(occluders: ParticleOccluderInput[]): void {
    this.assertActive();
    this.occluders = occluders.map(normalizeOccluder);
    for (const particle of this.live) this.updateVisual(particle);
  }

  emitBurst(input: ParticleBurstInput): void {
    this.assertReady();
    if (typeof input.id !== "string" || input.id.trim().length === 0) throw new TypeError("Burst ID is required.");
    if (this.seenEventIds.has(input.id)) return;
    const effect = this.effects.get(input.effectId);
    if (!effect) throw new Error(`Unknown particle effect '${input.effectId}'.`);
    if (!Number.isFinite(input.xPx) || !Number.isFinite(input.yPx)) throw new RangeError("Burst position must be finite.");
    if (!Number.isInteger(input.count) || input.count < 0 || input.count > this.maxParticles) {
      throw new RangeError("Burst count must be a nonnegative integer within maxParticles.");
    }
    const streams = input.streamId ? effect.streams.filter(stream => stream.id === input.streamId) : effect.streams;
    if (streams.length === 0) throw new Error(`Unknown stream '${input.streamId}'.`);
    this.seenEventIds.add(input.id);
    for (const stream of streams) {
      const followUp = effect.streams.find(candidate => candidate.id === stream.onDeathStreamId);
      const override = input.streamOverrides?.[stream.id];
      const followUpOverride = followUp ? input.streamOverrides?.[followUp.id] : undefined;
      for (let i = 0; i < input.count; i++) {
        this.spawn(stream, input.xPx, input.yPx, override, followUp, followUpOverride);
      }
    }
  }

  /** Delivers a reusable event to an active effect instance. */
  sendStimulus(input: ParticleStimulusInput): void {
    this.assertReady();
    if (typeof input.id !== "string" || input.id.trim().length === 0) throw new TypeError("Stimulus ID is required.");
    if (this.seenEventIds.has(input.id)) return;
    if (typeof input.emitterId !== "string" || input.emitterId.trim().length === 0) {
      throw new TypeError("Stimulus emitterId is required.");
    }
    const emitter = this.emitters.get(input.emitterId);
    if (!emitter) throw new Error(`Unknown particle emitter '${input.emitterId}'.`);
    if (!emitter.input.active) throw new Error(`Cannot stimulate inactive particle emitter '${input.emitterId}'.`);
    const effect = this.effects.get(emitter.input.effectId);
    if (!effect) throw new Error(`Unknown particle effect '${emitter.input.effectId}'.`);

    if (input.kind === "burst") {
      const count = input.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > this.maxParticles) {
        throw new RangeError("Stimulus burst count must be a positive integer within maxParticles.");
      }
      const xPx = input.xPx ?? emitter.input.xPx;
      const yPx = input.yPx ?? emitter.input.yPx;
      if (!Number.isFinite(xPx) || !Number.isFinite(yPx)) throw new RangeError("Stimulus position must be finite.");
      const directionDegrees = input.directionDegrees ?? 0;
      const speedPxPerSecond = input.speedPxPerSecond ?? 0;
      if (!Number.isFinite(directionDegrees) || directionDegrees < 0 || directionDegrees >= 360) {
        throw new RangeError("Stimulus directionDegrees must be in 0..359.");
      }
      if (!Number.isFinite(speedPxPerSecond) || speedPxPerSecond < 0) {
        throw new RangeError("Stimulus speedPxPerSecond must be nonnegative and finite.");
      }
      const streams = effect.streams.filter(stream => stream.surgeOnly);
      if (streams.length === 0) throw new Error(`Effect '${effect.id}' has no burst-responsive streams.`);
      const directionRadians = directionDegrees * Math.PI / 180;
      const velocityOffsetX = Math.cos(directionRadians) * speedPxPerSecond;
      const velocityOffsetY = Math.sin(directionRadians) * speedPxPerSecond;
      this.seenEventIds.add(input.id);
      for (const stream of streams) {
        const baseOverride = emitter.input.streamOverrides[stream.id];
        const override: ParticleStreamOverrides = { ...baseOverride };
        if (speedPxPerSecond > 0) {
          override.velocityOffsetXPxPerSecond = (baseOverride?.velocityOffsetXPxPerSecond ?? 0) + velocityOffsetX;
          override.velocityOffsetYPxPerSecond = (baseOverride?.velocityOffsetYPxPerSecond ?? 0) + velocityOffsetY;
        }
        const followUp = effect.streams.find(candidate => candidate.id === stream.onDeathStreamId);
        const followUpOverride = followUp ? emitter.input.streamOverrides[followUp.id] : undefined;
        for (let i = 0; i < count; i++) {
          this.spawn(stream, xPx, yPx, override, followUp, followUpOverride, emitter.input.id);
        }
      }
      return;
    }

    if (input.kind === "wind") {
      if (!Number.isFinite(input.directionDegrees) || input.directionDegrees < 0 || input.directionDegrees >= 360) {
        throw new RangeError("Wind directionDegrees must be in 0..359.");
      }
      if (!Number.isFinite(input.speedPxPerSecond) || input.speedPxPerSecond < 0) {
        throw new RangeError("Wind speedPxPerSecond must be nonnegative and finite.");
      }
      this.positiveSetting(input.durationSeconds, "wind durationSeconds");
      const responsiveStreams = this.windBlownStreamIdsForEffect(emitter.input.effectId);
      if (responsiveStreams.size === 0) {
        throw new Error(`Effect '${emitter.input.effectId}' has no wind-responsive streams.`);
      }
      const radians = input.directionDegrees * Math.PI / 180;
      emitter.windNudges.set(input.id, {
        velocityXPxPerSecond: Math.cos(radians) * input.speedPxPerSecond,
        velocityYPxPerSecond: Math.sin(radians) * input.speedPxPerSecond,
        startedAtSeconds: this.simulationTimeSeconds,
        durationSeconds: input.durationSeconds,
        fadeOutSeconds: this.windNudgeFadeOutSecondsForEffect(emitter.input.effectId)
      });
      this.seenEventIds.add(input.id);
      return;
    }

    throw new TypeError("Unknown particle stimulus kind.");
  }

  private windBlownStreamIdsForEffect(effectId: string): Set<string> {
    return this.roomStyles.get(effectId)?.windBlownStreamIds ?? this.styles.get(effectId)?.windBlownStreamIds ?? NO_WIND_STREAMS;
  }

  private windNudgeFadeOutSecondsForEffect(effectId: string): number {
    return this.roomStyles.get(effectId)?.windNudgeFadeOutSeconds ??
      this.styles.get(effectId)?.windNudgeFadeOutSeconds ?? WIND_NUDGE_FADE_OUT_SECONDS;
  }

  private windVelocityFor(state: LiveParticle): { x: number; y: number } {
    if (!state.emitterId) return NO_WIND;
    const emitter = this.emitters.get(state.emitterId);
    if (!emitter || emitter.windNudges.size === 0 ||
        !this.windBlownStreamIdsForEffect(emitter.input.effectId).has(state.stream.id)) return NO_WIND;
    let x = 0;
    let y = 0;
    for (const nudge of emitter.windNudges.values()) {
      const strength = this.windNudgeStrength(nudge);
      x += nudge.velocityXPxPerSecond * strength;
      y += nudge.velocityYPxPerSecond * strength;
    }
    return { x, y };
  }

  private windNudgeStrength(nudge: WindNudgeState): number {
    const elapsedSeconds = this.simulationTimeSeconds - nudge.startedAtSeconds;
    if (elapsedSeconds <= nudge.durationSeconds) return 1;
    if (nudge.fadeOutSeconds === 0) return 0;
    const fadeProgress = (elapsedSeconds - nudge.durationSeconds) / nudge.fadeOutSeconds;
    if (fadeProgress >= 1) return 0;
    const easedProgress = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
    return 1 - easedProgress;
  }

  update(timeSeconds: number): void {
    this.assertReady();
    if (!Number.isFinite(timeSeconds)) throw new RangeError("timeSeconds must be finite.");
    if (this.lastTimeSeconds === null) {
      this.lastTimeSeconds = timeSeconds;
      return;
    }
    if (timeSeconds < this.lastTimeSeconds) {
      throw new RangeError("Particle time moved backwards; call clear() before restarting the clock.");
    }
    const elapsed = Math.min(MAX_ADVANCE_SECONDS, timeSeconds - this.lastTimeSeconds);
    this.lastTimeSeconds = timeSeconds;
    this.timeRemainderSeconds += elapsed;
    while (this.timeRemainderSeconds + 1e-9 >= STEP_SECONDS) {
      this.step(STEP_SECONDS);
      this.timeRemainderSeconds -= STEP_SECONDS;
    }
  }

  getStats(): ParticleStats {
    this.assertActive();
    return {
      liveParticles: this.live.length,
      emittedParticles: this.emittedParticles,
      droppedParticles: this.droppedParticles,
      activeEmitters: [...this.emitters.values()].filter(emitter => emitter.input.active).length
    };
  }

  /** Clears room runtime state while retaining registered, game-owned effects. */
  clear(): void {
    this.assertActive();
    this.live.length = 0;
    for (const group of [...this.groups.values()]) this.releaseGroup(group);
    this.emitters.clear();
    this.occluders = [];
    this.seenEventIds.clear();
    this.lastTimeSeconds = null;
    this.timeRemainderSeconds = 0;
    this.simulationTimeSeconds = 0;
    this.randomState = this.initialSeed;
    this.emittedParticles = 0;
    this.droppedParticles = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    if (this.ownsRenderLayers) {
      this.preLight.destroy({ children: true });
      this.postLight.destroy({ children: true });
    }
    this.groups.clear();
    this.effects.clear();
    this.styles.clear();
    this.roomStyles.clear();
    this.geometry = null;
    this.disposed = true;
  }

  private validateColorTransitionFraction(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError("colorTransitionFraction must be in 0..1.");
    }
  }

  private positiveSetting(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
    return value;
  }

  private hash(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  private emitterRandom(emitter: EmitterState): number {
    let value = (emitter.surgeRandomState + 0x6D2B79F5) >>> 0;
    emitter.surgeRandomState = value;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  private validateColorBindings(bindings: Record<string, ParticleColorBinding>, streamIds: Set<string>): void {
    for (const [id, binding] of Object.entries(bindings)) {
      if (!streamIds.has(id)) throw new Error(`Unknown color binding stream '${id}'.`);
      if (typeof binding === "number") {
        if (!Number.isInteger(binding) || binding < 0) throw new TypeError(`Invalid color palette index for stream '${id}'.`);
      } else if (binding !== "primary" && binding !== "secondary" && binding !== "transition" && binding !== "flip") {
        throw new TypeError(`Invalid color binding for stream '${id}'.`);
      }
    }
  }

  private validateColorPalette(colors: readonly string[], label: string): void {
    if (!Array.isArray(colors) || colors.length === 0) {
      throw new TypeError(`${label} must be a nonempty ordered color array.`);
    }
    for (const color of colors) parseHexColor(color);
  }

  private mapStyleColors(
    stream: NormalizedStream,
    binding: ParticleColorBinding,
    defaults: ParticleColors,
    colors: readonly string[]
  ): Pick<ParticleStreamOverrides, "startColor" | "endColor"> {
    const startIndex = typeof binding === "number" ? binding : binding === "secondary" ? 1 : 0;
    const endIndex = typeof binding === "number" ? binding : binding === "primary" ? 0 : 1;
    const startDefault = startIndex === 0 ? defaults.primary : startIndex === 1 ? defaults.secondary : stream.startColor;
    const endDefault = endIndex === 0 ? defaults.primary : endIndex === 1 ? defaults.secondary : stream.endColor ?? stream.startColor;
    return {
      startColor: recolorStyleColor(stream.startColor, startDefault, colors[startIndex] ?? startDefault),
      endColor: recolorStyleColor(stream.endColor, endDefault, colors[endIndex] ?? endDefault)
    };
  }

  private step(dt: number): void {
    this.simulationTimeSeconds += dt;
    const completedFades: string[] = [];
    for (const [id, emitter] of this.emitters) {
      const fade = emitter.alphaFade;
      if (fade && this.simulationTimeSeconds >= fade.startedAtSeconds + fade.durationSeconds) {
        completedFades.push(id);
      }
      for (const [id, nudge] of emitter.windNudges) {
        if (this.simulationTimeSeconds >= nudge.startedAtSeconds + nudge.durationSeconds + nudge.fadeOutSeconds) {
          emitter.windNudges.delete(id);
        }
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const state = this.live[i];
      state.ageSeconds += dt;
      if (state.ageSeconds >= state.lifeSeconds) {
        state.group.container.removeParticle(state.visual);
        state.group.free.push(state.visual);
        this.live.splice(i, 1);
        if (state.onDeathStream) this.spawn(state.onDeathStream, state.xPx, state.yPx, state.onDeathOverride,
          undefined, undefined, state.emitterId);
        this.releaseUnusedGroups(state.emitterId ?? "");
        continue;
      }
      state.velocityXPxPerSecond += (state.stream.accelerationXPxPerSecond2 ?? 0) * dt;
      state.velocityYPxPerSecond += (state.stream.accelerationYPxPerSecond2 ?? 0) * dt;
      const wind = this.windVelocityFor(state);
      if (state.orbitRadiusPx !== undefined) {
        state.orbitCenterXPx! += wind.x * dt;
        state.orbitCenterYPx! += wind.y * dt;
        state.orbitAngleRadians! += state.orbitAngularSpeedRadiansPerSecond! * dt;
        state.xPx = state.orbitCenterXPx! + Math.cos(state.orbitAngleRadians!) * state.orbitRadiusPx;
        state.yPx = state.orbitCenterYPx! + Math.sin(state.orbitAngleRadians!) * state.orbitRadiusPx;
        state.visual.rotation = state.orbitAngleRadians! + Math.PI / 2;
      } else {
        if (state.skitter) {
          const previousPhase = state.skitter.phaseRadians + (state.ageSeconds - dt) * state.skitter.frequencyRadiansPerSecond;
          const currentPhase = state.skitter.phaseRadians + state.ageSeconds * state.skitter.frequencyRadiansPerSecond;
          const lateralDelta = state.skitter.lateralAmplitudePx * (Math.sin(currentPhase) - Math.sin(previousPhase));
          state.xPx += (state.velocityXPxPerSecond + wind.x) * dt + state.skitter.directionXPx * lateralDelta;
          state.yPx += (state.velocityYPxPerSecond + wind.y) * dt + state.skitter.directionYPx * lateralDelta;
        } else {
          state.xPx += (state.velocityXPxPerSecond + wind.x) * dt;
          state.yPx += (state.velocityYPxPerSecond + wind.y) * dt;
        }
      }
      this.updateVisual(state);
    }
    for (const emitter of this.emitters.values()) {
      if (!emitter.input.active) { emitter.surgeNextAt = null; continue; }
      const effect = this.effects.get(emitter.input.effectId);
      if (!effect) continue;
      for (const stream of effect.streams) {
        const override = emitter.input.streamOverrides[stream.id];
        const rate = override?.ratePerSecond ?? stream.ratePerSecond;
        const accumulated = (emitter.remainders.get(stream.id) ?? 0) + rate * dt;
        const count = Math.floor(accumulated + 1e-9);
        emitter.remainders.set(stream.id, accumulated - count);
        const followUp = effect.streams.find(candidate => candidate.id === stream.onDeathStreamId);
        const followUpOverride = followUp ? emitter.input.streamOverrides[followUp.id] : undefined;
        for (let i = 0; i < count; i++) {
          this.spawn(stream, emitter.input.xPx, emitter.input.yPx, override, followUp, followUpOverride, emitter.input.id);
        }
      }
      const surge = emitter.input.surge;
      if (surge) {
        const activeStreams = effect.streams.filter(stream =>
          (emitter.input.streamOverrides[stream.id]?.ratePerSecond ?? stream.ratePerSecond) > 0 || stream.surgeOnly);
        if (activeStreams.length === 0) { emitter.surgeNextAt = null; continue; }
        const nextInterval = () => surge.intervalMinSeconds + (surge.intervalMaxSeconds - surge.intervalMinSeconds) * this.emitterRandom(emitter);
        if (emitter.surgeNextAt === null) emitter.surgeNextAt = this.simulationTimeSeconds + nextInterval();
        if (this.simulationTimeSeconds + 1e-9 >= emitter.surgeNextAt) {
          const weights = activeStreams.map(stream => {
            const rate = emitter.input.streamOverrides[stream.id]?.ratePerSecond ?? stream.ratePerSecond;
            return rate > 0 ? rate : 1;
          });
          const total = weights.reduce((sum, rate) => sum + rate, 0);
          for (let i = 0; i < surge.burstCount; i++) {
            let pick = this.emitterRandom(emitter) * total;
            let index = 0;
            while (index < weights.length - 1 && (pick -= weights[index]) >= 0) index++;
            const stream = activeStreams[index];
            const override = emitter.input.streamOverrides[stream.id];
            const followUp = effect.streams.find(candidate => candidate.id === stream.onDeathStreamId);
            this.spawn(stream, emitter.input.xPx, emitter.input.yPx, override, followUp,
              followUp ? emitter.input.streamOverrides[followUp.id] : undefined, emitter.input.id);
          }
          emitter.surgeNextAt += nextInterval();
        }
      }
    }
    for (const id of completedFades) {
      if (this.live.some(state => state.emitterId === id)) continue;
      this.emitters.delete(id);
      this.releaseUnusedGroups(id);
    }
  }

  private spawn(
    stream: NormalizedStream,
    centerX: number,
    centerY: number,
    override?: ParticleStreamOverrides,
    onDeathStream?: NormalizedStream,
    onDeathOverride?: ParticleStreamOverrides,
    emitterId?: string
  ): void {
    if (this.live.length >= this.maxParticles) {
      this.droppedParticles++;
      return;
    }
    const renderedStream = override?.layer && override.layer !== stream.layer
      ? { ...stream, layer: override.layer } : stream;
    const group = this.groupFor(renderedStream, emitterId);
    const visual = group.free.pop() ?? new Particle({ texture: group.texture, anchorX: 0.5, anchorY: 0.5 });
    const radiusScale = override?.radiusScale ?? override?.spawnExtentScale ?? 1;
    const speedScale = override?.speedScale ?? 1;
    const radius = stream.spawn.kind === "point" ? (stream.spawn.radiusPx ?? 0) * radiusScale : 0;
    const innerRadius = stream.spawn.kind === "point"
      ? override?.innerRadiusPx ?? (stream.spawn.innerRadiusPx ?? 0) * radiusScale
      : 0;
    const distance = Math.sqrt(innerRadius * innerRadius + this.random() * (radius * radius - innerRadius * innerRadius));
    const angle = this.random() * Math.PI * 2;
    const emitter = emitterId ? this.emitters.get(emitterId) : undefined;
    const roomStyle = emitter ? this.roomStyles.get(emitter.input.effectId) : undefined;
    const edgeFlow = stream.spawn.kind === "room" && roomStyle?.windEdgeFlowStreamIds.has(stream.id) === true;
    const flowX = override?.velocityOffsetXPxPerSecond ?? 0;
    const flowY = override?.velocityOffsetYPxPerSecond ?? 0;
    const flowSpeed = Math.hypot(flowX, flowY);
    const edgeMargin = Math.max(stream.startWidthPx, stream.startHeightPx) * (override?.sizeScale ?? 1) / 2 + 2;
    const edgePosition = edgeFlow && flowSpeed > 0
      ? this.spawnAtWindwardEdge(flowX, flowY, edgeMargin)
      : undefined;
    const xPx = stream.spawn.kind === "room" ? edgePosition?.x ?? this.random() * this.geometry!.widthPx
      : stream.spawn.kind === "rectangle" ? centerX + (this.random() - 0.5) * (stream.spawn.widthPx ?? 0) * (override?.spawnExtentScale ?? radiusScale)
      : centerX + Math.cos(angle) * distance;
    const yPx = stream.spawn.kind === "room" ? edgePosition?.y ?? this.random() * this.geometry!.heightPx
      : stream.spawn.kind === "rectangle" ? centerY + (this.random() - 0.5) * (stream.spawn.heightPx ?? 0) * (override?.spawnExtentScale ?? radiusScale)
      : centerY + Math.sin(angle) * distance;
    const velocityXPxPerSecond = this.between(stream.velocityXMinPxPerSecond, stream.velocityXMaxPxPerSecond) * speedScale + (override?.velocityOffsetXPxPerSecond ?? 0);
    const velocityYPxPerSecond = this.between(stream.velocityYMinPxPerSecond, stream.velocityYMaxPxPerSecond) * speedScale + (override?.velocityOffsetYPxPerSecond ?? 0);
    let skitter: LiveParticle["skitter"];
    const motionMix = roomStyle?.windMotionMix;
    if (edgeFlow && motionMix?.streamIds.has(stream.id) && flowSpeed > 0) {
      const windFraction = Math.min(1, flowSpeed / motionMix.maxWindSpeedPxPerSecond);
      const skitterFraction = motionMix.lowWindSkitterFraction +
        (motionMix.highWindSkitterFraction - motionMix.lowWindSkitterFraction) * windFraction;
      if (this.random() < skitterFraction) {
        skitter = {
          phaseRadians: this.random() * Math.PI * 2,
          frequencyRadiansPerSecond: Math.PI * 2 * (0.8 + 0.7 * windFraction),
          lateralAmplitudePx: 0.5 + 1 * windFraction,
          directionXPx: -flowY / flowSpeed,
          directionYPx: flowX / flowSpeed
        };
      }
    }
    const leafFlip = roomStyle?.flipColorStreamIds.has(stream.id)
      ? {
          firstFlipAtSeconds: 0.7 + this.random() * 1.8,
          periodSeconds: skitter ? 2.8 + this.random() * 1.8 : 3.8 + this.random() * 2.8,
          durationSeconds: 0.28 + this.random() * 0.12
        }
      : undefined;
    const edgeFlowLifetime = edgeFlow
      ? this.timeToRoomExit(xPx, yPx, velocityXPxPerSecond, velocityYPxPerSecond, edgeMargin)
      : undefined;
    const baseRotationRadians = this.between(stream.rotationMinRadians ?? 0, stream.rotationMaxRadians ?? 0);
    visual.rotation = baseRotationRadians;
    if (override?.windStretchRotationRadians !== undefined) {
      visual.rotation = override.windStretchRotationRadians;
    }
    const lifetimeScale = override?.lifetimeScale ?? 1;
    const sampledLifetime = edgeFlowLifetime ?? override?.lifetimeSeconds ??
      this.between(override?.lifeMinSeconds ?? stream.lifeMinSeconds, override?.lifeMaxSeconds ?? stream.lifeMaxSeconds);
    const state: LiveParticle = {
      visual,
      group,
      stream: renderedStream,
      emitterId,
      onDeathStream,
      onDeathOverride,
      sizeScale: override?.sizeScale ?? 1,
      baseRotationRadians,
      windStretchScale: override?.windStretchScale ?? 1,
      skitter,
      leafFlip,
      alphaScale: override?.alphaScale ?? 1,
      startAlpha: override?.startAlpha ?? stream.startAlpha,
      endAlpha: override?.endAlpha ?? stream.endAlpha,
      startColorRgb: override?.startColor ? parseHexColor(override.startColor) : stream.startColorRgb,
      endColorRgb: override?.endColor ? parseHexColor(override.endColor) : stream.endColorRgb,
      colorTransitionFraction: override?.colorTransitionFraction ?? stream.colorTransitionFraction ?? 1,
      colorTransitionSeconds: override?.colorTransitionSeconds ?? stream.colorTransitionSeconds,
      xPx,
      yPx,
      velocityXPxPerSecond,
      velocityYPxPerSecond,
      windOffsetXPxPerSecond: override?.velocityOffsetXPxPerSecond ?? 0,
      windOffsetYPxPerSecond: override?.velocityOffsetYPxPerSecond ?? 0,
      orbitCenterXPx: stream.orbitAngularSpeedRadiansPerSecond ? centerX : undefined,
      orbitCenterYPx: stream.orbitAngularSpeedRadiansPerSecond ? centerY : undefined,
      orbitRadiusPx: stream.orbitAngularSpeedRadiansPerSecond ? Math.hypot(xPx - centerX, yPx - centerY) : undefined,
      orbitAngleRadians: stream.orbitAngularSpeedRadiansPerSecond ? angle : undefined,
      orbitAngularSpeedRadiansPerSecond: stream.orbitAngularSpeedRadiansPerSecond ? stream.orbitAngularSpeedRadiansPerSecond * speedScale : undefined,
      ageSeconds: 0,
      lifeSeconds: sampledLifetime * lifetimeScale / (edgeFlowLifetime !== undefined || override?.lifetimeSeconds !== undefined ? 1 : speedScale)
    };
    this.updateVisual(state);
    group.container.addParticle(visual);
    this.live.push(state);
    this.emittedParticles++;
  }

  private spawnAtWindwardEdge(windX: number, windY: number, margin: number): { x: number; y: number } {
    const width = this.geometry!.widthPx;
    const height = this.geometry!.heightPx;
    const magnitude = Math.hypot(windX, windY);
    const directionX = windX / magnitude;
    const directionY = windY / magnitude;
    const xEdgeFlux = Math.abs(directionX) * height;
    const yEdgeFlux = Math.abs(directionY) * width;
    if (this.random() * (xEdgeFlux + yEdgeFlux) < xEdgeFlux) {
      const x = directionX > 0 ? 0 : width;
      const y = this.random() * height;
      return { x: x - directionX * margin, y: y - directionY * margin };
    }
    const x = this.random() * width;
    const y = directionY > 0 ? 0 : height;
    return { x: x - directionX * margin, y: y - directionY * margin };
  }

  private timeToRoomExit(x: number, y: number, velocityX: number, velocityY: number, margin: number): number {
    const width = this.geometry!.widthPx;
    const height = this.geometry!.heightPx;
    let exitTime = Number.POSITIVE_INFINITY;
    if (velocityX > 0) exitTime = Math.min(exitTime, (width + margin - x) / velocityX);
    else if (velocityX < 0) exitTime = Math.min(exitTime, (-margin - x) / velocityX);
    if (velocityY > 0) exitTime = Math.min(exitTime, (height + margin - y) / velocityY);
    else if (velocityY < 0) exitTime = Math.min(exitTime, (-margin - y) / velocityY);
    if (Number.isFinite(exitTime) && exitTime > 0) return exitTime + STEP_SECONDS;
    const speed = Math.max(1, Math.hypot(velocityX, velocityY));
    return (width + height + margin * 2) / speed + STEP_SECONDS;
  }

  private updateVisual(state: LiveParticle): void {
    const t = state.ageSeconds / state.lifeSeconds;
    const stream = state.stream;
    const width = stream.startWidthPx + (stream.endWidthPx - stream.startWidthPx) * t;
    const height = stream.startHeightPx + (stream.endHeightPx - stream.startHeightPx) * t;
    state.visual.x = state.xPx;
    state.visual.y = state.yPx;
    const flipProgress = this.leafFlipProgress(state);
    const flipScaleX = 1 - flipProgress * 0.85;
    state.visual.scaleX = width * state.sizeScale * state.windStretchScale * flipScaleX / state.group.texture.width;
    state.visual.scaleY = height * state.sizeScale / state.group.texture.height;
    const colorProgress = state.leafFlip
      ? flipProgress
      : state.colorTransitionSeconds === undefined
        ? state.colorTransitionFraction === 0 ? 1 : t / state.colorTransitionFraction
        : state.colorTransitionSeconds === 0 ? 1 : state.ageSeconds / state.colorTransitionSeconds;
    state.visual.tint = mixColor(state.startColorRgb, state.endColorRgb, colorProgress);
    const alpha = state.startAlpha + (state.endAlpha - state.startAlpha) * t;
    state.visual.alpha = Math.max(0, Math.min(1,
      alpha * state.alphaScale * this.cellVisibility(state) * this.emitterAlphaForParticle(state)));
  }

  private emitterAlphaForParticle(state: LiveParticle): number {
    return state.emitterId ? this.emitterAlpha(this.emitters.get(state.emitterId), this.simulationTimeSeconds) : 1;
  }

  private emitterAlpha(emitter: EmitterState | undefined, timeSeconds: number): number {
    const fade = emitter?.alphaFade;
    if (!fade) return 1;
    const progress = Math.max(0, Math.min(1, (timeSeconds - fade.startedAtSeconds) / fade.durationSeconds));
    return fade.from + (fade.to - fade.from) * progress;
  }

  private removeEmitterParticles(emitterId: string): void {
    for (let index = this.live.length - 1; index >= 0; index--) {
      const state = this.live[index];
      if (state.emitterId !== emitterId) continue;
      state.group.container.removeParticle(state.visual);
      state.group.free.push(state.visual);
      this.live.splice(index, 1);
    }
  }

  private cellVisibility(state: LiveParticle): number {
    if (!state.stream.occludeByCells || !this.geometry) return 1;
    const fade = Math.max(1, Math.min(12, this.geometry.cellSizePx * 0.3));
    const t = state.ageSeconds / state.lifeSeconds;
    const elevationCells = state.skitter
      ? 0.02
      : state.stream.startElevationCells + (state.stream.endElevationCells - state.stream.startElevationCells) * t;
    let visibility = 1;
    for (const occluder of this.occluders) {
      const left = occluder.xPx;
      const top = occluder.yPx;
      const right = left + occluder.sizeXCells * this.geometry.cellSizePx;
      const bottom = top + occluder.sizeYCells * this.geometry.cellSizePx;
      const heightGapCells = (occluder.elevationCells ?? 1) - elevationCells;
      if (heightGapCells <= 0) continue;
      if (state.xPx < left || state.xPx > right || state.yPx < top || state.yPx > bottom) continue;
      const inside = Math.min(state.xPx - left, right - state.xPx, state.yPx - top, bottom - state.yPx);
      const edgeReveal = 1 - Math.min(1, inside / fade);
      const heightReveal = 1 - Math.min(1, heightGapCells / 0.25);
      visibility = Math.min(visibility, Math.max(edgeReveal, heightReveal));
    }
    return visibility;
  }

  private leafFlipProgress(state: LiveParticle): number {
    if (!state.leafFlip || state.ageSeconds < state.leafFlip.firstFlipAtSeconds) return 0;
    const cycleSeconds = (state.ageSeconds - state.leafFlip.firstFlipAtSeconds) % state.leafFlip.periodSeconds;
    if (cycleSeconds >= state.leafFlip.durationSeconds) return 0;
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * cycleSeconds / state.leafFlip.durationSeconds);
  }

  private groupFor(stream: NormalizedStream, emitterId?: string): ParticleGroup {
    const id = emitterId ?? "";
    const emitterOrder = emitterId ? this.emitters.get(emitterId)?.input.order ?? 0 : 0;
    const key = `${id}|${stream.layer}|${stream.blendMode}|${stream.textureId}|${stream.drawOrder}`;
    let group = this.groups.get(key);
    if (!group) {
      const texture = this.textures[stream.textureId];
      if (!texture || texture.width <= 0 || texture.height <= 0) {
        throw new Error(`Texture '${stream.textureId}' must be loaded before particles are emitted.`);
      }
      const container = new ParticleContainer<Particle>({
        texture,
        dynamicProperties: { position: true, vertex: true, rotation: true, uvs: false, color: true }
      });
      container.blendMode = stream.blendMode;
      (stream.layer === "pre-light" ? this.preLight : this.postLight).addChild(container);
      group = { key, container, texture, free: [], layer: stream.layer, emitterId: id, order: emitterOrder, drawOrder: stream.drawOrder };
      this.groups.set(key, group);
      if (this.orderCoordinator) this.orderCoordinator.register(id, emitterOrder, stream.layer, stream.drawOrder, container);
      else this.refreshParticleOrder();
    }
    group.order = emitterOrder;
    return group;
  }

  private refreshParticleOrder(): void {
    if (this.orderCoordinator) {
      const updated = new Set<string>();
      for (const group of this.groups.values()) {
        if (!group.emitterId || updated.has(group.emitterId)) continue;
        updated.add(group.emitterId);
        const order = this.emitters.get(group.emitterId)?.input.order;
        if (order !== undefined) this.orderCoordinator.updateInstanceOrder(group.emitterId, order);
      }
      return;
    }
    for (const group of this.groups.values()) {
      if (!group.emitterId) continue;
      group.order = this.emitters.get(group.emitterId)?.input.order ?? group.order;
    }
    for (const layer of ["pre-light", "post-light"] as const) {
      const ordered = [...this.groups.values()].filter(group => group.layer === layer).sort((a, b) =>
        a.order - b.order || (a.emitterId < b.emitterId ? -1 : a.emitterId > b.emitterId ? 1 : 0) || a.drawOrder - b.drawOrder
      );
      const drawOrders = ordered.map(group => group.drawOrder);
      const minDrawOrder = drawOrders.length ? Math.min(...drawOrders) : 0;
      const maxDrawOrder = drawOrders.length ? Math.max(...drawOrders) : 0;
      const instanceStride = maxDrawOrder - minDrawOrder + 1;
      let instanceKey = "";
      let instanceRank = -1;
      for (const group of ordered) {
        const nextKey = `${group.order}\u0000${group.emitterId}`;
        if (nextKey !== instanceKey) {
          instanceKey = nextKey;
          instanceRank++;
        }
        group.container.zIndex = instanceRank * instanceStride + group.drawOrder - minDrawOrder;
      }
    }
  }

  /** Drop groups and their free particle pools once an instance has no live particles. */
  private releaseUnusedGroups(emitterId: string): void {
    if (this.emitters.has(emitterId) || this.live.some(state => (state.emitterId ?? "") === emitterId)) return;
    for (const group of [...this.groups.values()]) {
      if (group.emitterId === emitterId) this.releaseGroup(group);
    }
    if (!this.orderCoordinator) this.refreshParticleOrder();
  }

  private releaseGroup(group: ParticleGroup): void {
    if (!this.groups.delete(group.key)) return;
    this.orderCoordinator?.remove(group.container);
    group.container.parent?.removeChild(group.container);
    group.free.length = 0;
    group.container.destroy({ children: true });
  }

  private withScopedImages<T extends ParticleEffectDefinition>(recipe: T, overrides?: Record<string, Texture>): T {
    if (!overrides || Object.keys(overrides).length === 0) return recipe;
    const slots = new Set(recipe.streams.map(stream => stream.textureId));
    for (const slot of Object.keys(overrides)) {
      if (!slots.has(slot)) throw new Error(`Unknown image slot '${slot}' for recipe '${recipe.id}'.`);
      if (!overrides[slot]) throw new TypeError(`Image slot '${slot}' for recipe '${recipe.id}' requires a texture.`);
    }
    const scopedIds = new Map<string, string>();
    for (const slot of Object.keys(overrides)) {
      const scopedId = `__recipe_image__/${recipe.id}/${slot}`;
      this.textures[scopedId] = overrides[slot];
      scopedIds.set(slot, scopedId);
    }
    return {
      ...recipe,
      streams: recipe.streams.map(stream => ({
        ...stream,
        ...(scopedIds.has(stream.textureId) ? { textureId: scopedIds.get(stream.textureId)! } : {})
      }))
    };
  }

  private random(): number {
    this.randomState = (this.randomState + 0x6D2B79F5) >>> 0;
    let value = this.randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  private between(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  private assertReady(): void {
    this.assertActive();
    if (!this.geometry) throw new Error("TopDownParticleSystem requires setRoomGeometry first.");
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("TopDownParticleSystem has been disposed.");
  }
}
