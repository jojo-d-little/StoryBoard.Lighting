import type { Texture } from "pixi.js";

export type ParticleLayer = "pre-light" | "post-light";
export type ParticleBlendMode = "normal" | "add";
export interface ParticleColors { primary: string; secondary: string; }
/** Ordered producer-supplied palette. Style documentation defines each color's use. */
export type ParticleColorPalette = readonly string[];
/** Named bindings preserve common behavior; a number selects that exact ordered palette entry. */
export type ParticleColorBinding = "primary" | "secondary" | "transition" | "flip" | number;
export interface ParticleStreamColorBinding {
  control: string;
  mode: "transition" | "flip" | "role" | "value";
  role?: "primary" | "secondary";
}
/** Whether a palette update affects only new particles or also living particles. */
export type ParticleColorChangeMode = "birth-snapshot" | "retint";

/** Surface-mark silhouette recipe. Direction rotates directional stain art. */
export type TopDownStainStyle = "splatter" | "patch" | "streak" | "directional-spray";

/** The base/detail image pair for one stain silhouette. */
export interface TopDownStainTexturePair {
  base: Texture;
  detail: Texture;
}

/** A default silhouette plus optional image variants for per-stain selection. */
export interface TopDownStainTextureSet extends TopDownStainTexturePair {
  variants?: readonly TopDownStainTexturePair[];
  /** Single-streak textures composed independently for the directional-spray style. */
  streakVariants?: readonly Texture[];
}

/** The original three texture pairs remain sufficient; spray is an additive optional style. */
export type TopDownStainTextures = Record<"splatter" | "patch" | "streak", TopDownStainTextureSet>
  & Partial<Record<"directional-spray", TopDownStainTextureSet>>;

/** A stationary translucent mark attached to a room-space surface position. */
export interface TopDownStainInput {
  id: string;
  /** Shared render order within the selected lighting pass; defaults to 0. */
  order?: number;
  style: TopDownStainStyle;
  xPx: number;
  yPx: number;
  /** Mark footprint in room pixels; directional spray uses this as length and keeps a fixed 120 px crosswise width. */
  sizePx: number;
  /** First color tints the body; second tints finer marks and satellites. */
  colors?: ParticleColorPalette;
  /** Overall alpha, independent of the authored texture alpha. */
  opacity?: number;
  /** Detail alpha from 0 to 1; directional spray uses this as streak density. */
  amount?: number;
  /** 0° points right and 90° points down-screen. */
  directionDegrees?: number;
  layer?: ParticleLayer;
  /** Omit to persist until removed. When set, the stain is removed at this age. */
  lifetimeSeconds?: number;
  /** Optional final portion of lifetime used to fade the stain out. */
  fadeOutSeconds?: number;
  active?: boolean;
}

export interface TopDownStainSystemOptions {
  /** Borrowed textures; the host owns their lifecycle. */
  textures: TopDownStainTextures;
  maxStains?: number;
  /** Notifies the host when a timed stain is removed. */
  onExpire?: (id: string) => void;
}

/** All geometry and motion values use pixels in the room image, not the viewport. */
export interface ParticleRoomGeometry {
  widthPx: number;
  heightPx: number;
  cellSizePx: number;
}

export interface ParticleSpawnShape {
  /** Room uses the current room geometry instead of authored pixel dimensions. */
  kind: "point" | "rectangle" | "room";
  radiusPx?: number;
  /** Minimum point-spawn distance from its source, creating a hollow center. */
  innerRadiusPx?: number;
  widthPx?: number;
  heightPx?: number;
}

