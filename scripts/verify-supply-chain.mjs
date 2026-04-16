import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { detectBunBinary } from "./bun-path.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(rootDir, "package.json");
const lockfilePath = path.join(rootDir, "bun.lock");

const riskyPackages = new Map([
  ["@ant/claude-for-chrome-mcp", "./stubs/@ant/claude-for-chrome-mcp"],
  ["@ant/computer-use-input", "./stubs/@ant/computer-use-input"],
  ["@ant/computer-use-mcp", "./stubs/@ant/computer-use-mcp"],
  ["@ant/computer-use-swift", "./stubs/@ant/computer-use-swift"],
  ["audio-capture-napi", "./stubs/audio-capture-napi"],
  ["color-diff-napi", "./stubs/color-diff-napi"],
  ["image-processor-napi", "./stubs/image-processor-napi"],
  ["modifiers-napi", "./stubs/modifiers-napi"],
  ["url-handler-napi", "./stubs/url-handler-napi"],
]);

function fail(message) {
  console.error(`verify:supply-chain: ${message}`);
  process.exit(1);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object") {
    fail(`missing ${label} in package.json`);
  }
  return value;
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const bunLock = readFileSync(lockfilePath, "utf8");

if (pkg.private !== true) {
  fail("package.json must stay private");
}

const dependencies = requireObject(pkg.dependencies, "dependencies");
const overrides = requireObject(pkg.overrides, "overrides");
const resolutions = requireObject(pkg.resolutions, "resolutions");

for (const [name, relativeStubPath] of riskyPackages) {
  const expected = `file:${relativeStubPath}`;
  for (const [sectionName, section] of [
    ["dependencies", dependencies],
    ["overrides", overrides],
    ["resolutions", resolutions],
  ]) {
    if (section[name] !== expected) {
      fail(`${sectionName}.${name} must be ${expected}`);
    }
  }

  const stubPath = path.join(rootDir, relativeStubPath.replace(/^\.\//, ""));
  if (!existsSync(stubPath)) {
    fail(`stub path is missing for ${name}: ${stubPath}`);
  }

  const lockSnippet = `"${name}": "${expected}"`;
  if (!bunLock.includes(lockSnippet)) {
    fail(`bun.lock is missing the pinned stub entry for ${name}`);
  }
}

const bunBinary = detectBunBinary();
if (!bunBinary) {
  fail("could not find a Bun binary; set BUN_BIN or add bun to PATH");
}

const tempHome = mkdtempSync(path.join(tmpdir(), "klaudia-supply-chain-"));

try {
  const env = {
    ...process.env,
    HOME: tempHome,
    XDG_CONFIG_HOME: path.join(tempHome, ".config"),
    XDG_CACHE_HOME: path.join(tempHome, ".cache"),
  };

  const installResult = spawnSync(
    bunBinary,
    ["install", "--frozen-lockfile", "--ignore-scripts", "--dry-run"],
    {
      cwd: rootDir,
      env,
      stdio: "inherit",
    },
  );

  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1);
  }

  console.log(
    `Verified ${riskyPackages.size} pinned risky/internal packages and Bun dry-run completed without lifecycle scripts.`,
  );
} finally {
  rmSync(tempHome, { recursive: true, force: true });
}
