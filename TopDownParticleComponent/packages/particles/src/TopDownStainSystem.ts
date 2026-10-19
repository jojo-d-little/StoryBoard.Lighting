import { Container, Sprite } from "pixi.js";
import type {
  TopDownStainInput,
  TopDownStainStyle,
  TopDownStainSystemOptions
} from "./contracts.js";
import type { TopDownStainTextures } from "./contracts.js";
import { loadDefaultStainTextures } from "./default-assets.js";

export interface TopDownStainSystemCreateOptions extends Omit<TopDownStainSystemOptions, "textures"> {
  /** Matching custom style sets replace packaged defaults. */
  textures?: Partial<TopDownStainTextures>;
}

interface NormalizedStain extends TopDownStainInput {
  colors: readonly string[];
  opacity: number;
  amount: number;
  directionDegrees: number;
  layer: "pre-light" | "post-light";
  active: boolean;
}

interface StainRuntime {
  input: NormalizedStain;
  container: Container;
  base?: Sprite;
  detail?: Sprite;
  sprayStrokes: Sprite[];
  variation: StainShapeVariation;
  createdAtSeconds: number;
}

interface SprayStrokeVariation {
  textureIndex: number;
  lengthScale: number;
  startOffset: number;
  lateralOffset: number;
  angleOffset: number;
  useSecondaryColor: boolean;
  alpha: number;
}

interface StainShapeVariation {
  textureVariantIndex: number;
  sprayStrokes: SprayStrokeVariation[];
  flipBaseY: boolean;
  flipDetailY: boolean;
  patchRotation: number;
  detailScaleX: number;
  detailScaleY: number;
  detailRotation: number;
  detailOffsetX: number;
  detailOffsetY: number;
}

const DEFAULT_COLORS = ["#8b2635", "#d38b72"] as const;
const DEFAULT_MAX_STAINS = 50;
const DIRECTIONAL_SPRAY_CROSS_AXIS_PX = 120;
const DIRECTIONAL_SPRAY_STREAK_HEIGHT_PX = 10;
const DIRECTIONAL_SPRAY_MIN_STREAKS = 4;
const DIRECTIONAL_SPRAY_MAX_STREAKS = 10;

/**
 * Static, translucent surface marks for top-down rooms. Stains are sprites,
 * not simulated particles; they remain until removed or their optional
 * lifetime expires. The host owns the renderer, textures, and game clock.
 */
export class TopDownStainSystem {
  readonly preLight = new Container();
  readonly postLight = new Container();

  private readonly textures: TopDownStainSystemOptions["textures"];
  private readonly maxStains: number;
  private readonly onExpire?: (id: string) => void;
  private readonly stains = new Map<string, StainRuntime>();
  private timeSeconds = 0;
  private disposed = false;

  /** Create a stain system with packaged default textures and optional style overrides. */
  static async create(options: TopDownStainSystemCreateOptions = {}): Promise<TopDownStainSystem> {
    const textures = await loadDefaultStainTextures({ stains: options.textures });
    return new TopDownStainSystem({
      textures,
      maxStains: options.maxStains,
      onExpire: options.onExpire
    });
  }

  constructor(options: TopDownStainSystemOptions) {
    this.textures = options.textures;
    this.maxStains = options.maxStains ?? DEFAULT_MAX_STAINS;
    this.onExpire = options.onExpire;
    if (!Number.isInteger(this.maxStains) || this.maxStains < 1) {
      throw new RangeError("maxStains must be a positive integer.");
    }
    for (const style of ["splatter", "patch", "streak"] as const) {
      const textureSet = this.textures[style];
      if (!textureSet?.base || !textureSet?.detail || textureSet.variants?.some(pair => !pair?.base || !pair?.detail)) {
        throw new TypeError(`Missing base or detail texture for stain style '${style}'.`);
      }
    }
    const sprayTextures = this.textures["directional-spray"];
    if (sprayTextures && (!sprayTextures.base || !sprayTextures.detail || sprayTextures.variants?.some(pair => !pair?.base || !pair?.detail) || sprayTextures.streakVariants?.some(texture => !texture))) {
      throw new TypeError("Missing base or detail texture for stain style 'directional-spray'.");
    }
  }

