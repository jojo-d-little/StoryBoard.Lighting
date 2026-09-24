export type LightMotionMode = "static" | "sway" | "flicker" | "sway-flicker";
export type FlickerStyle = "swell" | "flame";
export type BlockerCornerStyle = "square" | "round";
export type LightColorInput = string | number[] | { r: number; g: number; b: number };
export type RGB01 = readonly [number, number, number];

export interface PointLightInput {
  x: number;
  y: number;
  /** Optional radius override in room-image pixels. */
  radiusPx?: number;
  directionDeg?: number;
  coneAngleDeg?: number;
  motionMode?: LightMotionMode;
  phase?: number;
  color?: LightColorInput;
  outerColor?: LightColorInput;
  gradientExponent?: number;
  intensityScale?: number;
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

export interface NormalizedPointLight {
  x: number;
  y: number;
  /** Optional normalized radius override in room-image pixels. */
  radiusPx?: number;
  directionDeg: number;
  coneAngleDeg: number;
  motionMode: LightMotionMode;
  phase: number;
  color?: LightColorInput;
  outerColor?: LightColorInput;
  gradientExponent?: number;
  intensityScale: number;
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

export interface BlockerInput {
  /** Integer X coordinate of the top-left occupied room cell. */
  cellX: number;
  /** Integer Y coordinate of the top-left occupied room cell. */
  cellY: number;
  /** Number of occupied room cells along the X axis. */
  sizeXCells?: number;
  /** Number of occupied room cells along the Y axis. */
  sizeYCells?: number;
  /** Edge treatment inside the rectangular footprint. Defaults to hard square corners. */
  cornerStyle?: BlockerCornerStyle;
  /** Vertical occlusion elevation in cell units. */
  elevationCells?: number;
  strength?: number;
}

/** Pixel-space bounds derived from a normalized room-cell blocker. */
export interface BlockerBoundsPx {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  centerPxX: number;
  centerPxY: number;
}

export interface RoomGeometryInput {
  widthPx: number;
  heightPx: number;
  cellSizePx: number;
}

export interface RoomLightingInput {
  ambient?: number;
  radiusPx?: number;
  intensity?: number;
  lightColorHex?: string;
  lightOuterColorHex?: string;
  lightGradientExponent?: number;
  lightHeightCells?: number;
}

export interface NormalizedRoomLighting {
  ambient: number;
  radiusPx: number;
  intensity: number;
  lightColorHex: string;
  lightOuterColorHex: string;
  lightGradientExponent: number;
  lightHeightCells: number;
}

export interface PointLightDefaultsInput {
  swayAmountPx?: number;
  swayHz?: number;
  swayDirectionDeg?: number;
  flickerAmount?: number;
  flickerHz?: number;
  flickerStyle?: FlickerStyle;
}

/** Pipeline-quality settings shared by the room's lighting passes. */
export interface LightingPipelineInput {
  /** Global occlusion blur amount in the range 0..4. */
  shadowSoften?: number;
}

/** Complete lighting payload submitted by a host for one frame. */
export interface LightingFrameInput {
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

export interface NormalizedPointLightDefaults {
  swayAmountPx: number;
  swayHz: number;
  swayDirectionDeg: number;
  flickerAmount: number;
  flickerHz: number;
  flickerStyle: FlickerStyle;
}

export interface EvaluatedPointLight {
  x: number;
  y: number;
  /** Effective radius in room-image pixels. */
  radiusPx: number;
  directionDeg: number;
  coneAngleDeg: number;
  intensity: number;
  lightHeightCells: number;
  color: RGB01;
  outerColor: RGB01;
  gradientExponent: number;
}

const DEFAULT_ROOM_LIGHTING: NormalizedRoomLighting = {
  ambient: 0.35,
  radiusPx: 180,
  intensity: 1.5,
  lightColorHex: "#fff2c0",
  lightOuterColorHex: "#fff2c0",
  lightGradientExponent: 1,
  lightHeightCells: 2
};

const DEFAULT_POINT_LIGHTS: NormalizedPointLightDefaults = {
  swayAmountPx: 18,
  swayHz: 0.8,
  swayDirectionDeg: 90,
  flickerAmount: 0.35,
  flickerHz: 8,
  flickerStyle: "swell"
};

export function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumberOr(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeMotionMode(value: unknown): LightMotionMode {
  return value === "sway" || value === "flicker" || value === "sway-flicker" ? value : "static";
}

function normalizeFlickerStyle(value: unknown): FlickerStyle {
  return value === "flame" ? "flame" : "swell";
}

function normalizeBlockerCornerStyle(value: unknown): BlockerCornerStyle {
  return value === "round" ? "round" : "square";
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeLightColor01(value: unknown, fallback: RGB01): RGB01 {
  if (isHexColor(value)) {
    const numeric = parseInt(value.slice(1), 16);
    return [
      ((numeric >> 16) & 255) / 255,
      ((numeric >> 8) & 255) / 255,
      (numeric & 255) / 255
    ];
  }

  const channels = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [(value as { r?: unknown }).r, (value as { g?: unknown }).g, (value as { b?: unknown }).b]
      : null;

  if (!channels || channels.length < 3) {
    return fallback;
  }

  const raw = channels.slice(0, 3).map(Number);
  if (raw.some((channel) => !Number.isFinite(channel))) {
    return fallback;
  }

  const usesByteRange = raw.some((channel) => channel > 1);
  return usesByteRange
    ? [clampRange(raw[0] / 255, 0, 1), clampRange(raw[1] / 255, 0, 1), clampRange(raw[2] / 255, 0, 1)]
    : [clampRange(raw[0], 0, 1), clampRange(raw[1], 0, 1), clampRange(raw[2], 0, 1)];
}

export function normalizePointLightInput(light: PointLightInput | unknown): NormalizedPointLight {
  const source = (light ?? {}) as Partial<PointLightInput>;
  return {
    x: toNumberOr(source.x, 0),
    y: toNumberOr(source.y, 0),
    radiusPx: source.radiusPx == null ? undefined : clampRange(toNumberOr(source.radiusPx, 20), 20, 600),
    directionDeg: toNumberOr(source.directionDeg, 0),
    coneAngleDeg: clampRange(toNumberOr(source.coneAngleDeg, 360), 1, 360),
    motionMode: normalizeMotionMode(source.motionMode),
    phase: toNumberOr(source.phase, 0),
    color: source.color,
    outerColor: source.outerColor,
    gradientExponent: source.gradientExponent == null
      ? undefined
      : Math.max(0.01, toNumberOr(source.gradientExponent, 1)),
    intensityScale: Math.max(0, toNumberOr(source.intensityScale, 1)),
    lightHeightCells: source.lightHeightCells == null
      ? undefined
      : Math.max(0.25, toNumberOr(source.lightHeightCells, 0.25)),
    swayAmountPx: source.swayAmountPx == null ? undefined : Math.max(0, toNumberOr(source.swayAmountPx, 0)),
    swayHz: source.swayHz == null ? undefined : Math.max(0, toNumberOr(source.swayHz, 0)),
    swaySpeedHz: source.swaySpeedHz == null ? undefined : Math.max(0, toNumberOr(source.swaySpeedHz, 0)),
    swayDirectionDeg: source.swayDirectionDeg == null ? undefined : toNumberOr(source.swayDirectionDeg, 0),
    flickerAmount: source.flickerAmount == null ? undefined : clampRange(toNumberOr(source.flickerAmount, 0), 0, 1),
    flickerHz: source.flickerHz == null ? undefined : Math.max(0, toNumberOr(source.flickerHz, 0)),
    flickerSpeedHz: source.flickerSpeedHz == null ? undefined : Math.max(0, toNumberOr(source.flickerSpeedHz, 0)),
    flickerStyle: source.flickerStyle == null ? undefined : normalizeFlickerStyle(source.flickerStyle)
  };
}

export function normalizeBlockerInput(blocker: BlockerInput | unknown): Required<BlockerInput> {
  const source = (blocker ?? {}) as Partial<BlockerInput>;
  return {
    cellX: Math.floor(toNumberOr(source.cellX, 0)),
    cellY: Math.floor(toNumberOr(source.cellY, 0)),
    sizeXCells: Math.max(1, Math.floor(toNumberOr(source.sizeXCells, 1))),
    sizeYCells: Math.max(1, Math.floor(toNumberOr(source.sizeYCells, 1))),
    cornerStyle: normalizeBlockerCornerStyle(source.cornerStyle),
    elevationCells: Math.max(0, toNumberOr(source.elevationCells, 0)),
    strength: clampRange(toNumberOr(source.strength, 1), 0, 1)
  };
}

/**
 * Converts a normalized blocker from top-left room-cell coordinates into
 * pixel-space bounds. The same derived bounds should drive overlays and GPU
 * blocker centers so they cannot drift apart.
 */
export function getBlockerBoundsPx(
  blocker: Required<BlockerInput>,
  cellSizePx: number
): BlockerBoundsPx {
  const safeCellSizePx = Math.max(1, toNumberOr(cellSizePx, 1));
  const leftPx = blocker.cellX * safeCellSizePx;
  const topPx = blocker.cellY * safeCellSizePx;
  const widthPx = blocker.sizeXCells * safeCellSizePx;
  const heightPx = blocker.sizeYCells * safeCellSizePx;
  return {
    leftPx,
    topPx,
    widthPx,
    heightPx,
    centerPxX: leftPx + widthPx * 0.5,
    centerPxY: topPx + heightPx * 0.5
  };
}

export function normalizeRoomGeometryInput(geometry: RoomGeometryInput | unknown): RoomGeometryInput {
  const source = (geometry ?? {}) as Partial<RoomGeometryInput>;
  return {
    widthPx: Math.max(1, Math.floor(toNumberOr(source.widthPx, 1))),
    heightPx: Math.max(1, Math.floor(toNumberOr(source.heightPx, 1))),
    cellSizePx: Math.max(1, toNumberOr(source.cellSizePx, 1))
  };
}

export function normalizeRoomLightingInput(
  lighting: RoomLightingInput | unknown,
  fallback: NormalizedRoomLighting = DEFAULT_ROOM_LIGHTING
): NormalizedRoomLighting {
  const source = (lighting ?? {}) as Partial<RoomLightingInput>;
  return {
    ambient: clampRange(toNumberOr(source.ambient, fallback.ambient), 0, 1),
    radiusPx: clampRange(toNumberOr(source.radiusPx, fallback.radiusPx), 20, 600),
    intensity: Math.max(0, toNumberOr(source.intensity, fallback.intensity)),
    lightColorHex: isHexColor(source.lightColorHex) ? source.lightColorHex : fallback.lightColorHex,
    lightOuterColorHex: isHexColor(source.lightOuterColorHex) ? source.lightOuterColorHex : fallback.lightOuterColorHex,
    lightGradientExponent: Math.max(0.01, toNumberOr(source.lightGradientExponent, fallback.lightGradientExponent)),
    lightHeightCells: Math.max(0.25, toNumberOr(source.lightHeightCells, fallback.lightHeightCells))
  };
}

export function normalizePointLightDefaultsInput(
  defaults: PointLightDefaultsInput | unknown,
  fallback: NormalizedPointLightDefaults = DEFAULT_POINT_LIGHTS
): NormalizedPointLightDefaults {
  const source = (defaults ?? {}) as Partial<PointLightDefaultsInput>;
  return {
    swayAmountPx: Math.max(0, toNumberOr(source.swayAmountPx, fallback.swayAmountPx)),
    swayHz: Math.max(0, toNumberOr(source.swayHz, fallback.swayHz)),
    swayDirectionDeg: toNumberOr(source.swayDirectionDeg, fallback.swayDirectionDeg),
    flickerAmount: clampRange(toNumberOr(source.flickerAmount, fallback.flickerAmount), 0, 1),
    flickerHz: Math.max(0, toNumberOr(source.flickerHz, fallback.flickerHz)),
    flickerStyle: source.flickerStyle == null ? fallback.flickerStyle : normalizeFlickerStyle(source.flickerStyle)
  };
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smoothstep01(value: number): number {
  return value * value * (3 - 2 * value);
}

function hash11(value: number): number {
  return fract(Math.sin(value * 127.1 + 311.7) * 43758.5453123);
}

function smoothRandom1D(value: number): number {
  const integer = Math.floor(value);
  const fraction = value - integer;
  const start = hash11(integer);
  const end = hash11(integer + 1);
  return start + (end - start) * smoothstep01(fraction);
}

function flameFlickerNoise01(timeSeconds: number, hz: number, phase: number): number {
  const speed = Math.max(0.001, hz);
  const time = timeSeconds * speed;
  const slow = smoothRandom1D(time + phase * 0.17);
  const middle = smoothRandom1D(time * 2.7 + phase * 0.53);
  const fast = smoothRandom1D(time * 6.1 + phase * 1.11);
  const blended = clampRange(slow * 0.55 + middle * 0.3 + fast * 0.15, 0, 1);
  const brightBias = Math.pow(blended, 0.45);
  const dip = Math.pow(1 - fast, 6);
  return clampRange(brightBias - dip * 0.35, 0, 1);
}

function flickerScale(light: NormalizedPointLight, defaults: NormalizedPointLightDefaults, timeSeconds: number): number {
  if (light.motionMode !== "flicker" && light.motionMode !== "sway-flicker") {
    return 1;
  }

  const amount = light.flickerAmount ?? defaults.flickerAmount;
  const hz = light.flickerHz ?? light.flickerSpeedHz ?? defaults.flickerHz;
  const style = light.flickerStyle ?? defaults.flickerStyle;
  const phase = light.phase;
  const value = style === "flame"
    ? flameFlickerNoise01(timeSeconds, hz, phase)
    : ((Math.sin(timeSeconds * hz * 3.7 + phase) * 0.6
      + Math.sin(timeSeconds * hz * 8.9 + phase * 1.7) * 0.4) * 0.5 + 0.5);
  return 1 - amount + amount * clampRange(value, 0, 1);
}

export function evaluatePointLight(
  light: NormalizedPointLight,
  roomLighting: NormalizedRoomLighting,
  pointLightDefaults: NormalizedPointLightDefaults,
  timeSeconds: number
): EvaluatedPointLight {
  let x = light.x;
  let y = light.y;

  if (light.motionMode === "sway" || light.motionMode === "sway-flicker") {
    const amount = light.swayAmountPx ?? pointLightDefaults.swayAmountPx;
    const hz = light.swayHz ?? light.swaySpeedHz ?? pointLightDefaults.swayHz;
    const radians = (light.swayDirectionDeg ?? pointLightDefaults.swayDirectionDeg) * Math.PI / 180;
    const swing = Math.sin(timeSeconds * hz * Math.PI * 2 + light.phase);
    x += Math.cos(radians) * amount * swing;
    y += Math.sin(radians) * amount * swing;
  }

  const innerFallback = normalizeLightColor01(roomLighting.lightColorHex, [1, 1, 1]);
  const outerFallback = normalizeLightColor01(roomLighting.lightOuterColorHex, innerFallback);
  return {
    x,
    y,
    radiusPx: light.radiusPx ?? roomLighting.radiusPx,
    directionDeg: light.directionDeg,
    coneAngleDeg: light.coneAngleDeg,
    intensity: Math.max(0, light.intensityScale * flickerScale(light, pointLightDefaults, timeSeconds)),
    lightHeightCells: light.lightHeightCells ?? roomLighting.lightHeightCells,
    color: normalizeLightColor01(light.color, innerFallback),
    outerColor: normalizeLightColor01(light.outerColor, outerFallback),
    gradientExponent: light.gradientExponent ?? roomLighting.lightGradientExponent
  };
}
