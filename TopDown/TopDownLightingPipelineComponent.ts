// TypeScript source of truth for engine <-> lighting boundary.
// The HTML harness loads generated TopDownLightingPipelineComponent.js at runtime.
// Edit this file, then run `npm run build` (or `npm run watch`).

/** Supported animation combinations for an authored point light. */
type LightMotionMode = 'static' | 'sway' | 'flicker' | 'sway-flicker';

/** Algorithm used when a point light performs brightness flicker. */
type FlickerStyle = 'swell' | 'flame';

/** Flexible color payload accepted at the engine/component boundary. */
type LightColorInput = string | number[] | { r: number; g: number; b: number };

/**
 * External/authored point-light payload.
 *
 * This is the untrusted input shape supplied by the host engine or harness.
 * Optional properties intentionally remain omitted when the light should use
 * a point-light default or room-level lighting value.
 */
interface PointLightInput {
  /** Light center in room-image pixels. */
  x: number;
  /** Light center in room-image pixels. */
  y: number;
  /** Forward direction in screen/image coordinates: 0=right, 90=down. */
  directionDeg?: number;
  /** Emission cone in degrees; 360 represents an omni light. */
  coneAngleDeg?: number;
  /** Optional animation mode for this light. */
  motionMode?: LightMotionMode;
  /** Stable phase offset used by procedural animation. */
  phase?: number;
  /** Optional inner/core light color override. */
  color?: LightColorInput;
  /** Optional outer/edge light color override. */
  outerColor?: LightColorInput;
  /** Optional radial gradient exponent override. */
  gradientExponent?: number;
  /** Multiplier applied to the light's evaluated intensity. */
  intensityScale?: number;
  /** Optional elevation override; otherwise uses room lighting defaults. */
  lightHeightCells?: number;
  /** Optional sway distance override in pixels. */
  swayAmountPx?: number;
  /** Optional sway frequency override in hertz. */
  swayHz?: number;
  /** Legacy alias for swayHz; new callers should use swayHz. */
  swaySpeedHz?: number;
  /** Optional sway direction override in degrees. */
  swayDirectionDeg?: number;
  /** Optional flicker depth override in the range 0..1. */
  flickerAmount?: number;
  /** Optional flicker frequency override in hertz. */
  flickerHz?: number;
  /** Legacy alias for flickerHz; new callers should use flickerHz. */
  flickerSpeedHz?: number;
  /** Optional flicker algorithm override. */
  flickerStyle?: FlickerStyle;
}

/**
 * Canonical stored point-light configuration after input normalization.
 *
 * Values are type-safe and bounded, but optional override properties remain
 * optional so fallback resolution can happen at render time.
 */
interface NormalizedPointLight {
  /** Normalized light center in room-image pixels. */
  x: number;
  /** Normalized light center in room-image pixels. */
  y: number;
  /** Normalized forward direction in degrees. */
  directionDeg: number;
  /** Normalized emission cone in degrees. */
  coneAngleDeg: number;
  /** Normalized animation mode. */
  motionMode: LightMotionMode;
  /** Normalized procedural animation phase. */
  phase: number;
  /** Optional normalized inner/core color override. */
  color?: LightColorInput;
  /** Optional normalized outer/edge color override. */
  outerColor?: LightColorInput;
  /** Optional normalized radial gradient override. */
  gradientExponent?: number;
  /** Normalized non-negative intensity multiplier. */
  intensityScale: number;
  /** Optional elevation override; undefined means use room lighting. */
  lightHeightCells?: number;
  /** Optional normalized sway distance override in pixels. */
  swayAmountPx?: number;
  /** Optional normalized sway frequency override in hertz. */
  swayHz?: number;
  /** Legacy normalized alias for swayHz. */
  swaySpeedHz?: number;
  /** Optional normalized sway direction override in degrees. */
  swayDirectionDeg?: number;
  /** Optional normalized flicker depth override in the range 0..1. */
  flickerAmount?: number;
  /** Optional normalized flicker frequency override in hertz. */
  flickerHz?: number;
  /** Legacy normalized alias for flickerHz. */
  flickerSpeedHz?: number;
  /** Optional normalized flicker algorithm override. */
  flickerStyle?: FlickerStyle;
}

