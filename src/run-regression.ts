import type { RunRecord } from "./run-record";
import {
  summarizeRunRegressionResults,
  type RunRegressionSummary,
  type SummarizeRunRegressionResultsOptions,
} from "./run-regression-summary";
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

export interface RunRegressionSuiteCase<TContext = unknown> {
  name?: string;
  baseline: RunRecord<TContext>;
}

export interface RunRegressionSuite<TContext = unknown> {
  name?: string;
  expectation?: RunRegressionExpectation;
  cases: Array<RunRegressionSuiteCase<TContext>>;
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

export interface RunRegressionSuiteInput<
  TContext = unknown,
  TDescriptor = unknown,
> extends Omit<
  RunRegressionCaseInput<TContext, TDescriptor>,
  "baseline" | "name" | "expectation"
> {
  suite: RunRegressionSuite<TContext>;
  summaryOptions?: Omit<
    SummarizeRunRegressionResultsOptions<TContext>,
    "suite"
  >;
}

export interface RunRegressionSuiteResult<TContext = unknown> {
  name?: string;
  results: Array<RunRegressionResult<TContext>>;
  summary: RunRegressionSummary;
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

function resolveSuiteCase<TContext>(
  caseDefinition: RunRegressionSuiteCase<TContext>,
): {
  name: string;
  baseline: RunRecord<TContext>;
} {
  const baseline = caseDefinition.baseline;
  const name = caseDefinition.name ?? baseline.runId;

  return {
    name,
    baseline,
  };
}

export async function runRegressionSuite<
  TContext = unknown,
  TDescriptor = unknown,
>(
  input: RunRegressionSuiteInput<TContext, TDescriptor>,
): Promise<RunRegressionSuiteResult<TContext>> {
  const results: Array<RunRegressionResult<TContext>> = [];
  const { suite, summaryOptions, ...caseOptions } = input;

  for (const caseDefinition of suite.cases) {
    const regressionCase = resolveSuiteCase(caseDefinition);
    const result = await runRegressionCase<TContext, TDescriptor>({
      ...caseOptions,
      name: regressionCase.name,
      baseline: regressionCase.baseline,
      ...(typeof suite.expectation === "undefined"
        ? {}
        : { expectation: suite.expectation }),
    });
    results.push(result);
  }

  const summary = summarizeRunRegressionResults(results, {
    suite: suite.name,
    ...(summaryOptions ?? {}),
  });

  return {
    ...(typeof suite.name === "undefined" ? {} : { name: suite.name }),
    results,
    summary,
  };
}
