import type { FlickerStyle, LightColorInput, LightMotionMode } from "./contracts.js";

/** Internal normalized representation of a consumer-supplied point light. */
export interface NormalizedPointLight {
  x: number;
  y: number;
  radiusPx?: number;
  directionDeg: number;
  coneAngleDeg: number;
  motionMode: LightMotionMode;
  phase: number;
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

/** Internal normalized defaults applied to omitted point-light properties. */
export interface NormalizedPointLightDefaults {
  radiusPx: number;
  intensityScale: number;
  color?: LightColorInput;
  outerColor?: LightColorInput;
  gradientExponent: number;
  lightHeightCells: number;
  swayAmountPx: number;
  swayHz: number;
  swayDirectionDeg: number;
  flickerAmount: number;
  flickerHz: number;
  flickerStyle: FlickerStyle;
}

/** Internal normalized room-level lighting state. */
export interface NormalizedRoomLighting {
  ambient: number;
  ambientColor: RGB01;
}

/** Internal RGB color representation used by shader packing. */
export type RGB01 = readonly [number, number, number];

/** Internal point-light state after defaults and animation are evaluated. */
export interface EvaluatedPointLight {
  x: number;
  y: number;
  radiusPx: number;
  directionDeg: number;
  coneAngleDeg: number;
  intensity: number;
  lightHeightCells: number;
  color: RGB01;
  outerColor: RGB01;
  gradientExponent: number;
}
