import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(workspaceRoot, "packages", "particles");
const tempRoot = await mkdtemp(path.join(tmpdir(), "storyboard-particles-packed-"));
const consumerRoot = path.join(tempRoot, "consumer");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && command === npmCommand,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}.`);
}

try {
  run(npmCommand, ["run", "build"], packageRoot);
  const packed = spawnSync(npmCommand, ["pack", "--json", "--ignore-scripts", "--pack-destination", tempRoot], {
    cwd: packageRoot,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  if (packed.error) throw packed.error;
  if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr || packed.stdout}`);
  const [packageInfo] = JSON.parse(packed.stdout);
  const tarball = path.join(tempRoot, packageInfo.filename);

  await mkdir(consumerRoot);
  run(npmCommand, ["install", "--no-save", "--package-lock=false", tarball], consumerRoot);
  await copyFile(
    path.join(workspaceRoot, "programmatic-consumer", "packed-consumer.mjs"),
    path.join(consumerRoot, "packed-consumer.mjs")
  );
  run(process.execPath, ["packed-consumer.mjs"], consumerRoot);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
