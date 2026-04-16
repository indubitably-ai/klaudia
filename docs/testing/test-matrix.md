# Test Matrix

This file is the agent-readable suite map consumed by `scripts/verify-harness.mjs`.

| Subsystem | Suites | Status | Notes |
| --- | --- | --- | --- |
| Harness | `test/harness/bootstrap.test.ts`, `test/harness/startupSideEffects.test.ts` | active | Verifies preload wiring, `src/*` resolution, and runtime startup-side-effect gating. |
| Shell | `test/shell/sedValidation.test.ts`, `test/shell/bashPermissions.test.ts`, `test/shell/pathValidation.test.ts` | active | Boundary-first coverage for sed allowlists, wrapper stripping, prefix extraction, and path parsing. |
| MCP | `test/mcp/config.test.ts`, `test/mcp/policy.test.ts` | active | Config parsing, env expansion, signature dedup, and allowlist filtering. |
| Provider | `test/provider/providerSession.test.ts`, `test/provider/providerRegistry.test.ts`, `test/provider/openaiAuthManager.test.ts`, `test/provider/openaiModelCatalog.test.ts`, `test/provider/openaiTransport.test.ts`, `test/provider/openaiResponsesRequest.test.ts`, `test/provider/openaiResponsesStream.test.ts` | active | Boundary-first TDD for the OpenAI/Codex provider registry, subscription auth state, model catalog refresh/fallback behavior, transport headers and failure semantics, Responses request mapping, and SSE stream adaptation. |
| Runtime | `test/runtime/cliHelpSmoke.test.ts`, `test/runtime/startupSideEffects.integration.test.ts`, `test/runtime/mainImportSafe.test.ts`, `test/runtime/runtimeCompleteness.test.ts`, `test/runtime/openaiAuthStatus.test.ts`, `test/runtime/openaiModelPicker.test.ts`, `test/runtime/openaiQuerySmoke.test.ts`, `test/runtime/openaiInteractiveTui.test.ts` | active | Spawned safe-boot matrix, startup-side-effect suppression and negative tracing, `src/main.tsx` import safety, safe-boot asset/macro completeness, mocked OpenAI subscription/query smoke coverage, per-model print-mode catalog validation, OpenAI `/model` option derivation from the live catalog, PTY-backed interactive REPL boot plus direct visible/raw model routing, short-circuit gate failures, and `--continue` request replay continuity. |
| Settings | `test/settings/xdg.test.ts`, `test/settings/shellConfig.test.ts`, `test/settings/settingsCache.test.ts`, `test/settings/changeDetector.test.ts`, `test/settings/managedPath.test.ts` | active | XDG paths, shell alias management, cache resets, managed path rules, and watcher behavior. |
| Supporting | `test/supporting/frontmatterParser.test.ts`, `test/supporting/runtimeVersion.test.ts` | active | Regression coverage for shared local helpers and public-safe runtime shims. Legacy analytics and other call-home paths are intentionally out of scope. |
| Commands | `test/commands/version.test.ts`, `test/commands/help.test.ts` | active | Deterministic local command output and JSX command wiring. |
| Tools | `test/tools/fileReadTool.test.ts`, `test/tools/fileReadToolUI.test.ts`, `test/tools/fileEditToolUI.test.ts`, `test/tools/bashToolUI.test.ts` | active | Prompt template contract coverage for FileReadTool plus user-facing FileRead, FileEdit, and Bash tool UI/error label coverage. |
| Hooks | `test/hooks/useTimeout.test.ts` | active | Basic timing hook behavior with fake timers. |

Supporting docs:

- [./harness.md](./harness.md)
- [./openai-live.md](./openai-live.md)
- [../exec-plans/active/runtime-certification.md](../exec-plans/active/runtime-certification.md)
- [../quality/quality-score.md](../quality/quality-score.md)

Live certification notes:

- `scripts/verify-openai-live.mjs` fetches the live `/models` catalog, filters to picker-visible API-supported models, certifies the default visible model, then runs one exact-output print-mode check per visible slug.
- `scripts/verify-openai-live-interactive.mjs` fetches the same live catalog and certifies interactive `/model <slug>` switching across two distinct visible API-supported live models.
