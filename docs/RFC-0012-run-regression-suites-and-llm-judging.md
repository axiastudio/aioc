# RFC-0012: Run Regression Suites and Optional LLM Judging

- Status: Accepted
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
a list of baseline `RunRecord` values, a candidate harness, and an optional
suite-level expectation, then receive per-case regression results.

Implementation may start from smaller helpers, but the RFC direction is a
runner-oriented API rather than disconnected building blocks.

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

Companion packages may provide the ready-to-use judge and CLI described later
in this RFC.

## Goals

- Let applications treat stored `RunRecord` values as regression cases.
- Produce candidate `RunRecord` values for each case.
- Compare baseline and candidate records with deterministic diffs.
- Allow an application-provided expectation for the candidate harness.
- Allow optional LLM-as-judge evaluation over baseline, candidate, diff, and
  expectation.
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
6. Optionally, an LLM judge receives an evaluation bundle and returns a
   structured advisory verdict.

The output of the suite is a collection of per-case results. A case can pass
deterministic checks while still receiving a judge warning, or fail a
deterministic check without requiring judge execution.

## Regression Case Shape

The minimal standalone case can be just a baseline `RunRecord`.

Applications may attach an expectation to a suite when the candidate harness is
intentionally changing behavior:

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

The suite carries one shared expectation. This keeps the suite aligned with one
regression intent, for example "age-adapted explanations", while individual
cases provide different baseline records for that intent. A single-record
regression is represented as a suite with one case.

## Deterministic Result

A regression result should keep the concrete artifacts:

```ts
export interface RunRegressionResult<TContext = unknown> {
  name: string;
  baseline: RunRecord<TContext>;
  candidate: RunRecord<TContext>;
  comparison: RunRecordComparison;
  judge?: RunJudgeResult;
}
```

The intended public direction is a suite runner that coordinates replay,
comparison, one suite-level expectation, and optional judging.

## CI Summary

The rich suite output should remain the collection of `RunRegressionResult`
values. A runner should also be able to produce a small machine-readable summary
for CI, dashboards, and release checks.

Recommended shape:

```ts
export interface RunRegressionSummary {
  suite?: string;
  status: "pass" | "warn" | "fail";
  totals: {
    cases: number;
    passed: number;
    warned: number;
    failed: number;
  };
  cases: RunRegressionCaseSummary[];
}

export interface RunRegressionCaseSummary {
  name: string;
  status: "pass" | "warn" | "fail";
  baselineRunId: string;
  candidateRunId: string;
  signals: {
    statusChanged: boolean;
    toolsChanged: boolean;
    policyChanged: boolean;
    finalOutputChanged: boolean;
  };
  judge?: {
    verdict: "pass" | "warn" | "fail";
    summary: string;
  };
}
```

Example JSON:

```json
{
  "suite": "learning-harness-regression",
  "status": "warn",
  "totals": {
    "cases": 2,
    "passed": 1,
    "warned": 1,
    "failed": 0
  },
  "cases": [
    {
      "name": "explain-photosynthesis-age-10",
      "status": "pass",
      "baselineRunId": "run_001",
      "candidateRunId": "run_101",
      "signals": {
        "statusChanged": false,
        "toolsChanged": true,
        "policyChanged": false,
        "finalOutputChanged": true
      },
      "judge": {
        "verdict": "pass",
        "summary": "The candidate uses age-appropriate language and preserves factual correctness."
      }
    },
    {
      "name": "explain-gravity-age-8",
      "status": "warn",
      "baselineRunId": "run_002",
      "candidateRunId": "run_102",
      "signals": {
        "statusChanged": false,
        "toolsChanged": true,
        "policyChanged": false,
        "finalOutputChanged": true
      },
      "judge": {
        "verdict": "warn",
        "summary": "The answer is simpler than baseline, but still includes a few terms likely too advanced for age 8."
      }
    }
  ]
}
```

The summary is not a replacement for `RunRecord`, `RunRecordComparison`, or
`RunRegressionResult`. It is a stable compact artifact that lets CI decide
whether a candidate harness should pass, warn, or fail according to
application-owned release policy.

## API And Package Direction

The core package exposes a suite-oriented contract:

```ts
export interface RunRegressionSuiteCase<TContext = unknown> {
  name?: string;
  baseline: RunRecord<TContext>;
}

export interface RunRegressionSuite<TContext = unknown> {
  name?: string;
  expectation?: RunRegressionExpectation;
  cases: Array<RunRegressionSuiteCase<TContext>>;
}
```

The runner should:

- iterate baseline records,
- replay each record against the candidate harness,
- create a candidate `RunRecord`,
- compare baseline and candidate records,
- optionally call a suite-level judge adapter for each candidate result,
- return structured per-case results,
- optionally return a machine-readable CI summary.

The core package should define types for judge integration:

```ts
export type RunJudge<TContext = unknown> = (
  input: RunJudgeInput<TContext>,
) => Promise<RunJudgeResult> | RunJudgeResult;
```

