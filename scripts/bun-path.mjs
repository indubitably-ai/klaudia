import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function looksLikeBunBinary(candidate) {
  const base = path.basename(candidate).toLowerCase();
  return base === "bun" || base === "bun.exe";
}

function canExecute(candidate) {
  if (!candidate || !existsSync(candidate)) {
    return false;
  }

  const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

export function detectBunBinary() {
  if (typeof Bun !== "undefined") {
    return process.execPath;
  }

  const candidates = new Set();

  if (process.env.npm_execpath && looksLikeBunBinary(process.env.npm_execpath)) {
    candidates.add(process.env.npm_execpath);
  }
  if (process.env.BUN_BIN) {
    candidates.add(process.env.BUN_BIN);
  }
  if (process.env.HOME) {
    candidates.add(path.join(process.env.HOME, ".bun", "bin", "bun"));
  }

  const bunName = process.platform === "win32" ? "bun.exe" : "bun";
  for (const segment of (process.env.PATH ?? "").split(path.delimiter)) {
    if (segment) {
      candidates.add(path.join(segment, bunName));
    }
  }

  for (const candidate of candidates) {
    if (canExecute(candidate)) {
      return candidate;
    }
  }

  return null;
}
