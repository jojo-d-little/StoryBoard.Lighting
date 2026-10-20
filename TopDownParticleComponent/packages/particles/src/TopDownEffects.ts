import { Container } from "pixi.js";
import { TopDownAtmosphereSystem } from "./TopDownAtmosphereSystem.js";
import type { AtmosphereFieldInput, TopDownAtmosphereSystemOptions } from "./TopDownAtmosphereSystem.js";
import { TopDownParticleSystem } from "./TopDownParticleSystem.js";
import { loadDefaultParticleAssets } from "./default-assets.js";
import { loadDefaultStainTextures } from "./default-assets.js";
import { TopDownStainSystem } from "./TopDownStainSystem.js";
import { RenderOrderCoordinator } from "./RenderOrderCoordinator.js";
import type { DefaultParticleAssetOverrides } from "./default-assets.js";
import type {
  ParticleBurstInput,
  ParticleColorChangeMode,
  ParticleEffectDefinition,
  ParticleOccluderInput,
  ParticleRoomGeometry,
  ParticleRoomStyleDefinition,
  ParticleSurgeInput,
  ParticleStats,
  ParticleStimulusInput,
  ParticleStyleDefinition,
  ParticleStyledEmitterInput,
  TopDownStainInput,
  TopDownStainTextures,
  TopDownParticleSystemOptions
} from "./contracts.js";

/** Shared wind settings for any room effect. Direction is in screen-space degrees. */
export interface RoomEffectWind {
  directionDegrees: number;
  speedPxPerSecond: number;
}

const registeredRoomEffectName: unique symbol = Symbol("registeredRoomEffectName");

/** A room-effect name returned by `registerRoomEffect()`. */
export interface RegisteredRoomEffectName {
  readonly id: string;
  readonly [registeredRoomEffectName]: true;
}
export type RoomEffectName = RegisteredRoomEffectName | "fog" | "cloud";

interface RoomEffectRequestBase {
  id: string;
  /** Per-lighting-pass render order; ties are resolved by stable instance ID. */
  order?: number;
  transitionTimeMs?: number;
  removalDurationMs?: number | null;
  enabled?: boolean;
  /** Scales a particle recipe's authored density or sets overlay opacity. */
  intensity?: number;
  wind?: RoomEffectWind;
}

/** A registered, game-authored room recipe such as rain, snow, or leaves. */
export interface ParticleRoomEffectInput extends RoomEffectRequestBase {
  effect: RegisteredRoomEffectName;
  /** Particle footprint in room-space pixels. */
  sizePx?: number;
  colors?: readonly string[];
  colorChangeMode?: ParticleColorChangeMode;
  layer?: "pre-light" | "post-light";
  lifetimeSeconds?: number;
  colorTransitionSeconds?: number;
  surge?: ParticleSurgeInput;
  /** Rain-only starting sizes for drops and landing ripples. */
  rain?: { dropSizePx?: number; rippleSizePx?: number };
}

/** A built-in, continuous room overlay. */
export interface RoomOverlayEffectInput extends RoomEffectRequestBase {
  effect: "fog" | "cloud";
  /** Approximate repeated texture width in room-space pixels. */
  coveragePx?: number;
  tint?: string;
}

/** Caller-facing request for either a registered room recipe or an overlay. */
export type RoomEffectInput = ParticleRoomEffectInput | RoomOverlayEffectInput;

function isOverlayEffect(input: RoomEffectInput): input is RoomOverlayEffectInput {
  return input.effect === "fog" || input.effect === "cloud";
}

/** Pixi resources loaded and owned by the host. */
export interface TopDownEffectsOptions {
  textures: {
    particles: TopDownParticleSystemOptions["textures"];
    fog?: TopDownAtmosphereSystemOptions["fogTexture"];
    clouds?: TopDownAtmosphereSystemOptions["cloudTexture"];
    stains?: TopDownStainTextures;
  };
  maxParticles?: number;
  maxStains?: number;
  onStainExpire?: (id: string) => void;
  seed?: number;
}

/** Aggregate diagnostics for every effect family managed by the facade. */
export interface TopDownEffectsStats extends ParticleStats {
  atmosphereFields: number;
  stains: number;
  allocationFailures: {
    /** Particle instances rejected because maxParticles was reached. */
    particleCapacity: number;
    /** New stain instances rejected because maxStains was reached. */
    stainCapacity: number;
    total: number;
  };
}

/** Options for the async factory that loads this package's default images. */
export interface TopDownEffectsCreateOptions extends Omit<TopDownEffectsOptions, "textures"> {
  /** Matching custom textures override packaged defaults; omitted entries use package art. */
  textures?: DefaultParticleAssetOverrides;
  stainTextures?: Partial<TopDownStainTextures>;
}

