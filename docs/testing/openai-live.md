# OpenAI Live Certification

This runbook defines the operator-run live certification layer for the OpenAI/Codex subscription path. It covers both the print-mode exact-output path and the interactive TUI path. It sits on top of the hermetic harness and is intentionally excluded from `bun run verify:harness`, `bun run verify:runtime`, and `bun run verify:openai-transport`.

Prerequisites:

- A readable Codex auth file resolvable from `KLAUDIA_LIVE_CODEX_AUTH_PATH`, then `${CODEX_HOME}/auth.json`, then `~/.codex/auth.json`
- Network access to the default production Codex backend, unless `OPENAI_BASE_URL` is intentionally overridden
- Explicit opt-in via `KLAUDIA_ENABLE_OPENAI_LIVE=1`

Command:

- `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live`
- `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live-interactive`

Optional override:

- `KLAUDIA_LIVE_CODEX_AUTH_PATH=/absolute/path/to/auth.json`

Runner behavior:

- Creates a disposable `HOME` plus XDG layout
- Copies the resolved source Codex `auth.json` into the disposable `.codex` home
- Runs `klaudia auth import-codex` inside that disposable home so the live path exercises the real import workflow
- Fetches the live OpenAI `/models` catalog after import, then filters to picker-visible API-supported models (`supported_in_api === true && visibility === "list"`) in ascending backend priority order
- Uses the first visible live model as the expected runtime default for the print-mode baseline checks
- Runs exactly three `--bare -p ... --output-format stream-json --verbose` baseline checks with no explicit `--model`
- Runs one additional exact-output print-mode case per visible live model with `--model <slug>`
- Runs one PTY-backed interactive REPL session that switches to the second visible live model with `/model <slug>`, verifies `/model status`, gets a live reply, switches back to the first visible live model, verifies `/model status` again, gets a second live reply, and exits cleanly

Prompt matrix:

- `single_line`
  Prompt: `Return exactly this text and nothing else: PARSE-ONE: A_B-C.123 [] {} ()`
  Expected: `PARSE-ONE: A_B-C.123 [] {} ()`
- `multiline`
  Prompt: `Return exactly these three lines and nothing else:` followed by `first line`, `second line`, `third line`
  Expected: `first line\nsecond line\nthird line`
- `json_text`
  Prompt: `Return exactly this JSON text as plain text, with no code fence or extra commentary: {"status":"ok","items":[1,2,3],"note":"parse-check"}`
  Expected: `{"status":"ok","items":[1,2,3],"note":"parse-check"}`

Print-mode pass criteria:

- `stderr` is empty
- `stdout` parses as exactly 3 NDJSON records
- Record types are `system/init`, `assistant`, `result` in that order
- `system/init.model` matches the expected default live slug for baseline cases, or the explicit `--model <slug>` for per-model cases
- Assistant text exactly matches the expected payload
- `result.result` exactly matches the expected payload

Fail conditions:

- Auth source cannot be resolved
- `klaudia auth import-codex` cannot import the copied auth into the disposable home
- Imported auth is missing or expired for the live run
- Runtime `client_version` is rejected because it is not plain semver
- NDJSON is malformed, truncated, or has extra records
- Assistant or result payload differs from the expected string

Interactive pass criteria:

- `klaudia auth import-codex` and `klaudia auth status --json` succeed inside the disposable home
- Live `/models` returns at least two picker-visible API-supported models
- The interactive REPL reaches the idle prompt
- `/model <slug>` can move from the first visible live model to the second and back again
- `/model status` reflects the selected live display name after each switch
- Benign prompts return `LIVE-INTERACTIVE-SECOND` and `LIVE-INTERACTIVE-FIRST`
- The session exits without `stderr`
- The debug log does not contain `MACRO is not defined`

Signoff bar:

- Hermetic signoff: `bun run verify:openai-transport`, `bun run verify:openai-interactive`, and the default local verification flow from [../../AGENTS.md](../../AGENTS.md)
- Live signoff: one explicit `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live` pass and one explicit `KLAUDIA_ENABLE_OPENAI_LIVE=1 npm run verify:openai-live-interactive` pass, each recorded with its timestamp

References:

- [../../AGENTS.md](../../AGENTS.md)
- [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
- [./harness.md](./harness.md)
- [./test-matrix.md](./test-matrix.md)
- [../exec-plans/active/runtime-certification.md](../exec-plans/active/runtime-certification.md)
- [../quality/quality-score.md](../quality/quality-score.md)
