# Klaudia CLI

## Checklist

- [x] Shared Klaudia Repository to X Followers
- [ ] Did we piss off the lawyers at Anthropic yet?
- [ ] DMCA takedown from Github

Run Claude Code with your ChatGPT Pro / Codex subscription.

This repository is a GPT-model harness for Claude Code: it lets you run the Claude Code CLI against ChatGPT/Codex auth, use GPT models through the provider boundary, and iterate locally from source.

Use it when you want the Claude Code experience with ChatGPT Pro / Codex-backed authentication and GPT models instead of the default provider path.

If you want the live timer version, open [docs/stopwatch.html](./docs/stopwatch.html). It now counts from a fixed global launch timestamp instead of page load.

## Disclaimer

This repository includes built-in skills, tools, and automation surfaces that are under active development. They are provided without any guarantee of correctness, completeness, stability, or fitness for a particular purpose.

Use the skills and related automation at your own risk. Behavior may be incomplete, may change without notice, and may require operator judgment before use.

## Quick Start

### 1. Prerequisites

- Bun installed
- Node.js installed
- A local browser available for the ChatGPT/Codex sign-in flow
- Optional: Codex CLI, if you want to use `auth import-codex` or run the live certification scripts

Install repo dependencies:

```bash
bun install
```

### 2. Sign in to Klaudia

Klaudia now authenticates directly against ChatGPT/Codex through a local browser flow and stores fresh credentials in `~/.klaudia/auth.json`.

Run this from the repo root:

```bash
bun run cli:source -- auth login
```

This opens the browser, completes the ChatGPT/Codex sign-in flow, and persists Klaudia's own auth state locally.

Optional verification:

```bash
bun run cli:source -- auth status --json
```

### 3. Optional: import an existing Codex login

If you already have a fresh Codex auth file and want to seed Klaudia from it instead of using the browser flow, you can import it explicitly:

```bash
bun run cli:source -- auth import-codex
```

This copies `~/.codex/auth.json` into Klaudia's auth store and immediately validates it.

This path is mainly useful for:

- disposable-home testing
- live certification scripts
- cases where you explicitly want to bootstrap from an existing Codex login

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

`--no-env` clears ambient provider credentials so you can verify the ChatGPT/Codex-backed path without Anthropic, Bedrock, Vertex, or other env vars interfering.

## Contributing

We welcome contributions.

Before opening a PR, start with the smallest relevant validation for your change and then scale up as needed. The repo's default verification flow lives in [AGENTS.md](./AGENTS.md), and the broader architecture and testing references are in [ARCHITECTURE.md](./ARCHITECTURE.md), [docs/testing/harness.md](./docs/testing/harness.md), and [docs/testing/openai-live.md](./docs/testing/openai-live.md).

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

Use this when changing auth, auth import, model catalog, transport, or mocked OpenAI runtime behavior:

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

The live scripts copy a Codex `auth.json` into a disposable home, run `klaudia auth import-codex` inside that disposable environment, and then validate the live `/models` and runtime paths.

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

That usually means Klaudia is still on the fallback catalog because Klaudia is not signed in yet.

Run:

```bash
bun run cli:source -- auth login
```

Then restart Klaudia and open `/model` again.

### Klaudia says `Not logged in`

Run the native browser login flow again:

```bash
bun run cli:source -- auth login
```

If you are intentionally using the import path instead, first refresh Codex and then re-import:

```bash
codex login
bun run cli:source -- auth import-codex
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
bun run cli:source -- auth login
bun run cli:source
```
