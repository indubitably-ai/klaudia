# Klaudia CLI

Public-safe Klaudia CLI source tree and Bun-first harness for the INDUBITABLY.AI fork.

This fork is optimized for running Klaudia from source, iterating on the CLI quickly, and validating changes through a local-first test harness.

## Quick Start

### 1. Prerequisites

- Bun installed
- Node.js installed
- Codex CLI installed and able to sign in with your ChatGPT plan

Install repo dependencies:

```bash
bun install
```

### 2. Sign in with Codex

Klaudia does not authenticate directly against ChatGPT. Instead, it imports your Codex login from `~/.codex/auth.json` into Klaudia's own auth store.

If you have not signed into Codex yet:

```bash
codex login
```

Optional verification:

```bash
codex login status
```

### 3. Import Codex auth into Klaudia

Run this from the repo root:

```bash
bun run cli:source -- auth login
```

This imports your Codex credentials into Klaudia's local auth file under `~/.klaudia/auth.json`.

You usually need to do this:

- the first time you run Klaudia
- after refreshing or changing your Codex login
- if Klaudia says `Not logged in`
- if `/model` only shows the fallback model set such as `gpt-5.2-codex`

Optional verification:

```bash
bun run cli:source -- auth status --json
```

### 4. Run Klaudia from source

Start the app:

```bash
bun run cli:source
```

Useful variants:

```bash
bun run cli:source -- --help
bun run cli:source -- --version
bun run cli:source -- --no-env --help
```

`--no-env` clears ambient provider credentials so you can verify the Codex-backed path without Anthropic, Bedrock, Vertex, or other env vars interfering.

## Fast Iteration

The main development loop in this fork is:

1. Run Klaudia from source with `bun run cli:source`
2. Make a change
3. Run the smallest relevant check
4. Escalate to the full harness only when needed

### Common commands

Run the CLI from source:

```bash
bun run cli:source
```

Run the CLI with explicit args:

```bash
bun run cli:source -- --model gpt-5.4
bun run cli:source -- --bare --help
```

Typecheck the harness-owned TypeScript surface:

```bash
bun run typecheck
```

Run all tests:

```bash
bun test
```

Run tests in watch mode:

```bash
bun run test:watch
```

Run one file:

```bash
bun test test/runtime/openaiAuthStatus.test.ts
```

Run coverage:

```bash
bun run test:coverage
```

## Verification Levels

Start with the smallest check that matches your change.

### Structural and typing

```bash
bun run test:structural
bun run typecheck
```

### General local test pass

```bash
bun test
```

### OpenAI / Codex provider boundary

Use this when changing auth import, model catalog, transport, or mocked OpenAI runtime behavior:

```bash
bun run verify:openai-transport
```

### Interactive OpenAI / Codex TUI certification

Use this when changing `/model`, interactive auth behavior, or REPL boot behavior:

```bash
bun run verify:openai-interactive
```

### Runtime certification

Use this when changing startup behavior, CLI entrypoints, runtime assets, or safe-boot paths:

```bash
bun run verify:runtime
```

### Full default local verification flow

This is the repo default from [AGENTS.md](./AGENTS.md):

```bash
bun run test:structural
bun run typecheck
bun test
bun run verify:openai-interactive
bun run verify:runtime
bun run verify:harness
```

## Live OpenAI / Codex Certification

These runs use a real Codex login and are intentionally operator-run only.

```bash
KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live
KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live-interactive
```

The live scripts copy a Codex `auth.json` into a disposable home, run Klaudia auth import inside that disposable environment, and then validate the live `/models` and runtime paths.

See [docs/testing/openai-live.md](./docs/testing/openai-live.md) for the full runbook.

## Build and Compile Notes

This fork does not currently center a separate packaged build step for day-to-day development. The primary workflow is source execution through:

```bash
bun run cli:source
```

If you need compile confidence, use:

```bash
bun run typecheck
```

If you need runtime confidence, use:

```bash
bun test
bun run verify:runtime
```

Under the hood, `bun run cli:source` invokes the CLI entrypoint at [`src/entrypoints/cli.tsx`](./src/entrypoints/cli.tsx) through [`scripts/cli-from-source.sh`](./scripts/cli-from-source.sh).

## Troubleshooting

### `/model` only shows `gpt-5.2-codex`

That usually means Klaudia is still on the fallback catalog because Codex auth has not been imported yet.

Run:

```bash
bun run cli:source -- auth login
```

Then restart Klaudia and open `/model` again.

### Klaudia says `Not logged in`

First verify Codex itself is signed in:

```bash
codex login status
```

Then re-import into Klaudia:

```bash
bun run cli:source -- auth login
```

### Legacy provider env vars are interfering

Run with a clean environment:

```bash
bun run cli:source -- --no-env
```

Or unset legacy env vars such as `ANTHROPIC_API_KEY`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, and `CLAUDE_CODE_USE_FOUNDRY`.

## Repo Orientation

- `src/entrypoints/cli.tsx`: CLI bootstrap entrypoint
- `src/main.tsx`: command parsing and app startup
- `src/commands/`: slash command implementations
- `src/provider/`: OpenAI / Codex auth, model catalog, and transport boundary
- `test/provider/`: provider contract coverage
- `test/runtime/`: spawned runtime and interactive smoke coverage
- `scripts/`: verification and source-run helpers

For deeper system detail, start with:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/testing/harness.md](./docs/testing/harness.md)
- [docs/testing/test-matrix.md](./docs/testing/test-matrix.md)
- [docs/exec-plans/active/testing-harness.md](./docs/exec-plans/active/testing-harness.md)
- [docs/exec-plans/active/runtime-certification.md](./docs/exec-plans/active/runtime-certification.md)

## Tech Stack

- TypeScript
- Bun
- React + Ink
- Zod
- Commander.js
- Bun test

## Summary

If you only need the shortest path:

```bash
bun install
codex login
bun run cli:source -- auth login
bun run cli:source
```
