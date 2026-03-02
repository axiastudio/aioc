# Canonical Examples

These examples are the reference learning path for `aioc`.

All commands are run from the repository root.

## Prerequisite

Set `MISTRAL_API_KEY` in your environment (or `.env`), then run:

```bash
npm install
```

## 1) Hello Run

Command:

```bash
npm run example:hello
```

File:

- `src/examples/basic/hello-world.ts`

What it demonstrates:

- minimal provider setup (`setupMistral()`)
- single-agent execution with default non-stream mode
- reading `result.finalOutput`

## 2) Tool + Policy

Command:

```bash
npm run example:tool-policy
```

File:

- `src/examples/basic/tools.ts`

What it demonstrates:

- tool definition with Zod schema
- deterministic policy gate (`allow` / `deny`)
- soft deny path (`denyMode: "tool_result"`)
- streamed run events and policy logger output

## 3) RunRecord Sink

Command:

```bash
npm run example:run-record
```

File:

- `src/examples/basic/run-record-sink.ts`

What it demonstrates:

- run-record sink integration (`run(..., { record })`)
- context redaction before persistence (`contextRedactor`)
- prompt snapshots and request fingerprints
- policy decision audit trail and persisted envelope output

## Advanced (Non-Regression Diff)

Command:

```bash
npm run example:non-regression
```

File:

- `src/examples/non-regression/v1-v2-runrecord-diff.ts`

What it demonstrates:

- comparing `RunRecord` outputs across `v1` vs `v2`
- detecting prompt-driven behavior changes (for example tool not called)
- deriving structured diff signals (`removedTools`, fingerprint and prompt changes)