  upsertStain(input: TopDownStainInput): void {
    this.ensureActive();
    const normalized = normalizeStain(input);
    const previous = this.stains.get(normalized.id);
    if (!previous && this.stains.size >= this.maxStains) {
      throw new RangeError(`Stain capacity (${this.maxStains}) has been reached.`);
    }

    const state = previous?.input.style === normalized.style
      ? previous
      : this.createRuntime(normalized);
    if (previous && state !== previous) this.destroyRuntime(previous);
    state.input = normalized;
    if (previous && state !== previous) state.createdAtSeconds = previous.createdAtSeconds;
    else if (!previous) state.createdAtSeconds = this.timeSeconds;
    this.applyRuntime(state);
    this.stains.set(normalized.id, state);
  }

  removeStain(id: string): boolean {
    this.ensureActive();
    const state = this.stains.get(id);
    if (!state) return false;
    this.destroyRuntime(state);
    this.stains.delete(id);
    return true;
  }

  clear(): void {
    this.ensureActive();
    for (const state of this.stains.values()) this.destroyRuntime(state);
    this.stains.clear();
  }

  getStainIds(): string[] {
    this.ensureActive();
    return [...this.stains.keys()];
  }

  update(timeSeconds: number): void {
    this.ensureActive();
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      throw new RangeError("Stain time must be a nonnegative finite number.");
    }
    if (timeSeconds < this.timeSeconds) {
      throw new RangeError("Stain time cannot move backward; call resetClock() before restarting.");
    }
    this.timeSeconds = timeSeconds;

