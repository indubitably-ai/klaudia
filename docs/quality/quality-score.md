# Quality Score

Initial readiness score for safe modification work:

| Area | Score | Basis |
| --- | --- | --- |
| Harness | 4/5 | Bun preload, `src/*` alias shim, deterministic support utilities, structural verification, and safe startup-side-effect gating are in place. |
| Shell | 3/5 | Core parser and allowlist helpers are covered; full command-permission integration remains deferred. |
| MCP | 3/5 | Config parsing, expansion, dedup, and policy filtering are covered; live connector/session flows remain deferred. |
| Provider | 5/5 | The OpenAI/Codex provider registry, subscription auth storage/refresh path, transport headers/failure semantics, Responses request builder, and SSE stream adapter are wired with hermetic contract tests plus a separate live certification runbook and operator-run gate. |
| Runtime | 4/5 | The spawned safe-boot matrix, `src/main.tsx` import safety, runtime asset verification, startup trace contracts, mocked authenticated OpenAI query smoke, PTY-backed interactive TUI smoke coverage, short-circuit gate coverage, `--continue` continuity replay, and opt-in live print-mode plus interactive certification layers are in place; CI-backed production probing remains deferred. |
| Settings | 3/5 | XDG, shell config, cache, and change detector watcher behavior are covered; broader settings cascade tests remain deferred. |

References:

- [../testing/test-matrix.md](../testing/test-matrix.md)
- [../testing/openai-live.md](../testing/openai-live.md)
- [../exec-plans/active/testing-harness.md](../exec-plans/active/testing-harness.md)
- [../exec-plans/active/runtime-certification.md](../exec-plans/active/runtime-certification.md)

Coverage tracking:

- `bun run test:coverage` writes `.coverage/bun/lcov.info` and prints a focused summary for Runtime, Shell, MCP, Settings, and Supporting coverage.
- Legacy analytics, GrowthBook, and other call-home-only paths are intentionally excluded from that focus summary.
