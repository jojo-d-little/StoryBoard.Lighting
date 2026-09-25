import {
  BlurFilter,
  Container,
  Filter,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture
} from "pixi.js";
import type { Renderer } from "pixi.js";
import {
  evaluatePointLight,
  getBlockerBoundsPx,
  normalizeBlockerInput,
  normalizePointLightDefaultsInput,
  normalizePointLightInput,
  normalizeRoomGeometryInput,
  normalizeRoomLightingInput
} from "./lighting-core.js";
import type {
  BlockerInput,
  LightingFrameInput,
  LightingPipelineInput,
  PointLightInput,
  RoomGeometryInput,
  RoomLightingInput
} from "./contracts.js";
import type {
  NormalizedPointLight,
  NormalizedPointLightDefaults,
  NormalizedRoomLighting
} from "./internal-types.js";
import type {
  LightingOutputTextures,
  LightingRendererHost,
  RoomTextureOwnership,
  RoomTextureSetup
} from "./renderer-boundary.js";
import { COMPOSE_FRAGMENT, DEFAULT_FILTER_VERTEX, createLightFragment, createOcclusionFragment } from "./shaders.js";

export interface TopDownLightingPipelineOptions extends LightingRendererHost {
  /** Maximum point lights represented in the fixed-size shader arrays. */
  maxLights?: number;
  /** Maximum blockers represented in the fixed-size shader arrays. */
  maxBlockers?: number;
}

interface PassResources {
  occlusionTexture: RenderTexture;
  occlusionSoftTexture: RenderTexture;
  lightMapTexture: RenderTexture;
  composedTexture: RenderTexture;
  occlusionFilter: Filter;
  occlusionBlurFilter: BlurFilter;
  lightFilter: Filter;
  composeFilter: Filter;
  occlusionContainer: Container;
  occlusionBlurContainer: Container;
  lightContainer: Container;
  composeContainer: Container;
}

type UniformValue = {
  value: unknown;
  type: string;
  size?: number;
};

type UniformValues = Record<string, UniformValue>;

const DEFAULT_SHADOW_SOFTEN = 1.5;

/**
 * PixiJS-owned rendering implementation for the top-down lighting pipeline.
 * The host owns renderer creation and supplies room textures; this class owns
 * all intermediate render textures, pass containers, filters, and outputs.
 */
export class TopDownLightingPipeline {
  readonly renderer: Renderer;

  private readonly maxLights: number;
  private readonly maxBlockers: number;
  private roomTexture: Texture | null = null;
  private roomTextureOwnership: RoomTextureOwnership = "borrowed";
  private roomGeometry: RoomGeometryInput | null = null;
  private roomLighting: NormalizedRoomLighting = normalizeRoomLightingInput({});
  private pointLightDefaults: NormalizedPointLightDefaults = normalizePointLightDefaultsInput({});
  private pipeline: Required<LightingPipelineInput> = { shadowSoften: DEFAULT_SHADOW_SOFTEN };
  private pointLights: NormalizedPointLight[] = [];
  private blockers: Required<BlockerInput>[] = [];
  private passes: PassResources | null = null;
  private disposed = false;

  private readonly lightPositions: Float32Array;
  private readonly lightIntensities: Float32Array;
  private readonly lightInnerColors: Float32Array;
  private readonly lightOuterColors: Float32Array;
  private readonly lightGradientExponents: Float32Array;
  private readonly lightDirections: Float32Array;
  private readonly lightConeAnglesDeg: Float32Array;
  private readonly lightHeightCells: Float32Array;
  private readonly blockerPositions: Float32Array;
  private readonly blockerHalfSizeXCells: Float32Array;
  private readonly blockerHalfSizeYCells: Float32Array;
  private readonly blockerCornerStyles: Float32Array;
  private readonly blockerElevationCells: Float32Array;
  private readonly blockerStrengths: Float32Array;

