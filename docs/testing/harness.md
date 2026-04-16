# Bun-First Harness

The harness is built around `bun test` with repo-local configuration:

- [../../bunfig.toml](../../bunfig.toml) preloads `test/preload.ts`
- [../../tsconfig.json](../../tsconfig.json) provides the `src/*` alias shim for Bun and TypeScript
- [../../tsconfig.harness.json](../../tsconfig.harness.json) keeps `npm run typecheck` scoped to harness-owned files until the wider leaked tree is reconstructed
- `test/support/*` owns temp workspaces, env patching, fresh imports, timer helpers, spawned runtime helpers, and stable serialization
- `test/provider/*` owns the provider/auth/account boundary contracts for the future Codex-style provider layer
- `test/runtime/*` owns the phase 2 spawned safe-boot matrix, PTY-backed interactive TUI smoke coverage, and runtime certification contracts
- `scripts/verify-openai-live.mjs` and `scripts/verify-openai-live-interactive.mjs` own the opt-in live Codex subscription certification runs in a disposable home and are intentionally outside the default hermetic harness

Conventions:

- Prefer pure helpers and narrow reset hooks before broader integration
- Use `importFreshSourceModule()` plus `mockSourceModule()` when a module needs dependency overrides
- Register per-test cleanup with `registerTestCleanup()` for watchers, timers, or fresh module instances
- Keep phase 1 local-only; structural verification and docs drift checks run via `bun run test:structural`
- Use `bun run test:coverage` for coverage. It emits LCOV to `.coverage/bun/lcov.info` and then prints a focused Runtime/Shell/MCP/Settings summary. Bun's giant text coverage table is not used here because it trips an internal `WriteFailed` on this reconstructed tree.
- Use `npm run test:no-env` to run the harness with auth files backed up and API keys unset.
- Use `npm run cli:source -- --no-env --help` to run the CLI from source without API keys (forward args after `--`).
- Use `bun run verify:openai-interactive` to enforce the hermetic PTY-backed OpenAI interactive TUI certification path.
- Use `bun run verify:runtime` to enforce the runtime completeness checks plus the spawned safe-boot matrix.
- Use `bun run verify:openai-transport` to enforce the OpenAI/Codex provider, auth, request, stream, and mocked CLI smoke contracts as one boundary gate.
- Use `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live` and `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live-interactive` only for manual live certification. They import a real Codex auth file into a disposable home and are not part of `verify:harness` or `verify:runtime`.
- The spawned runtime suites run with disposable `HOME`, no ambient auth env, `CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS=1`, and `CLAUDE_CODE_STARTUP_SIDE_EFFECT_TRACE_ONLY=1` so safe-mode regressions are caught without touching live keychain or MDM state.
- Legacy analytics, GrowthBook, and other call-home-only paths are intentionally outside the required harness surface. The fork’s safety work is centered on local behavior and the future provider path should align with Codex-style API/subscription flows instead.
- New provider work follows boundary-first TDD: add a pure contract test in `test/provider/*`, make it fail, then implement the smallest session/provider abstraction needed before touching the legacy auth stack.

Reference docs:

- [../../AGENTS.md](../../AGENTS.md)
- [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
- [./openai-live.md](./openai-live.md)
- [./test-matrix.md](./test-matrix.md)
- [../exec-plans/active/testing-harness.md](../exec-plans/active/testing-harness.md)
- [../exec-plans/active/runtime-certification.md](../exec-plans/active/runtime-certification.md)
