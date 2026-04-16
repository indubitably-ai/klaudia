# Agent Scaffold

The harness system of record lives in:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/testing/harness.md](./docs/testing/harness.md)
- [docs/testing/openai-live.md](./docs/testing/openai-live.md)
- [docs/testing/test-matrix.md](./docs/testing/test-matrix.md)
- [docs/exec-plans/active/testing-harness.md](./docs/exec-plans/active/testing-harness.md)
- [docs/exec-plans/active/runtime-certification.md](./docs/exec-plans/active/runtime-certification.md)
- [docs/quality/quality-score.md](./docs/quality/quality-score.md)

Default local verification flow:

- `bun run test:structural`
- `bun run typecheck`
- `bun test`
- `bun run verify:openai-interactive`
- `bun run verify:runtime`
- `bun run verify:harness`

Optional operator-run live certification:

- `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live`
- `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live-interactive`