/** One stable-ID request shape for every persistent visual family. */
export type TopDownEffectInput =
  | { kind: "point"; input: ParticleStyledEmitterInput }
  | { kind: "room"; input: RoomEffectInput }
  | { kind: "stain"; input: Omit<TopDownStainInput, "lifetimeSeconds" | "fadeOutSeconds"> };

/**
 * Caller-facing effect controller. Register recipes once, then configure
 * point effects and room effects without selecting their rendering systems.
 */
export class TopDownEffects {
  readonly preLight = new Container();
  readonly postLight = new Container();
  private readonly particleSystem: TopDownParticleSystem;
  private readonly atmosphereSystem?: TopDownAtmosphereSystem;
  private readonly stainSystem?: TopDownStainSystem;

  private readonly registeredRoomEffects = new Set<string>();
  private disposed = false;
  private readonly orderCoordinator: RenderOrderCoordinator;

  /** Create a controller with packaged default art and optional per-image overrides. */
  static async create(options: TopDownEffectsCreateOptions = {}): Promise<TopDownEffects> {
    const [textures, stains] = await Promise.all([
      loadDefaultParticleAssets(options.textures),
      loadDefaultStainTextures({ stains: options.stainTextures })
    ]);
    return new TopDownEffects({
      textures: { ...textures, stains },
      maxParticles: options.maxParticles,
      maxStains: options.maxStains,
      onStainExpire: options.onStainExpire,
      seed: options.seed
    });
  }

  constructor(options: TopDownEffectsOptions) {
    this.orderCoordinator = new RenderOrderCoordinator({ "pre-light": this.preLight, "post-light": this.postLight });
    this.particleSystem = new TopDownParticleSystem({
      textures: options.textures.particles,
      maxParticles: options.maxParticles,
      seed: options.seed,
      renderLayers: { "pre-light": this.preLight, "post-light": this.postLight },
      orderCoordinator: this.orderCoordinator
    });
    if (options.textures.fog && options.textures.clouds) {
      this.atmosphereSystem = new TopDownAtmosphereSystem({
        fogTexture: options.textures.fog,
        cloudTexture: options.textures.clouds,
        layer: this.postLight,
        orderCoordinator: this.orderCoordinator
      });
    } else if (options.textures.fog || options.textures.clouds) {
      throw new TypeError("Room overlays require both fog and cloud textures.");
    }
    if (options.textures.stains) this.stainSystem = new TopDownStainSystem({
      textures: options.textures.stains,
      maxStains: options.maxStains,
      onExpire: options.onStainExpire,
      renderLayers: { "pre-light": this.preLight, "post-light": this.postLight },
      orderCoordinator: this.orderCoordinator
    });
  }

  setRoomGeometry(geometry: ParticleRoomGeometry): void {
    this.ensureActive();
    this.particleSystem.setRoomGeometry(geometry);
    this.atmosphereSystem?.setRoomGeometry(geometry);
  }

  registerRoomEffect(recipe: ParticleRoomStyleDefinition, imageSlotOverrides?: Record<string, TopDownParticleSystemOptions["textures"][string]>): RegisteredRoomEffectName {
    this.ensureActive();
    if (recipe.id === "fog" || recipe.id === "cloud") {
      throw new Error(`'${recipe.id}' is reserved for a built-in room overlay.`);
    }
    this.particleSystem.registerRoomStyle(recipe, imageSlotOverrides);
    this.registeredRoomEffects.add(recipe.id);
    return Object.freeze({ id: recipe.id, [registeredRoomEffectName]: true as const });
  }

  registerPointStyle(recipe: ParticleStyleDefinition, imageSlotOverrides?: Record<string, TopDownParticleSystemOptions["textures"][string]>): void {
    this.ensureActive();
    this.particleSystem.registerStyle(recipe, imageSlotOverrides);
  }

  /** Lower-level recipe registration for engine-owned point effects. */
  registerEffect(recipe: ParticleEffectDefinition): void {
    this.ensureActive();
    this.particleSystem.registerEffect(recipe);
  }

