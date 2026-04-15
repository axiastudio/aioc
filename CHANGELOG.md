# Changelog

## 0.1.0 - 2026-04-15

First stable release of `@axiastudio/aioc`.

### Stable Surface

- Core runtime APIs are now treated as stable: `Agent`, `tool(...)`, `run(...)`, policy helpers, logger hooks, run-record hooks, and run-record utilities.
- Public documentation has been aligned with the exported contract.
- `RunRecord` plus replay/compare workflows are part of the stable SDK story.
- Draft RFCs for approval evidence and thread history remain draft and are not part of the stable runtime contract.

### Migration Notes

- `resultMode` is the only supported non-allow delivery-mode field in `PolicyResult`.
- Legacy `denyMode` is no longer supported. Runtime rejects it deterministically with `deprecated_policy_field_denyMode`.
- Migrate policy code from:

```ts
deny("tool_not_allowlisted", { denyMode: "tool_result" });
```

to:

```ts
deny("tool_not_allowlisted", { resultMode: "tool_result" });
```

### Validation

- `npm run test:ci:stability`
- `npm run docs:build`
- `npm run build:package`
