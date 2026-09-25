import type { Renderer, RenderTexture, Texture } from "pixi.js";
import type { RoomGeometryInput } from "./contracts.js";

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
