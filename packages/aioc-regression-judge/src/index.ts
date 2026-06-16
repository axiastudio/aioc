import type {
  RunJudge,
  RunJudgeInput,
  RunJudgeResult,
  RunRecord,
  RunRecordComparison,
  RunRegressionExpectation,
  RunRegressionStatus,
} from "@axiastudio/aioc";

export const REGRESSION_JUDGE_INPUT_SCHEMA_VERSION =
  "aioc.regression_judge_input.v0";
export const REGRESSION_JUDGE_PROMPT_VERSION = "aioc.regression_judge.v0";

export type RunRegressionJudgeInputMode = "bounded" | "full";

export interface RunRegressionJudgeMessage {
  role: "system" | "user";
  content: string;
}

export interface RunRegressionJudgeRequest {
  promptVersion: string;
  input: unknown;
  messages: RunRegressionJudgeMessage[];
}

export type RunRegressionJudgeModelInvoker = (
  request: RunRegressionJudgeRequest,
) => Promise<unknown> | unknown;

export interface RunRegressionJudgeRequestOptions<
  TContext = unknown,
  TDescriptor = unknown,
> {
  inputMode?: RunRegressionJudgeInputMode;
  projection?: (input: RunJudgeInput<TContext, TDescriptor>) => unknown;
  systemPrompt?: string;
  promptVersion?: string;
}

export interface CreateRunRegressionJudgeOptions<
  TContext = unknown,
  TDescriptor = unknown,
> extends RunRegressionJudgeRequestOptions<TContext, TDescriptor> {
  generate: RunRegressionJudgeModelInvoker;
  judgeModel?: string;
}

export interface ParseRunJudgeResultOptions {
  judgeModel?: string;
  judgePromptVersion?: string;
}

export interface BoundedToolOutputProjection {
  status?: string;
  code?: string | null;
  publicReason?: string | null;
  outputType?: string;
  dataPresent?: boolean;
}

export interface BoundedToolCallProjection {
  name: string;
  hasArguments: boolean;
  hasOutput: boolean;
  output?: BoundedToolOutputProjection;
}

export interface BoundedPolicyDecisionProjection {
  decision: "allow" | "deny" | "require_approval";
  reason: string;
  publicReason?: string;
  policyVersion?: string;
  resource: {
    kind: "tool" | "handoff";
    name: string;
  };
}

export interface BoundedGuardrailDecisionProjection {
  guardrailName: string;
  decision: "pass" | "triggered";
  reason?: string;
}

export interface BoundedRunRecordProjection {
  runId: string;
  status: "completed" | "failed";
  agentName: string;
  providerName?: string;
  model?: string;
  question: string;
  response: string;
  errorName?: string;
  errorMessage?: string;
  toolCalls: BoundedToolCallProjection[];
  policyDecisions: BoundedPolicyDecisionProjection[];
  guardrailDecisions: BoundedGuardrailDecisionProjection[];
  promptSnapshots: Array<{
    turn: number;
    agentName: string;
    model?: string;
    promptVersion?: string;
    promptHash: string;
  }>;
  requestFingerprints: Array<{
    turn: number;
    agentName: string;
    providerName: string;
    model: string;
    requestHash: string;
    messageCount: number;
    toolCount: number;
  }>;
}

export interface BoundedDescriptorProjection {
  descriptorVersion?: string;
  metadata?: Record<string, unknown>;
  runtime?: {
    entryAgent?: string;
    maxTurns?: number;
  };
  agents?: string[];
  tools?: string[];
}

export interface BoundedRunJudgeInputProjection {
  schemaVersion: typeof REGRESSION_JUDGE_INPUT_SCHEMA_VERSION;
  expectation?: RunRegressionExpectation;
  baseline: BoundedRunRecordProjection;
  candidate: BoundedRunRecordProjection;
  comparison: {
    equal: boolean;
    summary: RunRecordComparison["summary"];
    metrics: RunRecordComparison["metrics"];
  };
  baselineDescriptor?: BoundedDescriptorProjection;
  candidateDescriptor?: BoundedDescriptorProjection;
}

const DEFAULT_SYSTEM_PROMPT = `You are an AIOC run-regression judge.

You receive a bounded projection of two AIOC RunRecord artifacts: a baseline run and a candidate run produced by a modified harness.

Use deterministic comparison fields as facts. Use the expectation as the application-owned direction of change. Do not treat your verdict as a runtime policy decision.

Return JSON only with this shape:
{
  "verdict": "pass" | "warn" | "fail",
  "summary": "short explanation",
  "findings": [
    { "severity": "info" | "warn" | "error", "reason": "...", "evidence": "optional short evidence" }
  ],
  "score": 0.0
}`;