    for (const [id, state] of this.stains) {
      const lifetime = state.input.lifetimeSeconds;
      if (lifetime === undefined) continue;
      const age = Math.max(0, timeSeconds - state.createdAtSeconds);
      if (age >= lifetime) {
        this.removeStain(id);
        this.onExpire?.(id);
        continue;
      }
      this.applyAlpha(state, timeSeconds);
    }
  }

  /** Resets finite stain lifetimes along with the host's restarted game clock. */
  resetClock(): void {
    this.ensureActive();
    this.timeSeconds = 0;
    for (const state of this.stains.values()) state.createdAtSeconds = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.preLight.destroy({ children: true });
    this.postLight.destroy({ children: true });
    this.disposed = true;
  }

  private createRuntime(input: NormalizedStain): StainRuntime {
    const textureSet = this.textures[input.style];
    if (!textureSet?.base || !textureSet?.detail) {
      throw new TypeError(`Missing base or detail texture for stain style '${input.style}'.`);
    }
    const sprayTextures = input.style === "directional-spray" ? textureSet.streakVariants : undefined;
    const variation = createShapeVariation(input.id, textureSet.variants?.length ?? 0, sprayTextures?.length ?? 0);
    const container = new Container();
    if (sprayTextures?.length) {
      const sprayStrokes = variation.sprayStrokes.map(stroke => {
        const sprite = new Sprite(sprayTextures[stroke.textureIndex]);
        sprite.anchor.set(0, 0.5);
        container.addChild(sprite);
        return sprite;
      });
      (input.layer === "pre-light" ? this.preLight : this.postLight).addChild(container);
      return { input, container, sprayStrokes, variation, createdAtSeconds: this.timeSeconds };
    }
    const texturePair = variation.textureVariantIndex === 0
      ? textureSet
      : textureSet.variants![variation.textureVariantIndex - 1];
    const base = new Sprite(texturePair.base);
    const detail = new Sprite(texturePair.detail);
    base.anchor.set(0.5);
    detail.anchor.set(0.5);
    container.addChild(base, detail);
    (input.layer === "pre-light" ? this.preLight : this.postLight).addChild(container);
    return {
      input, container, base, detail, sprayStrokes: [],
      variation,
      createdAtSeconds: this.timeSeconds
    };
  }

  private applyRuntime(state: StainRuntime): void {
    const { input, container, base, detail, sprayStrokes, variation } = state;
    const primary = input.colors[0] ?? DEFAULT_COLORS[0];
    const secondary = input.colors[1] ?? primary;
    const nextLayer = input.layer === "pre-light" ? this.preLight : this.postLight;
    if (container.parent !== nextLayer) nextLayer.addChild(container);
    // The spray texture is authored to fan rightward from its left edge, so
    // x/y identifies the source and the group extends forward from that point.
    const sourceOffset = input.style === "directional-spray" && sprayStrokes.length === 0 ? input.sizePx / 2 : 0;
    container.position.set(
      input.xPx + Math.cos(input.directionDegrees * Math.PI / 180) * sourceOffset,
      input.yPx + Math.sin(input.directionDegrees * Math.PI / 180) * sourceOffset
    );
    container.rotation = input.style === "patch"
      ? variation.patchRotation
      : input.directionDegrees * Math.PI / 180;
    container.visible = input.active && input.opacity > 0;
    if (sprayStrokes.length) {
      const visibleCount = DIRECTIONAL_SPRAY_MIN_STREAKS
        + Math.round(input.amount * (DIRECTIONAL_SPRAY_MAX_STREAKS - DIRECTIONAL_SPRAY_MIN_STREAKS));
      for (let index = 0; index < sprayStrokes.length; index++) {
        const sprite = sprayStrokes[index];
        const stroke = variation.sprayStrokes[index];
        sprite.visible = index < visibleCount;
        sprite.position.set(stroke.startOffset * input.sizePx, stroke.lateralOffset * DIRECTIONAL_SPRAY_CROSS_AXIS_PX);
        sprite.rotation = stroke.angleOffset;
        sprite.width = input.sizePx * stroke.lengthScale;
        // Each mark is one complete streak image. Vary its length along the
        // direction of travel while keeping its crosswise thickness fixed.
        sprite.height = DIRECTIONAL_SPRAY_STREAK_HEIGHT_PX;
        sprite.tint = parseHex(input.colors[stroke.useSecondaryColor ? 1 : 0] ?? input.colors[0] ?? DEFAULT_COLORS[0]);
        sprite.alpha = stroke.alpha;
      }
      this.applyAlpha(state, this.timeSeconds);
      return;
    }
    if (!base || !detail) throw new Error("Stain runtime is missing its base/detail sprites.");
    base.width = input.sizePx;
    base.height = input.style === "directional-spray" ? DIRECTIONAL_SPRAY_CROSS_AXIS_PX : input.sizePx;
    base.scale.y = variation.flipBaseY ? -Math.abs(base.scale.y) : Math.abs(base.scale.y);
    base.tint = parseHex(primary);
    detail.width = input.sizePx;
    detail.height = input.style === "directional-spray" ? DIRECTIONAL_SPRAY_CROSS_AXIS_PX : input.sizePx;
    detail.scale.set(
      Math.abs(detail.scale.x) * variation.detailScaleX,
      Math.abs(detail.scale.y) * variation.detailScaleY * (variation.flipDetailY ? -1 : 1)
    );
    detail.position.set(
      variation.detailOffsetX * input.sizePx,
      variation.detailOffsetY * (input.style === "directional-spray" ? DIRECTIONAL_SPRAY_CROSS_AXIS_PX : input.sizePx)
    );
    detail.rotation = input.style === "patch"
      ? variation.detailRotation
      : (variation.detailRotation - Math.PI) * 0.1;
    detail.tint = parseHex(secondary);
    detail.alpha = input.amount;
    this.applyAlpha(state, this.timeSeconds);
  }

  private applyAlpha(state: StainRuntime, timeSeconds: number): void {
    const { lifetimeSeconds, fadeOutSeconds } = state.input;
    if (lifetimeSeconds === undefined) {
      state.container.alpha = state.input.opacity;
      return;
    }
    const age = Math.max(0, timeSeconds - state.createdAtSeconds);
    const fade = fadeOutSeconds ?? 0;
    const fadeAlpha = fade > 0 && age > lifetimeSeconds - fade
      ? Math.max(0, (lifetimeSeconds - age) / fade)
      : age >= lifetimeSeconds ? 0 : 1;
    state.container.alpha = state.input.opacity * fadeAlpha;
  }

  private destroyRuntime(state: StainRuntime): void {
    state.container.removeFromParent();
    state.container.destroy({ children: true });
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("Stain system has been disposed.");
  }
}

