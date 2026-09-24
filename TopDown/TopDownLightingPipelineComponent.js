"use strict";
// TypeScript source of truth for engine <-> lighting boundary.
// The HTML harness loads generated TopDownLightingPipelineComponent.js at runtime.
// Edit this file, then run `npm run build` (or `npm run watch`).
function clampRange(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function toNumberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function normalizeMotionMode(value) {
    return value === 'sway' || value === 'flicker' || value === 'sway-flicker' ? value : 'static';
}
function normalizeFlickerStyle(value) {
    return value === 'flame' ? 'flame' : 'swell';
}
function normalizePointLightInput(light) {
    const source = (light ?? {});
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
function normalizeBlockerInput(blocker) {
    const source = (blocker ?? {});
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
function normalizeRoomLightingInput(config) {
    const source = (config ?? {});
    const out = {};
    // Room lighting values clamp against UI/harness bounds to keep behavior stable in
    // both test payloads and future engine-driven payloads.
    if (source.ambient != null)
        out.ambient = clampRange(toNumberOr(source.ambient, +ambient.value), 0, 1);
    if (source.radiusPx != null)
        out.radiusPx = clampRange(toNumberOr(source.radiusPx, +radius.value), 20, 600);
    if (source.intensity != null)
        out.intensity = Math.max(0, toNumberOr(source.intensity, +intensity.value));
    if (source.lightColorHex != null && /^#[0-9a-fA-F]{6}$/.test(String(source.lightColorHex))) {
        out.lightColorHex = String(source.lightColorHex);
    }
    if (source.lightOuterColorHex != null && /^#[0-9a-fA-F]{6}$/.test(String(source.lightOuterColorHex))) {
        out.lightOuterColorHex = String(source.lightOuterColorHex);
    }
    if (source.lightGradientExponent != null) {
        out.lightGradientExponent = Math.max(0.01, toNumberOr(source.lightGradientExponent, +lightGradientExponent.value));
    }
    if (source.lightHeightCells != null)
        out.lightHeightCells = Math.max(0.25, toNumberOr(source.lightHeightCells, +lightHeight.value));
    return out;
}
function normalizePointLightDefaultsInput(config) {
    const source = (config ?? {});
    const out = {};
    if (source.swayAmountPx != null)
        out.swayAmountPx = Math.max(0, toNumberOr(source.swayAmountPx, +swayAmount.value));
    if (source.swayHz != null)
        out.swayHz = Math.max(0, toNumberOr(source.swayHz, +swaySpeed.value));
    if (source.swayDirectionDeg != null)
        out.swayDirectionDeg = toNumberOr(source.swayDirectionDeg, +swayDirection.value);
    if (source.flickerAmount != null)
        out.flickerAmount = clampRange(toNumberOr(source.flickerAmount, +flickerAmount.value), 0, 1);
    if (source.flickerHz != null)
        out.flickerHz = Math.max(0, toNumberOr(source.flickerHz, +flickerSpeed.value));
    if (source.flickerStyle != null)
        out.flickerStyle = normalizeFlickerStyle(source.flickerStyle);
    return out;
}
function normalizeLightingPipelineInput(config) {
    const source = (config ?? {});
    const out = {};
    if (source.cellSizePx != null)
        out.cellSizePx = Math.max(1, toNumberOr(source.cellSizePx, +cellSize.value));
    if (source.shadowSoften != null)
        out.shadowSoften = clampRange(toNumberOr(source.shadowSoften, +shadowSoften.value), 0, 4);
    return out;
}
function normalizeFrameInput(input) {
    const source = (input ?? {});
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
    constructor() {
        this.version = '0.1-prototype';
    }
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
    setRoomImage(imageElement) {
        setupSceneFromImage(imageElement);
    }
    setPointLights(nextLights) {
        const source = Array.isArray(nextLights) ? nextLights : [];
        // Enforce hard upper bound to match shader uniform array limits.
        lights = source.slice(0, MAX_LIGHTS).map(normalizePointLightInput);
    }
    setBlockers(nextBlockers) {
        const source = Array.isArray(nextBlockers) ? nextBlockers : [];
        // Enforce hard upper bound to match occlusion stage uniform limits.
        blockers = source.slice(0, MAX_BLOCKERS).map(normalizeBlockerInput);
        rebuildBlockerOverlay();
    }
    setRoomLighting(config) {
        const normalized = normalizeRoomLightingInput(config);
        if (normalized.ambient != null)
            ambient.value = String(normalized.ambient);
        if (normalized.radiusPx != null)
            radius.value = String(normalized.radiusPx);
        if (normalized.intensity != null)
            intensity.value = String(normalized.intensity);
        if (normalized.lightColorHex != null)
            color.value = String(normalized.lightColorHex);
        if (normalized.lightOuterColorHex != null)
            colorOuter.value = String(normalized.lightOuterColorHex);
        if (normalized.lightGradientExponent != null)
            lightGradientExponent.value = String(normalized.lightGradientExponent);
        if (normalized.lightHeightCells != null)
            lightHeight.value = String(normalized.lightHeightCells);
        updateLabels();
    }
    setPointLightDefaults(config) {
        const normalized = normalizePointLightDefaultsInput(config);
        if (normalized.swayAmountPx != null)
            swayAmount.value = String(normalized.swayAmountPx);
        if (normalized.swayHz != null)
            swaySpeed.value = String(normalized.swayHz);
        if (normalized.swayDirectionDeg != null)
            swayDirection.value = String(normalized.swayDirectionDeg);
        if (normalized.flickerAmount != null)
            flickerAmount.value = String(normalized.flickerAmount);
        if (normalized.flickerHz != null)
            flickerSpeed.value = String(normalized.flickerHz);
        if (normalized.flickerStyle != null)
            flickerStyle.value = normalized.flickerStyle;
        updateLabels();
    }
    setPipeline(config) {
        const normalized = normalizeLightingPipelineInput(config);
        if (normalized.cellSizePx != null)
            cellSize.value = String(normalized.cellSizePx);
        if (normalized.shadowSoften != null)
            shadowSoften.value = String(normalized.shadowSoften);
        updateLabels();
    }
    submitFrame(input) {
        // Single boundary handoff used by both harness and engine-style callers.
        const normalized = normalizeFrameInput(input);
        this.setRoomLighting(normalized.roomLighting);
        this.setPointLightDefaults(normalized.pointLightDefaults);
        this.setPipeline(normalized.pipeline);
        this.setPointLights(normalized.pointLights);
        this.setBlockers(normalized.blockers);
        this.renderFrame();
    }
    renderFrame() {
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