export function createRunRegressionJudge<
  TContext = unknown,
  TDescriptor = unknown,
>(
  options: CreateRunRegressionJudgeOptions<TContext, TDescriptor>,
): RunJudge<TContext, TDescriptor> {
  return async (input) => {
    const request = createRunRegressionJudgeRequest(input, options);
    const output = await options.generate(request);
    return parseRunJudgeResult(output, {
      judgeModel: options.judgeModel,
      judgePromptVersion: request.promptVersion,
    });
  };
}

export function createRunRegressionJudgeRequest<
  TContext = unknown,
  TDescriptor = unknown,
>(
  input: RunJudgeInput<TContext, TDescriptor>,
  options: RunRegressionJudgeRequestOptions<TContext, TDescriptor> = {},
): RunRegressionJudgeRequest {
  const promptVersion =
    options.promptVersion ?? REGRESSION_JUDGE_PROMPT_VERSION;
  const projectedInput = projectJudgeInput(input, options);

  return {
    promptVersion,
    input: projectedInput,
    messages: [
      {
        role: "system",
        content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          "Evaluate this AIOC run regression input.",
          "Return JSON only. Do not include Markdown fences.",
          JSON.stringify(projectedInput, null, 2),
        ].join("\n\n"),
      },
    ],
  };
}

export function toBoundedRunJudgeInput<
  TContext = unknown,
  TDescriptor = unknown,
>(input: RunJudgeInput<TContext, TDescriptor>): BoundedRunJudgeInputProjection {
  return compactObject<BoundedRunJudgeInputProjection>({
    schemaVersion: REGRESSION_JUDGE_INPUT_SCHEMA_VERSION,
    expectation: input.expectation,
    baseline: projectRunRecord(input.baseline),
    candidate: projectRunRecord(input.candidate),
    comparison: {
      equal: input.comparison.equal,
      summary: input.comparison.summary,
      metrics: input.comparison.metrics,
    },
    baselineDescriptor: projectDescriptor(input.baselineDescriptor),
    candidateDescriptor: projectDescriptor(input.candidateDescriptor),
  });
}

export function parseRunJudgeResult(
  output: unknown,
  options: ParseRunJudgeResultOptions = {},
): RunJudgeResult {
  const value = parseJsonObject(output, "Run judge result");
  const verdict = parseVerdict(value.verdict);
  const summary = parseString(value.summary, "Run judge result summary");
  const findings = parseFindings(value.findings);
  const score = parseOptionalNumber(value.score, "Run judge result score");
  const judgeModel = parseOptionalString(
    value.judgeModel,
    "Run judge result judgeModel",
  );
  const judgePromptVersion = parseOptionalString(
    value.judgePromptVersion,
    "Run judge result judgePromptVersion",
  );

  return compactObject({
    verdict,
    summary,
    findings,
    score,
    judgeModel: judgeModel ?? options.judgeModel,
    judgePromptVersion: judgePromptVersion ?? options.judgePromptVersion,
  });
}

function projectJudgeInput<TContext, TDescriptor>(
  input: RunJudgeInput<TContext, TDescriptor>,
  options: RunRegressionJudgeRequestOptions<TContext, TDescriptor>,
): unknown {
  if (options.projection) {
    return options.projection(input);
  }

  if (options.inputMode === "full") {
    return input;
  }

  return toBoundedRunJudgeInput(input);
}

function projectRunRecord<TContext>(
  record: RunRecord<TContext>,
): BoundedRunRecordProjection {
  return compactObject({
    runId: record.runId,
    status: record.status,
    agentName: record.agentName,
    providerName: record.providerName,
    model: record.model,
    question: record.question,
    response: record.response,
    errorName: record.errorName,
    errorMessage: record.errorMessage,
    toolCalls: extractToolCallProjections(record),
    policyDecisions: record.policyDecisions.map((decision) =>
      compactObject({
        decision: decision.decision,
        reason: decision.reason,
        publicReason: decision.publicReason,
        policyVersion: decision.policyVersion,
        resource: {
          kind: decision.resource.kind,
          name: decision.resource.name,
        },
      }),
    ),
    guardrailDecisions: (record.guardrailDecisions ?? []).map((decision) =>
      compactObject({
        guardrailName: decision.guardrailName,
        decision: decision.decision,
        reason: decision.reason,
      }),
    ),
    promptSnapshots: record.promptSnapshots.map((snapshot) =>
      compactObject({
        turn: snapshot.turn,
        agentName: snapshot.agentName,
        model: snapshot.model,
        promptVersion: snapshot.promptVersion,
        promptHash: snapshot.promptHash,
      }),
    ),
    requestFingerprints: record.requestFingerprints.map((fingerprint) => ({
      turn: fingerprint.turn,
      agentName: fingerprint.agentName,
      providerName: fingerprint.providerName,
      model: fingerprint.model,
      requestHash: fingerprint.requestHash,
      messageCount: fingerprint.messageCount,
      toolCount: fingerprint.toolCount,
    })),
  });
}

