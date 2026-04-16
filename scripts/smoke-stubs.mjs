import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModulesDir = path.join(rootDir, "node_modules");
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));

if (!existsSync(nodeModulesDir)) {
  console.error(
    "smoke:stubs: node_modules is missing. Run `bun install --frozen-lockfile --ignore-scripts` first.",
  );
  process.exit(1);
}

function exportValue(moduleNamespace, name) {
  return moduleNamespace[name] ?? moduleNamespace.default?.[name];
}

async function expectRejects(action, expectedMessage) {
  let threw = false;

  try {
    await action();
  } catch (error) {
    threw = true;
    assert.match(String(error), expectedMessage);
  }

  assert.equal(threw, true, "expected the stub to reject");
}

const checks = [
  {
    name: "@ant/claude-for-chrome-mcp",
    verify: async mod => {
      assert.deepEqual(exportValue(mod, "BROWSER_TOOLS"), []);
      const server = exportValue(mod, "createClaudeForChromeMcpServer")();
      assert.equal(typeof server.connect, "function");
      assert.equal(typeof server.close, "function");
      assert.equal(typeof server.setRequestHandler, "function");
      await server.connect();
      await server.close();
    },
  },
  {
    name: "@ant/computer-use-input",
    verify: async mod => {
      assert.equal(exportValue(mod, "isSupported"), false);
    },
  },
  {
    name: "@ant/computer-use-mcp",
    verify: async mod => {
      assert.deepEqual(exportValue(mod, "DEFAULT_GRANT_FLAGS"), {
        clipboardRead: false,
        clipboardWrite: false,
        systemKeyCombos: false,
      });
      assert.deepEqual(exportValue(mod, "targetImageSize")(10, 20), [10, 20]);
      assert.deepEqual(exportValue(mod, "buildComputerUseTools")(), []);
      const response = await exportValue(mod, "bindSessionContext")()();
      assert.match(response.content[0]?.text ?? "", /public-safe build/);
    },
  },
  {
    name: "@ant/computer-use-mcp/types",
    verify: async mod => {
      assert.deepEqual(exportValue(mod, "DEFAULT_GRANT_FLAGS"), {
        clipboardRead: false,
        clipboardWrite: false,
        systemKeyCombos: false,
      });
    },
  },
  {
    name: "@ant/computer-use-mcp/sentinelApps",
    verify: async mod => {
      assert.equal(exportValue(mod, "getSentinelCategory")(), undefined);
    },
  },
  {
    name: "@ant/computer-use-swift",
    verify: async mod => {
      assert.equal(exportValue(mod, "tcc").checkAccessibility(), false);
      assert.equal(exportValue(mod, "tcc").checkScreenRecording(), false);
      assert.deepEqual(await exportValue(mod, "apps").listInstalled(), []);
      await expectRejects(
        () => exportValue(mod, "captureRegion")(),
        /public-safe build/,
      );
    },
  },
  {
    name: "audio-capture-napi",
    verify: async mod => {
      assert.equal(exportValue(mod, "isNativeAudioAvailable")(), false);
      assert.equal(exportValue(mod, "isNativeRecordingActive")(), false);
      assert.equal(exportValue(mod, "startNativeRecording")(), false);
      assert.equal(exportValue(mod, "stopNativeRecording")(), undefined);
    },
  },
  {
    name: "image-processor-napi",
    verify: async mod => {
      assert.equal(typeof mod.default, "function");
      assert.equal(exportValue(mod, "sharp"), mod.default);
      assert.equal(exportValue(mod, "getNativeModule")(), undefined);
    },
  },
  {
    name: "modifiers-napi",
    verify: async mod => {
      assert.equal(exportValue(mod, "prewarm")(), undefined);
      assert.equal(exportValue(mod, "isModifierPressed")("Shift"), false);
    },
  },
  {
    name: "url-handler-napi",
    verify: async mod => {
      assert.equal(exportValue(mod, "waitForUrlEvent")(), null);
    },
  },
  {
    name: "color-diff-napi",
    verify: async mod => {
      assert.equal(new (exportValue(mod, "ColorDiff"))().render(), null);
      assert.equal(new (exportValue(mod, "ColorFile"))().render(), null);
      assert.equal(exportValue(mod, "getSyntaxTheme")(), null);
    },
  },
];

for (const check of checks) {
  const resolvedPath = requireFromRoot.resolve(check.name);
  const moduleNamespace = await import(check.name);
  await check.verify(moduleNamespace);
  console.log(`ok ${check.name} -> ${resolvedPath}`);
}

console.log(`Stub smoke test passed for ${checks.length} imports.`);