  #upsertPoint(input: ParticleStyledEmitterInput): void {
    this.ensureActive();
    this.particleSystem.upsertStyledEmitter(input);
  }

  /** Upsert a persistent point, room, overlay, or stain request by its stable ID. */
  upsert(input: TopDownEffectInput): void {
    this.ensureActive();
    if (input.kind === "point") this.#upsertPoint(input.input);
    else if (input.kind === "room") this.#upsertRoom(input.input);
    else {
      if (!this.stainSystem) throw new Error("Stains require packaged defaults from TopDownEffects.create() or explicit stain textures.");
      this.stainSystem.upsertStain(input.input);
    }
  }

  sendStimulus(input: ParticleStimulusInput): void {
    this.ensureActive();
    this.particleSystem.sendStimulus(input);
  }

  emitBurst(input: ParticleBurstInput): void {
    this.ensureActive();
    this.particleSystem.emitBurst(input);
  }

  setOccluders(occluders: ParticleOccluderInput[]): void {
    this.ensureActive();
    this.particleSystem.setOccluders(occluders);
  }

  getStats(): TopDownEffectsStats {
    this.ensureActive();
    const particleStats = this.particleSystem.getStats();
    const stainCapacityFailures = this.stainSystem?.getCapacityFailureCount() ?? 0;
    return {
      ...particleStats,
      atmosphereFields: this.atmosphereSystem?.getFieldCount() ?? 0,
      stains: this.stainSystem?.getStainCount() ?? 0,
      allocationFailures: {
        particleCapacity: particleStats.droppedParticles,
        stainCapacity: stainCapacityFailures,
        total: particleStats.droppedParticles + stainCapacityFailures
      }
    };
  }

  /** Set or update a named room effect. */
  #upsertRoom(input: RoomEffectInput): void {
    this.ensureActive();
    const enabled = input.enabled ?? true;
    const intensity = input.intensity ?? 1;
    if (!Number.isFinite(intensity) || intensity < 0) {
      throw new RangeError("Room effect intensity must be nonnegative and finite.");
    }

    if (isOverlayEffect(input)) {
      if (input.coveragePx !== undefined && (!Number.isFinite(input.coveragePx) || input.coveragePx <= 0)) {
        throw new RangeError("Room overlay coveragePx must be positive and finite.");
      }
      const field: AtmosphereFieldInput = {
        enabled,
        opacity: intensity,
        scalePx: input.coveragePx ?? (input.effect === "fog" ? 360 : 520),
        tint: input.tint ?? "#ffffff",
        windDirectionDegrees: input.wind?.directionDegrees ?? 0,
        windSpeedPxPerSecond: input.wind?.speedPxPerSecond ?? 0,
        transitionTimeMs: input.transitionTimeMs,
        removalDurationMs: input.removalDurationMs
      };
      this.requireAtmosphere().setField(input.id, input.effect, input.order ?? 0, field);
      return;
    }

    if (input.sizePx !== undefined && (!Number.isFinite(input.sizePx) || input.sizePx <= 0)) {
      throw new RangeError("Room effect sizePx must be positive and finite.");
    }
    if (!this.registeredRoomEffects.has(input.effect.id)) {
      throw new Error(`Unknown room effect recipe '${input.effect.id}'. Register the recipe before setting it.`);
    }
    const wind = input.wind;
    this.particleSystem.upsertRoomEmitter({
      id: input.id,
      style: input.effect.id,
      active: enabled,
      order: input.order,
      densityScale: intensity,
      sizePx: input.sizePx,
      streamSizesPx: input.effect.id === "rain" && input.rain ? {
        ...(input.rain.dropSizePx === undefined ? {} : { drops: input.rain.dropSizePx }),
        ...(input.rain.rippleSizePx === undefined ? {} : { splash: input.rain.rippleSizePx })
      } : undefined,
      colors: input.colors,
      colorChangeMode: input.colorChangeMode,
      lifetimeSeconds: input.lifetimeSeconds,
      colorTransitionSeconds: input.colorTransitionSeconds,
      surge: input.surge,
      layer: input.layer,
      windXPxPerSecond: wind ? Math.cos(wind.directionDegrees * Math.PI / 180) * wind.speedPxPerSecond : 0,
      windYPxPerSecond: wind ? Math.sin(wind.directionDegrees * Math.PI / 180) * wind.speedPxPerSecond : 0
    });
  }

  remove(id: string): void {
    this.ensureActive();
    this.particleSystem.removeEmitter(id);
    this.atmosphereSystem?.removeField(id);
    this.stainSystem?.removeStain(id);
  }

  update(timeSeconds: number): void {
    this.ensureActive();
    this.particleSystem.update(timeSeconds);
    this.atmosphereSystem?.update(timeSeconds);
    this.stainSystem?.update(timeSeconds);
  }

  clear(): void {
    this.ensureActive();
    this.particleSystem.clear();
    this.atmosphereSystem?.clear();
    this.stainSystem?.clear();
    this.stainSystem?.resetClock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.particleSystem.dispose();
    this.atmosphereSystem?.dispose();
    this.stainSystem?.dispose();
    this.preLight.destroy({ children: true });
    this.postLight.destroy({ children: true });
    this.disposed = true;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("Effects controller has been disposed.");
  }

  private requireAtmosphere(): TopDownAtmosphereSystem {
    if (!this.atmosphereSystem) {
      throw new Error("Room overlays require fog and cloud textures in TopDownEffectsOptions.");
    }
    return this.atmosphereSystem;
  }
}
