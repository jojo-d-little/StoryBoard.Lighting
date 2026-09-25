import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const consumerDirectory = mkdtempSync(join(tmpdir(), "storyboard-lighting-consumer-"));
const packageDirectory = fileURLToPath(new URL("../packages/lighting/", import.meta.url));
const npmScript = process.env.npm_execpath;
const npmCommand = process.platform === "win32" && npmScript ? process.execPath : "npm";
const npmPrefix = process.platform === "win32" && npmScript ? [npmScript] : [];
const npmOptions = process.platform === "win32" && !npmScript ? { shell: true } : {};

function runNpm(args, options = {}) {
  return execFileSync(npmCommand, [...npmPrefix, ...args], { ...options, ...npmOptions });
}

try {
  const packageManifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  const packResult = JSON.parse(runNpm(
    ["pack", "--json", "--pack-destination", consumerDirectory],
    { cwd: packageDirectory, encoding: "utf8" }
  ));
  const tarballPath = join(consumerDirectory, packResult[0].filename);

  runNpm(
    ["init", "--yes"],
    { cwd: consumerDirectory, stdio: "ignore" }
  );
  runNpm(
    ["install", "--no-save", "--no-package-lock", "--ignore-scripts", tarballPath, "pixi.js@8.21.0"],
    { cwd: consumerDirectory, stdio: "inherit" }
  );

  const consumerScript = `
    import { TopDownLightingPipeline } from ${JSON.stringify(packageManifest.name)};
    const pipeline = new TopDownLightingPipeline({ renderer: {} });
    pipeline.submitFrame({ pointLights: [{ x: 10, y: 20 }] });
    if (pipeline.getOutputs() !== null) throw new Error('Expected no outputs before room setup');
    pipeline.dispose();
    console.log('Packed package consumer smoke test passed.');
  `;
  const scriptPath = join(consumerDirectory, "consumer-smoke.mjs");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(scriptPath, consumerScript);
  execFileSync(process.execPath, [scriptPath], { cwd: consumerDirectory, stdio: "inherit" });
} finally {
  rmSync(consumerDirectory, { recursive: true, force: true });
}
