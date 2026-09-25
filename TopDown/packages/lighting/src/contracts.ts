/** Selects which, if any, deterministic animation profile affects a point light. */
export type LightMotionMode = "static" | "sway" | "flicker" | "sway-flicker";

/** Selects the shape of the procedural flicker profile. */
export type FlickerStyle = "swell" | "flame";

/** Selects hard rectangular or softened rounded blocker corners. */
export type BlockerCornerStyle = "square" | "round";

/** Accepted color formats: six-digit hex, normalized/byte RGB channels, or RGB object. */
export type LightColorInput = string | number[] | { r: number; g: number; b: number };

/**
 * Authored point-light state supplied by the host in room-space pixels.
 *
 * Omitted appearance and animation properties fall back to
 * `PointLightDefaultsInput`. An omitted `motionMode` means `"static"`;
 * animation defaults do not activate animation by themselves.
 */
export interface PointLightInput {
  /** Horizontal room-space position in pixels; room `(0, 0)` is the top-left. */
  x: number;
  /** Vertical room-space position in pixels; positive Y points down the room image. */
  y: number;
  /** Optional influence radius override in room-space pixels. */
  radiusPx?: number;
  /** Direction in degrees from the positive X axis; positive angles turn toward positive Y. */
  directionDeg?: number;
  /** Emission cone width in degrees; `360` produces an omni-directional light. */
  coneAngleDeg?: number;
  /** Per-light animation selection; omitted means `"static"`. */
  motionMode?: LightMotionMode;
  /** Deterministic animation phase offset in radians. */
  phase?: number;
  /** Inner/near-source light color. */
  color?: LightColorInput;
  /** Outer/edge light color used at the far end of the radial gradient. */
  outerColor?: LightColorInput;
  /** Radial falloff exponent; larger values concentrate light nearer the source. */
  gradientExponent?: number;
  /** Per-light brightness multiplier; falls back to point-light defaults. */
  intensityScale?: number;
  /** Light elevation in room-cell units, used for blocker shadow evaluation. */
  lightHeightCells?: number;
  /** Sway displacement amplitude in room-space pixels. */
  swayAmountPx?: number;
  /** Sway oscillation frequency in cycles per second. */
  swayHz?: number;
  /** Compatibility alias for `swayHz`; used only when `swayHz` is omitted. */
  swaySpeedHz?: number;
  /** Direction of sway in degrees, using the same room-space axes as `directionDeg`. */
  swayDirectionDeg?: number;
  /** Flicker strength from steady (`0`) to fully varying (`1`). */
  flickerAmount?: number;
  /** Flicker frequency in cycles per second. */
  flickerHz?: number;
  /** Compatibility alias for `flickerHz`; used only when `flickerHz` is omitted. */
  flickerSpeedHz?: number;
  /** Flicker profile override. */
  flickerStyle?: FlickerStyle;
}

/**
 * Authored rectangular occlusion footprint in room-grid coordinates.
 *
 * The blocker is aligned to the room grid. Its top-left occupied cell is
 * `(cellX, cellY)` and its footprint extends along the X and Y cell axes.
 */
export interface BlockerInput {
  /** Integer X coordinate of the top-left occupied room cell. */
  cellX: number;
  /** Integer Y coordinate of the top-left occupied room cell. */
  cellY: number;
  /** Number of occupied room cells along the X axis; defaults to `1`. */
  sizeXCells?: number;
  /** Number of occupied room cells along the Y axis; defaults to `1`. */
  sizeYCells?: number;
  /** Edge treatment inside the footprint; defaults to hard square corners. */
  cornerStyle?: BlockerCornerStyle;
  /** Vertical occlusion elevation in room-cell units; used when casting shadows. */
  elevationCells?: number;
  /** Occlusion strength from transparent (`0`) to fully blocking (`1`). */
  strength?: number;
}

/** Pixel-space bounds derived from a room-cell blocker by `getBlockerBoundsPx()`. */
export interface BlockerBoundsPx {
  /** Left edge in room-space pixels. */
  leftPx: number;
  /** Top edge in room-space pixels. */
  topPx: number;
  /** Width in room-space pixels. */
  widthPx: number;
  /** Height in room-space pixels. */
  heightPx: number;
  /** Horizontal center in room-space pixels. */
  centerPxX: number;
  /** Vertical center in room-space pixels. */
  centerPxY: number;
}

/** Room/image dimensions and grid mapping used to allocate the lighting passes. */
export interface RoomGeometryInput {
  /** Room/image width in internal image-space pixels. */
  widthPx: number;
  /** Room/image height in internal image-space pixels. */
  heightPx: number;
  /** Grid-cell size in the same internal image-space pixels. */
  cellSizePx: number;
}

/** Room-wide illumination settings. These values do not describe a point light. */
export interface RoomLightingInput {
  /** Neutral base illumination from `0` (black) to `1` (full base visibility). */
  ambient?: number;
  /** Optional tint applied to the ambient contribution; defaults to white. */
  ambientColor?: LightColorInput;
}

/**
 * Fallback values for omitted `PointLightInput` properties.
 *
 * These are point-light defaults, not room-wide lighting values. If the host
 * omits this object, the package uses its built-in point-light defaults.
 * Animation settings apply only when an individual light selects an animated
 * `motionMode`.
 */
export interface PointLightDefaultsInput {
  /** Fallback radius for point lights, in room-image pixels. */
  radiusPx?: number;
  /** Fallback per-light intensity scale. */
  intensityScale?: number;
  /** Fallback inner color for point lights. */
  color?: LightColorInput;
  /** Fallback outer color for point lights. */
  outerColor?: LightColorInput;
  /** Fallback radial gradient exponent for point lights. */
  gradientExponent?: number;
  /** Fallback point-light elevation in room-cell units. */
  lightHeightCells?: number;
  /** Fallback sway displacement amplitude in room-space pixels. */
  swayAmountPx?: number;
  /** Fallback sway frequency in cycles per second. */
  swayHz?: number;
  /** Fallback sway direction in degrees. */
  swayDirectionDeg?: number;
  /** Fallback flicker strength from steady (`0`) to fully varying (`1`). */
  flickerAmount?: number;
  /** Fallback flicker frequency in cycles per second. */
  flickerHz?: number;
  /** Fallback flicker profile. This does not activate flicker by itself. */
  flickerStyle?: FlickerStyle;
}

/** Quality settings shared by the room's lighting passes. */
export interface LightingPipelineInput {
  /** Occlusion blur amount in the range `0..4`; larger values soften shadows more. */
  shadowSoften?: number;
}

/**
 * Lighting state submitted by the host for a frame.
 *
 * Room lighting, point-light defaults, and pipeline settings persist from the
 * previous submission when omitted. The `pointLights` and `blockers` arrays
 * represent the current frame; omitting either array means that collection is
 * empty for that frame.
 */
export interface LightingFrameInput {
  /** Room-wide lighting environment. */
  roomLighting?: RoomLightingInput;
  /** Fallbacks for omitted per-light appearance, intensity, and animation properties. */
  pointLightDefaults?: PointLightDefaultsInput;
  /** Grid and render-pipeline settings. */
  pipeline?: LightingPipelineInput;
  /** Current-frame authored point-light list; omitted means no point lights. */
  pointLights?: PointLightInput[];
  /** Current-frame authored blocker list; omitted means no blockers. */
  blockers?: BlockerInput[];
}
