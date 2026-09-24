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
  /** Room/image width in internal image-space pixels. */
  widthPx: number;
  /** Room/image height in internal image-space pixels. */
  heightPx: number;
  /** Grid-cell size in the same internal image-space pixels. */
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
