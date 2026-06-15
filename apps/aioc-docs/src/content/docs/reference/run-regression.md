---
title: Run Regression
description: Public helpers for RunRecord-based regression cases and summaries.
---

Run-regression helpers support the incremental implementation of RFC-0012.

They let applications represent regression results built from baseline
`RunRecord` values, candidate `RunRecord` values, deterministic comparisons,
optional expectations, and optional judge results.

The current implementation is intentionally small: it defines the public types,
provides a single-case regression runner, and provides a pure CI-summary
helper. It does not yet include a multi-case suite runner.

## `runRegressionCase(...)`

```ts
const result = await runRegressionCase({
  name: "photosynthesis-age-10",
  baseline,
  agent: candidateAgent,
  mode: "strict",
  expectation: {
    intent: "Adapt the explanation to the user's age range.",
    shouldUseTools: ["get_age_range"],
  },
  judge,
});
```

The helper runs one baseline `RunRecord` against a candidate agent by using
`replayFromRunRecord(...)`, captures the candidate `RunRecord`, compares the
two records with `compareRunRecords(...)`, and optionally invokes an
application-provided judge.

`mode` follows replay semantics:

- `strict`: use recorded tool outputs only
- `hybrid`: use recorded outputs and fall back to live execution
- `live`: run tools normally

The helper enables candidate `RunRecord` capture automatically. If the
application provides `runOptions.record.sink`, the sink is preserved.

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
- `RunRegressionResult`
- `RunRegressionSuite`
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
