# Changelog

## Unreleased

### Fixed

- OpenAI chat completions serialize resolved `Agent.instructions` as `developer` messages, while Mistral and the shared chat-completions base continue to use `system`.

### Documentation

- Clarified provider-specific instruction role mapping in the Agent and Providers reference pages.

## @axiastudio/aioc-inspect-ui 0.1.0 - 2026-04-24

First public-ready release of the reusable AIOC inspect UI package.

### Added

- Published package metadata for `@axiastudio/aioc-inspect-ui`.
- Reusable React components for `RunRecord` inspection and comparison.
- `createInspectRecord(...)` helper for adapting application-owned `RunRecord` values to the UI.
- Package build output under `dist` with JavaScript and TypeScript declarations.
- README guidance for Tailwind CSS v4 consumers.

### Notes

- This release does not change the stable core SDK surface of `@axiastudio/aioc`.
- Consumers must provide `@axiastudio/aioc`, `react`, and `react-dom` as peer dependencies.
- The package does not currently ship a standalone stylesheet; Tailwind consumers should include the package output in their source scan.

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
