# Canonical Examples

These examples are the reference learning path for `aioc`. They are organized
by reading level: start with the compact basic examples, then move to audit,
replay, harness descriptors, and advanced comparison workflows.

All commands are run from the repository root.

## Prerequisite

Most live examples use the shared provider helper. Set:

- `AIOC_EXAMPLE_PROVIDER=openai` with `OPENAI_API_KEY`, or
- `AIOC_EXAMPLE_PROVIDER=mistral` with `MISTRAL_API_KEY`

Optionally set `AIOC_EXAMPLE_MODEL` to override the default model for live examples.

The run-record utility examples are deterministic and do not need a provider.
`example:harness-rerun`, `example:run-regression`, and
`example:run-regression-judge` are intentionally different: they configure
OpenAI from `OPENAI_API_KEY` and declare harness models inside inline YAML
descriptors.

Then run:

```bash
npm install
```

## Start Here

### 1) Hello Run

Command:

```bash
npm run example:hello
```

File:

- `examples/core/basic/hello-world.ts`

What it demonstrates:

- minimal live-provider setup via `examples/core/support/live-provider.ts`
- single-agent execution with default non-stream mode
- reading `result.finalOutput`

### 2) Minimal Policy Gate

Command:

```bash
npm run example:policy
```

File:

- `examples/core/basic/policy.ts`

What it demonstrates:

- the smallest useful `tool + policy` example
- a parameterless tool definition
- a deterministic soft deny path (`resultMode: "tool_result"`)
- how the model receives a denied tool result instead of live tool execution

### 3) Approval Required

Command:

```bash
npm run example:approval-required
```

File:

- `examples/core/basic/approval-required.ts`

What it demonstrates:

- the smallest useful `requireApproval(...)` example
- a parameterless tool definition
- a deterministic soft approval-required path (`resultMode: "tool_result"`)
- the normalized tool-result envelope with `status = "approval_required"`

### 4) Tool + Policy

Command:

```bash
npm run example:tool-policy
```

File:

- `examples/core/basic/tools.ts`

What it demonstrates:

- tool definition with Zod schema
- deterministic policy gate on an allowed execution path
- tool execution after policy approval
- a straight, single-scenario basic example

### 5) Policy Composition

Command:

```bash
npm run example:policy-composition
```

File:

- `examples/core/basic/policy-composition.ts`

What it demonstrates:

- exact-name policy dispatch with `composeToolPolicies(...)`
- fallback deny policy through `"*"`
- preserving normal `ToolPolicy` runtime semantics

## Approval Flow

### 6) Approval Evidence Replay

Command:

```bash
npm run example:approval-evidence
```

File:

- `examples/core/basic/approval-evidence.ts`

What it demonstrates:

- creating an approval request seed from a suspended proposal
- projecting an approval grant into policy-friendly context
- policy reevaluation using `proposalHash`
- executing the same requested tool after approval is available

## Audit Trail

### 7) RunRecord Sink

Command:

```bash
npm run example:run-record
```

File:

- `examples/core/basic/run-record-sink.ts`

What it demonstrates:

- run-record sink integration (`run(..., { record })`)
- context redaction before persistence (`contextRedactor`)
- metadata attached to persisted records
- policy decision audit trail

## RunRecord Utilities

### 8) Minimal Utility Snippets

Commands:

```bash
npm run example:rru:01-extract
npm run example:rru:02-compare
npm run example:rru:03-replay-strict
npm run example:rru:04-replay-hybrid
```

Files:

- `examples/core/run-record-utils-minimal/01-extract-tool-calls.ts`
- `examples/core/run-record-utils-minimal/02-compare-run-records.ts`
- `examples/core/run-record-utils-minimal/03-replay-strict.ts`
- `examples/core/run-record-utils-minimal/04-replay-hybrid.ts`

What it demonstrates:

- extracting normalized tool calls from a run record
- comparing two run records with summary/metrics/differences
- replaying in strict mode (recorded outputs only)
- replaying in hybrid mode (recorded outputs + live fallback)

## Harness Descriptor

### 9) Modified Harness Replay

Command:

```bash
npm run example:harness-rerun
```

File:

- `examples/core/harness-descriptor/rerun-modified-harness.ts`

What it demonstrates:

- defining a minimal harness inline with YAML
- recording a source run with one harness version
- replaying the source run against a modified harness
- mocking a newly introduced tool output during replay

### 10) Full Descriptor Example

Command:

```bash
npm run example:harness
```

Files:

- `examples/core/harness-descriptor/customer-support.ts`
- `examples/core/harness-descriptor/customer-support.yaml`

What it demonstrates:

- loading an agent graph from a YAML harness descriptor
- binding descriptor tools through application-owned registries
- composing reusable instruction parts with `instructions_sequence`
- conditionally including instruction blocks through boolean `where` gates
- computing a stable descriptor hash for audit and deployment checks

## Advanced Workflows

### 11) Non-Regression Diff

Command:

```bash
npm run example:non-regression
```

File:

- `examples/core/non-regression/v1-v2-runrecord-diff.ts`

What it demonstrates:

- comparing `RunRecord` outputs across `v1` vs `v2`
- detecting prompt-driven behavior changes (for example tool not called)
- deriving structured diff signals (`removedTools`, fingerprint and prompt changes)
- live-provider behavior: results may vary between executions (example is educational, not deterministic)

### 12) Run Regression Suite

Command:

```bash
npm run example:run-regression
```

File:

- `examples/core/run-regression/age-adapted-suite.ts`

What it demonstrates:

- recording a baseline `RunRecord` from a minimal v1 harness
- running a v2 harness through `runRegressionSuite(...)`
- attaching one suite-level expectation to a single baseline case
- reading deterministic comparison and CI summary output without a judge

### 13) Run Regression Suite With Judge

Command:

```bash
npm run example:run-regression-judge
```

File:

- `packages/aioc-regression-judge/examples/age-adapted-suite-with-judge.ts`

What it demonstrates:

- recording a baseline `RunRecord` from a minimal v1 harness
- running a v2 age-adapted harness through `runRegressionSuite(...)`
- wiring `createRunRegressionJudge(...)` with an application-owned model call
- reading the structured judge verdict together with the suite CI summary

## Optional LangChain Interoperability

Optional LangChain examples live in `examples/langchain` with their own
`package.json`, so LangChain dependencies stay out of the core runtime package.

They demonstrate three composition patterns:

- **aioc-first, LangChain-extended**: aioc owns the governed agent run while
  LangChain provides OSS components behind aioc tools.
- **LangGraph-orchestrated, aioc-governed**: LangGraph owns workflow
  orchestration while selected graph nodes call aioc for policy-gated execution
  and portable audit evidence.
- **LangGraph-orchestrated, aioc-recorded**: LangGraph remains the primary
  orchestrator while a local RFC-0013 prototype emits a graph-level
  `RunRecord` around the compiled graph.

These examples are intentionally outside the canonical learning path. They are
for users who want to compose aioc with LangChain OSS components without moving
governance decisions into a LangChain or LangSmith control plane.
