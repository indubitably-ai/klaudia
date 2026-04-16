# Boundary Map

The Bun-first harness is intentionally boundary-first and local-first. Phase 1 established the repo-local test scaffold. Phase 2 adds runtime certification around the public-safe boot paths.

Active test families:

- `Harness`: preload, path alias resolution, deterministic support utilities, and structural verification.
- `Shell`: `src/tools/BashTool/*` parsing, wrapper stripping, path extraction, sed allowlists, and permission-rule helpers.
- `MCP`: `src/services/mcp/*` config parsing, environment expansion, signature/dedup helpers, and policy filtering.
- `Provider`: `src/provider/*` normalized provider/auth/account contracts that isolate Codex-style API and subscription work from the legacy first-party auth module, with hermetic transport coverage and a separate operator-run live certification layer.
- `Runtime`: spawned safe-boot checks for `src/entrypoints/cli.tsx`, import safety for `src/main.tsx`, startup-side-effect tracing, bundled runtime asset completeness, mocked OpenAI/Codex subscription print-mode continuity, hermetic PTY-backed interactive TUI smoke coverage, and a separate operator-run live interactive certification path.
- `Settings`: `src/utils/settings/*`, `src/utils/xdg.ts`, and `src/utils/shellConfig.ts` cache, path, and watcher behavior.

Explicit deferrals:

- CI-backed or continuous live auth/network probing beyond the narrow operator-run OpenAI live certification
- remote managed settings and production-like auth flows
- Legacy analytics, GrowthBook experimentation, and other call-home-only behavior
- CI wiring

Provider direction:

- The public fork’s next provider-facing work should target Codex-style API and subscription behavior, not legacy telemetry or account flows.

Supporting references:

- [AGENTS.md](./AGENTS.md)
- [docs/testing/harness.md](./docs/testing/harness.md)
- [docs/testing/openai-live.md](./docs/testing/openai-live.md)
- [docs/testing/test-matrix.md](./docs/testing/test-matrix.md)
- [docs/exec-plans/active/runtime-certification.md](./docs/exec-plans/active/runtime-certification.md)
- [docs/quality/quality-score.md](./docs/quality/quality-score.md)