function extractToolCallProjections<TContext>(
  record: RunRecord<TContext>,
): BoundedToolCallProjection[] {
  const calls = new Map<string, BoundedToolCallProjection>();
  const orderedCalls: BoundedToolCallProjection[] = [];

  for (const item of record.items) {
    if (item.type === "tool_call_item") {
      const projection: BoundedToolCallProjection = {
        name: item.name,
        hasArguments: typeof item.arguments !== "undefined",
        hasOutput: false,
      };
      calls.set(item.callId, projection);
      orderedCalls.push(projection);
      continue;
    }

    if (item.type === "tool_call_output_item") {
      const projection = calls.get(item.callId);
      if (!projection) {
        continue;
      }
      projection.hasOutput = true;
      projection.output = projectToolOutput(item.output);
    }
  }

  return orderedCalls;
}

function projectToolOutput(output: unknown): BoundedToolOutputProjection {
  if (isPlainObject(output)) {
    return compactObject({
      status: readOptionalString(output.status),
      code: readOptionalNullableString(output.code),
      publicReason: readOptionalNullableString(output.publicReason),
      outputType: "object",
      dataPresent: Object.prototype.hasOwnProperty.call(output, "data"),
    });
  }

  return {
    outputType: Array.isArray(output) ? "array" : typeof output,
  };
}

function projectDescriptor(
  value: unknown,
): BoundedDescriptorProjection | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const runtime = isPlainObject(value.runtime) ? value.runtime : undefined;

  return compactObject({
    descriptorVersion: readOptionalString(value.descriptor_version),
    metadata: isPlainObject(value.metadata) ? value.metadata : undefined,
    runtime: runtime
      ? compactObject({
          entryAgent: readOptionalString(runtime.entry_agent),
          maxTurns: readOptionalNumber(runtime.max_turns),
        })
      : undefined,
    agents: isPlainObject(value.agents) ? Object.keys(value.agents) : undefined,
    tools: isPlainObject(value.tools) ? Object.keys(value.tools) : undefined,
  });
}

function parseJsonObject(
  output: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof output === "string") {
    const text = stripJsonFence(output.trim());
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch (error) {
      throw new Error(`${label} must be valid JSON: ${String(error)}`);
    }
  }

  if (isPlainObject(output)) {
    return output;
  }

  throw new Error(`${label} must be a JSON object.`);
}

function stripJsonFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? (match[1] ?? "") : text;
}

function parseVerdict(value: unknown): RunRegressionStatus {
  if (value === "pass" || value === "warn" || value === "fail") {
    return value;
  }
  throw new Error("Run judge result verdict must be pass, warn, or fail.");
}

function parseFindings(value: unknown): RunJudgeResult["findings"] {
  if (typeof value === "undefined") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Run judge result findings must be an array.");
  }

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Run judge result finding ${index} must be an object.`);
    }

    return compactObject({
      severity: parseFindingSeverity(entry.severity, index),
      reason: parseString(
        entry.reason,
        `Run judge result finding ${index} reason`,
      ),
      evidence: parseOptionalString(
        entry.evidence,
        `Run judge result finding ${index} evidence`,
      ),
    });
  });
}

function parseFindingSeverity(
  value: unknown,
  index: number,
): RunJudgeResult["findings"][number]["severity"] {
  if (value === "info" || value === "warn" || value === "error") {
    return value;
  }
  throw new Error(
    `Run judge result finding ${index} severity must be info, warn, or error.`,
  );
}

function parseString(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new Error(`${label} must be a non-empty string.`);
}

function parseOptionalString(
  value: unknown,
  label: string,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  return parseString(value, label);
}

function parseOptionalNullableString(
  value: unknown,
  label: string,
): string | null | undefined {
  if (typeof value === "undefined" || value === null) {
    return value;
  }
  return parseString(value, label);
}

function parseOptionalNumber(
  value: unknown,
  label: string,
): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`${label} must be a finite number.`);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalString(value);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactObject<T extends object>(value: T): T {
  const mutable = value as Record<string, unknown>;
  for (const key of Object.keys(mutable)) {
    if (typeof mutable[key] === "undefined") {
      delete mutable[key];
    }
  }
  return value;
}