  constructor(options: TopDownLightingPipelineOptions) {
    this.renderer = options.renderer;
    this.maxLights = Math.max(1, Math.floor(options.maxLights ?? 64));
    this.maxBlockers = Math.max(1, Math.floor(options.maxBlockers ?? 64));
    this.lightPositions = new Float32Array(this.maxLights * 2);
    this.lightIntensities = new Float32Array(this.maxLights);
    this.lightInnerColors = new Float32Array(this.maxLights * 4);
    this.lightOuterColors = new Float32Array(this.maxLights * 3);
    this.lightGradientExponents = new Float32Array(this.maxLights);
    this.lightDirections = new Float32Array(this.maxLights * 2);
    this.lightConeAnglesDeg = new Float32Array(this.maxLights);
    this.lightHeightCells = new Float32Array(this.maxLights);
    this.blockerPositions = new Float32Array(this.maxBlockers * 2);
    this.blockerHalfSizeXCells = new Float32Array(this.maxBlockers);
    this.blockerHalfSizeYCells = new Float32Array(this.maxBlockers);
    this.blockerCornerStyles = new Float32Array(this.maxBlockers);
    this.blockerElevationCells = new Float32Array(this.maxBlockers);
    this.blockerStrengths = new Float32Array(this.maxBlockers);
  }

  setRoomTexture(setup: RoomTextureSetup): void {
    this.assertActive();
    if (this.roomTexture && this.roomTexture !== setup.texture && this.roomTextureOwnership === "owned") {
      this.roomTexture.destroy(true);
    }
    this.releasePassResources();
    this.roomTexture = setup.texture;
    this.roomTextureOwnership = setup.ownership ?? "borrowed";
    this.roomGeometry = normalizeRoomGeometryInput(setup.geometry);
    this.allocatePassResources();
  }

  resize(geometry: RoomGeometryInput): void {
    this.assertActive();
    const normalized = normalizeRoomGeometryInput(geometry);
    this.roomGeometry = normalized;
    if (this.roomTexture) {
      this.releasePassResources();
      this.allocatePassResources();
    }
  }

  submitFrame(frame: LightingFrameInput): void {
    this.assertActive();
    const source = frame ?? {};
    this.roomLighting = normalizeRoomLightingInput(source.roomLighting, this.roomLighting);
    this.pointLightDefaults = normalizePointLightDefaultsInput(source.pointLightDefaults, this.pointLightDefaults);
    this.pipeline = {
      shadowSoften: clampShadowSoften(source.pipeline?.shadowSoften ?? this.pipeline.shadowSoften)
    };
    this.pointLights = Array.isArray(source.pointLights)
      ? source.pointLights.slice(0, this.maxLights).map(normalizePointLightInput)
      : [];
    this.blockers = Array.isArray(source.blockers)
      ? source.blockers.slice(0, this.maxBlockers).map(normalizeBlockerInput)
      : [];
  }

  renderFrame(timeSeconds: number): void {
    this.assertActive();
    if (!this.passes || !this.roomGeometry || !this.roomTexture) {
      throw new Error("TopDownLightingPipeline.renderFrame requires setRoomTexture first.");
    }

    this.packFrame(timeSeconds);
    this.updatePassUniforms();

    this.renderer.render({
      container: this.passes.occlusionContainer,
      target: this.passes.occlusionTexture,
      clear: true
    });
    this.passes.occlusionBlurFilter.blur = this.pipeline.shadowSoften;
    this.passes.occlusionBlurFilter.quality = 1;
    this.renderer.render({
      container: this.passes.occlusionBlurContainer,
      target: this.passes.occlusionSoftTexture,
      clear: true
    });
    this.renderer.render({
      container: this.passes.lightContainer,
      target: this.passes.lightMapTexture,
      clear: true
    });
    this.renderer.render({
      container: this.passes.composeContainer,
      target: this.passes.composedTexture,
      clear: true
    });
  }

