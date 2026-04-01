# Canonical Examples

These examples are the reference learning path for `aioc`.

All commands are run from the repository root.

## Prerequisite

Set:

- `AIOC_EXAMPLE_PROVIDER=openai` with `OPENAI_API_KEY`, or
- `AIOC_EXAMPLE_PROVIDER=mistral` with `MISTRAL_API_KEY`

Optionally set `AIOC_EXAMPLE_MODEL` to override the default model for live examples.

Then run:

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

- minimal live-provider setup via `src/examples/support/live-provider.ts`
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
- a deterministic soft deny path (`resultMode: "tool_result"`)
- how the model receives a denied tool result instead of live tool execution

## 3) Approval Required

Command:

```bash
npm run example:approval-required
```

File:

- `src/examples/basic/approval-required.ts`

What it demonstrates:

- the smallest useful `requireApproval(...)` example
- a parameterless tool definition
- a deterministic soft approval-required path (`resultMode: "tool_result"`)
- the normalized tool-result envelope with `status = "approval_required"`

## 4) Tool + Policy

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

## 5) Approval Evidence Replay

Command:

```bash
npm run example:approval-evidence
```

File:

- `src/examples/basic/approval-evidence.ts`

What it demonstrates:

- capturing `proposalHash` from an approval-required error
- passing approval evidence back through `context`
- policy reevaluation using `proposalHash`
- executing the same requested tool after approval is available

## 6) RunRecord Sink

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

## 7) RunRecord Utilities (Minimal)

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