/** Serializable, game-owned settings for one particle stream. */
export interface ParticleStreamDefinition {
  id: string;
  textureId: string;
  /** Catalog semantic role used to derive point stream groups at registration. */
  role?: "flame" | "smoke" | "ember";
  isWindBlown?: boolean;
  isWindStretched?: boolean;
  windEdgeFlow?: boolean;
  windMotionMixEnabled?: boolean;
  lifetimeTuningApplicable?: boolean;
  colorBinding?: ParticleStreamColorBinding;
  colorTransitionSeconds?: number;
  colorTransitionFraction?: number;
  layer: ParticleLayer;
  /** Draw priority among groups in the same lighting pass; higher values render above lower values. */
  drawOrder?: number;
  blendMode?: ParticleBlendMode;
  ratePerSecond: number;
  /** Zero-rate streams are event-burst eligible and can also be used by configured surges. */
  surgeOnly?: boolean;
  spawn: ParticleSpawnShape;
  lifeMinSeconds: number;
  lifeMaxSeconds: number;
  /** Height above the floor, in room-cell units; independent of screen Y. */
  startElevationCells?: number;
  endElevationCells?: number;
  /** Optional sibling stream emitted once when this particle reaches its timed end. */
  onDeathStreamId?: string;
  /** Motion across the floor plane. Screen Y is not vertical height. */
  velocityXMinPxPerSecond: number;
  velocityXMaxPxPerSecond: number;
  velocityYMinPxPerSecond: number;
  velocityYMaxPxPerSecond: number;
  /** Initial orientation of a particle in the floor plane. */
  rotationMinRadians?: number;
  rotationMaxRadians?: number;
  /** Nonzero values make a point-spawn stream orbit its emitter at this signed angular speed. */
  orbitAngularSpeedRadiansPerSecond?: number;
  accelerationXPxPerSecond2?: number;
  accelerationYPxPerSecond2?: number;
  startWidthPx: number;
  startHeightPx: number;
  endWidthPx?: number;
  endHeightPx?: number;
  startColor: string;
  endColor?: string;
  startAlpha?: number;
  endAlpha?: number;
  /** Only object streams behind an occluder use cell-based visual hiding. */
  occludeByCells?: boolean;
}

export interface ParticleEffectDefinition {
  id: string;
  /** Null/omitted keeps natural particle decay; zero clears immediately; positive values fade surviving particles. */
  removalDurationMs?: number | null;
  streams: ParticleStreamDefinition[];
}

/** Technical style recipe. The game can keep this out of producer-facing data. */
export interface ParticleStyleDefinition extends ParticleEffectDefinition {
  defaultColor: string;
  baseRadiusPx: number;
  colorControlStreamIds: string[];
  defaultSmokeColor: string;
  flameStreamIds: string[];
  smokeStreamIds: string[];
  emberStreamIds: string[];
  /** Optional producer palette for the independent flame and smoke emitters. */
  defaultColors?: ParticleColors;
  defaultSmokeColors?: ParticleColors;
  /** Default color at palette index 2 for styles with a third color role such as a flame tip. */
  defaultTipColor?: string;
  tipColorLabel?: string;
  colorBindings?: Record<string, ParticleColorBinding>;
  /** Streams whose existing particles respond to temporary wind stimuli. */
  windBlownStreamIds?: string[];
  /** Return fade after a wind nudge's full-strength duration; defaults to 0.35 seconds. */
  windNudgeFadeOutSeconds?: number;
  /** Streams affected by the producer lifetime control; defaults to every stream. */
  lifetimeControlStreamIds?: string[];
  colorLabels?: { primary: string; secondary: string };
  smokeColorLabels?: { primary: string; secondary: string };
}