  getRoomTexture(): Texture | null {
    this.assertActive();
    return this.roomTexture;
  }

  getRoomGeometry(): RoomGeometryInput | null {
    this.assertActive();
    return this.roomGeometry && { ...this.roomGeometry };
  }

  getOutputs(): LightingOutputTextures | null {
    this.assertActive();
    if (!this.passes) return null;
    return {
      composedTexture: this.passes.composedTexture,
      lightMapTexture: this.passes.lightMapTexture,
      occlusionTexture: this.passes.occlusionTexture,
      occlusionSoftTexture: this.passes.occlusionSoftTexture
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.releasePassResources();
    if (this.roomTexture && this.roomTextureOwnership === "owned") {
      this.roomTexture.destroy(true);
    }
    this.roomTexture = null;
    this.roomGeometry = null;
    this.disposed = true;
  }

  private allocatePassResources(): void {
    if (!this.roomGeometry || !this.roomTexture) return;
    const { widthPx, heightPx } = this.roomGeometry;
    const createTarget = (): RenderTexture => RenderTexture.create({
      width: widthPx,
      height: heightPx,
      resolution: 1
    });
    const occlusionTexture = createTarget();
    const occlusionSoftTexture = createTarget();
    const lightMapTexture = createTarget();
    const composedTexture = createTarget();
    const occlusionFilter = this.createOcclusionFilter(widthPx, heightPx);
    const occlusionBlurFilter = new BlurFilter({ strength: 0, quality: 1, kernelSize: 5 });
    occlusionBlurFilter.repeatEdgePixels = true;
    const lightFilter = this.createLightFilter(widthPx, heightPx, occlusionSoftTexture, occlusionTexture);
    const composeFilter = this.createComposeFilter(widthPx, heightPx, lightMapTexture);

    const occlusionContainer = this.createFilteredContainer(Texture.WHITE, occlusionFilter, widthPx, heightPx);
    const occlusionBlurContainer = this.createFilteredContainer(
      occlusionTexture,
      occlusionBlurFilter,
      widthPx,
      heightPx
    );
    const lightContainer = this.createFilteredContainer(Texture.WHITE, lightFilter, widthPx, heightPx);
    const composeContainer = this.createFilteredContainer(this.roomTexture, composeFilter, widthPx, heightPx);

    this.passes = {
      occlusionTexture,
      occlusionSoftTexture,
      lightMapTexture,
      composedTexture,
      occlusionFilter,
      occlusionBlurFilter,
      lightFilter,
      composeFilter,
      occlusionContainer,
      occlusionBlurContainer,
      lightContainer,
      composeContainer
    };
  }

  private createFilteredContainer(
    texture: Texture,
    filter: Filter,
    widthPx: number,
    heightPx: number
  ): Container {
    const sprite = new Sprite(texture);
    sprite.width = widthPx;
    sprite.height = heightPx;
    sprite.filters = [filter];
    sprite.filterArea = new Rectangle(0, 0, widthPx, heightPx);
    const container = new Container();
    container.addChild(sprite);
    return container;
  }

  private createOcclusionFilter(widthPx: number, heightPx: number): Filter {
    const uniforms = createUniforms({
      uImageSize: { value: new Float32Array([widthPx, heightPx]), type: "vec2<f32>" },
      uCellSizePx: { value: 1, type: "f32" },
      uBlockerCount: { value: 0, type: "f32" },
      uBlockerPosPx: { value: this.blockerPositions, type: "vec2<f32>", size: this.maxBlockers },
      uBlockerHalfSizeXCells: { value: this.blockerHalfSizeXCells, type: "f32", size: this.maxBlockers },
      uBlockerHalfSizeYCells: { value: this.blockerHalfSizeYCells, type: "f32", size: this.maxBlockers },
      uBlockerCornerStyle: { value: this.blockerCornerStyles, type: "f32", size: this.maxBlockers },
      uBlockerElevationCells: { value: this.blockerElevationCells, type: "f32", size: this.maxBlockers },
      uBlockerStrength: { value: this.blockerStrengths, type: "f32", size: this.maxBlockers },
      uHeightEncodeScale: { value: 16, type: "f32" }
    });
    return Filter.from({
      gl: { vertex: DEFAULT_FILTER_VERTEX, fragment: createOcclusionFragment(this.maxBlockers) },
      resources: { uniforms }
    });
  }

  private createLightFilter(
    widthPx: number,
    heightPx: number,
    occlusionSoftTexture: RenderTexture,
    occlusionTexture: RenderTexture
  ): Filter {
    const uniforms = createUniforms({
      uImageSize: { value: new Float32Array([widthPx, heightPx]), type: "vec2<f32>" },
      uAmbient: { value: 0, type: "f32" },
      uAmbientColor: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
      uLightCount: { value: 0, type: "f32" },
      uLightPosPx: { value: this.lightPositions, type: "vec2<f32>", size: this.maxLights },
      uLightIntensity: { value: this.lightIntensities, type: "f32", size: this.maxLights },
      uLightInnerColor: { value: this.lightInnerColors, type: "vec4<f32>", size: this.maxLights },
      uLightOuterColor: { value: this.lightOuterColors, type: "vec3<f32>", size: this.maxLights },
      uLightGradientExp: { value: this.lightGradientExponents, type: "f32", size: this.maxLights },
      uLightDir: { value: this.lightDirections, type: "vec2<f32>", size: this.maxLights },
      uLightConeDeg: { value: this.lightConeAnglesDeg, type: "f32", size: this.maxLights },
      uLightHeightCells: { value: this.lightHeightCells, type: "f32", size: this.maxLights },
      uHeightEncodeScale: { value: 16, type: "f32" }
    });
    return Filter.from({
      gl: { vertex: DEFAULT_FILTER_VERTEX, fragment: createLightFragment(this.maxLights) },
      resources: {
        uniforms,
        uOcclusionMap: occlusionSoftTexture.source,
        uOcclusionOccupancyMap: occlusionTexture.source
      }
    });
  }

  private createComposeFilter(widthPx: number, heightPx: number, lightMapTexture: RenderTexture): Filter {
    const uniforms = createUniforms({
      uImageSize: { value: new Float32Array([widthPx, heightPx]), type: "vec2<f32>" }
    });
    return Filter.from({
      gl: { vertex: DEFAULT_FILTER_VERTEX, fragment: COMPOSE_FRAGMENT },
      resources: {
        uniforms,
        uLightMap: lightMapTexture.source
      }
    });
  }

  private packFrame(timeSeconds: number): void {
    if (!this.roomGeometry) return;
    const cellSizePx = this.roomGeometry.cellSizePx;
    const evaluatedLights = this.pointLights.map((light) => evaluatePointLight(
      light,
      this.pointLightDefaults,
      timeSeconds
    ));

    for (let i = 0; i < this.maxLights; i++) {
      if (i < evaluatedLights.length) {
        const light = evaluatedLights[i];
        this.lightPositions[i * 2] = light.x;
        this.lightPositions[i * 2 + 1] = light.y;
        this.lightIntensities[i] = light.intensity;
        this.lightInnerColors[i * 4] = light.color[0];
        this.lightInnerColors[i * 4 + 1] = light.color[1];
        this.lightInnerColors[i * 4 + 2] = light.color[2];
        this.lightInnerColors[i * 4 + 3] = light.radiusPx / 600;
        this.lightOuterColors[i * 3] = light.outerColor[0];
        this.lightOuterColors[i * 3 + 1] = light.outerColor[1];
        this.lightOuterColors[i * 3 + 2] = light.outerColor[2];
        this.lightGradientExponents[i] = light.gradientExponent;
        const directionRadians = light.directionDeg * Math.PI / 180;
        this.lightDirections[i * 2] = Math.cos(directionRadians);
        this.lightDirections[i * 2 + 1] = Math.sin(directionRadians);
        this.lightConeAnglesDeg[i] = light.coneAngleDeg;
        this.lightHeightCells[i] = light.lightHeightCells;
      } else {
        this.lightPositions[i * 2] = -1e6;
        this.lightPositions[i * 2 + 1] = -1e6;
        this.lightIntensities[i] = 0;
        this.lightInnerColors[i * 4] = 0;
        this.lightInnerColors[i * 4 + 1] = 0;
        this.lightInnerColors[i * 4 + 2] = 0;
        this.lightInnerColors[i * 4 + 3] = 0;
        this.lightOuterColors[i * 3] = 0;
        this.lightOuterColors[i * 3 + 1] = 0;
        this.lightOuterColors[i * 3 + 2] = 0;
        this.lightGradientExponents[i] = 1;
        this.lightDirections[i * 2] = 1;
        this.lightDirections[i * 2 + 1] = 0;
        this.lightConeAnglesDeg[i] = 360;
        this.lightHeightCells[i] = 0;
      }
    }

    for (let i = 0; i < this.maxBlockers; i++) {
      if (i < this.blockers.length) {
        const blocker = this.blockers[i];
        const bounds = getBlockerBoundsPx(blocker, cellSizePx);
        this.blockerPositions[i * 2] = bounds.centerPxX;
        this.blockerPositions[i * 2 + 1] = bounds.centerPxY;
        this.blockerHalfSizeXCells[i] = blocker.sizeXCells * 0.5;
        this.blockerHalfSizeYCells[i] = blocker.sizeYCells * 0.5;
        this.blockerCornerStyles[i] = blocker.cornerStyle === "round" ? 1 : 0;
        this.blockerElevationCells[i] = blocker.elevationCells;
        this.blockerStrengths[i] = blocker.strength;
      } else {
        this.blockerPositions[i * 2] = -1e6;
        this.blockerPositions[i * 2 + 1] = -1e6;
        this.blockerHalfSizeXCells[i] = 0;
        this.blockerHalfSizeYCells[i] = 0;
        this.blockerCornerStyles[i] = 0;
        this.blockerElevationCells[i] = 0;
        this.blockerStrengths[i] = 0;
      }
    }
  }

  private updatePassUniforms(): void {
    if (!this.passes || !this.roomGeometry) return;
    const occlusionUniforms = this.passes.occlusionFilter.resources.uniforms.uniforms as Record<string, unknown>;
    occlusionUniforms.uCellSizePx = this.roomGeometry.cellSizePx;
    occlusionUniforms.uBlockerCount = this.blockers.length;

    const lightUniforms = this.passes.lightFilter.resources.uniforms.uniforms as Record<string, unknown>;
    lightUniforms.uAmbient = this.roomLighting.ambient;
    lightUniforms.uAmbientColor = this.roomLighting.ambientColor;
    lightUniforms.uLightCount = this.pointLights.length;
  }

  private releasePassResources(): void {
    if (!this.passes) return;
    this.passes.occlusionFilter.destroy();
    this.passes.occlusionBlurFilter.destroy();
    this.passes.lightFilter.destroy();
    this.passes.composeFilter.destroy();
    this.passes.occlusionContainer.destroy({ children: true });
    this.passes.occlusionBlurContainer.destroy({ children: true });
    this.passes.lightContainer.destroy({ children: true });
    this.passes.composeContainer.destroy({ children: true });
    this.passes.occlusionTexture.destroy(true);
    this.passes.occlusionSoftTexture.destroy(true);
    this.passes.lightMapTexture.destroy(true);
    this.passes.composedTexture.destroy(true);
    this.passes = null;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("TopDownLightingPipeline has been disposed.");
  }
}

function clampShadowSoften(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : DEFAULT_SHADOW_SOFTEN;
}

function createUniforms(values: UniformValues): Record<string, UniformValue> {
  return values;
}
