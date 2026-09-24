import {
  evaluatePointLight,
  normalizeBlockerInput,
  normalizePointLightDefaultsInput,
  normalizePointLightInput,
  normalizeRoomGeometryInput,
  normalizeRoomLightingInput,
  type BlockerInput,
  type EvaluatedPointLight,
  type LightingFrameInput,
  type LightingPipelineInput,
  type NormalizedPointLight,
  type NormalizedPointLightDefaults,
  type NormalizedRoomLighting,
  type PointLightDefaultsInput,
  type PointLightInput,
  type RoomGeometryInput,
  type RoomLightingInput
} from "./src/lighting/LightingCore.js";

interface LightingHarnessBridge {
  setupSceneFromImage(imageElement: HTMLImageElement, geometry: RoomGeometryInput): void;
  setPointLights(pointLights: NormalizedPointLight[]): void;
  setBlockers(blockers: Required<BlockerInput>[]): void;
  setEvaluatedLights(lights: EvaluatedPointLight[]): void;
  rebuildBlockerOverlay(): void;
  updateLabels(): void;
  rebuildLightingMap(): void;
  applyDisplayMode(): void;
  updateStatus(): void;
  getOutputs(): {
    composedTexture: unknown;
    lightMapTexture: unknown;
    occlusionTexture: unknown;
    occlusionSoftTexture: unknown;
  };
}

declare global {
  interface Window {
    lightingHarnessBridge: LightingHarnessBridge;
    TopDownLightingPipelineComponent: typeof TopDownLightingPipelineComponent;
    topDownLightingPipelineComponent?: TopDownLightingPipelineComponent;
  }
}

function bridge(): LightingHarnessBridge {
  if (!window.lightingHarnessBridge) {
    throw new Error("The lighting harness bridge has not been initialized.");
  }
  return window.lightingHarnessBridge;
}

function inputValue(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected #${id} to be an HTML input.`);
  }
  return element;
}

function selectValue(id: string): HTMLSelectElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Expected #${id} to be a select.`);
  }
  return element;
}

function normalizePipelineInput(
  config: LightingPipelineInput | undefined,
  fallback: Required<LightingPipelineInput>
): Required<LightingPipelineInput> {
  const source = config ?? {};
  const value = Number(source.shadowSoften ?? fallback.shadowSoften);
  return { shadowSoften: Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : fallback.shadowSoften };
}

/**
 * Browser-facing prototype component.
 *
 * The component owns the public boundary and delegates pure normalization and
 * animation decisions to LightingCore. The harness bridge owns Pixi resources.
 */
export class TopDownLightingPipelineComponent {
  readonly version = "0.1-prototype";

  private roomLighting: NormalizedRoomLighting = normalizeRoomLightingInput({});
  private pointLightDefaults: NormalizedPointLightDefaults = normalizePointLightDefaultsInput({});
  private pipeline: Required<LightingPipelineInput> = { shadowSoften: 1.5 };
  private pointLights: NormalizedPointLight[] = [];
  private blockers: Required<BlockerInput>[] = [];

  getContract() {
    return {
      version: this.version,
      required: {
        roomImage: "HTMLImageElement (loaded)",
        pointLights: "PointLightInput[]",
        blockers: "BlockerInput[]"
      },
      roomSetup: {
        targetRoomTexture: "PIXI.Texture",
        targetRoomGeometry: "RoomGeometryInput",
        prototypeRoomImage: "HTMLImageElement (loaded)",
        prototypeGeometrySetter: "setRoomGeometry(RoomGeometryInput)"
      },
      optionalRoomLighting: {
        ambient: "0..1",
        radiusPx: "number",
        intensity: "number",
        lightColorHex: "#rrggbb",
        lightOuterColorHex: "#rrggbb",
        lightGradientExponent: "number (>0)",
        lightHeightCells: "number"
      },
      optionalPointLightDefaults: {
        swayAmountPx: "number",
        swayHz: "number",
        swayDirectionDeg: "number",
        flickerAmount: "0..1",
        flickerHz: "number",
        flickerStyle: "swell | flame"
      },
      optionalPipeline: { shadowSoften: "0..4" },
      outputs: {
        composedTexture: "PIXI.RenderTexture",
        lightMapTexture: "PIXI.RenderTexture",
        occlusionTexture: "PIXI.RenderTexture",
        occlusionSoftTexture: "PIXI.RenderTexture"
      },
      typeAliases: {
        PointLightInput: "TS interface",
        NormalizedPointLight: "Normalized canonical shape used by runtime",
        BlockerInput: "TS interface",
        RoomGeometryInput: "TS interface",
        RoomLightingInput: "TS interface",
        PointLightDefaultsInput: "TS interface",
        LightingPipelineInput: "TS interface",
        LightingFrameInput: "TS interface"
      }
    };
  }