function createShapeVariation(id: string, variantCount: number, streakVariantCount = 0): StainShapeVariation {
  let state = 2166136261;
  for (let index = 0; index < id.length; index++) {
    state ^= id.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const sprayStrokes = Array.from({ length: DIRECTIONAL_SPRAY_MAX_STREAKS }, (): SprayStrokeVariation => ({
    textureIndex: streakVariantCount > 0 ? Math.floor(random() * streakVariantCount) : 0,
    // Keep each image instance long enough to read as a complete paint mark;
    // distribute its start position so several instances do not line up as dashes.
    lengthScale: 0.62 + random() * 0.38,
    startOffset: random() * 0.35,
    lateralOffset: (random() - 0.5) * 1,
    angleOffset: (random() - 0.5) * 0.22,
    useSecondaryColor: random() < 0.28,
    alpha: 0.58 + random() * 0.42
  }));
  return {
    textureVariantIndex: Math.floor(random() * (variantCount + 1)),
    sprayStrokes,
    flipBaseY: random() < 0.5,
    flipDetailY: random() < 0.5,
    patchRotation: random() * Math.PI * 2,
    detailScaleX: 0.65 + random() * 0.7,
    detailScaleY: 0.6 + random() * 0.8,
    detailRotation: random() * Math.PI * 2,
    detailOffsetX: (random() - 0.5) * 0.26,
    detailOffsetY: (random() - 0.5) * 0.26
  };
}

function normalizeStain(input: TopDownStainInput): NormalizedStain {
  if (!input || typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new TypeError("Stain id must be a nonempty string.");
  }
  if (input.style !== "splatter" && input.style !== "patch" && input.style !== "streak" && input.style !== "directional-spray") {
    throw new TypeError(`Unknown stain style '${String(input.style)}'.`);
  }
  for (const [field, value] of [["xPx", input.xPx], ["yPx", input.yPx]] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite.`);
  }
  if (!Number.isFinite(input.sizePx) || input.sizePx <= 0) {
    throw new RangeError("Stain sizePx must be positive and finite.");
  }
  const opacity = input.opacity ?? 1;
  const amount = input.amount ?? 1;
  const directionDegrees = input.directionDegrees ?? 0;
  const layer = input.layer ?? "pre-light";
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new RangeError("Stain opacity must be between 0 and 1.");
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
    throw new RangeError("Stain amount must be between 0 and 1.");
  }
  if (!Number.isFinite(directionDegrees) || directionDegrees < 0 || directionDegrees >= 360) {
    throw new RangeError("Stain directionDegrees must be in 0..359.");
  }
  if (layer !== "pre-light" && layer !== "post-light") {
    throw new TypeError("Stain layer must be 'pre-light' or 'post-light'.");
  }
  const colors = input.colors?.length ? [...input.colors] : [...DEFAULT_COLORS];
  for (const color of colors) parseHex(color);
  if (input.active !== undefined && typeof input.active !== "boolean") {
    throw new TypeError("Stain active must be a boolean.");
  }
  if (input.lifetimeSeconds !== undefined && (!Number.isFinite(input.lifetimeSeconds) || input.lifetimeSeconds <= 0)) {
    throw new RangeError("Stain lifetimeSeconds must be positive and finite when provided.");
  }
  if (input.fadeOutSeconds !== undefined && (!Number.isFinite(input.fadeOutSeconds) || input.fadeOutSeconds < 0)) {
    throw new RangeError("Stain fadeOutSeconds must be nonnegative and finite.");
  }
  if (input.fadeOutSeconds !== undefined && input.lifetimeSeconds === undefined) {
    throw new TypeError("A fading stain must have a finite lifetimeSeconds.");
  }
  if (input.lifetimeSeconds !== undefined && (input.fadeOutSeconds ?? 0) > input.lifetimeSeconds) {
    throw new RangeError("Stain fadeOutSeconds cannot exceed lifetimeSeconds.");
  }
  return { ...input, colors, opacity, amount, directionDegrees, layer, active: input.active ?? true };
}

function parseHex(color: string): number {
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new TypeError(`Invalid stain color '${String(color)}'; expected #RRGGBB.`);
  }
  return Number.parseInt(color.slice(1), 16);
}
