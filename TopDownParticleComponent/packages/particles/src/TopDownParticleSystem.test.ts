import { describe, expect, it } from "vitest";
import { ParticleContainer, Texture } from "pixi.js";
import { TopDownParticleSystem } from "./TopDownParticleSystem.js";
import { recolorStyleColor } from "./particle-core.js";
import type { ParticleEffectDefinition } from "./contracts.js";

const geometry = { widthPx: 200, heightPx: 120, cellSizePx: 20 };
const effect: ParticleEffectDefinition = {
  id: "test",
  streams: [{
    id: "dots",
    textureId: "dot",
    layer: "pre-light",
    ratePerSecond: 60,
    spawn: { kind: "point", radiusPx: 0 },
    lifeMinSeconds: 2,
    lifeMaxSeconds: 2,
    velocityXMinPxPerSecond: 0,
    velocityXMaxPxPerSecond: 0,
    velocityYMinPxPerSecond: 0,
    velocityYMaxPxPerSecond: 0,
    startWidthPx: 4,
    startHeightPx: 4,
    startColor: "#ffffff",
    startAlpha: 1,
    endAlpha: 1,
    occludeByCells: true
  }]
};

function system(): TopDownParticleSystem {
  const particles = new TopDownParticleSystem({
    textures: { dot: Texture.WHITE },
    seed: 5
  });
  particles.setRoomGeometry(geometry);
  particles.registerEffect(effect);
  return particles;
}