/** External/authored blocker payload expressed in grid-cell coordinates. */
interface BlockerInput {
  /** Integer grid-cell X coordinate. */
  cellX: number;
  /** Integer grid-cell Y coordinate. */
  cellY: number;
  /** Blocker footprint diameter in cell units. */
  sizeCells?: number;
  /** 0=square footprint, 1=circle footprint. */
  shapeMode?: number;
  /** Blocker elevation in cell units. */
  heightCells?: number;
  /** Optical blocking strength in the range 0..1. */
  strength?: number;
}

/**
 * Room-wide lighting values.
 *
 * These describe the room's lighting environment and shared light appearance.
 * They do not imply that ambient light animates or flickers.
 */
interface RoomLightingInput {
  /** Constant room illumination in the range 0..1. */
  ambient?: number;
  /** Shared point-light radius in room-image pixels. */
  radiusPx?: number;
  /** Shared point-light intensity multiplier. */
  intensity?: number;
  /** Default inner/core color for lights without a color override. */
  lightColorHex?: string;
  /** Default outer/edge color for lights without an outer-color override. */
  lightOuterColorHex?: string;
  /** Default radial gradient exponent for lights without an override. */
  lightGradientExponent?: number;
  /** Default light elevation in cell units. */
  lightHeightCells?: number;
}

/**
 * Defaults used when individual point lights omit animation overrides.
 *
 * These are defaults for point-light behavior, not effects applied to ambient
 * room lighting. A light can override any of them independently.
 */
interface PointLightDefaultsInput {
  /** Default sway distance in pixels. */
  swayAmountPx?: number;
  /** Default sway frequency in hertz. */
  swayHz?: number;
  /** Default sway direction in degrees. */
  swayDirectionDeg?: number;
  /** Default flicker depth in the range 0..1. */
  flickerAmount?: number;
  /** Default flicker frequency in hertz. */
  flickerHz?: number;
  /** Default flicker algorithm for lights without an override. */
  flickerStyle?: FlickerStyle;
}

/** Pipeline/grid settings shared by the room's lighting passes. */
interface LightingPipelineInput {
  /** Conversion from grid-cell units to room-image pixels. */
  cellSizePx?: number;
  /** Global occlusion blur amount in the range 0..4. */
  shadowSoften?: number;
}

/** Complete lighting payload submitted by a host for one frame. */
interface LightingFrameInput {
  /** Room-wide lighting environment and shared light appearance. */
  roomLighting?: RoomLightingInput;
  /** Fallbacks for omitted per-light animation properties. */
  pointLightDefaults?: PointLightDefaultsInput;
  /** Grid and render-pipeline settings. */
  pipeline?: LightingPipelineInput;
  /** Authored point-light list. */
  pointLights?: PointLightInput[];
  /** Authored blocker list. */
  blockers?: BlockerInput[];
}

// The component is intentionally normalization-first:
// engine/harness inputs are treated as external/untrusted payloads and always
// mapped into bounded canonical shapes before touching runtime state.

// Harness-owned bindings currently consumed by the component.
// In engine integration, these should be replaced with an injected host adapter.
declare const ambient: HTMLInputElement;
declare const radius: HTMLInputElement;
declare const intensity: HTMLInputElement;
declare const color: HTMLInputElement;
declare const colorOuter: HTMLInputElement;
declare const lightGradientExponent: HTMLInputElement;
declare const flickerStyle: HTMLSelectElement;
declare const lightHeight: HTMLInputElement;
declare const cellSize: HTMLInputElement;
declare const shadowSoften: HTMLInputElement;
declare const swayAmount: HTMLInputElement;
declare const swaySpeed: HTMLInputElement;
declare const swayDirection: HTMLInputElement;
declare const flickerAmount: HTMLInputElement;
declare const flickerSpeed: HTMLInputElement;
declare const MAX_LIGHTS: number;
declare const MAX_BLOCKERS: number;
declare let lights: NormalizedPointLight[];
declare let blockers: BlockerInput[];
declare function setupSceneFromImage(imageElement: HTMLImageElement): void;
declare function rebuildBlockerOverlay(): void;
declare function updateLabels(): void;
declare function rebuildLightingMap(): void;
declare function applyDisplayMode(): void;
declare function updateStatus(): void;
declare const composedTexture: unknown;
declare const lightMapTexture: unknown;
declare const occlusionTexture: unknown;
declare const occlusionSoftTexture: unknown;

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMotionMode(value: unknown): LightMotionMode {
  return value === 'sway' || value === 'flicker' || value === 'sway-flicker' ? value : 'static';
}

