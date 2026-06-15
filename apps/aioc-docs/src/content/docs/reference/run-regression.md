---
title: Run Regression
description: Public types and summary helpers for RunRecord-based regression suites.
---

Run-regression helpers support the first implemented slice of RFC-0012.

They let applications represent regression results built from baseline
`RunRecord` values, candidate `RunRecord` values, deterministic comparisons,
optional expectations, and optional judge results.

The current implementation is intentionally small: it defines the public types
and provides a pure CI-summary helper. It does not yet run replay suites or
invoke judges.

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
- `RunRegressionResult`
- `RunRegressionSuite`
- `RunRegressionSummary`
- `RunRegressionCaseSummary`
- `RunJudge`
- `RunJudgeInput`
- `RunJudgeResult`

The judge types are contracts only. The core package does not invoke a judge
model and does not include a default judge prompt.

## Status

This is the first incremental implementation step for RFC-0012.

The intended direction remains a suite runner that can replay stored
`RunRecord` baselines against a candidate harness and produce candidate records,
comparisons, optional judge results, and CI summaries.
