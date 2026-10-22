import { Container, TilingSprite, type Texture } from "pixi.js";
import type { ParticleRoomGeometry } from "./contracts.js";
import type { RenderOrderCoordinator } from "./RenderOrderCoordinator.js";

interface AtmosphereRenderOptions {
  layer?: Container;
  orderCoordinator?: RenderOrderCoordinator;
}

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
  /** Visual retuning/fade duration when no explicit removal duration is set. */
  transitionTimeMs?: number;
  /** Zero removes immediately; positive values fade; null uses transitionTimeMs. */
  removalDurationMs?: number | null;
}

export interface TopDownAtmosphereSystemOptions {
  /** Borrowed, already loaded seamless textures. The host owns their lifecycle. */
  fogTexture: Texture;
  cloudTexture: Texture;
  /** Three independent image layers allow separate sizes, opacity, and drift. */
  maxCloudLayers?: number;
}

interface FieldRuntime {
  id: string;
  kind: "fog" | "cloud";
  order: number;
  container: Container;
  sprites: TilingSprite[];
  tileScaleFactors: number[];
  phaseFractions: Array<[number, number]>;
  offsetX: number[];
  offsetY: number[];
  input: Required<AtmosphereFieldInput>;
  alphaFade?: { from: number; to: number; startedAtSeconds: number; durationSeconds: number };
  removing: boolean;
}

const DEFAULT_FIELD: Required<AtmosphereFieldInput> = {
  enabled: false,
  opacity: 0.2,
  tint: "#ffffff",
  scalePx: 360,
  windDirectionDegrees: 0,
  windSpeedPxPerSecond: 0,
  transitionTimeMs: 0,
  removalDurationMs: null
};

