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

## 2) Minimal Policy Gate

Command:

```bash
npm run example:policy
```

File:

- `src/examples/basic/policy.ts`

What it demonstrates:

- the smallest useful `tool + policy` example
- a parameterless tool definition
- a deterministic soft deny path (`denyMode: "tool_result"`)
- how the model receives a denied tool result instead of live tool execution

## 3) Tool + Policy

Command:

```bash
npm run example:tool-policy
```

File:

- `src/examples/basic/tools.ts`

What it demonstrates:

- tool definition with Zod schema
- deterministic policy gate on an allowed execution path
- tool execution after policy approval
- a straight, single-scenario basic example

## 4) RunRecord Sink

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

## 5) RunRecord Utilities (Minimal)

Commands:

```bash
npm run example:rru:01-extract
npm run example:rru:02-compare
npm run example:rru:03-replay-strict
npm run example:rru:04-replay-hybrid
```

Files:

- `src/examples/run-record-utils-minimal/01-extract-tool-calls.ts`
- `src/examples/run-record-utils-minimal/02-compare-run-records.ts`
- `src/examples/run-record-utils-minimal/03-replay-strict.ts`
- `src/examples/run-record-utils-minimal/04-replay-hybrid.ts`

What it demonstrates:

- extracting normalized tool calls from a run record
- comparing two run records with summary/metrics/differences
- replaying in strict mode (recorded outputs only)
- replaying in hybrid mode (recorded outputs + live fallback)

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
- live-provider behavior: results may vary between executions (example is educational, not deterministic)
