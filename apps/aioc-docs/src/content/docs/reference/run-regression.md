---
title: Run Regression
description: Public helpers for RunRecord-based regression cases and summaries.
---

Run-regression helpers support the incremental implementation of RFC-0012.

They let applications replay baseline `RunRecord` values against a candidate
harness, compare the resulting candidate records, and optionally evaluate a
suite-level expectation with an application-provided judge.

The current implementation defines the public types, provides single-case and
multi-case regression runners, and provides a pure CI-summary helper.

## `runRegressionCase(...)`

```ts
const result = await runRegressionCase({
  name: "photosynthesis-age-10",
  baseline,
  agent: candidateAgent,
  mode: "strict",
});
```

The helper runs one baseline `RunRecord` against a candidate agent by using
`replayFromRunRecord(...)`, captures the candidate `RunRecord`, compares the
two records with `compareRunRecords(...)`, and returns the deterministic
regression result.

`mode` follows replay semantics:

- `strict`: use recorded tool outputs only
- `hybrid`: use recorded outputs and fall back to live execution
- `live`: run tools normally

The helper enables candidate `RunRecord` capture automatically. If the
application provides `runOptions.record.sink`, the sink is preserved.

`runRegressionCase(...)` is intentionally low level. Expectations and judge
execution belong to `runRegressionSuite(...)`, even when the suite contains a
single case.

## `runRegressionSuite(...)`

```ts
const suite = await runRegressionSuite({
  suite: {
    name: "age-adapted-explanation",
    expectation: {
      intent: "Adapt explanations to the user's age range.",
    },
    cases: [{ baseline: baselineRunRecord }],
  },
  agent: candidateAgent,
  mode: "strict",
  judge,
});
```

The suite runner calls `runRegressionCase(...)` for each baseline case and
returns:

- `results`: rich per-case `RunRegressionResult[]`
- `summary`: compact `RunRegressionSummary` for CI and dashboards

A suite has one `expectation`: it represents the shared intent being checked
across all cases. The optional `judge` evaluates each candidate result against
that shared expectation. Cases are objects with `baseline` plus optional `name`.

## `summarizeRunRegressionResults(...)`

```ts
const summary = summarizeRunRegressionResults(results, {
  suite: "age-adapted-explanation",
});
```

The helper converts rich `RunRegressionResult[]` values into a compact
`RunRegressionSummary` suitable for CI, dashboards, and release checks.

The default classification is conservative:

- candidate run failed or judge verdict is `fail` -> `fail`
- deterministic comparison changed or judge verdict is `warn` -> `warn`
- otherwise -> `pass`

Applications can override this with `classifyCase`:

```ts
const summary = summarizeRunRegressionResults(results, {
  classifyCase: (result) => {
    if (result.candidate.status === "failed") {
      return "fail";
    }

    return "pass";
  },
});
```

## Public Types

The core exported types include:

- `RunRegressionExpectation`
- `RunRegressionCaseInput`
- `RunRegressionSuiteInput`
- `RunRegressionResult`
- `RunRegressionSuite`
- `RunRegressionSuiteCase`
- `RunRegressionSuiteResult`
- `RunRegressionSummary`
- `RunRegressionCaseSummary`
- `RunJudge`
- `RunJudgeInput`
- `RunJudgeResult`

The judge types are contracts only. The core package invokes only the
application-provided `judge` function; it does not include a judge model or a
default judge prompt.

`RunJudgeInput<TContext, TDescriptor>` is generic over descriptor shape. The
default descriptor type is `unknown`, but applications can specialize it, for
example with `AgentHarnessDescriptor`.

## Status

This is an incremental implementation step for RFC-0012.

The intended direction remains a suite runner that can replay stored
`RunRecord` baselines against a candidate harness and produce candidate records,
comparisons, optional judge results, and CI summaries.
