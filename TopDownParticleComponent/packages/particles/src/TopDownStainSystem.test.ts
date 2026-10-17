import { describe, expect, it } from "vitest";
import { Rectangle, Sprite, Texture } from "pixi.js";
import { TopDownStainSystem } from "./TopDownStainSystem.js";

function stainSystem(maxStains = 4, onExpire?: (id: string) => void): TopDownStainSystem {
  const pair = { base: Texture.WHITE, detail: Texture.WHITE };
  return new TopDownStainSystem({
    maxStains,
    textures: { splatter: pair, patch: pair, streak: pair, "directional-spray": pair },
    onExpire
  });
}

describe("TopDownStainSystem", () => {
  it("keeps the original three-texture setup compatible when spray art is not supplied", () => {
    const pair = { base: Texture.WHITE, detail: Texture.WHITE };
    const stains = new TopDownStainSystem({ textures: { splatter: pair, patch: pair, streak: pair } });
    try {
      stains.upsertStain({ id: "legacy", style: "patch", xPx: 20, yPx: 30, sizePx: 40 });
      expect(stains.getStainIds()).toEqual(["legacy"]);
      expect(() => stains.upsertStain({
        id: "spray", style: "directional-spray", xPx: 20, yPx: 30, sizePx: 40
      })).toThrow("Missing base or detail texture for stain style 'directional-spray'.");
    } finally {
      stains.dispose();
    }
  });

  it("renders stationary tinted layers and routes them to the selected lighting pass", () => {
    const stains = stainSystem();
    try {
      stains.upsertStain({
        id: "pillow-mark", style: "splatter", xPx: 120, yPx: 80, sizePx: 96,
        colors: ["#aa2233", "#d08060"], opacity: 0.7, amount: 0.4,
        directionDegrees: 90, layer: "post-light"
      });
      expect(stains.preLight.children).toHaveLength(0);
      expect(stains.postLight.children).toHaveLength(1);
      const group = stains.postLight.children[0];
      expect(group.position.x).toBe(120);
      expect(group.position.y).toBe(80);
      expect(group.rotation).toBeCloseTo(Math.PI / 2);
      expect(group.alpha).toBe(0.7);
      expect(group.children).toHaveLength(2);
      expect(group.children[0]).toBeInstanceOf(Sprite);
      expect((group.children[0] as Sprite).width).toBe(96);
      expect((group.children[0] as Sprite).tint).toBe(0xaa2233);
      expect((group.children[1] as Sprite).tint).toBe(0xd08060);
      expect((group.children[1] as Sprite).alpha).toBe(0.4);
    } finally {
      stains.dispose();
    }
  });

  it("gives each stain stable, ID-seeded shape variation without changing its directed heading", () => {
    const first = stainSystem();
    const second = stainSystem();
    try {
      for (const stains of [first, second]) {
        stains.upsertStain({ id: "patch-a", style: "patch", xPx: 20, yPx: 20, sizePx: 80 });
        stains.upsertStain({ id: "patch-b", style: "patch", xPx: 120, yPx: 20, sizePx: 80 });
        stains.upsertStain({ id: "splat", style: "splatter", xPx: 20, yPx: 120, sizePx: 80, directionDegrees: 35 });
      }

      const [patchA, patchB, splatter] = first.preLight.children;
      const [samePatchA, samePatchB] = second.preLight.children;
      expect(patchA.rotation).not.toBe(patchB.rotation);
      expect(patchA.rotation).toBe(samePatchA.rotation);
      expect(patchB.rotation).toBe(samePatchB.rotation);
      expect(splatter.rotation).toBeCloseTo(35 * Math.PI / 180);
      expect((patchA.children[1] as Sprite).position.x).not.toBe((patchB.children[1] as Sprite).position.x);
      expect((patchA.children[1] as Sprite).position.x).toBe((samePatchA.children[1] as Sprite).position.x);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("selects among supplied image pairs deterministically by stain ID", () => {
    const pair = { base: Texture.WHITE, detail: Texture.WHITE };
    const variantA = {
      base: new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 1, 1) }),
      detail: Texture.WHITE
    };
    const variantB = {
      base: new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 1, 1) }),
      detail: Texture.WHITE
    };
    const textures = {
      splatter: { ...pair, variants: [variantA, variantB] },
      patch: pair,
      streak: pair
    };
    const first = new TopDownStainSystem({ textures });
    const second = new TopDownStainSystem({ textures });
    try {
      for (let index = 0; index < 12; index++) {
        first.upsertStain({ id: `variant-${index}`, style: "splatter", xPx: index * 10, yPx: 20, sizePx: 40 });
      }
      second.upsertStain({ id: "variant-0", style: "splatter", xPx: 0, yPx: 20, sizePx: 40 });
      const selectedTextures = first.preLight.children.map(group => (group.children[0] as Sprite).texture);
      expect(new Set(selectedTextures).size).toBeGreaterThan(1);
      expect((first.preLight.children[0].children[0] as Sprite).texture)
        .toBe((second.preLight.children[0].children[0] as Sprite).texture);
    } finally {
      first.dispose();
      second.dispose();
      variantA.base.destroy(false);
      variantB.base.destroy(false);
    }
  });

  it("composes a directional spray from independently placed single-streak sprites", () => {
    const pair = { base: Texture.WHITE, detail: Texture.WHITE };
    const streakA = Texture.WHITE;
    const streakB = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 1, 1) });
    const streakC = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 1, 1) });
    const stains = new TopDownStainSystem({
      textures: {
        splatter: pair,
        patch: pair,
        streak: pair,
        "directional-spray": { ...pair, streakVariants: [streakA, streakB, streakC] }
      }
    });
    try {
      stains.upsertStain({
        id: "paint-spray", style: "directional-spray", xPx: 120, yPx: 90,
        sizePx: 180, directionDegrees: 35, amount: 0.5, colors: ["#aa2233", "#d08060"]
      });
      const group = stains.preLight.children[0];
      const marks = group.children as Sprite[];
      const visible = marks.filter(mark => mark.visible);
      expect(marks).toHaveLength(10);
      expect(visible).toHaveLength(7);
      expect(group.position.x).toBe(120);
      expect(group.position.y).toBe(90);
      expect(group.rotation).toBeCloseTo(35 * Math.PI / 180);
      expect(new Set(visible.map(mark => mark.position.x)).size).toBeGreaterThan(1);
      expect(new Set(visible.map(mark => mark.rotation)).size).toBeGreaterThan(1);
      expect(new Set(visible.map(mark => mark.width)).size).toBeGreaterThan(1);
      expect(new Set(visible.map(mark => mark.texture)).size).toBeGreaterThan(1);

      stains.upsertStain({
        id: "paint-spray", style: "directional-spray", xPx: 120, yPx: 90,
        sizePx: 180, directionDegrees: 35, amount: 1, colors: ["#aa2233", "#d08060"]
      });
      expect(marks.filter(mark => mark.visible)).toHaveLength(10);
    } finally {
      stains.dispose();
      streakB.destroy(false);
      streakC.destroy(false);
    }
  });

  it("keeps marks stationary, fades only during the configured tail, and expires them", () => {
    const expired: string[] = [];
    const stains = stainSystem(4, id => expired.push(id));
    try {
      stains.upsertStain({
        id: "rug-grime", style: "patch", xPx: 30, yPx: 40, sizePx: 140,
        lifetimeSeconds: 10, fadeOutSeconds: 2, opacity: 0.8
      });
      const group = stains.preLight.children[0];
      stains.update(7.9);
      expect(group.alpha).toBe(0.8);
      stains.update(9);
      expect(group.alpha).toBeCloseTo(0.4);
      expect(group.position.x).toBe(30);
      expect(stains.getStainIds()).toEqual(["rug-grime"]);
      stains.update(10);
      expect(stains.getStainIds()).toEqual([]);
      expect(expired).toEqual(["rug-grime"]);
      expect(stains.preLight.children).toHaveLength(0);
    } finally {
      stains.dispose();
    }
  });

  it("anchors the directional spray at its source and fans it along the chosen direction", () => {
    const stains = stainSystem();
    try {
      stains.upsertStain({
        id: "paint-fan", style: "directional-spray", xPx: 100, yPx: 80,
        sizePx: 240, directionDegrees: 90
      });
      const group = stains.preLight.children[0];
      expect(group.position.x).toBeCloseTo(100);
      expect(group.position.y).toBeCloseTo(200);
      expect(group.rotation).toBeCloseTo(Math.PI / 2);
      expect((group.children[0] as Sprite).width).toBe(240);
      expect((group.children[0] as Sprite).height).toBe(120);
      expect((group.children[1] as Sprite).width).toBeGreaterThanOrEqual(240 * 0.65);
      expect((group.children[1] as Sprite).width).toBeLessThanOrEqual(240 * 1.35);
      expect((group.children[1] as Sprite).height).toBeGreaterThanOrEqual(120 * 0.6);
      expect((group.children[1] as Sprite).height).toBeLessThanOrEqual(120 * 1.4);
    } finally {
      stains.dispose();
    }
  });

  it("preserves activation age during tuning, validates values, and enforces capacity", () => {
    const stains = stainSystem(1);
    try {
      stains.upsertStain({ id: "one", style: "streak", xPx: 0, yPx: 0, sizePx: 40, lifetimeSeconds: 8, fadeOutSeconds: 2 });
      stains.update(6);
      stains.upsertStain({ id: "one", style: "patch", xPx: 10, yPx: 0, sizePx: 60, lifetimeSeconds: 8, fadeOutSeconds: 2 });
      expect(stains.preLight.children[0].alpha).toBe(1);
      stains.update(7);
      expect(stains.preLight.children[0].alpha).toBeCloseTo(0.5);
      expect(() => stains.upsertStain({ id: "bad", style: "patch", xPx: 0, yPx: 0, sizePx: 10, opacity: 1.1 })).toThrow(RangeError);
      expect(() => stains.upsertStain({ id: "two", style: "patch", xPx: 0, yPx: 0, sizePx: 10 })).toThrow(RangeError);
      expect(stains.removeStain("one")).toBe(true);
      expect(stains.removeStain("missing")).toBe(false);
      stains.upsertStain({ id: "two", style: "patch", xPx: 0, yPx: 0, sizePx: 10 });
      expect(stains.getStainIds()).toEqual(["two"]);
      stains.clear();
      expect(stains.getStainIds()).toEqual([]);
      stains.resetClock();
      expect(() => stains.update(0)).not.toThrow();
    } finally {
      stains.dispose();
    }
  });
});
