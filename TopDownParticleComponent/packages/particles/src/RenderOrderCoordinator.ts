import type { Container } from "pixi.js";
import type { ParticleLayer } from "./contracts.js";

interface OrderedContainer {
  id: string;
  order: number;
  layer: ParticleLayer;
  localOrder: number;
  sequence: number;
  container: Container;
}

/** Shared instance ordering for every visual family managed by TopDownEffects. */
export class RenderOrderCoordinator {
  private readonly entries = new Map<Container, OrderedContainer>();
  private sequence = 0;

  constructor(private readonly layers: Record<ParticleLayer, Container>) {
    layers["pre-light"].sortableChildren = true;
    layers["post-light"].sortableChildren = true;
  }

  register(id: string, order: number, layer: ParticleLayer, localOrder: number, container: Container): void {
    const previous = this.entries.get(container);
    this.entries.set(container, {
      id,
      order,
      layer,
      localOrder,
      sequence: previous?.sequence ?? this.sequence++,
      container
    });
    if (previous && previous.layer !== layer) this.sort(previous.layer);
    this.sort(layer);
  }

  updateInstanceOrder(id: string, order: number): void {
    const affected = new Set<ParticleLayer>();
    for (const entry of this.entries.values()) {
      if (entry.id !== id) continue;
      entry.order = order;
      affected.add(entry.layer);
    }
    for (const layer of affected) this.sort(layer);
  }

  remove(container: Container): void {
    const entry = this.entries.get(container);
    if (!entry) return;
    this.entries.delete(container);
    this.sort(entry.layer);
  }

  private sort(layer: ParticleLayer): void {
    const ordered = [...this.entries.values()].filter(entry => entry.layer === layer).sort((a, b) =>
      a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
      a.localOrder - b.localOrder || a.sequence - b.sequence
    );
    const parent = this.layers[layer];
    ordered.forEach((entry, index) => {
      if (entry.container.parent === parent) parent.setChildIndex(entry.container, index);
      entry.container.zIndex = index;
    });
  }
}