function normalizeFlickerStyle(value: unknown): FlickerStyle {
  return value === 'flame' ? 'flame' : 'swell';
}

function normalizePointLightInput(light: PointLightInput | unknown): NormalizedPointLight {
  const source = (light ?? {}) as Partial<PointLightInput>;
  return {
    // Pixel-space light center in image coordinates.
    x: toNumberOr(source.x, 0),
    y: toNumberOr(source.y, 0),
    // Direction/cone defaults preserve old omni-light behavior unless authored.
    directionDeg: toNumberOr(source.directionDeg, 0),
    coneAngleDeg: clampRange(toNumberOr(source.coneAngleDeg, 360), 1, 360),
    motionMode: normalizeMotionMode(source.motionMode),
    phase: toNumberOr(source.phase, 0),
    // Colors are accepted as flexible payloads and interpreted later.
    color: source.color,
    outerColor: source.outerColor,
    // Preserve omission so the renderer can apply the room lighting default.
    gradientExponent: source.gradientExponent == null
      ? undefined
      : Math.max(0.01, toNumberOr(source.gradientExponent, 1)),
    // Per-light intensity scale is non-negative and multiplies room intensity.
    intensityScale: Math.max(0, toNumberOr(source.intensityScale, 1)),
    // Preserve omission so the renderer can apply the room-level fallback.
    lightHeightCells: source.lightHeightCells == null
      ? undefined
      : Math.max(0.25, toNumberOr(source.lightHeightCells, 0.25)),
    swayAmountPx: source.swayAmountPx == null ? undefined : toNumberOr(source.swayAmountPx, 0),
    swayHz: source.swayHz == null ? undefined : toNumberOr(source.swayHz, 0),
    swaySpeedHz: source.swaySpeedHz == null ? undefined : toNumberOr(source.swaySpeedHz, 0),
    swayDirectionDeg: source.swayDirectionDeg == null ? undefined : toNumberOr(source.swayDirectionDeg, 0),
    flickerAmount: source.flickerAmount == null ? undefined : clampRange(toNumberOr(source.flickerAmount, 0), 0, 1),
    flickerHz: source.flickerHz == null ? undefined : toNumberOr(source.flickerHz, 0),
    flickerSpeedHz: source.flickerSpeedHz == null ? undefined : toNumberOr(source.flickerSpeedHz, 0),
    // Preserve omission so the renderer can apply the point-light default.
    flickerStyle: source.flickerStyle == null ? undefined : normalizeFlickerStyle(source.flickerStyle)
  };
}

function normalizeBlockerInput(blocker: BlockerInput | unknown): BlockerInput {
  const source = (blocker ?? {}) as Partial<BlockerInput>;
  return {
    // Grid-space blocker address is integer-based by design.
    cellX: Math.floor(toNumberOr(source.cellX, 0)),
    cellY: Math.floor(toNumberOr(source.cellY, 0)),
    sizeCells: clampRange(toNumberOr(source.sizeCells, 1), 0.25, 2.0),
    shapeMode: source.shapeMode === 1 ? 1 : 0,
    heightCells: Math.max(0, toNumberOr(source.heightCells, 0)),
    strength: clampRange(toNumberOr(source.strength, 1), 0, 1)
  };
}

