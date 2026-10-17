import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { dedupe: ["pixi.js"] },
  server: {
    fs: { allow: [fileURLToPath(new URL("../", import.meta.url))] },
    watch: { ignored: ["**/.browser-check/**"] }
  }
});