/** A full-room style uses the same streams as any other effect. */
export interface ParticleRoomStyleDefinition extends ParticleEffectDefinition {
  defaultColors: ParticleColors;
  colorBindings: Record<string, ParticleColorBinding>;
  defaultEmissionRatePerSecond?: number;
  defaultSizePx?: number;
  defaultLifetimeSeconds?: number;
  colorLabels?: { primary: string; secondary: string };
  /** Streams whose planar motion responds to room wind. */
  windBlownStreamIds?: string[];
  /** Return fade after a wind nudge's full-strength duration; defaults to 0.35 seconds. */
  windNudgeFadeOutSeconds?: number;
  /** Room streams that enter from the windward edge and leave at the room edge. */
  windEdgeFlowStreamIds?: string[];
  /** Internal mix between airborne leaves and near-floor skitters as wind changes. */
  windMotionMix?: {
    streamIds: string[];
    maxWindSpeedPxPerSecond: number;
    lowWindSkitterFraction: number;
    highWindSkitterFraction: number;
  };
  /** Streams whose sprite length and angle respond to room wind. */
  windStretchStreamIds?: string[];
  /** If empty, the producer color-timing control has no effect. */
  colorTransitionControlStreamIds?: string[];
  defaultColorTransitionFraction?: number;
  defaultColorTransitionSeconds?: number;
}

/** A seeded, emitter-local schedule for irregular extra particles. */
export interface ParticleSurgeInput {
  intervalMinSeconds: number;
  intervalMaxSeconds: number;
  burstCount: number;
  seed?: number;
}

/** Per-stream values preserve the registered recipe; multipliers and wind update an active emitter's living particles, while rates and spawn settings govern later spawns. */
export interface ParticleStreamOverrides {
  ratePerSecond?: number;
  sizeScale?: number;
  radiusScale?: number;
  /** Scales authored point/rectangle spawn extents proportionally. */
  spawnExtentScale?: number;
  /** Absolute minimum distance from a point emitter when spawning particles. */
  innerRadiusPx?: number;
  /** Multiplies planar velocity and divides lifetime, speeding the full motion. */
  speedScale?: number;
  /** Replaces the recipe minimum lifetime for particles spawned after this update. */
  lifeMinSeconds?: number;
  /** Replaces the recipe maximum lifetime for particles spawned after this update. */
  lifeMaxSeconds?: number;
  lifetimeScale?: number;
  lifetimeSeconds?: number;
  layer?: ParticleLayer;
  startColor?: string;
  endColor?: string;
  startAlpha?: number;
  endAlpha?: number;
  alphaScale?: number;
  /** Fraction of life at which endColor is reached; 1 is the full lifetime. */
  colorTransitionFraction?: number;
  colorTransitionSeconds?: number;
  velocityOffsetXPxPerSecond?: number;
  velocityOffsetYPxPerSecond?: number;
  /** Multiplies local X size for wind-stretched streams. */
  windStretchScale?: number;
  /** Orients a wind-stretched stream along its wind vector. */
  windStretchRotationRadians?: number;
}

export interface ParticleEmitterInput {
  id: string;
  effectId: string;
  xPx: number;
  yPx: number;
  active?: boolean;
  /** Instance render order; equal values are resolved by stable emitter ID. */
  order?: number;
  surge?: ParticleSurgeInput;
  /** Defaults to birth-snapshot so existing particles keep their original palette. */
  colorChangeMode?: ParticleColorChangeMode;
  streamOverrides?: Record<string, ParticleStreamOverrides>;
}

/** Producer-facing controls for an emitter built from a named style. */
export interface ParticleStyledEmitterInput {
  id: string;
  style: string;
  xPx: number;
  yPx: number;
  active?: boolean;
  /** Instance render order; equal values are resolved by stable emitter ID. */
  order?: number;
  /** Select a named part of the style so flame and smoke can use independent emitters. */
  streamGroup?: "all" | "flame" | "smoke";
  /** Optional layer override for every selected stream. */
  layer?: ParticleLayer;
  /** Adds a shared planar drift vector; 0° is right and 90° is down-screen. */
  directionDegrees?: number;
  directionStrengthPxPerSecond?: number;
  color?: string;
  colors?: ParticleColorPalette;
  colorTransitionFraction?: number;
  colorTransitionSeconds?: number;
  /** Retint living particles at their current color-over-life progress when the palette changes. */
  colorChangeMode?: ParticleColorChangeMode;
  sizeScale?: number;
  sizePx?: number;
  radiusPx?: number;
  speedScale?: number;
  lifetimeSeconds?: number;
  emissionRatePerSecond?: number;
  surge?: ParticleSurgeInput;
  /** Smoke-only minimum spawn distance; requires streamGroup "smoke". */
  clearRadiusPx?: number;
  /** Smoke-only planar drift direction and strength; requires streamGroup "smoke". */
  windDirectionDegrees?: number;
  windStrengthPxPerSecond?: number;
  smokeAmount?: number;
  smokeSizeScale?: number;
  smokeColor?: string;
  flameLayer?: ParticleLayer;
  smokeLayer?: ParticleLayer;
  embersLayer?: ParticleLayer;
  /** Per-stream controls. Applied after shared style controls for streams selected by streamGroup. */
  streamOverrides?: Record<string, ParticleStreamOverrides>;
}

