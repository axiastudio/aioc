import type { RunRecord } from "./run-record";
import type { RunRecordComparison } from "./run-record-utils";

export type RunRegressionStatus = "pass" | "warn" | "fail";

export interface RunRegressionExpectation {
  intent?: string;
  shouldUseTools?: string[];
  shouldAvoidTools?: string[];
  shouldPreserve?: string[];
  shouldImprove?: string[];
  notes?: string;
}

export interface RunJudgeFinding {
  severity: "info" | "warn" | "error";
  reason: string;
  evidence?: string;
}

export interface RunJudgeResult {
  verdict: RunRegressionStatus;
  summary: string;
  findings: RunJudgeFinding[];
  score?: number;
  judgeModel?: string;
  judgePromptVersion?: string;
}

export interface RunJudgeInput<TContext = unknown> {
  baseline: RunRecord<TContext>;
  candidate: RunRecord<TContext>;
  comparison: RunRecordComparison;
  expectation?: RunRegressionExpectation;
  baselineDescriptor?: unknown;
  candidateDescriptor?: unknown;
}

export type RunJudge<TContext = unknown> = (
  input: RunJudgeInput<TContext>,
) => Promise<RunJudgeResult> | RunJudgeResult;

export interface RunRegressionResult<TContext = unknown> {
  name: string;
  baseline: RunRecord<TContext>;
  candidate: RunRecord<TContext>;
  comparison: RunRecordComparison;
  expectation?: RunRegressionExpectation;
  judge?: RunJudgeResult;
}

export interface RunRegressionSuite<TContext = unknown> {
  name?: string;
  cases: Array<RunRecord<TContext>>;
  expectations?: Record<string, RunRegressionExpectation>;
}