function normalizeRoomLightingInput(config: RoomLightingInput | unknown): RoomLightingInput {
  const source = (config ?? {}) as Partial<RoomLightingInput>;
  const out: RoomLightingInput = {};

  // Room lighting values clamp against UI/harness bounds to keep behavior stable in
  // both test payloads and future engine-driven payloads.

  if (source.ambient != null) out.ambient = clampRange(toNumberOr(source.ambient, +ambient.value), 0, 1);
  if (source.radiusPx != null) out.radiusPx = clampRange(toNumberOr(source.radiusPx, +radius.value), 20, 600);
  if (source.intensity != null) out.intensity = Math.max(0, toNumberOr(source.intensity, +intensity.value));
  if (source.lightColorHex != null && /^#[0-9a-fA-F]{6}$/.test(String(source.lightColorHex))) {
    out.lightColorHex = String(source.lightColorHex);
  }
  if (source.lightOuterColorHex != null && /^#[0-9a-fA-F]{6}$/.test(String(source.lightOuterColorHex))) {
    out.lightOuterColorHex = String(source.lightOuterColorHex);
  }
  if (source.lightGradientExponent != null) {
    out.lightGradientExponent = Math.max(0.01, toNumberOr(source.lightGradientExponent, +lightGradientExponent.value));
  }
  if (source.lightHeightCells != null) out.lightHeightCells = Math.max(0.25, toNumberOr(source.lightHeightCells, +lightHeight.value));

  return out;
}

function normalizePointLightDefaultsInput(config: PointLightDefaultsInput | unknown): PointLightDefaultsInput {
  const source = (config ?? {}) as Partial<PointLightDefaultsInput>;
  const out: PointLightDefaultsInput = {};

  if (source.swayAmountPx != null) out.swayAmountPx = Math.max(0, toNumberOr(source.swayAmountPx, +swayAmount.value));
  if (source.swayHz != null) out.swayHz = Math.max(0, toNumberOr(source.swayHz, +swaySpeed.value));
  if (source.swayDirectionDeg != null) out.swayDirectionDeg = toNumberOr(source.swayDirectionDeg, +swayDirection.value);
  if (source.flickerAmount != null) out.flickerAmount = clampRange(toNumberOr(source.flickerAmount, +flickerAmount.value), 0, 1);
  if (source.flickerHz != null) out.flickerHz = Math.max(0, toNumberOr(source.flickerHz, +flickerSpeed.value));
  if (source.flickerStyle != null) out.flickerStyle = normalizeFlickerStyle(source.flickerStyle);

  return out;
}

function normalizeLightingPipelineInput(config: LightingPipelineInput | unknown): LightingPipelineInput {
  const source = (config ?? {}) as Partial<LightingPipelineInput>;
  const out: LightingPipelineInput = {};

  if (source.cellSizePx != null) out.cellSizePx = Math.max(1, toNumberOr(source.cellSizePx, +cellSize.value));
  if (source.shadowSoften != null) out.shadowSoften = clampRange(toNumberOr(source.shadowSoften, +shadowSoften.value), 0, 4);

  return out;
}

function normalizeFrameInput(input: LightingFrameInput | unknown): Required<LightingFrameInput> {
  const source = (input ?? {}) as LightingFrameInput;
  return {
    // Frame payload is normalized field-by-field so partial updates are safe.
    roomLighting: normalizeRoomLightingInput(source.roomLighting),
    pointLightDefaults: normalizePointLightDefaultsInput(source.pointLightDefaults),
    pipeline: normalizeLightingPipelineInput(source.pipeline),
    pointLights: Array.isArray(source.pointLights) ? source.pointLights.map(normalizePointLightInput) : [],
    blockers: Array.isArray(source.blockers) ? source.blockers.map(normalizeBlockerInput) : []
  };
}

class TopDownLightingPipelineComponent {
  readonly version = '0.1-prototype';

  getContract() {
    return {
      version: this.version,
      required: {
        roomImage: 'HTMLImageElement (loaded)',
        pointLights: 'PointLightInput[]',
        blockers: 'BlockerInput[]'
      },
      optionalRoomLighting: {
        ambient: '0..1',
        radiusPx: 'number',
        intensity: 'number',
        lightColorHex: '#rrggbb',
        lightOuterColorHex: '#rrggbb',
        lightGradientExponent: 'number (>0)',
        lightHeightCells: 'number'
      },
      optionalPointLightDefaults: {
        swayAmountPx: 'number',
        swayHz: 'number',
        swayDirectionDeg: 'number',
        flickerAmount: '0..1',
        flickerHz: 'number',
        flickerStyle: 'swell | flame'
      },
      optionalPipeline: {
        cellSizePx: 'number',
        shadowSoften: '0..4'
      },
      outputs: {
        composedTexture: 'PIXI.RenderTexture',
        lightMapTexture: 'PIXI.RenderTexture',
        occlusionTexture: 'PIXI.RenderTexture',
        occlusionSoftTexture: 'PIXI.RenderTexture'
      },
      typeAliases: {
        PointLightInput: 'TS interface',
        NormalizedPointLight: 'Normalized canonical shape used by runtime',
        BlockerInput: 'TS interface',
        RoomLightingInput: 'TS interface',
        PointLightDefaultsInput: 'TS interface',
        LightingPipelineInput: 'TS interface',
        LightingFrameInput: 'TS interface'
      }
    };
  }

