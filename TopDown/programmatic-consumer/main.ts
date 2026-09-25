import * as PIXI from "pixi.js";
import { TopDownLightingPipeline } from "../packages/lighting/dist/index.js";

const ROOM_WIDTH = 640;
const ROOM_HEIGHT = 400;
const CELL_SIZE = 40;

const app = new PIXI.Application();
await app.init({
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
  background: 0x20242a,
  antialias: true,
  preference: "webgl"
});
document.body.appendChild(app.canvas);

const roomSurface = PIXI.RenderTexture.create({
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
  resolution: 1
});
const roomContents = new PIXI.Container();

const floor = new PIXI.Graphics()
  .rect(0, 0, ROOM_WIDTH, ROOM_HEIGHT)
  .fill(0x7b6854);
roomContents.addChild(floor);

for (let x = 0; x <= ROOM_WIDTH; x += CELL_SIZE) {
  roomContents.addChild(new PIXI.Graphics()
    .rect(x, 0, 1, ROOM_HEIGHT)
    .fill({ color: 0x9b856c, alpha: 0.35 }));
}
for (let y = 0; y <= ROOM_HEIGHT; y += CELL_SIZE) {
  roomContents.addChild(new PIXI.Graphics()
    .rect(0, y, ROOM_WIDTH, 1)
    .fill({ color: 0x9b856c, alpha: 0.35 }));
}

const movingObject = new PIXI.Graphics()
  .roundRect(0, 0, CELL_SIZE * 2, CELL_SIZE * 2, 8)
  .fill(0x9c493f);
roomContents.addChild(movingObject);

const staticObject = new PIXI.Graphics()
  .rect(440, 120, CELL_SIZE * 2, CELL_SIZE)
  .fill(0x496b77);
roomContents.addChild(staticObject);

const lightingPipeline = new TopDownLightingPipeline({ renderer: app.renderer });
lightingPipeline.setRoomTexture({
  texture: roomSurface,
  geometry: {
    widthPx: ROOM_WIDTH,
    heightPx: ROOM_HEIGHT,
    cellSizePx: CELL_SIZE
  },
  ownership: "borrowed"
});
lightingPipeline.submitFrame({
  roomLighting: {
    ambient: 0.3,
    radiusPx: 180,
    intensity: 1.5,
    lightColorHex: "#fff2c0",
    lightOuterColorHex: "#d7e9ff",
    lightHeightCells: 2
  },
  pointLights: [
    { x: 220, y: 190, radiusPx: 220, intensityScale: 1.1 },
    { x: 500, y: 260, radiusPx: 160, intensityScale: 0.8, color: "#b8d8ff" }
  ],
  blockers: [
    { cellX: 11, cellY: 3, sizeXCells: 2, sizeYCells: 1, elevationCells: 1 }
  ]
});

const outputSprite = new PIXI.Sprite(lightingPipeline.getOutputs()!.composedTexture);
app.stage.addChild(outputSprite);

app.ticker.add((ticker) => {
  // The host updates its unlit room surface before asking the lighting package
  // to render. This is the dynamic RenderTexture path in its smallest form.
  movingObject.x = 80 + Math.sin(ticker.lastTime * 0.001) * 80;
  movingObject.y = 240;
  app.renderer.render({ container: roomContents, target: roomSurface, clear: true });

  lightingPipeline.renderFrame(ticker.lastTime * 0.001);
});

window.addEventListener("beforeunload", () => {
  lightingPipeline.dispose();
  roomSurface.destroy(true);
  app.destroy(true);
});
