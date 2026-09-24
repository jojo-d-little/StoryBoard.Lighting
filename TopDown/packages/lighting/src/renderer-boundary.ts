import type { Renderer, RenderTexture, Texture } from "pixi.js";
import type { LightingFrameInput, RoomGeometryInput } from "./contracts.js";

/** The application owns renderer creation, initialization, resize, and destruction. */
export interface LightingRendererHost {
  readonly renderer: Renderer;
}

/** Whether the lighting component may destroy the supplied room texture. */
export type RoomTextureOwnership = "borrowed" | "owned";

export interface RoomTextureSetup {
  /** Host-supplied room/albedo texture in room-space coordinates. */
  texture: Texture;
  /** Room/image dimensions and grid mapping for the texture. */
  geometry: RoomGeometryInput;
  /** Defaults to `borrowed`; the host remains responsible for destroying the texture. */
  ownership?: RoomTextureOwnership;
}

export interface LightingOutputTextures {
  composedTexture: RenderTexture;
  lightMapTexture: RenderTexture;
  occlusionTexture: RenderTexture;
  occlusionSoftTexture: RenderTexture;
}

/** Lifecycle boundary established in Phase 2; rendering implementation follows in Phase 3. */
export class TopDownLightingPipeline {
  readonly renderer: Renderer;

  private roomTexture: Texture | null = null;
  private roomGeometry: RoomGeometryInput | null = null;
  private roomTextureOwnership: RoomTextureOwnership = "borrowed";
  private pendingFrame: LightingFrameInput | null = null;
  private disposed = false;

  constructor(host: LightingRendererHost) {
    this.renderer = host.renderer;
  }

  /**
   * Replaces the room texture and its room-space geometry.
   * Existing borrowed textures remain host-owned; an existing owned texture is
   * destroyed when it is replaced by a different texture.
   */
  setRoomTexture(setup: RoomTextureSetup): void {
    this.assertActive();
    if (this.roomTexture && this.roomTexture !== setup.texture && this.roomTextureOwnership === "owned") {
      this.roomTexture.destroy(true);
    }
    this.roomTexture = setup.texture;
    this.roomGeometry = { ...setup.geometry };
    this.roomTextureOwnership = setup.ownership ?? "borrowed";
  }

  /**
   * Updates internal room-space dimensions. Before room setup this is retained
   * as pending geometry; it never represents a display viewport resize.
   */
  resize(geometry: RoomGeometryInput): void {
    this.assertActive();
    this.roomGeometry = { ...geometry };
  }

  /** Stores authoritative frame data without rendering immediately. */
  submitFrame(frame: LightingFrameInput): void {
    this.assertActive();
    this.pendingFrame = frame;
  }

  /** Returns the current room texture, or null before room setup. */
  getRoomTexture(): Texture | null {
    this.assertActive();
    return this.roomTexture;
  }

  /** Returns room-space geometry, or null before room setup. */
  getRoomGeometry(): RoomGeometryInput | null {
    this.assertActive();
    return this.roomGeometry && { ...this.roomGeometry };
  }

  /** Returns null until Phase 3 allocates and renders the output textures. */
  getOutputs(): LightingOutputTextures | null {
    this.assertActive();
    return null;
  }

  /**
   * The host supplies absolute scene time. Pass execution is intentionally
   * deferred to Phase 3, after the package boundary review.
   */
  renderFrame(_timeSeconds: number): void {
    this.assertActive();
    if (!this.roomTexture || !this.roomGeometry) {
      throw new Error("TopDownLightingPipeline.renderFrame requires setRoomTexture first.");
    }
    throw new Error("TopDownLightingPipeline rendering is scheduled for Phase 3.");
  }

  /** Releases component-owned resources and makes the instance unusable. */
  dispose(): void {
    if (this.disposed) return;
    if (this.roomTexture && this.roomTextureOwnership === "owned") {
      this.roomTexture.destroy(true);
    }
    this.roomTexture = null;
    this.roomGeometry = null;
    this.pendingFrame = null;
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("TopDownLightingPipeline has been disposed.");
    }
  }
}
