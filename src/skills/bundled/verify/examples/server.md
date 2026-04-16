# Server Verification Example

When the change touches a server or background service, prefer a smoke check that proves startup and one request path.

Example pattern:

```sh
bun test test/mcp/config.test.ts
```

Report:

- startup result
- one verified request or contract path
- any skipped live-network behavior
