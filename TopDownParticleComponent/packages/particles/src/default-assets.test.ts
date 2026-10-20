import { afterEach, describe, expect, it, vi } from "vitest";
import { Assets, Texture } from "pixi.js";
import { loadDefaultParticleAssets } from "./default-assets.js";

describe("packaged particle defaults", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads every packaged slot and keeps defaults when only selected slots are overridden", async () => {
    const load = vi.spyOn(Assets, "load").mockImplementation(async () => Texture.WHITE as never);
    const custom = new Texture({ source: Texture.WHITE.source });

    const assets = await loadDefaultParticleAssets({
      particles: { "smoke-puff": custom },
      clouds: custom
    });

    expect(load).toHaveBeenCalledTimes(18);
    expect(load.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      expect.stringContaining("smoke-puff.png"),
      expect.stringContaining("fog-field.svg"),
      expect.stringContaining("cloud-field.svg")
    ]));
    expect(assets.particles["smoke-puff"]).toBe(custom);
    expect(assets.particles["spark-glow"]).toBe(Texture.WHITE);
    expect(assets.fog).toBe(Texture.WHITE);
    expect(assets.clouds).toBe(custom);
    custom.destroy(true);
  });
});
