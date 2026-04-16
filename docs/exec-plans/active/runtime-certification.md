# Runtime Certification Status

Phase 2 objective: prove the public-safe fork can boot selected CLI paths in a disposable environment without triggering keychain or MDM startup reads, while preserving near-original startup behavior outside explicit safe mode.

Status:

- Done: `test/runtime/*` adds a spawned safe-boot matrix for `--version`, `--help`, `--bare --help`, `mcp --help`, `plugin --help`, `doctor --help`, and `update --help`.
- Done: runtime tests isolate `HOME`/XDG state, scrub ambient auth env, and use startup trace-only mode so regressions are observable without touching live OS secrets.
- Done: `src/entrypoints/startupTrace.ts` records startup bootstrap attempts and subprocess intents for runtime certification.
- Done: `src/main.tsx` import safety is now enforced by a spawned import-only smoke test.
- Done: `scripts/verify-runtime.mjs` verifies safe-boot asset presence, safe-path macro guards, and the spawned safe boot matrix.
- Done: the OpenAI/Codex cutover now has mocked authenticated runtime coverage via `test/runtime/openaiAuthStatus.test.ts` and `test/runtime/openaiQuerySmoke.test.ts`, with a dedicated `bun run verify:openai-transport` gate for provider/auth/request/stream contracts.
- Done: `test/runtime/openaiInteractiveTui.test.ts` adds hermetic PTY-backed source-run interactive coverage for REPL boot, OpenAI startup isolation, `/help`, `/status`, and `--continue`.
- Done: `scripts/verify-openai-live.mjs` adds an opt-in live Codex subscription certification layer that imports a real `~/.codex/auth.json` into a disposable home and validates three exact-output print-mode cases against production by default.
- Done: `scripts/verify-openai-live-interactive.mjs` adds an opt-in live interactive Codex certification layer that imports a real `~/.codex/auth.json` into a disposable home and validates one end-to-end REPL roundtrip against production by default.
- Deferred: CI-backed live probing, remote managed settings, broader production-like network/runtime validation, and legacy call-home features.

Scope note:

- Legacy analytics, GrowthBook, and similar telemetry paths are intentionally not part of the required runtime certification surface for this fork.
- The next provider-facing certification work should be shaped around Codex-style API/subscription integration rather than legacy account or telemetry behavior.
- Live certification is operator-run and intentionally separate from the default hermetic harness. See [../../testing/openai-live.md](../../testing/openai-live.md).

Verification entrypoints:

- `bun run verify:runtime`
- `bun run verify:openai-interactive`
- `bun run verify:openai-transport`
- `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live`
- `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live-interactive`
- `bun test test/runtime`
- `CLAUDE_CODE_DISABLE_STARTUP_SIDE_EFFECTS=1 bun src/entrypoints/cli.tsx --bare --help`

Reference:

- [./testing-harness.md](./testing-harness.md)
- [../../testing/harness.md](../../testing/harness.md)
- [../../testing/openai-live.md](../../testing/openai-live.md)
- [../../testing/test-matrix.md](../../testing/test-matrix.md)
- [../../quality/quality-score.md](../../quality/quality-score.md)
