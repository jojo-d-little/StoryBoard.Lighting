import { Container, TilingSprite, type Texture } from "pixi.js";
import type { ParticleRoomGeometry } from "./contracts.js";

/** A continuous, room-wide overlay. Speeds are room pixels per second. */
export interface AtmosphereFieldInput {
  enabled?: boolean;
  /** Overlay opacity, from 0 (invisible) to 1 (opaque). */
  opacity?: number;
  /** Hex tint multiplied with the authored texture colors. */
  tint?: string;
  /** Approximate repeated texture width in room pixels. */
  scalePx?: number;
  windDirectionDegrees?: number;
  windSpeedPxPerSecond?: number;
}

export interface TopDownAtmosphereSystemOptions {
  /** Borrowed, already loaded seamless textures. The host owns their lifecycle. */
  fogTexture: Texture;
  cloudTexture: Texture;
  /** Three independent image layers allow separate sizes, opacity, and drift. */
  maxCloudLayers?: number;
}

interface FieldRuntime {
  container: Container;
  sprites: TilingSprite[];
  tileScaleFactors: number[];
  phaseFractions: Array<[number, number]>;
  input: Required<AtmosphereFieldInput>;
}

const DEFAULT_FIELD: Required<AtmosphereFieldInput> = {
  enabled: false,
  opacity: 0.2,
  tint: "#ffffff",
  scalePx: 360,
  windDirectionDegrees: 0,
  windSpeedPxPerSecond: 0
};

function normalized(input: AtmosphereFieldInput): Required<AtmosphereFieldInput> {
  const result = { ...DEFAULT_FIELD, ...input };
  if (typeof result.enabled !== "boolean" || !Number.isFinite(result.opacity) || result.opacity < 0 || result.opacity > 1 ||
      !Number.isFinite(result.scalePx) || result.scalePx <= 0 || !Number.isFinite(result.windDirectionDegrees) ||
      !Number.isFinite(result.windSpeedPxPerSecond) || result.windSpeedPxPerSecond < 0 || !/^#[0-9a-fA-F]{6}$/.test(result.tint)) {
    throw new RangeError("Atmosphere fields require opacity 0–1, positive scale, finite direction, and nonnegative wind speed.");
  }
  result.windDirectionDegrees = ((result.windDirectionDegrees % 360) + 360) % 360;
  return result;
}

/**
 * Separate, shader-free room atmosphere overlays for fog and visible clouds.
 * The host chooses where `layer` sits in its composition; this system never
 * reads or changes lighting. Call update with the host's monotonic game time.
 */
export class TopDownAtmosphereSystem {
  readonly layer = new Container();
  private readonly fog: FieldRuntime;
  private readonly clouds: FieldRuntime[];
  private widthPx = 0;
  private heightPx = 0;
  private lastTimeSeconds: number | undefined;
  private disposed = false;

  constructor(options: TopDownAtmosphereSystemOptions) {
    const maxCloudLayers = options.maxCloudLayers ?? 3;
    if (!Number.isInteger(maxCloudLayers) || maxCloudLayers < 1 || maxCloudLayers > 3) {
      throw new RangeError("Atmosphere supports one to three cloud layers.");
    }
    // Three overlapping fog tiles use different periods and offsets so their
    // repeat boundaries do not line up into visible horizontal/vertical bands.
    this.fog = this.createField(options.fogTexture, true);
    this.clouds = Array.from({ length: maxCloudLayers }, () => this.createField(options.cloudTexture));
    this.layer.addChild(this.fog.container);
    for (const cloud of this.clouds) this.layer.addChild(cloud.container);
  }

