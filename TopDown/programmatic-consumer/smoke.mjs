import { TopDownLightingPipeline } from "../packages/lighting/dist/index.js";

const pipeline = new TopDownLightingPipeline({ renderer: {} });
pipeline.submitFrame({
  roomLighting: { ambient: 0.25 },
  pointLights: [{ x: 10, y: 20 }],
  blockers: [{ cellX: 0, cellY: 0 }]
});

if (pipeline.getOutputs() !== null) {
  throw new Error("Outputs should be null before room texture setup.");
}

pipeline.resize({ widthPx: 640, heightPx: 400, cellSizePx: 40 });
pipeline.dispose();

let disposedError = false;
try {
  pipeline.getOutputs();
} catch (error) {
  disposedError = error instanceof Error && error.message.includes("disposed");
}
if (!disposedError) {
  throw new Error("Disposed pipeline should reject further use.");
}

console.log("Programmatic package consumer smoke test passed.");
