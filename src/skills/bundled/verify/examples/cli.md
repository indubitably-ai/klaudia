# CLI Verification Example

Use a focused command that checks the changed CLI surface without launching unrelated subsystems.

Example pattern:

```sh
bun test test/harness/startupSideEffects.test.ts
```

Report:

- the command you ran
- whether it passed or failed
- what behavior it proves