describe("TopDownParticleSystem", () => {
  it("keeps a flame's bright core while shifting the producer's chosen hue", () => {
    expect(recolorStyleColor("#ff9d34", "#ff9d34", "#4488ff")).toBe("#4488ff");
    expect(recolorStyleColor("#fff1a8", "#ff9d34", "#4488ff")).toBe("#b8bbff");
  });

  it("orders emitter instances numerically and breaks ties by stable ID", () => {
    const particles = system();
    try {
      for (const [id, order, color] of [["zeta", 0, "#0000ff"], ["alpha", 0, "#ff0000"], ["middle", -1, "#00ff00"]] as const) {
        particles.upsertEmitter({
          id, effectId: "test", xPx: 20, yPx: 20, order,
          streamOverrides: { dots: { startColor: color, endColor: color } }
        });
      }
      particles.update(0);
      particles.update(1 / 60);
      const orderedContainers = () => [...particles.preLight.children]
        .sort((a, b) => a.zIndex - b.zIndex) as ParticleContainer[];
      const colorsInOrder = () => orderedContainers().map(container => container.particleChildren[0]?.tint);
      expect(colorsInOrder()).toEqual([0x00ff00, 0xff0000, 0x0000ff]);

      particles.upsertEmitter({
        id: "zeta", effectId: "test", xPx: 20, yPx: 20, order: -2,
        streamOverrides: { dots: { startColor: "#0000ff", endColor: "#0000ff" } }
      });
      expect(colorsInOrder()).toEqual([0x0000ff, 0x00ff00, 0xff0000]);
    } finally {
      particles.dispose();
    }
  });

  it("stops emission and lets natural-removal particles decay", () => {
    const particles = system();
    try {
      particles.upsertEmitter({ id: "natural", effectId: "test", xPx: 20, yPx: 20 });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(1);
      particles.upsertEmitter({ id: "natural", effectId: "test", xPx: 20, yPx: 20, active: false });
      expect(particles.getStats().activeEmitters).toBe(0);
      expect(particles.getStats().liveParticles).toBe(1);
      for (let frame = 2; frame <= 122; frame++) particles.update(frame / 60);
      expect(particles.getStats().liveParticles).toBe(0);
    } finally {
      particles.dispose();
    }
  });

  it("releases retired emitter groups and clears their pooled containers", () => {
    const particles = system();
    try {
      particles.upsertEmitter({ id: "short-lived", effectId: "test", xPx: 20, yPx: 20 });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.preLight.children).toHaveLength(1);

      particles.removeEmitter("short-lived");
      expect(particles.preLight.children).toHaveLength(1);
      for (let frame = 2; frame <= 122; frame++) particles.update(frame / 60);
      expect(particles.getStats().liveParticles).toBe(0);
      expect(particles.preLight.children).toHaveLength(0);

      particles.registerEffect({ ...effect, id: "immediate-cleanup", removalDurationMs: 0 });
      for (let index = 0; index < 20; index++) {
        const id = `short-burst-${index}`;
        particles.upsertEmitter({ id, effectId: "immediate-cleanup", xPx: 20, yPx: 20 });
        particles.update((123 + index * 2) / 60);
        particles.update((124 + index * 2) / 60);
        particles.removeEmitter(id);
        expect(particles.preLight.children).toHaveLength(0);
      }

      particles.upsertEmitter({ id: "cleared", effectId: "test", xPx: 20, yPx: 20 });
      particles.update(3);
      particles.update(3 + 1 / 60);
      expect(particles.preLight.children).toHaveLength(1);
      particles.clear();
      expect(particles.preLight.children).toHaveLength(0);
      expect(particles.getStats().liveParticles).toBe(0);
    } finally {
      particles.dispose();
    }
  });

  it("supports immediate removal and a cancellable timed fade without an alpha jump", () => {
    const particles = system();
    try {
      particles.registerEffect({ ...effect, id: "immediate", removalDurationMs: 0 });
      particles.upsertEmitter({ id: "immediate-id", effectId: "immediate", xPx: 20, yPx: 20 });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(1);
      particles.removeEmitter("immediate-id");
      expect(particles.getStats().liveParticles).toBe(0);

      particles.registerEffect({ ...effect, id: "timed", removalDurationMs: 1000 });
      particles.upsertEmitter({ id: "timed-id", effectId: "timed", xPx: 20, yPx: 20 });
      particles.update(2 / 60);
      particles.update(3 / 60);
      const group = particles.preLight.children.find((child: any) => child.particleChildren?.length) as ParticleContainer;
      const particle = group.particleChildren[group.particleChildren.length - 1];
      particles.removeEmitter("timed-id");
      particles.update(4 / 60);
      const fadedAlpha = particle.alpha;
      expect(fadedAlpha).toBeLessThan(1);
      particles.upsertEmitter({ id: "timed-id", effectId: "timed", xPx: 20, yPx: 20 });
      particles.update(5 / 60);
      expect(Math.abs(particle.alpha - fadedAlpha)).toBeLessThan(0.02);
      for (let frame = 6; frame <= 20; frame++) particles.update(frame / 60);
      expect(particle.alpha).toBeGreaterThan(fadedAlpha);
      expect(particles.getStats().activeEmitters).toBe(1);

      particles.removeEmitter("timed-id");
      for (let frame = 21; frame <= 82; frame++) particles.update(frame / 60);
      expect(particles.getStats().activeEmitters).toBe(0);
      expect(particles.getStats().liveParticles).toBeGreaterThan(0);
      expect(particles.preLight.children).toHaveLength(1);
      for (let frame = 83; frame <= 150; frame++) particles.update(frame / 60);
      expect(particles.getStats().liveParticles).toBe(0);
      expect(particles.preLight.children).toHaveLength(0);
    } finally {
      particles.dispose();
    }
  });

  it("keeps birth-snapshot colors by default and retints living particles at their current color-over-life progress", () => {
    const particles = system();
    try {
      const emitter = {
        id: "color-mode", effectId: "test", xPx: 30, yPx: 30,
        streamOverrides: {
          dots: { ratePerSecond: 60, lifeMinSeconds: 2, lifeMaxSeconds: 2, startColor: "#ff0000",
            endColor: "#00ff00", colorTransitionFraction: 0.5 }
        }
      };
      particles.upsertEmitter(emitter);
      particles.update(0);
      particles.update(0.25);
      const group = particles.preLight.children[0] as ParticleContainer;
      const existing = group.particleChildren.find(particle => particle.tint !== 0xff0000)!;
      expect(existing).toBeDefined();
      const oldColor = existing.tint;

      const changed = {
        ...emitter,
        streamOverrides: {
          dots: { ...emitter.streamOverrides.dots, startColor: "#0000ff", endColor: "#ffffff" }
        }
      };
      particles.upsertEmitter(changed);
      expect(existing.tint).toBe(oldColor);
      particles.update(0.26);
      const oldProgress = (((existing.tint as number) >>> 8) & 0xff) / 255;
      expect(oldProgress).toBeGreaterThan(0);

      particles.upsertEmitter({ ...changed, colorChangeMode: "retint" });
      const retinted = existing.tint as number;
      const red = (retinted >>> 16) & 0xff;
      const green = (retinted >>> 8) & 0xff;
      expect(Math.abs(red - green)).toBeLessThanOrEqual(1);
      expect(retinted & 0xff).toBe(0xff);
      expect(red / 255).toBeCloseTo(oldProgress, 1);
    } finally {
      particles.dispose();
    }
  });

  it("applies live size, lifetime, and wind updates to particles already emitted by an instance", () => {
    const particles = system();
    try {
      particles.upsertEmitter({ id: "live-tuning", effectId: "test", xPx: 20, yPx: 20,
        streamOverrides: { dots: { ratePerSecond: 60, sizeScale: 1, lifetimeScale: 1 } } });
      particles.update(0);
      particles.update(1 / 60);
      const group = particles.preLight.children.find((child: any) => child.particleChildren?.length) as ParticleContainer;
      const particle = group.particleChildren[0];
      const initialScale = particle.scaleX;
      const initialX = particle.x;

      particles.upsertEmitter({ id: "live-tuning", effectId: "test", xPx: 20, yPx: 20,
        streamOverrides: { dots: { ratePerSecond: 0, sizeScale: 2, lifetimeScale: 2,
          velocityOffsetXPxPerSecond: 60 } } });
      expect(particle.scaleX).toBeCloseTo(initialScale * 2);
      particles.update(2 / 60);
      expect(particle.x).toBeCloseTo(initialX + 1);

      for (let frame = 3; frame <= 150; frame++) particles.update(frame / 60);
      expect(particles.getStats().liveParticles).toBe(1);
    } finally {
      particles.dispose();
    }
  });

  it("spawns smoke inside the configured outer radius and outside its clear radius", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "smoke-ring", defaultColor: "#ffffff", defaultSmokeColor: "#aaaaaa",
        baseRadiusPx: 20, colorControlStreamIds: ["smoke"], flameStreamIds: [],
        smokeStreamIds: ["smoke"], emberStreamIds: [],
        streams: [{ ...effect.streams[0], id: "smoke", spawn: { kind: "point", radiusPx: 20 }, occludeByCells: false }]
      });
      particles.upsertStyledEmitter({
        id: "smoke", style: "smoke-ring", streamGroup: "smoke", xPx: 50, yPx: 50,
        radiusPx: 20, clearRadiusPx: 10
      });
      particles.update(0);
      particles.update(1 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      const particle = group.particleChildren[0];
      const distance = Math.hypot(particle.x - 50, particle.y - 50);
      expect(distance).toBeGreaterThanOrEqual(10);
      expect(distance).toBeLessThanOrEqual(20);
      expect(() => particles.upsertStyledEmitter({
        id: "bad-smoke", style: "smoke-ring", streamGroup: "smoke", xPx: 50, yPx: 50,
        radiusPx: 20, clearRadiusPx: 21
      })).toThrow(RangeError);
    } finally {
      particles.dispose();
    }
  });

  it("keeps surge-only streams quiet between seeded bursts", () => {
    const particles = system();
    try {
      particles.registerEffect({
        id: "event-accent",
        streams: [{ ...effect.streams[0], id: "burst", ratePerSecond: 0, surgeOnly: true }]
      });
      particles.upsertEmitter({
        id: "event-only", effectId: "event-accent", xPx: 30, yPx: 40,
        surge: { burstCount: 3, intervalMinSeconds: 0.1, intervalMaxSeconds: 0.1, seed: 44 }
      });
      particles.update(0);
      for (let frame = 1; frame <= 6; frame++) particles.update(frame / 60);
      expect(particles.getStats().emittedParticles).toBe(0);
      particles.update(7 / 60);
      expect(particles.getStats().emittedParticles).toBe(3);
      particles.update(8 / 60);
      expect(particles.getStats().emittedParticles).toBe(3);
    } finally {
      particles.dispose();
    }
  });

  it("keeps orbiting particles on a circle around their emitter", () => {
    const particles = system();
    try {
      particles.registerEffect({
        id: "orbit-test",
        streams: [{ ...effect.streams[0], id: "orbit", ratePerSecond: 60,
          spawn: { kind: "point", radiusPx: 10 }, orbitAngularSpeedRadiansPerSecond: 3 }]
      });
      particles.upsertEmitter({ id: "orbiting", effectId: "orbit-test", xPx: 70, yPx: 60 });
      particles.update(0);
      particles.update(0.1);
      const group = particles.preLight.children[0] as ParticleContainer;
      const first = group.particleChildren[0];
      const initial = { x: first.x, y: first.y };
      const initialRadius = Math.hypot(initial.x - 70, initial.y - 60);
      particles.update(0.35);
      expect(Math.hypot(first.x - 70, first.y - 60)).toBeCloseTo(initialRadius, 5);
      expect(Math.hypot(first.x - initial.x, first.y - initial.y)).toBeGreaterThan(5);
    } finally {
      particles.dispose();
    }
  });

  it("adds a producer selected directional push to a styled emitter", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "directional-style", defaultColor: "#ffffff", defaultSmokeColor: "#888888",
        baseRadiusPx: 1, colorControlStreamIds: ["dots"], flameStreamIds: ["dots"],
        smokeStreamIds: [], emberStreamIds: [],
        streams: [{ ...effect.streams[0], spawn: { kind: "point", radiusPx: 0 },
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0 }]
      });
      particles.upsertStyledEmitter({
        id: "directional-emitter", style: "directional-style", xPx: 70, yPx: 60,
        directionDegrees: 0, directionStrengthPxPerSecond: 20
      });
      particles.update(0);
      particles.update(0.2);
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren[0].x).toBeGreaterThan(70);
      expect(group.particleChildren[0].y).toBeCloseTo(60, 5);
    } finally {
      particles.dispose();
    }
  });

  it("uses a smoke style's authored hollow spawn radius when no override is supplied", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "authored-smoke-ring", defaultColor: "#ffffff", defaultSmokeColor: "#aaaaaa",
        baseRadiusPx: 9, colorControlStreamIds: ["smoke"], flameStreamIds: [],
        smokeStreamIds: ["smoke"], emberStreamIds: [],
        streams: [{ ...effect.streams[0], id: "smoke", spawn: { kind: "point", radiusPx: 20, innerRadiusPx: 10 }, occludeByCells: false }]
      });
      particles.upsertStyledEmitter({
        id: "smoke", style: "authored-smoke-ring", streamGroup: "smoke", xPx: 50, yPx: 50,
        radiusPx: 10
      });
      particles.update(0);
      particles.update(1 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      const particle = group.particleChildren[0];
      const distance = Math.hypot(particle.x - 50, particle.y - 50);
      expect(distance).toBeGreaterThanOrEqual(5);
      expect(distance).toBeLessThanOrEqual(10);
    } finally {
      particles.dispose();
    }
  });

  it("adds smoke wind in room pixels per second", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "wind-smoke", defaultColor: "#ffffff", defaultSmokeColor: "#aaaaaa",
        baseRadiusPx: 1, colorControlStreamIds: ["smoke"], flameStreamIds: [],
        smokeStreamIds: ["smoke"], emberStreamIds: [],
        streams: [{ ...effect.streams[0], id: "smoke", spawn: { kind: "point", radiusPx: 0 }, occludeByCells: false }]
      });
      particles.upsertStyledEmitter({
        id: "smoke", style: "wind-smoke", streamGroup: "smoke", xPx: 50, yPx: 50,
        radiusPx: 0, windDirectionDegrees: 90, windStrengthPxPerSecond: 6
      });
      particles.update(0);
      particles.update(1 / 60);
      particles.update(2 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren.some(particle => particle.y > 50)).toBe(true);
      expect(group.particleChildren.every(particle => Math.abs(particle.x - 50) < 1e-6)).toBe(true);
    } finally {
      particles.dispose();
    }
  });

  it("emits from elapsed game time and does not advance on a repeated timestamp", () => {
    const particles = system();
    try {
      particles.upsertEmitter({ id: "one", effectId: "test", xPx: 20, yPx: 20 });
      particles.update(10);
      particles.update(10.1);
      expect(particles.getStats().liveParticles).toBe(6);
      particles.update(10.1);
      expect(particles.getStats().liveParticles).toBe(6);
    } finally {
      particles.dispose();
    }
  });

  it("keeps a burst one-time and clears it on a room transition", () => {
    const particles = system();
    try {
      const burst = { id: "impact-1", effectId: "test", streamId: "dots", xPx: 30, yPx: 30, count: 3 };
      particles.emitBurst(burst);
      particles.emitBurst(burst);
      expect(particles.getStats().liveParticles).toBe(3);
      particles.setRoomGeometry(geometry);
      expect(particles.getStats().liveParticles).toBe(0);
      particles.emitBurst(burst);
      expect(particles.getStats().liveParticles).toBe(3);
    } finally {
      particles.dispose();
    }
  });

  it("maps named style controls to emission without exposing stream settings", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "torch",
        defaultColor: "#ffffff",
        defaultSmokeColor: "#888888",
        baseRadiusPx: 4,
        colorControlStreamIds: ["body"],
        flameStreamIds: ["body"],
        smokeStreamIds: [],
        emberStreamIds: [],
        streams: [{
          ...effect.streams[0], id: "body", rotationMinRadians: 1, rotationMaxRadians: 1
        }]
      });
      particles.upsertStyledEmitter({
        id: "torch-1", style: "torch", xPx: 50, yPx: 50,
        color: "#ff0000", sizeScale: 2, radiusPx: 0, speedScale: 2
      });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(2);
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren[0].x).toBe(50);
      expect(group.particleChildren[0].y).toBe(50);
      expect(group.particleChildren[0].scaleX).toBe(8);
      expect(group.particleChildren[0].tint).toBe(0xff0000);
      expect(group.particleChildren[0].rotation).toBe(1);
    } finally {
      particles.dispose();
    }
  });

  it("keeps smoke amount and lighting pass controllable per styled emitter", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "fire-style",
        defaultColor: "#ffffff",
        defaultSmokeColor: "#888888",
        baseRadiusPx: 4,
        colorControlStreamIds: ["body"],
        flameStreamIds: ["body"],
        smokeStreamIds: ["smoke"],
        emberStreamIds: [],
        streams: [
          { ...effect.streams[0], id: "body", occludeByCells: false },
          { ...effect.streams[0], id: "smoke", startColor: "#888888", occludeByCells: false }
        ]
      });
      particles.upsertStyledEmitter({
        id: "fire-1", style: "fire-style", xPx: 40, yPx: 40,
        smokeAmount: 0, flameLayer: "post-light", smokeLayer: "post-light"
      });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(1);
      expect(particles.postLight.children.length).toBe(1);
      particles.upsertStyledEmitter({
        id: "fire-1", style: "fire-style", xPx: 40, yPx: 40,
        smokeAmount: 1, smokeSizeScale: 2, smokeColor: "#ff0000",
        flameLayer: "post-light", smokeLayer: "post-light"
      });
      particles.update(2 / 60);
      expect(particles.getStats().liveParticles).toBe(3);
      const group = particles.postLight.children[0] as ParticleContainer;
      expect(group.particleChildren[2].tint).toBe(0xff0000);
      expect(group.particleChildren[2].scaleX).toBe(8);
    } finally {
      particles.dispose();
    }
  });

  it("places flame and smoke from one style at independent emitter positions", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "split-fire", defaultColor: "#ffffff", defaultSmokeColor: "#888888",
        baseRadiusPx: 4, colorControlStreamIds: ["body"], flameStreamIds: ["body"],
        smokeStreamIds: ["smoke"], emberStreamIds: [],
        streams: [
          { ...effect.streams[0], id: "body", occludeByCells: false },
          { ...effect.streams[0], id: "smoke", occludeByCells: false }
        ]
      });
      particles.upsertStyledEmitter({ id: "flame", style: "split-fire", streamGroup: "flame", xPx: 20, yPx: 30, radiusPx: 0 });
      particles.upsertStyledEmitter({ id: "smoke", style: "split-fire", streamGroup: "smoke", xPx: 90, yPx: 80, radiusPx: 0 });
      particles.update(0);
      particles.update(1 / 60);
      const particlesByEmitter = () => [...particles.preLight.children]
        .flatMap(child => (child as ParticleContainer).particleChildren.map(particle => [particle.x, particle.y]));
      expect(particlesByEmitter()).toEqual([[20, 30], [90, 80]]);
      particles.upsertStyledEmitter({ id: "smoke", style: "split-fire", streamGroup: "smoke", xPx: 110, yPx: 70, radiusPx: 0 });
      particles.update(2 / 60);
      expect(particlesByEmitter()).toEqual([[20, 30], [20, 30], [90, 80], [110, 70]]);
    } finally {
      particles.dispose();
    }
  });

  it("spawns across room geometry and times a two-color transition independently of motion", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "snow", defaultColors: { primary: "#ffffff", secondary: "#808080" },
        colorBindings: { flake: "transition" }, windBlownStreamIds: ["flake"],
        colorTransitionControlStreamIds: ["flake"],
        streams: [{ ...effect.streams[0], id: "flake", spawn: { kind: "room" },
          endColor: "#808080", occludeByCells: false }]
      });
      particles.upsertRoomEmitter({
        id: "snow-1", style: "snow", densityScale: 1, colorTransitionFraction: 0.5,
        colors: ["#ff0000", "#0000ff"], windXPxPerSecond: 10
      });
      particles.update(0);
      particles.update(1 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      const visual = group.particleChildren[0];
      const initialX = visual.x;
      expect(initialX).toBeGreaterThanOrEqual(0);
      expect(initialX).toBeLessThan(geometry.widthPx);
      expect(visual.y).toBeGreaterThanOrEqual(0);
      expect(visual.y).toBeLessThan(geometry.heightPx);
      expect(visual.tint).toBe(0xff0000);
      particles.upsertRoomEmitter({ id: "snow-1", style: "snow", active: false });
      for (let frame = 2; frame <= 61; frame++) particles.update(frame / 60);
      expect(visual.x).toBeCloseTo(initialX + 10, 4);
      expect(visual.tint).toBe(0x0000ff);
    } finally {
      particles.dispose();
    }
  });

  it("accepts room producer controls in particles per second, pixels, and seconds", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "measured-room-style",
        defaultColors: { primary: "#ffffff", secondary: "#808080" },
        defaultEmissionRatePerSecond: 60,
        defaultSizePx: 4,
        defaultLifetimeSeconds: 2,
        defaultColorTransitionSeconds: 0.5,
        colorBindings: { dots: "transition" },
        colorTransitionControlStreamIds: ["dots"],
        streams: [{ ...effect.streams[0], spawn: { kind: "room" }, occludeByCells: false }]
      });
      particles.upsertRoomEmitter({
        id: "room-style", style: "measured-room-style", emissionRatePerSecond: 120,
        sizePx: 8, lifetimeSeconds: 1.5, colorTransitionSeconds: 0.5,
        colors: ["#ff0000", "#0000ff"]
      });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(2);
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren[0].scaleX).toBe(8);
      for (let frame = 2; frame <= 16; frame++) particles.update(frame / 60);
      expect(group.particleChildren[0].tint).not.toBe(0xff0000);
      expect(group.particleChildren[0].tint).not.toBe(0x0000ff);
    } finally {
      particles.dispose();
    }
  });

  it("uses the producer's exact room lifetime and preserves authored impact lifetime", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "fall-speed-room",
        defaultColors: { primary: "#ffffff", secondary: "#808080" },
        defaultEmissionRatePerSecond: 60,
        defaultSizePx: 4,
        defaultLifetimeSeconds: 2,
        colorBindings: { drops: "primary", splash: "secondary" },
        streams: [
          { ...effect.streams[0], id: "drops", spawn: { kind: "room" },
            velocityXMinPxPerSecond: 10, velocityXMaxPxPerSecond: 10,
            lifeMinSeconds: 2, lifeMaxSeconds: 2, onDeathStreamId: "splash", occludeByCells: false },
          { ...effect.streams[0], id: "splash", spawn: { kind: "point", radiusPx: 0 },
            ratePerSecond: 0, lifeMinSeconds: 2, lifeMaxSeconds: 2, occludeByCells: false }
        ]
      });
      particles.upsertRoomEmitter({ id: "exact-lifetime", style: "fall-speed-room", lifetimeSeconds: 0.5 });
      particles.update(0);
      particles.update(1 / 60);
      particles.upsertRoomEmitter({ id: "exact-lifetime", style: "fall-speed-room", active: false });
      const group = particles.preLight.children[0] as ParticleContainer;
      const drop = group.particleChildren[0];
      for (let frame = 2; frame <= 30; frame++) particles.update(frame / 60);
      expect(group.particleChildren).toContain(drop);

      particles.update(31 / 60);
      expect(group.particleChildren).toHaveLength(1);
      const splash = group.particleChildren[0];
      expect(splash.scaleX).toBe(4);
      for (let frame = 32; frame <= 120; frame++) particles.update(frame / 60);
      expect(group.particleChildren).toContain(splash);
    } finally {
      particles.dispose();
    }
  });

  it("overrides room particle sizes per stream in pixels", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "split-size-room",
        defaultColors: { primary: "#ffffff", secondary: "#808080" },
        defaultEmissionRatePerSecond: 60,
        defaultSizePx: 4,
        colorBindings: { drops: "primary", splash: "secondary", mist: "primary" },
        streams: [
          { ...effect.streams[0], id: "drops", spawn: { kind: "room" }, occludeByCells: false },
          { ...effect.streams[0], id: "splash", spawn: { kind: "room" }, startWidthPx: 3, occludeByCells: false },
          { ...effect.streams[0], id: "mist", spawn: { kind: "room" }, occludeByCells: false }
        ]
      });
      particles.upsertRoomEmitter({
        id: "split-size", style: "split-size-room", sizePx: 8,
        streamSizesPx: { drops: 2, splash: 9 }
      });
      particles.update(0);
      particles.update(1 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren.map(particle => particle.scaleX)).toEqual([2, 9, 8]);
    } finally {
      particles.dispose();
    }
  });

  it("stretches and aligns only room streams marked for wind stretch", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "wind-stretch-rain",
        defaultColors: { primary: "#ffffff", secondary: "#808080" },
        defaultEmissionRatePerSecond: 120,
        defaultSizePx: 4,
        colorBindings: { drops: "primary", splash: "secondary" },
        windBlownStreamIds: ["drops"],
        windStretchStreamIds: ["drops"],
        streams: [
          { ...effect.streams[0], id: "drops", spawn: { kind: "room" }, occludeByCells: false },
          { ...effect.streams[0], id: "splash", spawn: { kind: "room" }, startWidthPx: 3, startHeightPx: 3, occludeByCells: false }
        ]
      });
      particles.upsertRoomEmitter({
        id: "rain-windy", style: "wind-stretch-rain", sizePx: 4,
        streamSizesPx: { drops: 4, splash: 6 }, windYPxPerSecond: 40
      });
      particles.update(0);
      particles.update(1 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      const [drop, splash] = group.particleChildren;
      expect(drop.scaleX).toBe(24);
      expect(drop.scaleY).toBe(4);
      expect(drop.rotation).toBeCloseTo(Math.PI / 2);
      expect(splash.scaleX).toBe(6);
      expect(splash.scaleY).toBe(6);

      particles.clear();
      particles.upsertRoomEmitter({
        id: "rain-calm", style: "wind-stretch-rain", sizePx: 4,
        streamSizesPx: { drops: 4, splash: 6 }
      });
      particles.update(0);
      particles.update(1 / 60);
      const calmDrop = [...particles.preLight.children]
        .flatMap(child => (child as ParticleContainer).particleChildren)
        .find(particle => particle.scaleX === 4)!;
      expect(calmDrop.scaleX).toBe(4);
      expect(calmDrop.scaleY).toBe(4);
      expect(calmDrop.rotation).toBe(0);
    } finally {
      particles.dispose();
    }
  });

  it("uses both producer colors on a styled flame without changing its lifetime", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "two-color-flame", defaultColor: "#ffffff", defaultSmokeColor: "#888888",
        defaultColors: { primary: "#ffffff", secondary: "#808080" },
        baseRadiusPx: 1, colorControlStreamIds: ["body"], flameStreamIds: ["body"],
        smokeStreamIds: [], emberStreamIds: [], colorBindings: { body: "transition" },
        streams: [{ ...effect.streams[0], id: "body", endColor: "#808080", occludeByCells: false }]
      });
      particles.upsertStyledEmitter({ id: "flame", style: "two-color-flame", streamGroup: "flame",
        xPx: 50, yPx: 50, radiusPx: 0,
        colors: ["#ff0000", "#0000ff"], colorTransitionFraction: 0.5 });
      particles.update(0);
      particles.update(1 / 60);
      const visual = (particles.preLight.children[0] as ParticleContainer).particleChildren[0];
      particles.upsertStyledEmitter({ id: "flame", style: "two-color-flame", streamGroup: "flame", active: false,
        xPx: 50, yPx: 50 });
      for (let frame = 2; frame <= 61; frame++) particles.update(frame / 60);
      expect(visual.tint).toBe(0x0000ff);
      expect(particles.getStats().liveParticles).toBe(1);
    } finally {
      particles.dispose();
    }
  });

  it("applies advanced styled-stream overrides independently and cannot reactivate smoke", () => {
    const particles = system();
    try {
      const stream = effect.streams[0];
      particles.registerStyle({
        id: "advanced-fire", defaultColor: "#ffffff", defaultSmokeColor: "#888888",
        defaultColors: { primary: "#ffffff", secondary: "#888888" }, baseRadiusPx: 2,
        colorControlStreamIds: ["flame", "tip"], flameStreamIds: ["flame", "tip"],
        smokeStreamIds: ["smoke"], emberStreamIds: [],
        streams: [
          { ...stream, id: "flame", ratePerSecond: 60, startWidthPx: 4, startHeightPx: 4, lifeMinSeconds: 1, lifeMaxSeconds: 2 },
          { ...stream, id: "tip", ratePerSecond: 60, layer: "pre-light", startWidthPx: 4, startHeightPx: 4, lifeMinSeconds: 1, lifeMaxSeconds: 2 },
          { ...stream, id: "smoke", ratePerSecond: 0, layer: "pre-light" }
        ]
      });
      particles.upsertStyledEmitter({
        id: "fire", style: "advanced-fire", streamGroup: "flame", xPx: 50, yPx: 50,
        streamOverrides: {
          flame: { ratePerSecond: 12, lifeMinSeconds: 0.4, lifeMaxSeconds: 0.8, sizeScale: 2,
            startColor: "#ff0000", endColor: "#ff8800", startAlpha: 0.8, endAlpha: 0.2, layer: "post-light" },
          tip: { ratePerSecond: 48, lifeMinSeconds: 2, lifeMaxSeconds: 3, speedScale: 1.5, layer: "pre-light" },
          smoke: { ratePerSecond: 600, layer: "post-light" }
        }
      });
      particles.update(0);
      particles.update(0.25);
      expect(particles.getStats().emittedParticles).toBe(15);
      expect(particles.getStats().liveParticles).toBe(15);
      expect((particles.preLight.children[0] as ParticleContainer).particleChildren).toHaveLength(12);
      expect((particles.postLight.children[0] as ParticleContainer).particleChildren).toHaveLength(3);
      const flame = (particles.postLight.children[0] as ParticleContainer).particleChildren[0];
      expect(flame.scaleX).toBe(8);
      expect(flame.tint).toBeGreaterThan(0xff0000);
      expect(flame.alpha).toBeLessThanOrEqual(0.8);
      particles.upsertStyledEmitter({ id: "fire", style: "advanced-fire", streamGroup: "flame", xPx: 50, yPx: 50, active: false });
      for (const time of [0.5, 0.75, 1, 1.25, 1.5]) particles.update(time);
      expect(particles.getStats().liveParticles).toBeGreaterThan(0);
      expect(particles.getStats().liveParticles).toBeLessThan(15);
    } finally {
      particles.dispose();
    }
  });

  it("restores a styled stream to recipe values when its override is reset", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "reset-fire", defaultColor: "#ffffff", defaultSmokeColor: "#888888",
        baseRadiusPx: 1, colorControlStreamIds: ["flame"], flameStreamIds: ["flame"],
        smokeStreamIds: [], emberStreamIds: [],
        streams: [{ ...effect.streams[0], id: "flame", ratePerSecond: 60, startWidthPx: 4, startHeightPx: 4 }]
      });
      const fire = { id: "fire", style: "reset-fire", streamGroup: "flame" as const, xPx: 20, yPx: 20 };
      particles.upsertStyledEmitter({ ...fire, streamOverrides: { flame: { ratePerSecond: 0, sizeScale: 3, startColor: "#00ff00" } } });
      particles.update(0);
      expect(particles.getStats().emittedParticles).toBe(0);
      // Clearing the caller's per-style override map is the public reset operation.
      particles.upsertStyledEmitter(fire);
      particles.update(0.25);
      expect(particles.getStats().emittedParticles).toBe(15);
      const visual = (particles.preLight.children[0] as ParticleContainer).particleChildren[0];
      expect(visual.scaleX).toBe(4);
      expect(visual.tint).toBe(0xffffff);
    } finally {
      particles.dispose();
    }
  });

  it("applies a room style's second color and lighting pass to a timed impact", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "hail", defaultColors: { primary: "#ffffff", secondary: "#aaaaff" },
        colorBindings: { stone: "primary", impact: "secondary" },
        streams: [
          { ...effect.streams[0], id: "stone", spawn: { kind: "room" },
            lifeMinSeconds: 1 / 60, lifeMaxSeconds: 1 / 60, onDeathStreamId: "impact", occludeByCells: false },
          { ...effect.streams[0], id: "impact", ratePerSecond: 0, layer: "pre-light",
            startColor: "#aaaaff", endColor: "#aaaaff", occludeByCells: false }
        ]
      });
      particles.upsertRoomEmitter({
        id: "hail-1", style: "hail", active: true,
        colors: ["#ff0000", "#00ff00"], layer: "post-light"
      });
      particles.update(0);
      particles.update(1 / 60);
      particles.upsertRoomEmitter({ id: "hail-1", style: "hail", active: false });
      particles.update(2 / 60);
      expect(particles.getStats().liveParticles).toBe(1);
      const group = particles.postLight.children[0] as ParticleContainer;
      expect(group.particleChildren[0].tint).toBe(0x00ff00);
    } finally {
      particles.dispose();
    }
  });

  it("uses a cell footprint to hide particles below an object's top", () => {
    const particles = system();
    try {
      particles.setOccluders([{ xPx: 10, yPx: 10, sizeXCells: 2, sizeYCells: 2 }]);
      particles.emitBurst({ id: "b", effectId: "test", xPx: 30, yPx: 30, count: 1 });
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren[0].alpha).toBe(0);
      particles.setOccluders([]);
      particles.update(0);
      particles.update(1 / 60);
      expect(group.particleChildren[0].alpha).toBe(1);
    } finally {
      particles.dispose();
    }
  });

  it("reveals smoke as its elevation rises without moving along screen Y", () => {
    const particles = system();
    try {
      particles.registerEffect({
        ...effect,
        id: "rising",
        streams: [{
          ...effect.streams[0],
          startElevationCells: 0,
          endElevationCells: 2
        }]
      });
      particles.setOccluders([{ xPx: 10, yPx: 10, sizeXCells: 2, sizeYCells: 2, elevationCells: 1 }]);
      particles.emitBurst({ id: "rising-smoke", effectId: "rising", xPx: 30, yPx: 30, count: 1 });
      const group = particles.preLight.children[0] as ParticleContainer;
      const visual = group.particleChildren[0];
      expect(visual.alpha).toBe(0);
      particles.update(0);
      for (const time of [0.25, 0.5, 0.75, 1]) particles.update(time);
      expect(visual.y).toBe(30);
      expect(visual.alpha).toBe(1);
    } finally {
      particles.dispose();
    }
  });

  it("hides a descending drop below an object without moving it down the image", () => {
    const particles = system();
    try {
      particles.registerEffect({
        ...effect,
        id: "descending",
        streams: [{ ...effect.streams[0], startElevationCells: 2, endElevationCells: 0 }]
      });
      particles.setOccluders([{ xPx: 10, yPx: 10, sizeXCells: 2, sizeYCells: 2, elevationCells: 1 }]);
      particles.emitBurst({ id: "descending-drop", effectId: "descending", xPx: 30, yPx: 30, count: 1 });
      const group = particles.preLight.children[0] as ParticleContainer;
      const visual = group.particleChildren[0];
      expect(visual.alpha).toBe(1);
      particles.update(0);
      for (const time of [0.25, 0.5, 0.75, 1, 1.25, 1.5]) particles.update(time);
      expect(visual.y).toBe(30);
      expect(visual.alpha).toBe(0);
    } finally {
      particles.dispose();
    }
  });

  it("starts a floor splash at the position where a descending drop ends", () => {
    const particles = system();
    try {
      particles.registerEffect({
        id: "rain",
        streams: [
          {
            ...effect.streams[0],
            id: "drop",
            ratePerSecond: 0,
            lifeMinSeconds: 1 / 60,
            lifeMaxSeconds: 1 / 60,
            startElevationCells: 2,
            endElevationCells: 0,
            onDeathStreamId: "splash"
          },
          {
            ...effect.streams[0],
            id: "splash",
            ratePerSecond: 0,
            lifeMinSeconds: 1,
            lifeMaxSeconds: 1,
            occludeByCells: false
          }
        ]
      });
      particles.emitBurst({ id: "one-drop", effectId: "rain", streamId: "drop", xPx: 90, yPx: 35, count: 1 });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(1);
      expect(particles.getStats().emittedParticles).toBe(2);
      const group = particles.preLight.children[0] as ParticleContainer;
      expect(group.particleChildren[0].x).toBe(90);
      expect(group.particleChildren[0].y).toBe(35);
    } finally {
      particles.dispose();
    }
  });

  it("uses seeded irregular surge intervals and adds the configured burst count", () => {
    const first = system();
    const second = system();
    try {
      const input = {
        id: "torch-a", effectId: "test", xPx: 40, yPx: 30,
        surge: { intervalMinSeconds: 0.12, intervalMaxSeconds: 0.18, burstCount: 4, seed: 987 }
      };
      first.upsertEmitter(input);
      second.upsertEmitter(input);
      first.update(0);
      second.update(0);
      for (let frame = 1; frame <= 30; frame++) {
        first.update(frame / 60);
        second.update(frame / 60);
      }
      expect(first.getStats().emittedParticles).toBeGreaterThan(30);
      expect(first.getStats().emittedParticles).toBe(second.getStats().emittedParticles);
      const firstVisuals = (first.preLight.children[0] as ParticleContainer).particleChildren;
      const secondVisuals = (second.preLight.children[0] as ParticleContainer).particleChildren;
      expect(firstVisuals.map(particle => [particle.x, particle.y])).toEqual(secondVisuals.map(particle => [particle.x, particle.y]));
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("rejects invalid authored colors before emitting anything", () => {
    const particles = system();
    try {
      expect(() => particles.registerEffect({
        ...effect,
        id: "invalid",
        streams: [{ ...effect.streams[0], startColor: "orange" }]
      })).toThrow(/#RRGGBB/);
      expect(() => particles.upsertEmitter({ id: "bad", effectId: "missing", xPx: 0, yPx: 0 })).toThrow(/Unknown/);
      expect(() => particles.registerEffect({
        ...effect,
        id: "missing-follow-up",
        streams: [{ ...effect.streams[0], onDeathStreamId: "not-here" }]
      })).toThrow(/onDeathStreamId/);
    } finally {
      particles.dispose();
    }
  });

  it("turns a short debris burst into stationary long-lived follow-up particles", () => {
    const particles = system();
    try {
      particles.registerEffect({
        id: "rubble-effect",
        streams: [
          { ...effect.streams[0], id: "flying", ratePerSecond: 0, lifeMinSeconds: 0.1, lifeMaxSeconds: 0.1,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0, onDeathStreamId: "settled" },
          { ...effect.streams[0], id: "settled", ratePerSecond: 0, lifeMinSeconds: 10, lifeMaxSeconds: 10,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0 }
        ]
      });
      particles.emitBurst({
        id: "wall-hit-1", effectId: "rubble-effect", streamId: "flying", xPx: 40, yPx: 50, count: 2,
        streamOverrides: {
          flying: { lifetimeSeconds: 0.1, velocityOffsetXPxPerSecond: 30 },
          settled: { lifetimeSeconds: 10 }
        }
      });
      particles.update(0);
      particles.update(0.2);
      expect(particles.getStats().liveParticles).toBe(2);
      const group = particles.preLight.children[0] as ParticleContainer;
      const settledPositions = group.particleChildren.map(particle => ({ x: particle.x, y: particle.y }));
      expect(settledPositions.every(position => position.x > 40)).toBe(true);
      particles.update(0.3);
      expect(group.particleChildren.map(particle => ({ x: particle.x, y: particle.y }))).toEqual(settledPositions);
      expect(particles.getStats().emittedParticles).toBe(4);
    } finally {
      particles.dispose();
    }
  });

  it("delivers a burst stimulus to the event-responsive streams of an active emitter", () => {
    const particles = system();
    try {
      particles.registerEffect({
        id: "stimulus-burst",
        streams: [
          { ...effect.streams[0], id: "chips", ratePerSecond: 0, surgeOnly: true,
            lifeMinSeconds: 0.1, lifeMaxSeconds: 0.1, velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
            onDeathStreamId: "settled" },
          { ...effect.streams[0], id: "settled", ratePerSecond: 0, lifeMinSeconds: 10, lifeMaxSeconds: 10,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0 }
        ]
      });
      particles.upsertEmitter({ id: "wall-binding", effectId: "stimulus-burst", xPx: 40, yPx: 50 });
      const stimulus = { id: "wall-impact-1", emitterId: "wall-binding", kind: "burst" as const, count: 3, directionDegrees: 0, speedPxPerSecond: 30 };
      particles.sendStimulus(stimulus);
      particles.sendStimulus(stimulus);
      expect(particles.getStats().liveParticles).toBe(3);
      particles.update(0);
      particles.update(0.2);
      expect(particles.getStats().liveParticles).toBe(3);
      expect(particles.getStats().emittedParticles).toBe(6);
    } finally {
      particles.dispose();
    }
  });

  it("keeps wall debris settled after the configured flying lifetime expires", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "wall-debris-lifetime",
        defaultColor: "#806448", defaultSmokeColor: "#806448", baseRadiusPx: 3,
        colorControlStreamIds: ["flying-chips", "settled-rubble"],
        flameStreamIds: [], smokeStreamIds: [], emberStreamIds: [],
        lifetimeControlStreamIds: ["flying-chips"],
        streams: [
          { ...effect.streams[0], id: "flying-chips", ratePerSecond: 0, surgeOnly: true,
            lifeMinSeconds: 0.4, lifeMaxSeconds: 0.6, onDeathStreamId: "settled-rubble" },
          { ...effect.streams[0], id: "settled-rubble", ratePerSecond: 0,
            lifeMinSeconds: 86400, lifeMaxSeconds: 86400,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
            velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0 }
        ]
      });
      particles.upsertStyledEmitter({
        id: "debris-emitter", style: "wall-debris-lifetime", xPx: 40, yPx: 50,
        lifetimeSeconds: 0.1
      });
      particles.update(0);
      particles.sendStimulus({ id: "hammer-hit-lifetime", emitterId: "debris-emitter", kind: "burst", count: 3 });
      particles.update(0.2);

      expect(particles.getStats().liveParticles).toBe(3);
      expect(particles.getStats().emittedParticles).toBe(6);
    } finally {
      particles.dispose();
    }
  });

  it("fades a wind stimulus smoothly back to calm after its hold duration", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "wind-stimulus-style", defaultColor: "#ffffff", defaultSmokeColor: "#aaaaaa",
        baseRadiusPx: 1, colorControlStreamIds: ["dots"], flameStreamIds: ["dots"],
        smokeStreamIds: [], emberStreamIds: [], windBlownStreamIds: ["dots"], windNudgeFadeOutSeconds: 0.8,
        streams: [{ ...effect.streams[0], id: "dots", spawn: { kind: "point", radiusPx: 0 },
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0 }]
      });
      particles.upsertStyledEmitter({ id: "wind-target", style: "wind-stimulus-style", xPx: 50, yPx: 50 });
      particles.update(0);
      particles.update(0.1);
      const group = particles.preLight.children[0] as ParticleContainer;
      const particle = group.particleChildren[0];
      const initialX = particle.x;
      particles.sendStimulus({
        id: "gust-1", emitterId: "wind-target", kind: "wind",
        directionDegrees: 0, speedPxPerSecond: 50, durationSeconds: 0.1
      });
      particles.update(0.2);
      const gustedX = particle.x;
      expect(gustedX).toBeGreaterThan(initialX + 2);
      particles.update(0.3);
      const fadingX = particle.x;
      expect(fadingX).toBeGreaterThan(gustedX);
      expect(fadingX - gustedX).toBeLessThan(gustedX - initialX);
      for (let time = 0.4; time <= 1.1; time += 0.1) {
        particles.update(Number(time.toFixed(1)));
      }
      const settledX = particle.x;
      particles.update(1.2);
      expect(particle.x).toBeCloseTo(settledX, 5);
    } finally {
      particles.dispose();
    }
  });

  it("moves an opted-in orbiting cloud during a temporary wind stimulus", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "orbit-wind-style", defaultColor: "#ffffff", defaultSmokeColor: "#aaaaaa",
        baseRadiusPx: 1, colorControlStreamIds: ["bugs"], flameStreamIds: ["bugs"],
        smokeStreamIds: [], emberStreamIds: [], windBlownStreamIds: ["bugs"],
        streams: [{ ...effect.streams[0], id: "bugs", ratePerSecond: 30,
          spawn: { kind: "point", radiusPx: 0 }, orbitAngularSpeedRadiansPerSecond: 3.8,
          lifeMinSeconds: 5, lifeMaxSeconds: 5,
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0 }]
      });
      particles.upsertStyledEmitter({ id: "orbit-wind-target", style: "orbit-wind-style", xPx: 50, yPx: 50 });
      particles.update(0);
      particles.update(0.1);
      const group = particles.preLight.children[0] as ParticleContainer;
      const particle = group.particleChildren[0];
      const initialX = particle.x;
      particles.sendStimulus({
        id: "orbit-gust", emitterId: "orbit-wind-target", kind: "wind",
        directionDegrees: 0, speedPxPerSecond: 50, durationSeconds: 0.1
      });
      particles.update(0.2);
      const gustedX = particle.x;
      expect(gustedX).toBeGreaterThan(initialX + 4);
      particles.update(0.3);
      const fadingX = particle.x;
      expect(fadingX).toBeGreaterThan(gustedX);
      expect(fadingX - gustedX).toBeLessThan(gustedX - initialX);
      particles.update(0.6);
      const settledX = particle.x;
      particles.update(0.7);
      expect(particle.x).toBeCloseTo(settledX, 5);
    } finally {
      particles.dispose();
    }
  });

  it("sends edge-flow leaves into the room and keeps them alive until they cross it", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "edge-leaves", defaultColors: { primary: "#b87835", secondary: "#71512e" },
        colorBindings: { leaves: "transition" }, windBlownStreamIds: ["leaves"],
        windEdgeFlowStreamIds: ["leaves"], defaultEmissionRatePerSecond: 60,
        defaultSizePx: 4, defaultLifetimeSeconds: 0.1,
        streams: [{ ...effect.streams[0], id: "leaves", ratePerSecond: 60,
          spawn: { kind: "room" }, lifeMinSeconds: 2, lifeMaxSeconds: 3,
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0 }]
      });
      particles.upsertRoomEmitter({ id: "leaf-gust", style: "edge-leaves", windXPxPerSecond: 0,
        emissionRatePerSecond: 60, sizePx: 4, lifetimeSeconds: 0.1 });
      particles.update(0);
      particles.update(1 / 60);
      expect(particles.getStats().liveParticles).toBe(0);

      particles.upsertRoomEmitter({ id: "leaf-gust", style: "edge-leaves", windXPxPerSecond: 100,
        emissionRatePerSecond: 60, sizePx: 4, lifetimeSeconds: 0.1 });
      particles.update(2 / 60);
      const group = particles.preLight.children[0] as ParticleContainer;
      const leaf = group.particleChildren[0];
      expect(leaf.x).toBeLessThan(0);
      particles.upsertRoomEmitter({ id: "leaf-gust", style: "edge-leaves", active: false,
        windXPxPerSecond: 100, emissionRatePerSecond: 60, sizePx: 4, lifetimeSeconds: 0.1 });
      particles.update(0.2);
      expect(particles.getStats().liveParticles).toBe(1);
      expect(leaf.x).toBeGreaterThan(0);
      expect(leaf.x).toBeLessThan(geometry.widthPx);
      for (let time = 0.45; time <= 2.45; time += 0.25) particles.update(time);
      expect(particles.getStats().liveParticles).toBe(0);
    } finally {
      particles.dispose();
    }
  });

  it("makes the skittering leaf share respond to room wind strength", () => {
    const countSkitteringLeaves = (windSpeed: number): number => {
      const particles = system();
      try {
        particles.registerRoomStyle({
          id: "wind-mixed-leaves", defaultColors: { primary: "#b87835", secondary: "#71512e" },
          colorBindings: { leaves: "flip" }, windBlownStreamIds: ["leaves"],
          windEdgeFlowStreamIds: ["leaves"],
          windMotionMix: {
            streamIds: ["leaves"], maxWindSpeedPxPerSecond: 40,
            lowWindSkitterFraction: 0.2, highWindSkitterFraction: 0.08
          },
          defaultEmissionRatePerSecond: 240, defaultSizePx: 4, defaultLifetimeSeconds: 2,
          streams: [{ ...effect.streams[0], id: "leaves", ratePerSecond: 240,
            spawn: { kind: "room" }, lifeMinSeconds: 2, lifeMaxSeconds: 3,
            velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
            velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0,
            rotationMinRadians: 0, rotationMaxRadians: 0 }]
        });
        particles.upsertRoomEmitter({ id: "wind-mix", style: "wind-mixed-leaves",
          windXPxPerSecond: windSpeed, emissionRatePerSecond: 240, sizePx: 4, lifetimeSeconds: 2 });
        particles.update(0);
        particles.update(0.25);
        const group = particles.preLight.children[0] as ParticleContainer;
        const yAtStart = group.particleChildren.map(leaf => leaf.y);
        particles.upsertRoomEmitter({ id: "wind-mix", style: "wind-mixed-leaves", active: false,
          windXPxPerSecond: windSpeed, emissionRatePerSecond: 240, sizePx: 4, lifetimeSeconds: 2 });
        particles.update(0.4);
        return group.particleChildren.filter((leaf, index) => Math.abs(leaf.y - yAtStart[index]) > 0.05).length;
      } finally {
        particles.dispose();
      }
    };

    expect(countSkitteringLeaves(1)).toBeGreaterThan(countSkitteringLeaves(40));
  });

  it("uses the secondary leaf color during occasional flips", () => {
    const particles = system();
    try {
      particles.registerRoomStyle({
        id: "flipping-leaves", defaultColors: { primary: "#ff0000", secondary: "#0000ff" },
        colorBindings: { leaves: "flip" }, windBlownStreamIds: ["leaves"], windEdgeFlowStreamIds: ["leaves"],
        defaultEmissionRatePerSecond: 20, defaultSizePx: 8, defaultLifetimeSeconds: 3,
        streams: [{ ...effect.streams[0], id: "leaves", ratePerSecond: 20, spawn: { kind: "room" },
          lifeMinSeconds: 3, lifeMaxSeconds: 3, velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0, rotationMinRadians: 0, rotationMaxRadians: 0 }]
      });
      particles.upsertRoomEmitter({ id: "flip-test", style: "flipping-leaves", windXPxPerSecond: 10,
        emissionRatePerSecond: 20, sizePx: 8, lifetimeSeconds: 3 });
      particles.update(0);
      particles.update(0.1);
      const group = particles.preLight.children[0] as ParticleContainer;
      let sawUndersideBlend = false;
      for (let index = 0; index < 28; index++) {
        particles.update(0.1);
        if (group.particleChildren.some(leaf => leaf.tint !== 0xff0000)) sawUndersideBlend = true;
      }
      expect(sawUndersideBlend).toBe(true);
    } finally {
      particles.dispose();
    }
  });

  it("accepts independent upper and underside colors for every mixed-leaf stream", () => {
    const particles = system();
    try {
      const streamIds = ["oak", "maple", "oval"];
      particles.registerRoomStyle({
        id: "six-color-leaves", defaultColors: { primary: "#ffffff", secondary: "#000000" },
        colorBindings: { oak: "flip", maple: "flip", oval: "flip" },
        windBlownStreamIds: streamIds, windEdgeFlowStreamIds: streamIds,
        defaultEmissionRatePerSecond: 90, defaultSizePx: 8, defaultLifetimeSeconds: 200,
        streams: streamIds.map(id => ({ ...effect.streams[0], id, textureId: "dot", ratePerSecond: 30,
          spawn: { kind: "room" as const }, lifeMinSeconds: 200, lifeMaxSeconds: 200,
          startWidthPx: 8, startHeightPx: 8, startColor: "#ffffff", endColor: "#000000",
          velocityXMinPxPerSecond: 0, velocityXMaxPxPerSecond: 0,
          velocityYMinPxPerSecond: 0, velocityYMaxPxPerSecond: 0 }))
      });
      const palettes = {
        oak: ["#a02020", "#20a020"],
        maple: ["#2020a0", "#a0a020"],
        oval: ["#a020a0", "#20a0a0"]
      };
      particles.upsertRoomEmitter({ id: "six-color", style: "six-color-leaves", windXPxPerSecond: 1,
        emissionRatePerSecond: 90, sizePx: 8, lifetimeSeconds: 200, streamColors: palettes });
      particles.update(0);
      particles.update(0.5);
      const group = particles.preLight.children[0] as ParticleContainer;
      const seenTints = new Set<number>();
      for (let index = 11; index < 140; index++) {
        particles.update(index * 0.05);
        for (const leaf of group.particleChildren) seenTints.add(leaf.tint);
      }
      const closeToTint = (hex: string) => {
        const expected = Number.parseInt(hex.slice(1), 16);
        return [...seenTints].some(actual => [16, 8, 0].every(shift =>
          Math.abs(((actual >> shift) & 255) - ((expected >> shift) & 255)) <= 2));
      };
      for (const palette of Object.values(palettes)) {
        for (const color of palette) expect(closeToTint(color)).toBe(true);
      }
    } finally {
      particles.dispose();
    }
  });

  it("uses a third palette color for a named flame-tip stream", () => {
    const particles = system();
    try {
      particles.registerStyle({
        id: "three-color-flame", defaultColor: "#ff8000", defaultSmokeColor: "#888888",
        defaultColors: { primary: "#ff8000", secondary: "#aa2200" }, defaultTipColor: "#fff0b0",
        baseRadiusPx: 1, colorControlStreamIds: ["body", "tip"], flameStreamIds: ["body", "tip"],
        smokeStreamIds: [], emberStreamIds: [], colorBindings: { body: "transition", tip: 2 },
        streams: [
          { ...effect.streams[0], id: "body", endColor: "#aa2200", spawn: { kind: "point", radiusPx: 0 }, occludeByCells: false },
          { ...effect.streams[0], id: "tip", startColor: "#fff0b0", endColor: "#fff0b0", spawn: { kind: "point", radiusPx: 0 }, occludeByCells: false }
        ]
      });
      particles.upsertStyledEmitter({ id: "blue-tip", style: "three-color-flame", streamGroup: "flame",
        xPx: 40, yPx: 40, radiusPx: 0, colors: ["#ff8000", "#aa2200", "#3388ff"] });
      particles.update(0);
      particles.update(1 / 60);
      const tints = particles.preLight.children.flatMap(group =>
        (group as ParticleContainer).particleChildren.map(visual => visual.tint));
      expect(tints).toContain(0x3388ff);
    } finally {
      particles.dispose();
    }
  });

  it("renders higher draw-order streams above other streams in the same lighting pass", () => {
    const particles = new TopDownParticleSystem({
      textures: { dot: Texture.WHITE, tip: Texture.WHITE }
    });
    try {
      particles.setRoomGeometry(geometry);
      particles.registerEffect({
        id: "ordered-flame",
        streams: [
          { ...effect.streams[0], id: "body", textureId: "dot", ratePerSecond: 60 },
          { ...effect.streams[0], id: "tip", textureId: "tip", drawOrder: 10, ratePerSecond: 60 }
        ]
      });
      particles.upsertEmitter({ id: "ordered-flame", effectId: "ordered-flame", xPx: 40, yPx: 40 });
      particles.update(0);
      particles.update(1 / 60);
      particles.preLight.sortChildren();

      expect(particles.preLight.children.map(child => child.zIndex)).toEqual([0, 10]);
    } finally {
      particles.dispose();
    }
  });
});
