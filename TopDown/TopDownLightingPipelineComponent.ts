// TypeScript source of truth for engine <-> lighting boundary.
// The HTML harness loads generated TopDownLightingPipelineComponent.js at runtime.
// Edit this file, then run `npm run build` (or `npm run watch`).

type LightMotionMode = 'static' | 'sway' | 'flicker' | 'sway-flicker';
type FlickerStyle = 'swell' | 'flame';
type LightColorInput = string | number[] | { r: number; g: number; b: number };

interface PointLightInput {
  x: number;
  y: number;
  directionDeg?: number;
  coneAngleDeg?: number;
  motionMode?: LightMotionMode;
  phase?: number;
  color?: LightColorInput;
  outerColor?: LightColorInput;
  gradientExponent?: number;
  intensityScale?: number;
  // Optional per-light elevation. Falls back to roomGlobals.lightHeightCells.
  lightHeightCells?: number;
  swayAmountPx?: number;
  swayHz?: number;
  swaySpeedHz?: number;
  swayDirectionDeg?: number;
  flickerAmount?: number;
  flickerHz?: number;
  flickerSpeedHz?: number;
  flickerStyle?: FlickerStyle;
}

interface PointLightState {
  x: number;
  y: number;
  directionDeg: number;
  coneAngleDeg: number;
  motionMode: LightMotionMode;
  phase: number;
  color?: LightColorInput;
  outerColor?: LightColorInput;
  gradientExponent: number;
  intensityScale: number;
  // Undefined means use the room-level lightHeightCells fallback.
  lightHeightCells?: number;
  swayAmountPx?: number;
  swayHz?: number;
  swaySpeedHz?: number;
  swayDirectionDeg?: number;
  flickerAmount?: number;
  flickerHz?: number;
  flickerSpeedHz?: number;
  flickerStyle: FlickerStyle;
}

interface BlockerInput {
  cellX: number;
  cellY: number;
  sizeCells?: number;
  shapeMode?: number;
  heightCells?: number;
  strength?: number;
}

interface RoomGlobalsInput {
  ambient?: number;
  radiusPx?: number;
  intensity?: number;
  lightColorHex?: string;
  lightOuterColorHex?: string;
  lightGradientExponent?: number;
  flickerStyle?: FlickerStyle;
  lightHeightCells?: number;
  cellSizePx?: number;
  shadowSoften?: number;
}

interface LightingFrameInput {
  roomGlobals?: RoomGlobalsInput;
  pointLights?: PointLightInput[];
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
declare const MAX_LIGHTS: number;
declare const MAX_BLOCKERS: number;
declare let lights: PointLightState[];
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

function normalizePointLightInput(light: PointLightInput | unknown): PointLightState {
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
    // Gradient exponent must remain positive for pow() safety in shader math.
    gradientExponent: Math.max(0.01, toNumberOr(source.gradientExponent, 1)),
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
    flickerStyle: normalizeFlickerStyle(source.flickerStyle)
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

function normalizeRoomGlobalsInput(config: RoomGlobalsInput | unknown): RoomGlobalsInput {
  const source = (config ?? {}) as Partial<RoomGlobalsInput>;
  const out: RoomGlobalsInput = {};

  // Room globals clamp against UI/harness bounds to keep behavior stable in
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
  if (source.flickerStyle != null) out.flickerStyle = normalizeFlickerStyle(source.flickerStyle);
  if (source.lightHeightCells != null) out.lightHeightCells = Math.max(0.25, toNumberOr(source.lightHeightCells, +lightHeight.value));
  if (source.cellSizePx != null) out.cellSizePx = Math.max(1, toNumberOr(source.cellSizePx, +cellSize.value));
  if (source.shadowSoften != null) out.shadowSoften = clampRange(toNumberOr(source.shadowSoften, +shadowSoften.value), 0, 4);

  return out;
}

function normalizeFrameInput(input: LightingFrameInput | unknown): Required<LightingFrameInput> {
  const source = (input ?? {}) as LightingFrameInput;
  return {
    // Frame payload is normalized field-by-field so partial updates are safe.
    roomGlobals: normalizeRoomGlobalsInput(source.roomGlobals),
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
      optionalRoomGlobals: {
        ambient: '0..1',
        radiusPx: 'number',
        intensity: 'number',
        lightColorHex: '#rrggbb',
        lightOuterColorHex: '#rrggbb',
        lightGradientExponent: 'number (>0)',
        flickerStyle: 'swell | flame',
        lightHeightCells: 'number',
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
        PointLightState: 'Normalized canonical shape used by runtime',
        BlockerInput: 'TS interface',
        RoomGlobalsInput: 'TS interface',
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

  setRoomGlobals(config: RoomGlobalsInput | undefined): void {
    const normalized = normalizeRoomGlobalsInput(config);
    if (normalized.ambient != null) ambient.value = String(normalized.ambient);
    if (normalized.radiusPx != null) radius.value = String(normalized.radiusPx);
    if (normalized.intensity != null) intensity.value = String(normalized.intensity);
    if (normalized.lightColorHex != null) color.value = String(normalized.lightColorHex);
    if (normalized.lightOuterColorHex != null) colorOuter.value = String(normalized.lightOuterColorHex);
    if (normalized.lightGradientExponent != null) lightGradientExponent.value = String(normalized.lightGradientExponent);
    if (normalized.flickerStyle != null) flickerStyle.value = normalized.flickerStyle;
    if (normalized.lightHeightCells != null) lightHeight.value = String(normalized.lightHeightCells);
    if (normalized.cellSizePx != null) cellSize.value = String(normalized.cellSizePx);
    if (normalized.shadowSoften != null) shadowSoften.value = String(normalized.shadowSoften);
    // Sync UI labels because globals are mirrored to harness controls.
    updateLabels();
  }

  submitFrame(input: LightingFrameInput | undefined): void {
    // Single boundary handoff used by both harness and engine-style callers.
    const normalized = normalizeFrameInput(input);
    this.setRoomGlobals(normalized.roomGlobals);
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