  setRoomGeometry(geometry: Pick<ParticleRoomGeometry, "widthPx" | "heightPx">): void {
    this.ensureActive();
    if (!Number.isFinite(geometry.widthPx) || geometry.widthPx <= 0 || !Number.isFinite(geometry.heightPx) || geometry.heightPx <= 0) {
      throw new RangeError("Atmosphere room dimensions must be positive finite pixel values.");
    }
    this.widthPx = geometry.widthPx;
    this.heightPx = geometry.heightPx;
    for (const field of [this.fog, ...this.clouds]) {
      for (const sprite of field.sprites) {
        sprite.width = this.widthPx;
        sprite.height = this.heightPx;
      }
    }
  }

  setFog(input: AtmosphereFieldInput): void {
    this.apply(this.fog, input);
  }

  setCloudLayer(index: number, input: AtmosphereFieldInput): void {
    this.ensureActive();
    const cloud = this.clouds[index];
    if (!cloud) throw new RangeError(`Cloud layer index ${index} is not configured.`);
    this.apply(cloud, input);
  }

  getCloudLayerCount(): number {
    return this.clouds.length;
  }

  update(timeSeconds: number): void {
    this.ensureActive();
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Atmosphere time must be a nonnegative finite number.");
    if (this.lastTimeSeconds !== undefined && timeSeconds < this.lastTimeSeconds) {
      throw new RangeError("Atmosphere time cannot move backward; call resetClock() before restarting.");
    }
    this.lastTimeSeconds = timeSeconds;
    for (const field of [this.fog, ...this.clouds]) {
      const { windDirectionDegrees, windSpeedPxPerSecond } = field.input;
      const radians = windDirectionDegrees * Math.PI / 180;
      // Modulo avoids unbounded tile offsets in long-running rooms.
      for (let index = 0; index < field.sprites.length; index++) {
        const period = field.input.scalePx * field.tileScaleFactors[index];
        const [phaseX, phaseY] = field.phaseFractions[index];
        const x = (Math.cos(radians) * windSpeedPxPerSecond * timeSeconds + period * phaseX) % period;
        const y = (Math.sin(radians) * windSpeedPxPerSecond * timeSeconds + period * phaseY) % period;
        field.sprites[index].tilePosition.set(x, y);
      }
    }
  }

  resetClock(): void {
    this.lastTimeSeconds = undefined;
    for (const field of [this.fog, ...this.clouds]) {
      for (let index = 0; index < field.sprites.length; index++) {
        const period = field.input.scalePx * field.tileScaleFactors[index];
        const [phaseX, phaseY] = field.phaseFractions[index];
        field.sprites[index].tilePosition.set(period * phaseX, period * phaseY);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.layer.destroy({ children: true });
    this.disposed = true;
  }

  private createField(texture: Texture, fog = false): FieldRuntime {
    const container = new Container();
    const tileScaleFactors = fog ? [1, 0.77, 1.29] : [1];
    const phaseFractions: Array<[number, number]> = fog ? [[0, 0], [0.5, 0.5], [0.29, 0.67]] : [[0, 0]];
    const alphaScales = fog ? [1, 0.4, 0.28] : [1];
    const sprites = tileScaleFactors.map((_, index) => {
      const sprite = new TilingSprite({ texture, width: this.widthPx, height: this.heightPx });
      sprite.alpha = alphaScales[index];
      container.addChild(sprite);
      return sprite;
    });
    container.visible = false;
    return { container, sprites, tileScaleFactors, phaseFractions, input: { ...DEFAULT_FIELD } };
  }

  private apply(field: FieldRuntime, input: AtmosphereFieldInput): void {
    this.ensureActive();
    field.input = normalized(input);
    field.container.alpha = field.input.opacity;
    field.container.visible = field.input.enabled && field.input.opacity > 0;
    for (let index = 0; index < field.sprites.length; index++) {
      const sprite = field.sprites[index];
      sprite.tint = Number.parseInt(field.input.tint.slice(1), 16);
      const size = field.input.scalePx * field.tileScaleFactors[index];
      sprite.tileScale.set(size / sprite.texture.width, size / sprite.texture.height);
    }
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("Atmosphere system has been disposed.");
  }
}