/** Producer-facing controls for a room-wide effect instance. */
export interface ParticleRoomEmitterInput {
  id: string;
  style: string;
  active?: boolean;
  /** Instance render order; equal values are resolved by stable emitter ID. */
  order?: number;
  surge?: ParticleSurgeInput;
  emissionRatePerSecond?: number;
  sizePx?: number;
  /** Optional per-stream starting widths in room pixels; overrides sizePx for named streams. */
  streamSizesPx?: Record<string, number>;
  /** Actual lifetime in seconds for room-spawned particles; point-spawned impacts keep authored lifetimes. */
  lifetimeSeconds?: number;
  densityScale?: number;
  sizeScale?: number;
  colors?: ParticleColorPalette;
  /** Retint living particles at their current color-over-life progress when the palette changes. */
  colorChangeMode?: ParticleColorChangeMode;
  /** Optional per-stream ordered palettes; useful when a style combines distinct particle shapes. */
  streamColors?: Record<string, ParticleColorPalette>;
  /** Exact per-stream resolved values from the catalog adapter, applied after shared controls. */
  streamOverrides?: Record<string, ParticleStreamOverrides>;
  colorTransitionFraction?: number;
  colorTransitionSeconds?: number;
  layer?: "style-default" | ParticleLayer;
  windXPxPerSecond?: number;
  windYPxPerSecond?: number;
}

export interface ParticleBurstInput {
  /** Repeating an ID does not fire the burst again. */
  id: string;
  effectId: string;
  xPx: number;
  yPx: number;
  count: number;
  streamId?: string;
  /** Optional per-stream tuning for this event, including its timed follow-up streams. */
  streamOverrides?: Record<string, ParticleStreamOverrides>;
}

/** A reusable, one-time stimulus delivered to an active effect instance. */
export type ParticleStimulusInput =
  | {
      id: string;
      emitterId: string;
      kind: "burst";
      /** Copies emitted from each surge-only stream; defaults to one. */
      count?: number;
      /** Defaults to the attached emitter's current position. */
      xPx?: number;
      yPx?: number;
      /** Optional launch direction and added speed for burst particles. */
      directionDegrees?: number;
      speedPxPerSecond?: number;
    }
  | {
      id: string;
      emitterId: string;
      kind: "wind";
      directionDegrees: number;
      speedPxPerSecond: number;
      /** Full-strength hold time; the renderer then eases the nudge out over a 0.35-second tail. */
      durationSeconds: number;
    };

/** Visual coverage only; these are not physics colliders. */
export interface ParticleOccluderInput {
  xPx: number;
  yPx: number;
  sizeXCells: number;
  sizeYCells: number;
  /** Height above the floor; defaults to one cell. */
  elevationCells?: number;
}

export interface TopDownParticleSystemOptions {
  /** Borrowed, already loaded textures indexed by authored texture IDs. */
  textures: Record<string, Texture>;
  maxParticles?: number;
  seed?: number;
}

export interface ParticleStats {
  liveParticles: number;
  emittedParticles: number;
  droppedParticles: number;
  activeEmitters: number;
}
