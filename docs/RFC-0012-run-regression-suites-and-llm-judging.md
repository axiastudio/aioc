# RFC-0012: Run Regression Suites and Optional LLM Judging

- Status: Draft
- Date: 2026-06-12
- Owners: aioc maintainers
- Depends on: RFC-0003, RFC-0007, RFC-0011
- Related: RFC-0008, RFC-0009, RFC-0010

## Context

`aioc` now has the primitives needed to evaluate harness changes:

- `RunRecord` captures the executed run.
- `RunRecord.inputItemCount` preserves the original input scope for
  history-faithful replay.
- `replayFromRunRecord(...)` can run a recorded case against a candidate
  harness.
- `compareRunRecords(...)` can produce deterministic differences between two
  records.
- `AgentHarnessDescriptor` can describe the old and new harness candidates.

Applications can already compose these pieces manually, but the workflow is
important enough to deserve a small public contract:

```text
baseline RunRecords -> candidate replay -> candidate RunRecords -> deterministic diff -> optional judge
```

The goal is not to turn `aioc` into a generic eval framework. The goal is to
make the existing audit and replay primitives easier to use for regression
checks when an application changes prompts, tools, handoffs, or harness
descriptors.

## Decision

`aioc` should introduce lightweight run-regression utilities.

The target public surface is a suite runner: applications should be able to pass
a list of baseline `RunRecord` values, a candidate harness, and optional
expectations, then receive per-case regression results.

The first implementation may be built incrementally from smaller helpers, but
the RFC direction is a runner-oriented API rather than only disconnected
building blocks.

The suite input should be a list of existing `RunRecord` values. Each record is
both:

- the baseline behavior to compare against, and
- the source of the initial input used to run the candidate harness.

The deterministic layer should remain primary. It compares recorded facts:

- run status,
- final output,
- tool calls,
- policy decisions,
- suspended proposals,
- prompt snapshots,
- request fingerprints,
- descriptor metadata,
- errors.

An LLM judge may be added as an optional advisory layer. The judge should
evaluate semantic intent that deterministic diffs cannot decide, for example:

- whether a new harness moves in the expected direction,
- whether a newly introduced tool was used sensibly,
- whether a response is adapted to an expected audience,
- whether a qualitative regression appears despite acceptable structural
  changes.

The judge must not replace deterministic diffing and must not become a runtime
policy decision point.

The core package should define the judge-facing types and integration points,
but should not own model invocation or bundled judge prompts.

A companion package may provide a ready-to-use judge implementation. Its default
instructions can encode `aioc` domain knowledge such as how to read a
`RunRecord`, how to interpret `RunRecordComparison`, and how to reason over
YAML harness descriptors. Application-specific expectations remain explicit
inputs, not hidden prompt behavior.

## Goals

- Let applications treat stored `RunRecord` values as regression cases.
- Produce candidate `RunRecord` values for each case.
- Compare baseline and candidate records with deterministic diffs.
- Allow application-provided expectations for the candidate harness.
- Allow optional LLM-as-judge evaluation over baseline, candidate, diff, and
  expectations.
- Keep judge results explicitly probabilistic and advisory.
- Define judge contracts in core without requiring a judge implementation.
- Leave ready-to-use judge orchestration to a companion package.
- Keep the first implementation small and composable.

## Non-Goals

- No generic benchmark framework.
- No automatic quality scoring as a core runtime decision.
- No replacement for `compareRunRecords(...)`.
- No model-owned security, policy, or approval decision.
- No judge model invocation in core.
- No built-in hosted judge service.
- No bundled core dependency on a judge provider.
- No requirement that every suite uses an LLM judge.
- No descriptor-owned policy or executable test DSL.

## Conceptual Flow

1. The application selects baseline `RunRecord` values.
2. The application builds or loads a candidate harness.
3. Each baseline record is replayed against the candidate harness.
4. The replay produces a candidate `RunRecord`.
5. The baseline and candidate records are compared deterministically.
6. Optionally, an LLM judge receives a redacted evaluation bundle and returns a
   structured advisory verdict.

The output of the suite is a collection of per-case results. A case can pass
deterministic checks while still receiving a judge warning, or fail a
deterministic check without requiring judge execution.

## Regression Case Shape

The minimal case can be just a `RunRecord`.

Applications may attach expectations when the candidate harness is intentionally
changing behavior:

```ts
export interface RunRegressionExpectation {
  intent?: string;
  shouldUseTools?: string[];
  shouldAvoidTools?: string[];
  shouldPreserve?: string[];
  shouldImprove?: string[];
  notes?: string;
}
```

Example expectation:

