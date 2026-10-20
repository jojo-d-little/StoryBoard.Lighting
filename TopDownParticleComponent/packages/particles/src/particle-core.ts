import type {
  ParticleEffectDefinition,
  ParticleEmitterInput,
  ParticleOccluderInput,
  ParticleRoomGeometry,
  ParticleStreamDefinition,
  ParticleStreamOverrides
} from "./contracts.js";

export interface NormalizedStream extends Omit<ParticleStreamDefinition,
  "blendMode" | "drawOrder" | "endWidthPx" | "endHeightPx" | "endColor" | "startAlpha" | "endAlpha" | "occludeByCells" | "startElevationCells" | "endElevationCells"> {
  blendMode: "normal" | "add";
  drawOrder: number;
  endWidthPx: number;
  endHeightPx: number;
  startColor: string;
  endColor: string;
  startAlpha: number;
  endAlpha: number;
  occludeByCells: boolean;
  startElevationCells: number;
  endElevationCells: number;
  startColorRgb: number;
  endColorRgb: number;
}

export interface NormalizedEffect {
  id: string;
  removalDurationMs?: number | null;
  streams: NormalizedStream[];
}

export interface NormalizedEmitter extends Omit<ParticleEmitterInput, "active" | "streamOverrides"> {
  active: boolean;
  surge?: { intervalMinSeconds: number; intervalMaxSeconds: number; burstCount: number; seed: number };
  streamOverrides: Record<string, ParticleStreamOverrides>;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

function nonnegative(value: number, name: string): number {
  const result = finite(value, name);
  if (result < 0) throw new RangeError(`${name} must be nonnegative.`);
  return result;
}

function positive(value: number, name: string): number {
  const result = finite(value, name);
  if (result <= 0) throw new RangeError(`${name} must be positive.`);
  return result;
}

function unit(value: number, name: string): number {
  const result = finite(value, name);
  if (result < 0 || result > 1) throw new RangeError(`${name} must be in 0..1.`);
  return result;
}

function identifier(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a nonempty string.`);
  }
  return value.trim();
}

export function parseHexColor(value: string): number {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new TypeError("Particle colors must be six-digit #RRGGBB strings.");
  }
  return Number.parseInt(value.slice(1), 16);
}

/** Changes a style's hue while keeping each stream's relative light/dark color. */
export function recolorStyleColor(baseHex: string, defaultHex: string, selectedHex: string): string {
  const toHsl = (hex: string): [number, number, number] => {
    const rgb = parseHexColor(hex);
    const r = ((rgb >> 16) & 255) / 255;
    const g = ((rgb >> 8) & 255) / 255;
    const b = (rgb & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const difference = max - min;
    const lightness = (max + min) / 2;
    if (difference === 0) return [0, 0, lightness];
    const saturation = difference / (1 - Math.abs(2 * lightness - 1));
    let hue = max === r ? ((g - b) / difference) % 6
      : max === g ? (b - r) / difference + 2
      : (r - g) / difference + 4;
    hue = (hue * 60 + 360) % 360;
    return [hue, saturation, lightness];
  };
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const [baseHue, baseSaturation, baseLightness] = toHsl(baseHex);
  const [defaultHue, defaultSaturation, defaultLightness] = toHsl(defaultHex);
  const [selectedHue, selectedSaturation, selectedLightness] = toHsl(selectedHex);
  const hue = (baseHue + selectedHue - defaultHue + 360) % 360;
  const saturation = clamp(baseSaturation + selectedSaturation - defaultSaturation);
  const lightness = clamp(baseLightness + selectedLightness - defaultLightness);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs(segment % 2 - 1));
  const [r0, g0, b0] = segment < 1 ? [chroma, second, 0]
    : segment < 2 ? [second, chroma, 0]
    : segment < 3 ? [0, chroma, second]
    : segment < 4 ? [0, second, chroma]
    : segment < 5 ? [second, 0, chroma] : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return `#${[r0, g0, b0].map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function normalizeGeometry(input: ParticleRoomGeometry): ParticleRoomGeometry {
  return {
    widthPx: positive(input.widthPx, "widthPx"),
    heightPx: positive(input.heightPx, "heightPx"),
    cellSizePx: positive(input.cellSizePx, "cellSizePx")
  };
}

export function normalizeOccluder(input: ParticleOccluderInput): ParticleOccluderInput {
  const sizeXCells = positive(input.sizeXCells, "sizeXCells");
  const sizeYCells = positive(input.sizeYCells, "sizeYCells");
  if (!Number.isInteger(sizeXCells) || !Number.isInteger(sizeYCells)) {
    throw new RangeError("Occluder cell dimensions must be integers.");
  }
  return {
    xPx: finite(input.xPx, "occluder xPx"),
    yPx: finite(input.yPx, "occluder yPx"),
    sizeXCells,
    sizeYCells,
    elevationCells: nonnegative(input.elevationCells ?? 1, "occluder elevationCells")
  };
}

export function normalizeEmitter(input: ParticleEmitterInput): NormalizedEmitter {
  const colorChangeMode = input.colorChangeMode ?? "birth-snapshot";
  if (colorChangeMode !== "birth-snapshot" && colorChangeMode !== "retint") {
    throw new TypeError("colorChangeMode must be birth-snapshot or retint.");
  }
  const order = finite(input.order ?? 0, "order");
  const overrides: Record<string, ParticleStreamOverrides> = {};
  for (const [streamId, source] of Object.entries(input.streamOverrides ?? {})) {
    const result: ParticleStreamOverrides = {};
    if (source.ratePerSecond !== undefined) result.ratePerSecond = nonnegative(source.ratePerSecond, "ratePerSecond");
    if (source.sizeScale !== undefined) result.sizeScale = positive(source.sizeScale, "sizeScale");
    if (source.radiusScale !== undefined) result.radiusScale = nonnegative(source.radiusScale, "radiusScale");
    if (source.innerRadiusPx !== undefined) result.innerRadiusPx = nonnegative(source.innerRadiusPx, "innerRadiusPx");
    if (source.speedScale !== undefined) result.speedScale = positive(source.speedScale, "speedScale");
    if (source.lifeMinSeconds !== undefined) result.lifeMinSeconds = positive(source.lifeMinSeconds, "lifeMinSeconds");
    if (source.lifeMaxSeconds !== undefined) result.lifeMaxSeconds = positive(source.lifeMaxSeconds, "lifeMaxSeconds");
    if (source.lifetimeScale !== undefined) result.lifetimeScale = positive(source.lifetimeScale, "lifetimeScale");
    if (source.lifetimeSeconds !== undefined) result.lifetimeSeconds = positive(source.lifetimeSeconds, "lifetimeSeconds");
    if (source.colorTransitionSeconds !== undefined) result.colorTransitionSeconds = positive(source.colorTransitionSeconds, "colorTransitionSeconds");
    if (source.layer !== undefined) {
      if (source.layer !== "pre-light" && source.layer !== "post-light") throw new TypeError("Invalid stream override layer.");
      result.layer = source.layer;
    }
    if (source.alphaScale !== undefined) result.alphaScale = nonnegative(source.alphaScale, "alphaScale");
    if (source.startAlpha !== undefined) result.startAlpha = unit(source.startAlpha, "startAlpha");
    if (source.endAlpha !== undefined) result.endAlpha = unit(source.endAlpha, "endAlpha");
    if (result.lifeMinSeconds !== undefined && result.lifeMaxSeconds !== undefined && result.lifeMaxSeconds < result.lifeMinSeconds) {
      throw new RangeError("lifeMaxSeconds must be at least lifeMinSeconds.");
    }
    if (source.colorTransitionFraction !== undefined) {
      const fraction = positive(source.colorTransitionFraction, "colorTransitionFraction");
      if (fraction < 0.1 || fraction > 1) throw new RangeError("colorTransitionFraction must be in 0.1..1.");
      result.colorTransitionFraction = fraction;
    }
    if (source.velocityOffsetXPxPerSecond !== undefined) {
      result.velocityOffsetXPxPerSecond = finite(source.velocityOffsetXPxPerSecond, "velocityOffsetXPxPerSecond");
    }
    if (source.velocityOffsetYPxPerSecond !== undefined) {
      result.velocityOffsetYPxPerSecond = finite(source.velocityOffsetYPxPerSecond, "velocityOffsetYPxPerSecond");
    }
    if (source.windStretchScale !== undefined) result.windStretchScale = positive(source.windStretchScale, "windStretchScale");
    if (source.windStretchRotationRadians !== undefined) {
      result.windStretchRotationRadians = finite(source.windStretchRotationRadians, "windStretchRotationRadians");
    }
    if (source.startColor !== undefined) {
      parseHexColor(source.startColor);
      result.startColor = source.startColor;
    }
    if (source.endColor !== undefined) {
      parseHexColor(source.endColor);
      result.endColor = source.endColor;
    }
    overrides[identifier(streamId, "stream override ID")] = result;
  }
  let surge: NormalizedEmitter["surge"];
  if (input.surge) {
    const intervalMinSeconds = positive(input.surge.intervalMinSeconds, "surge.intervalMinSeconds");
    const intervalMaxSeconds = positive(input.surge.intervalMaxSeconds, "surge.intervalMaxSeconds");
    if (intervalMaxSeconds < intervalMinSeconds) throw new RangeError("surge.intervalMaxSeconds must be at least intervalMinSeconds.");
    if (!Number.isInteger(input.surge.burstCount) || input.surge.burstCount < 1 || input.surge.burstCount > 1000) {
      throw new RangeError("surge.burstCount must be an integer in 1..1000.");
    }
    surge = { intervalMinSeconds, intervalMaxSeconds, burstCount: input.surge.burstCount, seed: (input.surge.seed ?? 1) >>> 0 };
  }
  return {
    id: identifier(input.id, "emitter ID"),
    effectId: identifier(input.effectId, "effect ID"),
    xPx: finite(input.xPx, "emitter xPx"),
    yPx: finite(input.yPx, "emitter yPx"),
    active: input.active ?? true,
    surge,
    colorChangeMode,
    order,
    streamOverrides: overrides
  };
}

export function normalizeEffect(input: ParticleEffectDefinition): NormalizedEffect {
  const id = identifier(input.id, "effect ID");
  if (input.removalDurationMs !== undefined && input.removalDurationMs !== null &&
      (!Number.isFinite(input.removalDurationMs) || input.removalDurationMs < 0)) {
    throw new RangeError("removalDurationMs must be null or a nonnegative finite number.");
  }
  if (!Array.isArray(input.streams) || input.streams.length === 0) {
    throw new TypeError("An effect needs at least one stream.");
  }
  const seen = new Set<string>();
  const streams = input.streams.map((source): NormalizedStream => {
    const streamId = identifier(source.id, "stream ID");
    if (seen.has(streamId)) throw new Error(`Duplicate stream ID: ${streamId}`);
    seen.add(streamId);
    if (source.layer !== "pre-light" && source.layer !== "post-light") {
      throw new TypeError(`Invalid layer for stream ${streamId}.`);
    }
    const blendMode = source.blendMode ?? "normal";
    if (blendMode !== "normal" && blendMode !== "add") {
      throw new TypeError(`Invalid blend mode for stream ${streamId}.`);
    }
    if (source.spawn.kind !== "point" && source.spawn.kind !== "rectangle" && source.spawn.kind !== "room") {
      throw new TypeError(`Invalid spawn shape for stream ${streamId}.`);
    }
    const spawn = source.spawn.kind === "point"
      ? (() => {
        const radiusPx = nonnegative(source.spawn.radiusPx ?? 0, "spawn radiusPx");
        const innerRadiusPx = nonnegative(source.spawn.innerRadiusPx ?? 0, "spawn innerRadiusPx");
        if (innerRadiusPx > radiusPx) throw new RangeError("spawn innerRadiusPx must not exceed radiusPx.");
        return { kind: "point" as const, radiusPx, innerRadiusPx };
      })()
      : source.spawn.kind === "room" ? { kind: "room" as const }
      : {
        kind: "rectangle" as const,
        widthPx: nonnegative(source.spawn.widthPx ?? 0, "spawn widthPx"),
        heightPx: nonnegative(source.spawn.heightPx ?? 0, "spawn heightPx")
      };
    const lifeMinSeconds = positive(source.lifeMinSeconds, "lifeMinSeconds");
    const lifeMaxSeconds = positive(source.lifeMaxSeconds, "lifeMaxSeconds");
    if (lifeMaxSeconds < lifeMinSeconds) throw new RangeError("lifeMaxSeconds must be at least lifeMinSeconds.");
    const velocityXMinPxPerSecond = finite(source.velocityXMinPxPerSecond, "velocityXMinPxPerSecond");
    const velocityXMaxPxPerSecond = finite(source.velocityXMaxPxPerSecond, "velocityXMaxPxPerSecond");
    const velocityYMinPxPerSecond = finite(source.velocityYMinPxPerSecond, "velocityYMinPxPerSecond");
    const velocityYMaxPxPerSecond = finite(source.velocityYMaxPxPerSecond, "velocityYMaxPxPerSecond");
    if (velocityXMaxPxPerSecond < velocityXMinPxPerSecond || velocityYMaxPxPerSecond < velocityYMinPxPerSecond) {
      throw new RangeError("Velocity maxima must be at least their minima.");
    }
    const rotationMinRadians = finite(source.rotationMinRadians ?? 0, "rotationMinRadians");
    const rotationMaxRadians = finite(source.rotationMaxRadians ?? rotationMinRadians, "rotationMaxRadians");
    if (rotationMaxRadians < rotationMinRadians) throw new RangeError("rotationMaxRadians must be at least rotationMinRadians.");
    const orbitAngularSpeedRadiansPerSecond = finite(source.orbitAngularSpeedRadiansPerSecond ?? 0, "orbitAngularSpeedRadiansPerSecond");
    if (orbitAngularSpeedRadiansPerSecond !== 0 && spawn.kind !== "point") {
      throw new TypeError("Orbit motion requires a point-spawn stream.");
    }
    const startColorRgb = parseHexColor(source.startColor);
    const endColor = source.endColor ?? source.startColor;
    const endColorRgb = parseHexColor(endColor);
    return {
      id: streamId,
      textureId: identifier(source.textureId, "texture ID"),
      onDeathStreamId: source.onDeathStreamId === undefined
        ? undefined : identifier(source.onDeathStreamId, "onDeathStreamId"),
      layer: source.layer,
      blendMode,
      drawOrder: finite(source.drawOrder ?? 0, "drawOrder"),
      ratePerSecond: nonnegative(source.ratePerSecond, "ratePerSecond"),
      surgeOnly: source.surgeOnly ?? false,
      spawn,
      lifeMinSeconds,
      lifeMaxSeconds,
      startElevationCells: nonnegative(source.startElevationCells ?? 0, "startElevationCells"),
      endElevationCells: nonnegative(source.endElevationCells ?? source.startElevationCells ?? 0, "endElevationCells"),
      velocityXMinPxPerSecond,
      velocityXMaxPxPerSecond,
      velocityYMinPxPerSecond,
      velocityYMaxPxPerSecond,
      rotationMinRadians,
      rotationMaxRadians,
      orbitAngularSpeedRadiansPerSecond,
      accelerationXPxPerSecond2: finite(source.accelerationXPxPerSecond2 ?? 0, "accelerationXPxPerSecond2"),
      accelerationYPxPerSecond2: finite(source.accelerationYPxPerSecond2 ?? 0, "accelerationYPxPerSecond2"),
      startWidthPx: positive(source.startWidthPx, "startWidthPx"),
      startHeightPx: positive(source.startHeightPx, "startHeightPx"),
      endWidthPx: positive(source.endWidthPx ?? source.startWidthPx, "endWidthPx"),
      endHeightPx: positive(source.endHeightPx ?? source.startHeightPx, "endHeightPx"),
      startColor: source.startColor,
      endColor,
      startAlpha: unit(source.startAlpha ?? 1, "startAlpha"),
      endAlpha: unit(source.endAlpha ?? 0, "endAlpha"),
      occludeByCells: source.occludeByCells ?? false,
      startColorRgb,
      endColorRgb
    };
  });
  for (const stream of streams) {
    if (!stream.onDeathStreamId) continue;
    const target = streams.find(candidate => candidate.id === stream.onDeathStreamId);
    if (!target) throw new Error(`Unknown onDeathStreamId '${stream.onDeathStreamId}' in effect '${id}'.`);
    if (target.onDeathStreamId) throw new Error("A timed follow-up stream cannot start another follow-up stream.");
  }
  return { id, removalDurationMs: input.removalDurationMs, streams };
}

export function mixColor(start: number, end: number, fraction: number): number {
  const t = Math.max(0, Math.min(1, fraction));
  const channel = (shift: number): number => {
    const a = (start >> shift) & 255;
    const b = (end >> shift) & 255;
    return Math.round(a + (b - a) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