The core package should not provide a default judge model implementation.

This keeps the governance kernel small while still giving users a practical
path to semantic evaluation.

## Companion Packages

The regression workflow can be implemented incrementally across companion
packages rather than forcing every concern into the core package.

### `@axiastudio/aioc-regression-judge`

This package should provide a ready-to-use judge implementation.

Responsibilities:

- provide default judge instructions for understanding `RunRecord`;
- provide default judge instructions for understanding `RunRecordComparison`;
- provide default judge instructions for understanding agent harness
  descriptors;
- apply bounded judge-input projection by default;
- require explicit opt-in for full-record judging;
- invoke the configured judge model;
- parse and validate structured `RunJudgeResult` output.

Application-specific expectation data, such as "adapt the explanation to the
user's age range", remain explicit inputs. They should not be hidden inside the
default judge prompt.

### `@axiastudio/aioc-regression-cli`

This package should provide a thin CLI wrapper around the regression runner.

The CLI should operate on filesystem artifacts:

- baseline `RunRecord` files;
- baseline descriptor YAML when available;
- candidate descriptor YAML;
- an expectation file;
- output directories for candidate records, comparisons, judge results, and CI
  summaries.

Executable behavior must still be supplied by the application through an
adapter module. A descriptor can describe the harness, but it does not own:

- executable tools;
- policies;
- provider setup;
- approval workflows;
- secrets;
- application-specific redaction;
- judge configuration.

Example command shape:

```bash
aioc-regression run \
  --records ./baseline/runrecords \
  --baseline ./baseline/harness.yaml \
  --candidate ./candidate/harness.yaml \
  --expectation ./expectation.yaml \
  --adapter ./adapter.ts \
  --out ./out
```

The adapter contract is intentionally deferred. Conceptually, it may provide:

```ts
export default {
  setupProvider,
  createToolRegistry,
  createPolicies,
  createJudge,
  onMissingToolCall,
};
```

Detailed CLI concerns such as exact command names, exit codes, TypeScript
adapter loading, output layout, and expectation-file schema can be promoted into
a later RFC if the CLI contract needs to become stable.

### Target Example

The first complete example should demonstrate age-adapted explanations:

```text
examples/regression-age-adapted-explanation/
  baseline/
    harness.yaml
    runrecords/
      photosynthesis-age-10.json
      gravity-age-8.json
  candidate/
    harness.yaml
  expectation.yaml
  adapter.ts
  README.md
```

The baseline harness explains topics generically. The candidate harness
introduces a `get_age_range` tool and should adapt explanations to the user's
age range.

This example should show the complete operational flow:

- baseline records as regression cases;
- candidate descriptor as the changed harness;
- application adapter for tools, policies, provider setup, and optional judge;
- deterministic comparison;
- optional semantic judge result;
- CI summary output.

## Optional Judge

The core judge contract is intentionally data-shaped. It describes the logical
evaluation bundle, not a mandatory redaction policy:

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

Consistently with `RunRecord`, the core package should not redact by default.
It should provide types and hooks that let applications project or redact judge
input when needed.

Ready-to-use companion judge packages should be stricter. They should default
to a bounded projection and require explicit opt-in before sending full
`RunRecord` artifacts to a judge model.

The default bounded projection should include enough evidence for semantic
review:

- baseline final output,
- candidate final output,
- deterministic comparison summary,
- application-provided expectation,
- relevant tool names and call summaries,
- descriptor metadata or hashes when available.

It should exclude by default:

- full `contextSnapshot`,
- raw prompt text,
- full message history,
- full raw tool outputs,
- unfiltered metadata.

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
- the candidate expectation,
- old and new harness descriptors when available.

The prompt should instruct the judge to separate:

- deterministic facts from the diff,
- semantic assessment,
- uncertainty.

## Privacy And Governance

Judge input may contain sensitive context, prompts, tool outputs, or user
messages.

Core utilities follow the existing `RunRecord` posture: no implicit redaction
by default, because the core runtime does not invoke external judge models.

Companion judge packages should follow a safer operational posture: bounded
projection by default, with explicit opt-in for full-record judging.

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

## Minimal Test Matrix

1. A baseline `RunRecord` can be replayed against a candidate harness.
2. The replay uses the recorded initial input scope.
3. A candidate `RunRecord` is produced for each baseline record.
4. Baseline and candidate records are compared with `compareRunRecords(...)`.
5. A regression result preserves baseline, candidate, comparison, and optional
   expectation.
6. Judge execution is optional.
7. Core judge input is not redacted implicitly.
8. Companion judge packages default to bounded input projection.
9. Judge input can be projected or redacted before model invocation.
10. Judge output is structured and marked advisory.
11. A CI-friendly summary can be produced from suite results.

## Status

Accepted. The first implementation covers core types, single-case regression,
suite regression, and CI summaries. Judge and CLI companion packages remain
future work.
