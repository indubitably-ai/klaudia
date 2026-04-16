# Testing Harness Status

Phase 1 objective: establish a Bun-first local harness that lets us modify Shell, MCP, and Settings safely before broader refactors.

Status:

- Done: `bunfig.toml`, `tsconfig.json`, preload/support utilities, first-wave suites, and structural verification.
- Done: `tsconfig.harness.json` scopes TypeScript verification to the harness-owned surface while the wider leaked tree remains incomplete.
- Done: agent-readable docs in [../../AGENTS.md](../../AGENTS.md), [../../ARCHITECTURE.md](../../ARCHITECTURE.md), [../../testing/openai-live.md](../../testing/openai-live.md), and [../testing/test-matrix.md](../testing/test-matrix.md).
- Done: `bun run test:coverage` now uses LCOV plus a repo-local focus summarizer instead of Bun's unstable full-tree text reporter.
- Done: phase 1 runtime hardening moved early MDM/keychain startup reads behind an explicit bootstrap and validated a safe `--bare --help` smoke run.
- Active follow-on: [runtime certification](./runtime-certification.md) now covers spawned safe-boot paths and import safety for the public fork.
- Active follow-on: the OpenAI/Codex path now has a separate operator-run live certification layer via [../../testing/openai-live.md](../../testing/openai-live.md), outside the default harness.
- Done: the OpenAI/Codex path now has hermetic PTY-backed interactive TUI smoke coverage and a separate operator-run live interactive certification entrypoint.
- Deferred: CI-backed live probing and broader UI end-to-end coverage beyond the certified interactive REPL path.

Verification entrypoints:

- `bun run test:structural`
- `bun run typecheck`
- `bun test`
- `bun run verify:openai-interactive`
- `bun run verify:runtime`
- `bun run verify:harness`

Reference:

- [../../testing/harness.md](../../testing/harness.md)
- [../../testing/openai-live.md](../../testing/openai-live.md)
- [../../testing/test-matrix.md](../../testing/test-matrix.md)
- [./runtime-certification.md](./runtime-certification.md)