function normalized(input: AtmosphereFieldInput): Required<AtmosphereFieldInput> {
  const result = { ...DEFAULT_FIELD };
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) Object.assign(result, { [key]: value });
  }
  if (typeof result.enabled !== "boolean" || !Number.isFinite(result.opacity) || result.opacity < 0 || result.opacity > 1 ||
      !Number.isFinite(result.scalePx) || result.scalePx <= 0 || !Number.isFinite(result.windDirectionDegrees) ||
      !Number.isFinite(result.windSpeedPxPerSecond) || result.windSpeedPxPerSecond < 0 ||
      !Number.isFinite(result.transitionTimeMs) || result.transitionTimeMs < 0 ||
      (result.removalDurationMs !== null && (!Number.isFinite(result.removalDurationMs) || result.removalDurationMs < 0)) ||
      !/^#[0-9a-fA-F]{6}$/.test(result.tint)) {
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
  readonly layer: Container;
  private readonly fields = new Map<string, FieldRuntime>();
  private readonly fogTexture: Texture;
  private readonly cloudTexture: Texture;
  private widthPx = 0;
  private heightPx = 0;
  private lastTimeSeconds: number | undefined;
  private disposed = false;
  private readonly ownsLayer: boolean;
  private readonly orderCoordinator?: RenderOrderCoordinator;

  constructor(options: TopDownAtmosphereSystemOptions & AtmosphereRenderOptions) {
    this.ownsLayer = options.layer === undefined;
    this.layer = options.layer ?? new Container();
    this.orderCoordinator = options.orderCoordinator;
    this.fogTexture = options.fogTexture;
    this.cloudTexture = options.cloudTexture;
  }

  setRoomGeometry(geometry: Pick<ParticleRoomGeometry, "widthPx" | "heightPx">): void {
    this.ensureActive();
    if (!Number.isFinite(geometry.widthPx) || geometry.widthPx <= 0 || !Number.isFinite(geometry.heightPx) || geometry.heightPx <= 0) {
      throw new RangeError("Atmosphere room dimensions must be positive finite pixel values.");
    }
    this.widthPx = geometry.widthPx;
    this.heightPx = geometry.heightPx;
    for (const field of this.fields.values()) {
      for (const sprite of field.sprites) {
        sprite.width = this.widthPx;
        sprite.height = this.heightPx;
      }
    }
  }

  setField(id: string, kind: "fog" | "cloud", order: number, input: AtmosphereFieldInput): void {
    this.ensureActive();
    if (!id.trim()) throw new TypeError("Atmosphere field ID must be non-empty.");
    if (!Number.isFinite(order)) throw new RangeError("Atmosphere order must be finite.");
    let field = this.fields.get(id);
    if (field && field.kind !== kind) {
      this.destroyField(field);
      field = undefined;
    }
    const isNewField = !field;
    if (!field) {
      field = this.createField(id, kind, kind === "fog" ? this.fogTexture : this.cloudTexture);
      this.fields.set(id, field);
      this.layer.addChild(field.container);
    }
    field.order = order;
    this.apply(field, input, isNewField);
    if (this.orderCoordinator) this.orderCoordinator.register(id, order, "post-light", 0, field.container);
    else this.sortFields();
  }

  removeField(id: string, fallbackDurationMs?: number): boolean {
    this.ensureActive();
    const field = this.fields.get(id);
    if (!field) return false;
    const durationMs = field.input.removalDurationMs ?? fallbackDurationMs ?? field.input.transitionTimeMs;
    if (durationMs > 0) {
      const now = this.lastTimeSeconds ?? 0;
      const from = this.fieldAlpha(field, now);
      field.input = { ...field.input, enabled: false };
      field.alphaFade = { from, to: 0, startedAtSeconds: now, durationSeconds: durationMs / 1000 };
      field.removing = true;
      this.applyAlpha(field, now);
      return true;
    }
    this.destroyField(field);
    return true;
  }

  private destroyField(field: FieldRuntime): void {
    this.orderCoordinator?.remove(field.container);
    this.layer.removeChild(field.container);
    field.container.destroy({ children: true });
    this.fields.delete(field.id);
  }

  clear(): void {
    this.ensureActive();
    for (const field of [...this.fields.values()]) this.destroyField(field);
    this.lastTimeSeconds = undefined;
  }

  getFieldCount(): number {
    return this.fields.size;
  }

  update(timeSeconds: number): void {
    this.ensureActive();
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new RangeError("Atmosphere time must be a nonnegative finite number.");
    if (this.lastTimeSeconds !== undefined && timeSeconds < this.lastTimeSeconds) {
      throw new RangeError("Atmosphere time cannot move backward; call resetClock() before restarting.");
    }
    const elapsed = this.lastTimeSeconds === undefined ? 0 : timeSeconds - this.lastTimeSeconds;
    this.lastTimeSeconds = timeSeconds;
    const finishedRemovals: FieldRuntime[] = [];
    for (const field of this.fields.values()) {
      const { windDirectionDegrees, windSpeedPxPerSecond } = field.input;
      const radians = windDirectionDegrees * Math.PI / 180;
      for (let index = 0; index < field.sprites.length; index++) {
        const period = field.input.scalePx * field.tileScaleFactors[index];
        field.offsetX[index] = (field.offsetX[index] + Math.cos(radians) * windSpeedPxPerSecond * elapsed) % period;
        field.offsetY[index] = (field.offsetY[index] + Math.sin(radians) * windSpeedPxPerSecond * elapsed) % period;
      }
      for (let index = 0; index < field.sprites.length; index++) {
        const period = field.input.scalePx * field.tileScaleFactors[index];
        const [phaseX, phaseY] = field.phaseFractions[index];
        const x = (field.offsetX[index] + period * phaseX) % period;
        const y = (field.offsetY[index] + period * phaseY) % period;
        field.sprites[index].tilePosition.set(x, y);
      }
      this.applyAlpha(field, timeSeconds);
      if (field.removing && this.fieldAlpha(field, timeSeconds) <= 0) finishedRemovals.push(field);
    }
    for (const field of finishedRemovals) this.destroyField(field);
  }

  resetClock(): void {
    this.lastTimeSeconds = undefined;
    for (const field of this.fields.values()) {
      field.offsetX.fill(0);
      field.offsetY.fill(0);
      for (let index = 0; index < field.sprites.length; index++) {
        const period = field.input.scalePx * field.tileScaleFactors[index];
        const [phaseX, phaseY] = field.phaseFractions[index];
        field.sprites[index].tilePosition.set(period * phaseX, period * phaseY);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    if (this.ownsLayer) this.layer.destroy({ children: true });
    this.disposed = true;
  }

  private createField(id: string, kind: "fog" | "cloud", texture: Texture): FieldRuntime {
    const fog = kind === "fog";
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
    return { id, kind, order: 0, container, sprites, tileScaleFactors, phaseFractions,
      offsetX: tileScaleFactors.map(() => 0), offsetY: tileScaleFactors.map(() => 0), input: { ...DEFAULT_FIELD }, removing: false };
  }

  private apply(field: FieldRuntime, input: AtmosphereFieldInput, initial = false): void {
    this.ensureActive();
    const next = normalized(input);
    const now = this.lastTimeSeconds ?? 0;
    if (!initial && field.input.enabled && !next.enabled) {
      const durationMs = next.removalDurationMs ?? next.transitionTimeMs;
      const from = this.fieldAlpha(field, now);
      field.alphaFade = durationMs > 0
        ? { from, to: 0, startedAtSeconds: now, durationSeconds: durationMs / 1000 }
        : undefined;
      field.removing = false;
    } else if (!initial && !field.input.enabled && next.enabled) {
      const from = this.fieldAlpha(field, now);
      const durationMs = next.transitionTimeMs || (next.removalDurationMs ?? 0);
      field.alphaFade = from < 1 && durationMs > 0
        ? { from, to: 1, startedAtSeconds: now, durationSeconds: durationMs / 1000 }
        : undefined;
      field.removing = false;
    }
    field.input = next;
    for (let index = 0; index < field.sprites.length; index++) {
      const sprite = field.sprites[index];
      sprite.tint = Number.parseInt(field.input.tint.slice(1), 16);
      const size = field.input.scalePx * field.tileScaleFactors[index];
      sprite.tileScale.set(size / sprite.texture.width, size / sprite.texture.height);
    }
    this.applyAlpha(field, now);
  }

  private fieldAlpha(field: FieldRuntime, timeSeconds: number): number {
    const fade = field.alphaFade;
    if (!fade) return field.input.enabled ? 1 : 0;
    const progress = Math.max(0, Math.min(1, (timeSeconds - fade.startedAtSeconds) / fade.durationSeconds));
    return fade.from + (fade.to - fade.from) * progress;
  }

  private applyAlpha(field: FieldRuntime, timeSeconds: number): void {
    const factor = this.fieldAlpha(field, timeSeconds);
    field.container.alpha = field.input.opacity * factor;
    field.container.visible = field.input.opacity > 0 && factor > 0;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("Atmosphere system has been disposed.");
  }

  private sortFields(): void {
    const ordered = [...this.fields.values()].sort((a, b) =>
      a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    ordered.forEach((field, index) => this.layer.setChildIndex(field.container, index));
  }
}
