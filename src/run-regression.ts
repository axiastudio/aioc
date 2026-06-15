import type { RunRecord } from "./run-record";
import {
  compareRunRecords,
  replayFromRunRecord,
  type CompareRunRecordsOptions,
  type ReplayFromRunRecordInput,
  type RunRecordComparison,
} from "./run-record-utils";

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

export interface RunJudgeInput<TContext = unknown, TDescriptor = unknown> {
  baseline: RunRecord<TContext>;
  candidate: RunRecord<TContext>;
  comparison: RunRecordComparison;
  expectation?: RunRegressionExpectation;
  baselineDescriptor?: TDescriptor;
  candidateDescriptor?: TDescriptor;
}

export type RunJudge<TContext = unknown, TDescriptor = unknown> = (
  input: RunJudgeInput<TContext, TDescriptor>,
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

export interface RunRegressionCaseInput<
  TContext = unknown,
  TDescriptor = unknown,
> extends Omit<ReplayFromRunRecordInput<TContext>, "sourceRunRecord"> {
  name?: string;
  baseline: RunRecord<TContext>;
  expectation?: RunRegressionExpectation;
  judge?: RunJudge<TContext, TDescriptor>;
  baselineDescriptor?: TDescriptor;
  candidateDescriptor?: TDescriptor;
  comparisonOptions?: CompareRunRecordsOptions;
}

function toRegressionCaseName<TContext, TDescriptor>(
  input: RunRegressionCaseInput<TContext, TDescriptor>,
): string {
  return input.name ?? input.baseline.runId;
}

function toReplayRunOptions<TContext, TDescriptor>(
  input: RunRegressionCaseInput<TContext, TDescriptor>,
): ReplayFromRunRecordInput<TContext>["runOptions"] {
  return {
    ...(input.runOptions ?? {}),
    record: input.runOptions?.record ?? {},
  };
}

function toReplayAgentFields<TContext, TDescriptor>(
  input: RunRegressionCaseInput<TContext, TDescriptor>,
): Pick<ReplayFromRunRecordInput<TContext>, "agent" | "agentFactory"> {
  return {
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.agentFactory ? { agentFactory: input.agentFactory } : {}),
  };
}

export async function runRegressionCase<
  TContext = unknown,
  TDescriptor = unknown,
>(
  input: RunRegressionCaseInput<TContext, TDescriptor>,
): Promise<RunRegressionResult<TContext>> {
  const replay = await replayFromRunRecord<TContext>({
    sourceRunRecord: input.baseline,
    ...toReplayAgentFields(input),
    mode: input.mode,
    runOptions: toReplayRunOptions(input),
    inputMode: input.inputMode,
    metadataOverrides: input.metadataOverrides,
    onMissingToolCall: input.onMissingToolCall,
  });

  if (!replay.replayRunRecord) {
    throw new Error(
      "runRegressionCase expected replayFromRunRecord to produce a candidate RunRecord.",
    );
  }

  const comparison = compareRunRecords(
    input.baseline,
    replay.replayRunRecord,
    input.comparisonOptions,
  );
  const judge = input.judge
    ? await input.judge({
        baseline: input.baseline,
        candidate: replay.replayRunRecord,
        comparison,
        ...(typeof input.expectation === "undefined"
          ? {}
          : { expectation: input.expectation }),
        ...(typeof input.baselineDescriptor === "undefined"
          ? {}
          : { baselineDescriptor: input.baselineDescriptor }),
        ...(typeof input.candidateDescriptor === "undefined"
          ? {}
          : { candidateDescriptor: input.candidateDescriptor }),
      })
    : undefined;

  return {
    name: toRegressionCaseName(input),
    baseline: input.baseline,
    candidate: replay.replayRunRecord,
    comparison,
    ...(typeof input.expectation === "undefined"
      ? {}
      : { expectation: input.expectation }),
    ...(judge ? { judge } : {}),
  };
}
