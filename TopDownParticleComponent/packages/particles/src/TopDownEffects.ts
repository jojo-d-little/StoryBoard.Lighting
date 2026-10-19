import { Container } from "pixi.js";
import { TopDownAtmosphereSystem } from "./TopDownAtmosphereSystem.js";
import type { AtmosphereFieldInput, TopDownAtmosphereSystemOptions } from "./TopDownAtmosphereSystem.js";
import { TopDownParticleSystem } from "./TopDownParticleSystem.js";
import { loadDefaultParticleAssets } from "./default-assets.js";
import type { DefaultParticleAssetOverrides } from "./default-assets.js";
import type {
  ParticleBurstInput,
  ParticleEffectDefinition,
  ParticleOccluderInput,
  ParticleRoomGeometry,
  ParticleRoomStyleDefinition,
  ParticleSurgeInput,
  ParticleStats,
  ParticleStimulusInput,
  ParticleStyleDefinition,
  ParticleStyledEmitterInput,
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
  };
  maxParticles?: number;
  seed?: number;
}

/** Options for the async factory that loads this package's default images. */
export interface TopDownEffectsCreateOptions extends Omit<TopDownEffectsOptions, "textures"> {
  /** Matching custom textures override packaged defaults; omitted entries use package art. */
  textures?: DefaultParticleAssetOverrides;
}

/**
 * Caller-facing effect controller. Register recipes once, then configure
 * point effects and room effects without selecting their rendering systems.
 */
export class TopDownEffects {
  readonly preLight = new Container();
  readonly postLight = new Container();
  private readonly particleSystem: TopDownParticleSystem;
  private readonly atmosphereSystem?: TopDownAtmosphereSystem;

  private readonly registeredRoomEffects = new Set<string>();
  private readonly cloudSlots = new Map<string, number>();
  private fogId: string | null = null;
  private disposed = false;

  /** Create a controller with packaged default art and optional per-image overrides. */
  static async create(options: TopDownEffectsCreateOptions = {}): Promise<TopDownEffects> {
    const textures = await loadDefaultParticleAssets(options.textures);
    return new TopDownEffects({
      textures,
      maxParticles: options.maxParticles,
      seed: options.seed
    });
  }

  constructor(options: TopDownEffectsOptions) {
    this.particleSystem = new TopDownParticleSystem({
      textures: options.textures.particles,
      maxParticles: options.maxParticles,
      seed: options.seed
    });
    if (options.textures.fog && options.textures.clouds) {
      this.atmosphereSystem = new TopDownAtmosphereSystem({
        fogTexture: options.textures.fog,
        cloudTexture: options.textures.clouds
      });
    } else if (options.textures.fog || options.textures.clouds) {
      throw new TypeError("Room overlays require both fog and cloud textures.");
    }
    this.preLight.addChild(this.particleSystem.preLight);
    this.postLight.addChild(this.particleSystem.postLight);
    if (this.atmosphereSystem) this.postLight.addChild(this.atmosphereSystem.layer);
  }

  setRoomGeometry(geometry: ParticleRoomGeometry): void {
    this.ensureActive();
    this.particleSystem.setRoomGeometry(geometry);
    this.atmosphereSystem?.setRoomGeometry(geometry);
  }

  registerRoomEffect(recipe: ParticleRoomStyleDefinition): RegisteredRoomEffectName {
    this.ensureActive();
    if (recipe.id === "fog" || recipe.id === "cloud") {
      throw new Error(`'${recipe.id}' is reserved for a built-in room overlay.`);
    }
    this.particleSystem.registerRoomStyle(recipe);
    this.registeredRoomEffects.add(recipe.id);
    return Object.freeze({ id: recipe.id, [registeredRoomEffectName]: true as const });
  }

  registerPointStyle(recipe: ParticleStyleDefinition): void {
    this.ensureActive();
    this.particleSystem.registerStyle(recipe);
  }

  /** Lower-level recipe registration for engine-owned point effects. */
  registerEffect(recipe: ParticleEffectDefinition): void {
    this.ensureActive();
    this.particleSystem.registerEffect(recipe);
  }

  setPointEffect(input: ParticleStyledEmitterInput): void {
    this.ensureActive();
    this.particleSystem.upsertStyledEmitter(input);
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

  getStats(): ParticleStats {
    this.ensureActive();
    return this.particleSystem.getStats();
  }

  /** Set or update a named room effect. */
  setRoomEffect(input: RoomEffectInput): void {
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
        windSpeedPxPerSecond: input.wind?.speedPxPerSecond ?? 0
      };
      if (input.effect === "fog") {
        this.fogId = input.id;
        this.requireAtmosphere().setFog(field);
        return;
      }
      let slot = this.cloudSlots.get(input.id);
      if (slot === undefined) {
        const occupied = new Set(this.cloudSlots.values());
        slot = [0, 1, 2].find(candidate => !occupied.has(candidate));
        if (slot === undefined) throw new RangeError("At most three cloud room effects can be active.");
        this.cloudSlots.set(input.id, slot);
      }
      this.requireAtmosphere().setCloudLayer(slot, field);
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
      densityScale: intensity,
      sizePx: input.sizePx,
      streamSizesPx: input.effect.id === "rain" && input.rain ? {
        ...(input.rain.dropSizePx === undefined ? {} : { drops: input.rain.dropSizePx }),
        ...(input.rain.rippleSizePx === undefined ? {} : { splash: input.rain.rippleSizePx })
      } : undefined,
      colors: input.colors,
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
    if (this.fogId === id) {
      this.fogId = null;
      this.requireAtmosphere().setFog({ enabled: false });
    }
    const slot = this.cloudSlots.get(id);
    if (slot !== undefined) {
      this.cloudSlots.delete(id);
      this.requireAtmosphere().setCloudLayer(slot, { enabled: false });
    }
  }

  removePointEffect(id: string): void {
    this.ensureActive();
    this.particleSystem.removeEmitter(id);
  }

  removeEmitter(id: string): void {
    this.removePointEffect(id);
  }

  update(timeSeconds: number): void {
    this.ensureActive();
    this.particleSystem.update(timeSeconds);
    this.atmosphereSystem?.update(timeSeconds);
  }

  clear(): void {
    this.ensureActive();
    this.particleSystem.clear();
    this.fogId = null;
    this.cloudSlots.clear();
    if (this.atmosphereSystem) {
      this.atmosphereSystem.setFog({ enabled: false });
      for (let slot = 0; slot < 3; slot++) this.atmosphereSystem.setCloudLayer(slot, { enabled: false });
      this.atmosphereSystem.resetClock();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.particleSystem.dispose();
    this.atmosphereSystem?.dispose();
    this.preLight.destroy({ children: false });
    this.postLight.destroy({ children: false });
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