  setRoomImage(imageElement: HTMLImageElement, geometry: RoomGeometryInput): void {
    const normalized = normalizeRoomGeometryInput(geometry);
    this.setRoomGeometry(normalized);
    bridge().setupSceneFromImage(imageElement, normalized);
  }

  setRoomGeometry(geometry: RoomGeometryInput): void {
    const normalized = normalizeRoomGeometryInput(geometry);
    inputValue("cellSize").value = String(normalized.cellSizePx);
    bridge().rebuildBlockerOverlay();
    bridge().updateLabels();
  }

  setPointLights(nextLights: PointLightInput[] | undefined): void {
    const source = Array.isArray(nextLights) ? nextLights : [];
    this.pointLights = source.slice(0, 64).map(normalizePointLightInput);
    bridge().setPointLights(this.pointLights);
  }

  setBlockers(nextBlockers: BlockerInput[] | undefined): void {
    const source = Array.isArray(nextBlockers) ? nextBlockers : [];
    this.blockers = source.slice(0, 64).map(normalizeBlockerInput);
    bridge().setBlockers(this.blockers);
    bridge().rebuildBlockerOverlay();
  }

  setRoomLighting(config: RoomLightingInput | undefined): void {
    this.roomLighting = normalizeRoomLightingInput(config, this.roomLighting);
    const values: Record<string, string | number> = {
      ambient: this.roomLighting.ambient,
      radius: this.roomLighting.radiusPx,
      intensity: this.roomLighting.intensity,
      color: this.roomLighting.lightColorHex,
      colorOuter: this.roomLighting.lightOuterColorHex,
      lightGradientExponent: this.roomLighting.lightGradientExponent,
      lightHeight: this.roomLighting.lightHeightCells
    };
    for (const [id, value] of Object.entries(values)) inputValue(id).value = String(value);
    bridge().updateLabels();
  }

  setPointLightDefaults(config: PointLightDefaultsInput | undefined): void {
    this.pointLightDefaults = normalizePointLightDefaultsInput(config, this.pointLightDefaults);
    const values: Record<string, string | number> = {
      swayAmount: this.pointLightDefaults.swayAmountPx,
      swaySpeed: this.pointLightDefaults.swayHz,
      swayDirection: this.pointLightDefaults.swayDirectionDeg,
      flickerAmount: this.pointLightDefaults.flickerAmount,
      flickerSpeed: this.pointLightDefaults.flickerHz
    };
    for (const [id, value] of Object.entries(values)) inputValue(id).value = String(value);
    selectValue("flickerStyle").value = this.pointLightDefaults.flickerStyle;
    bridge().updateLabels();
  }

  setPipeline(config: LightingPipelineInput | undefined): void {
    this.pipeline = normalizePipelineInput(config, this.pipeline);
    inputValue("shadowSoften").value = String(this.pipeline.shadowSoften);
    bridge().updateLabels();
  }

  submitFrame(input: LightingFrameInput | undefined): void {
    const source = input ?? {};
    this.setRoomLighting(source.roomLighting);
    this.setPointLightDefaults(source.pointLightDefaults);
    this.setPipeline(source.pipeline);
    this.setPointLights(source.pointLights);
    this.setBlockers(source.blockers);
    this.renderFrame();
  }

  renderFrame(): void {
    const nowSeconds = performance.now() * 0.001;
    bridge().setEvaluatedLights(this.pointLights.map((light) => evaluatePointLight(
      light,
      this.roomLighting,
      this.pointLightDefaults,
      nowSeconds
    )));
    bridge().rebuildLightingMap();
    bridge().applyDisplayMode();
    bridge().updateStatus();
  }

  getOutputs() {
    return bridge().getOutputs();
  }
}

window.TopDownLightingPipelineComponent = TopDownLightingPipelineComponent;
