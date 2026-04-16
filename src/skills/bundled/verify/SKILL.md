---
description: Verify a code change by running the smallest safe command that proves the behavior.
---

Use this skill when you need to verify that a change actually works.

Principles:

- Prefer the narrowest command that exercises the changed behavior.
- Start with deterministic local checks before broader integration runs.
- Explain what was verified, what was not verified, and any residual risk.
- If the safe command fails, capture the failure mode before changing code again.

Suggested workflow:

1. Identify the smallest runnable validation for the modified surface.
2. Run local checks that do not require secrets or external state.
3. Expand to broader verification only when the narrower checks pass.
4. Summarize the exact command, result, and remaining gaps.

Examples live in `examples/cli.md` and `examples/server.md`.