```ts
{
  intent: "The candidate harness should adapt explanations to the user's age range.",
  shouldUseTools: ["get_age_range"],
  shouldPreserve: ["factual correctness", "concise explanation"],
  shouldImprove: ["age-appropriate wording"]
}
```

Expectations are not policies. They are evaluation hints used by reporting or
by an optional judge.

## Deterministic Result

A regression result should keep the concrete artifacts:

```ts
export interface RunRegressionResult<TContext = unknown> {
  name: string;
  baseline: RunRecord<TContext>;
  candidate: RunRecord<TContext>;
  comparison: RunRecordComparison;
  expectation?: RunRegressionExpectation;
  judge?: RunJudgeResult;
}
```

The exact helper names are intentionally deferred. The implementation may start
with smaller helpers that compose existing primitives, but the intended public
direction is a suite runner that coordinates replay, comparison, expectations,
and optional judging.

## API And Package Direction

The core package should eventually expose the suite-oriented contract:

```ts
export interface RunRegressionSuite<TContext = unknown> {
  name?: string;
  cases: Array<RunRecord<TContext>>;
  expectations?: Record<string, RunRegressionExpectation>;
}
```

The concrete runner signature is deferred, but conceptually it should:

- iterate baseline records,
- replay each record against the candidate harness,
- create a candidate `RunRecord`,
- compare baseline and candidate records,
- optionally call a judge adapter,
- return structured per-case results.

The core package should define types for judge integration:

```ts
export type RunJudge<TContext = unknown> = (
  input: RunJudgeInput<TContext>,
) => Promise<RunJudgeResult> | RunJudgeResult;
```

The core package should not provide a default judge model implementation.

A companion package can provide a ready-to-use judge. That package may include:

- default judge instructions about `RunRecord`,
- default judge instructions about `RunRecordComparison`,
- default judge instructions about agent harness descriptors,
- provider-specific model invocation,
- response parsing and validation,
- examples for application-specific expectations.

This keeps the governance kernel small while still giving users a practical
path to semantic evaluation.

## Optional Judge

The judge should receive a bounded, redacted bundle:

```ts
export interface RunJudgeInput<TContext = unknown> {
  baseline: RunRecord<TContext>;
  candidate: RunRecord<TContext>;
  comparison: RunRecordComparison;
  expectation?: RunRegressionExpectation;
  baselineDescriptor?: unknown;
  candidateDescriptor?: unknown;
}
```

The judge output should be structured:

```ts
export interface RunJudgeResult {
  verdict: "pass" | "warn" | "fail";
  summary: string;
  findings: Array<{
    severity: "info" | "warn" | "error";
    reason: string;
    evidence?: string;
  }>;
  score?: number;
  judgeModel?: string;
  judgePromptVersion?: string;
}
```

The judge prompt should explain how to read:

- a `RunRecord`,
- a `RunRecordComparison`,
- candidate expectations,
- old and new harness descriptors when available.

The prompt should instruct the judge to separate:

- deterministic facts from the diff,
- semantic assessment,
- uncertainty.

## Privacy And Governance

Judge input may contain sensitive context, prompts, tool outputs, or user
messages. Applications should be able to redact or project the evaluation
bundle before it is sent to a judge model.

The judge result should record:

- judge model,
- judge prompt version,
- generated verdict,
- findings,
- any application-provided expectation metadata.

Judge results are advisory governance evidence. They should not be treated as
deterministic policy decisions.

## Example Use Case

A baseline harness explains a topic generically.

A candidate harness introduces a `get_age_range` tool and should adapt the
explanation to the user's age.

The deterministic diff can show:

- the candidate called `get_age_range`,
- the prompt/request fingerprints changed,
- the final output changed,
- policy decisions remained allowed.

The judge can assess:

- whether the new response is actually age-appropriate,
- whether factual correctness was preserved,
- whether the new tool output was reflected in the answer,
- whether the candidate moved in the intended direction.

## Open Questions

1. What should be the default redaction strategy for judge input?
2. Should suite outputs include a machine-readable CI summary?

## Minimal Test Matrix

1. A baseline `RunRecord` can be replayed against a candidate harness.
2. The replay uses the recorded initial input scope.
3. A candidate `RunRecord` is produced for each baseline record.
4. Baseline and candidate records are compared with `compareRunRecords(...)`.
5. A regression result preserves baseline, candidate, comparison, and optional
   expectation.
6. Judge execution is optional.
7. Judge input can be projected or redacted before model invocation.
8. Judge output is structured and marked advisory.

## Status

Draft. This RFC defines the intended direction before committing to a concrete
API shape.
