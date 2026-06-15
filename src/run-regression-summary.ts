import type {
  RunRegressionResult,
  RunRegressionStatus,
} from "./run-regression";

export interface RunRegressionCaseSummary {
  name: string;
  status: RunRegressionStatus;
  baselineRunId: string;
  candidateRunId: string;
  signals: {
    statusChanged: boolean;
    toolsChanged: boolean;
    policyChanged: boolean;
    finalOutputChanged: boolean;
  };
  judge?: {
    verdict: RunRegressionStatus;
    summary: string;
  };
}

export interface RunRegressionSummary {
  suite?: string;
  status: RunRegressionStatus;
  totals: {
    cases: number;
    passed: number;
    warned: number;
    failed: number;
  };
  cases: RunRegressionCaseSummary[];
}

export interface SummarizeRunRegressionResultsOptions<TContext = unknown> {
  suite?: string;
  classifyCase?: (result: RunRegressionResult<TContext>) => RunRegressionStatus;
}

function defaultClassifyRunRegressionCase<TContext>(
  result: RunRegressionResult<TContext>,
): RunRegressionStatus {
  if (
    result.candidate.status === "failed" ||
    result.judge?.verdict === "fail"
  ) {
    return "fail";
  }

  if (!result.comparison.equal || result.judge?.verdict === "warn") {
    return "warn";
  }

  return "pass";
}

function summarizeCase<TContext>(
  result: RunRegressionResult<TContext>,
  status: RunRegressionStatus,
): RunRegressionCaseSummary {
  const judge = result.judge
    ? {
        verdict: result.judge.verdict,
        summary: result.judge.summary,
      }
    : undefined;

  return {
    name: result.name,
    status,
    baselineRunId: result.baseline.runId,
    candidateRunId: result.candidate.runId,
    signals: {
      statusChanged: result.baseline.status !== result.candidate.status,
      toolsChanged: !result.comparison.summary.sameToolCallShape,
      policyChanged: !result.comparison.summary.samePolicyDecisions,
      finalOutputChanged: !result.comparison.summary.sameFinalResponse,
    },
    ...(judge ? { judge } : {}),
  };
}

function toSuiteStatus(
  totals: RunRegressionSummary["totals"],
): RunRegressionStatus {
  if (totals.failed > 0) {
    return "fail";
  }

  if (totals.warned > 0) {
    return "warn";
  }

  return "pass";
}

export function summarizeRunRegressionResults<TContext = unknown>(
  results: Array<RunRegressionResult<TContext>>,
  options: SummarizeRunRegressionResultsOptions<TContext> = {},
): RunRegressionSummary {
  const classifyCase =
    options.classifyCase ?? defaultClassifyRunRegressionCase<TContext>;
  const totals: RunRegressionSummary["totals"] = {
    cases: results.length,
    passed: 0,
    warned: 0,
    failed: 0,
  };
  const cases = results.map((result) => {
    const status = classifyCase(result);
    if (status === "pass") {
      totals.passed += 1;
    } else if (status === "warn") {
      totals.warned += 1;
    } else {
      totals.failed += 1;
    }
    return summarizeCase(result, status);
  });

  return {
    ...(typeof options.suite === "undefined" ? {} : { suite: options.suite }),
    status: toSuiteStatus(totals),
    totals,
    cases,
  };
}