  setRoomImage(imageElement: HTMLImageElement): void {
    setupSceneFromImage(imageElement);
  }

  setPointLights(nextLights: PointLightInput[] | undefined): void {
    const source = Array.isArray(nextLights) ? nextLights : [];
    // Enforce hard upper bound to match shader uniform array limits.
    lights = source.slice(0, MAX_LIGHTS).map(normalizePointLightInput);
  }

  setBlockers(nextBlockers: BlockerInput[] | undefined): void {
    const source = Array.isArray(nextBlockers) ? nextBlockers : [];
    // Enforce hard upper bound to match occlusion stage uniform limits.
    blockers = source.slice(0, MAX_BLOCKERS).map(normalizeBlockerInput);
    rebuildBlockerOverlay();
  }

  setRoomLighting(config: RoomLightingInput | undefined): void {
    const normalized = normalizeRoomLightingInput(config);
    if (normalized.ambient != null) ambient.value = String(normalized.ambient);
    if (normalized.radiusPx != null) radius.value = String(normalized.radiusPx);
    if (normalized.intensity != null) intensity.value = String(normalized.intensity);
    if (normalized.lightColorHex != null) color.value = String(normalized.lightColorHex);
    if (normalized.lightOuterColorHex != null) colorOuter.value = String(normalized.lightOuterColorHex);
    if (normalized.lightGradientExponent != null) lightGradientExponent.value = String(normalized.lightGradientExponent);
    if (normalized.lightHeightCells != null) lightHeight.value = String(normalized.lightHeightCells);
    updateLabels();
  }

  setPointLightDefaults(config: PointLightDefaultsInput | undefined): void {
    const normalized = normalizePointLightDefaultsInput(config);
    if (normalized.swayAmountPx != null) swayAmount.value = String(normalized.swayAmountPx);
    if (normalized.swayHz != null) swaySpeed.value = String(normalized.swayHz);
    if (normalized.swayDirectionDeg != null) swayDirection.value = String(normalized.swayDirectionDeg);
    if (normalized.flickerAmount != null) flickerAmount.value = String(normalized.flickerAmount);
    if (normalized.flickerHz != null) flickerSpeed.value = String(normalized.flickerHz);
    if (normalized.flickerStyle != null) flickerStyle.value = normalized.flickerStyle;
    updateLabels();
  }

  setPipeline(config: LightingPipelineInput | undefined): void {
    const normalized = normalizeLightingPipelineInput(config);
    if (normalized.cellSizePx != null) cellSize.value = String(normalized.cellSizePx);
    if (normalized.shadowSoften != null) shadowSoften.value = String(normalized.shadowSoften);
    updateLabels();
  }

  submitFrame(input: LightingFrameInput | undefined): void {
    // Single boundary handoff used by both harness and engine-style callers.
    const normalized = normalizeFrameInput(input);
    this.setRoomLighting(normalized.roomLighting);
    this.setPointLightDefaults(normalized.pointLightDefaults);
    this.setPipeline(normalized.pipeline);
    this.setPointLights(normalized.pointLights);
    this.setBlockers(normalized.blockers);
    this.renderFrame();
  }

  renderFrame(): void {
    // Keep rendering orchestration in one place for predictable behavior.
    rebuildLightingMap();
    applyDisplayMode();
    updateStatus();
  }

  getOutputs() {
    return {
      composedTexture,
      lightMapTexture,
      occlusionTexture,
      occlusionSoftTexture
    };
  }
}
