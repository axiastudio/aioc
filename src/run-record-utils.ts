import { createHash } from "node:crypto";
import { Agent } from "./agent";
import { run } from "./run";
import type { RunRecord, RunRecordOptions, RunRecordSink } from "./run-record";
import type { Tool } from "./tool";
import type { AgentInputItem, NonStreamRunOptions, RunResult } from "./types";

type CanonicalJsonValue =
  | null
  | string
  | number
  | boolean
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function normalizeCanonicalValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): CanonicalJsonValue {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    return value as string | number | boolean;
  }

  if (valueType === "undefined") {
    return "[undefined]";
  }

  if (valueType === "bigint") {
    return `[bigint:${String(value)}]`;
  }

  if (valueType === "symbol") {
    return `[symbol:${String(value)}]`;
  }

  if (valueType === "function") {
    return "[function]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeCanonicalValue(entry, seen));
  }

  if (value instanceof Set) {
    const entries = [...value].map((entry) =>
      normalizeCanonicalValue(entry, seen),
    );
    entries.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
    return entries;
  }

  if (value instanceof Map) {
    const entries = [...value.entries()].map(([key, entry]) => [
      normalizeCanonicalValue(key, seen),
      normalizeCanonicalValue(entry, seen),
    ]);
    entries.sort((left, right) =>
      JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0])),
    );
    return entries as CanonicalJsonValue;
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return "[circular]";
    }
    seen.add(objectValue);

    const normalized: Record<string, CanonicalJsonValue> = {};
    const keys = Object.keys(objectValue).sort();
    for (const key of keys) {
      normalized[key] = normalizeCanonicalValue(objectValue[key], seen);
    }

    seen.delete(objectValue);
    return normalized;
  }

  return String(value);
}

function toCanonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Normalized view of a tool call extracted from run history.
 */
export interface ExtractedToolCall {
  callId: string;
  name: string;
  arguments: unknown;
  output?: unknown;
  hasOutput: boolean;
  turn?: number;
  argsCanonicalJson: string;
  argsHash: string;
}

function buildExtractedToolCall(
  callId: string,
  name: string,
  rawArguments: unknown,
  turn?: number,
): ExtractedToolCall {
  const normalizedArguments =
    typeof rawArguments === "undefined" ? {} : rawArguments;
  const argsCanonicalJson = toCanonicalJson(normalizedArguments);
  return {
    callId,
    name,
    arguments: normalizedArguments,
    hasOutput: false,
    turn,
    argsCanonicalJson,
    argsHash: sha256(argsCanonicalJson),
  };
}

/**
 * Extracts and pairs tool call/input and tool call/output items from a run record.
 * Pairing is done by `callId` and preserves chronological order of tool call proposals.
 */
export function extractToolCalls<TContext>(
  input: RunRecord<TContext>,
): ExtractedToolCall[];
/**
 * Extracts and pairs tool call/input and tool call/output items from run items.
 * Pairing is done by `callId` and preserves chronological order of tool call proposals.
 */
export function extractToolCalls(input: AgentInputItem[]): ExtractedToolCall[];
export function extractToolCalls<TContext>(
  input: RunRecord<TContext> | AgentInputItem[],
): ExtractedToolCall[] {
  const items = Array.isArray(input) ? input : input.items;
  const orderedCalls: ExtractedToolCall[] = [];
  const callsById = new Map<string, ExtractedToolCall>();
  let toolTurn = 0;

  for (const item of items) {
    if (item.type === "tool_call_item") {
      toolTurn += 1;
      const extracted = buildExtractedToolCall(
        item.callId,
        item.name,
        item.arguments,
        toolTurn,
      );
      callsById.set(item.callId, extracted);
      orderedCalls.push(extracted);
      continue;
    }

    if (item.type === "tool_call_output_item") {
      const existing = callsById.get(item.callId);
      if (!existing) {
        const orphanCall = buildExtractedToolCall(
          item.callId,
          "",
          {},
          undefined,
        );
        orphanCall.output = item.output;
        orphanCall.hasOutput = true;
        callsById.set(item.callId, orphanCall);
        orderedCalls.push(orphanCall);
        continue;
      }

      existing.output = item.output;
      existing.hasOutput = true;
    }
  }

  return orderedCalls.map((call) => ({ ...call }));
}

/**
 * Sections available for run-record comparison.
 */
export type RunRecordComparisonSection =
  | "response"
  | "toolCalls"
  | "policy"
  | "guardrails"
  | "metadata";

/**
 * Options for `compareRunRecords`.
 */
export interface CompareRunRecordsOptions {
  includeSections?: RunRecordComparisonSection[];
  excludeSections?: RunRecordComparisonSection[];
  responseMatchMode?: "exact";
}

/**
 * Structured diff item returned by `compareRunRecords`.
 */
export interface RunRecordDifference {
  path: string;
  kind: "mismatch" | "missing_left" | "missing_right";
  left?: unknown;
  right?: unknown;
}

export interface RunRecordComparisonSummary {
  sameFinalResponse: boolean;
  sameToolCallShape: boolean;
  samePolicyDecisions: boolean;
  sameGuardrailDecisions: boolean;
}

export interface RunRecordComparisonMetrics {
  responseLengthA: number;
  responseLengthB: number;
  toolCallsA: number;
  toolCallsB: number;
  matchedToolCalls: number;
  missingToolCalls: number;
  extraToolCalls: number;
}

/**
 * Result of `compareRunRecords`.
 */
export interface RunRecordComparison {
  equal: boolean;
  summary: RunRecordComparisonSummary;
  metrics: RunRecordComparisonMetrics;
  differences: RunRecordDifference[];
}

function compareArraysByCanonical(
  path: string,
  left: unknown[],
  right: unknown[],
  differences: RunRecordDifference[],
): boolean {
  let same = left.length === right.length;

  if (left.length !== right.length) {
    differences.push({
      path: `${path}.length`,
      kind: "mismatch",
      left: left.length,
      right: right.length,
    });
  }

  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (typeof leftItem === "undefined") {
      same = false;
      differences.push({
        path: `${path}[${index}]`,
        kind: "missing_left",
        right: rightItem,
      });
      continue;
    }
    if (typeof rightItem === "undefined") {
      same = false;
      differences.push({
        path: `${path}[${index}]`,
        kind: "missing_right",
        left: leftItem,
      });
      continue;
    }

    const leftCanonical = toCanonicalJson(leftItem);
    const rightCanonical = toCanonicalJson(rightItem);
    if (leftCanonical !== rightCanonical) {
      same = false;
      differences.push({
        path: `${path}[${index}]`,
        kind: "mismatch",
        left: leftItem,
        right: rightItem,
      });
    }
  }

  return same;
}

function resolveSections(
  options?: CompareRunRecordsOptions,
): Set<RunRecordComparisonSection> {
  const allSections: RunRecordComparisonSection[] = [
    "response",
    "toolCalls",
    "policy",
    "guardrails",
    "metadata",
  ];
  const included = options?.includeSections
    ? new Set(options.includeSections)
    : new Set(allSections);

  for (const section of options?.excludeSections ?? []) {
    included.delete(section);
  }

  return included;
}

function toToolCallKey(call: ExtractedToolCall): string {
  return `${call.name}\u001f${call.argsHash}`;
}

function countByKey(calls: ExtractedToolCall[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const key = toToolCallKey(call);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compares two run records and returns a structured report suitable for CI gates.
 */
export function compareRunRecords<TContextA, TContextB>(
  left: RunRecord<TContextA>,
  right: RunRecord<TContextB>,
  options?: CompareRunRecordsOptions,
): RunRecordComparison {
  const sections = resolveSections(options);
  const differences: RunRecordDifference[] = [];

  const toolCallsLeft = extractToolCalls(left);
  const toolCallsRight = extractToolCalls(right);

  const metrics: RunRecordComparisonMetrics = {
    responseLengthA: left.response.length,
    responseLengthB: right.response.length,
    toolCallsA: toolCallsLeft.length,
    toolCallsB: toolCallsRight.length,
    matchedToolCalls: 0,
    missingToolCalls: 0,
    extraToolCalls: 0,
  };

  const leftCounts = countByKey(toolCallsLeft);
  const rightCounts = countByKey(toolCallsRight);
  const allKeys = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  for (const key of allKeys) {
    const leftCount = leftCounts.get(key) ?? 0;
    const rightCount = rightCounts.get(key) ?? 0;
    metrics.matchedToolCalls += Math.min(leftCount, rightCount);
    if (leftCount > rightCount) {
      metrics.missingToolCalls += leftCount - rightCount;
    }
    if (rightCount > leftCount) {
      metrics.extraToolCalls += rightCount - leftCount;
    }
  }

  let sameFinalResponse = true;
  if (sections.has("response")) {
    const responseMatchMode = options?.responseMatchMode ?? "exact";
    if (responseMatchMode === "exact" && left.response !== right.response) {
      sameFinalResponse = false;
      differences.push({
        path: "response",
        kind: "mismatch",
        left: left.response,
        right: right.response,
      });
    }
  }

  let sameToolCallShape = true;
  if (sections.has("toolCalls")) {
    if (toolCallsLeft.length !== toolCallsRight.length) {
      sameToolCallShape = false;
      differences.push({
        path: "toolCalls.length",
        kind: "mismatch",
        left: toolCallsLeft.length,
        right: toolCallsRight.length,
      });
    }

    const maxLength = Math.max(toolCallsLeft.length, toolCallsRight.length);
    for (let index = 0; index < maxLength; index += 1) {
      const leftCall = toolCallsLeft[index];
      const rightCall = toolCallsRight[index];

      if (!leftCall) {
        sameToolCallShape = false;
        differences.push({
          path: `toolCalls[${index}]`,
          kind: "missing_left",
          right: rightCall,
        });
        continue;
      }
      if (!rightCall) {
        sameToolCallShape = false;
        differences.push({
          path: `toolCalls[${index}]`,
          kind: "missing_right",
          left: leftCall,
        });
        continue;
      }

      if (leftCall.name !== rightCall.name) {
        sameToolCallShape = false;
        differences.push({
          path: `toolCalls[${index}].name`,
          kind: "mismatch",
          left: leftCall.name,
          right: rightCall.name,
        });
      }
      if (leftCall.argsHash !== rightCall.argsHash) {
        sameToolCallShape = false;
        differences.push({
          path: `toolCalls[${index}].argsHash`,
          kind: "mismatch",
          left: leftCall.argsHash,
          right: rightCall.argsHash,
        });
      }
      if (leftCall.hasOutput !== rightCall.hasOutput) {
        differences.push({
          path: `toolCalls[${index}].hasOutput`,
          kind: "mismatch",
          left: leftCall.hasOutput,
          right: rightCall.hasOutput,
        });
      }

      if (leftCall.hasOutput && rightCall.hasOutput) {
        const leftOutputCanonical = toCanonicalJson(leftCall.output);
        const rightOutputCanonical = toCanonicalJson(rightCall.output);
        if (leftOutputCanonical !== rightOutputCanonical) {
          differences.push({
            path: `toolCalls[${index}].output`,
            kind: "mismatch",
            left: leftCall.output,
            right: rightCall.output,
          });
        }
      }
    }
  }

  let samePolicyDecisions = true;
  if (sections.has("policy")) {
    samePolicyDecisions = compareArraysByCanonical(
      "policyDecisions",
      left.policyDecisions,
      right.policyDecisions,
      differences,
    );
  }

  let sameGuardrailDecisions = true;
  if (sections.has("guardrails")) {
    sameGuardrailDecisions = compareArraysByCanonical(
      "guardrailDecisions",
      left.guardrailDecisions ?? [],
      right.guardrailDecisions ?? [],
      differences,
    );
  }

  if (sections.has("metadata")) {
    const leftMetadataCanonical = toCanonicalJson(left.metadata ?? {});
    const rightMetadataCanonical = toCanonicalJson(right.metadata ?? {});
    if (leftMetadataCanonical !== rightMetadataCanonical) {
      differences.push({
        path: "metadata",
        kind: "mismatch",
        left: left.metadata,
        right: right.metadata,
      });
    }
  }

  return {
    equal: differences.length === 0,
    summary: {
      sameFinalResponse,
      sameToolCallShape,
      samePolicyDecisions,
      sameGuardrailDecisions,
    },
    metrics,
    differences,
  };
}

/**
 * Replay mode.
 */
export type ReplayMode = "live" | "strict" | "hybrid";

export interface MissingToolCallResolution {
  action: "throw" | "use_live" | "use_output";
  output?: unknown;
}

export interface ReplayMissingToolCallInput {
  mode: ReplayMode;
  toolName: string;
  arguments: unknown;
  argsCanonicalJson: string;
  argsHash: string;
}

export type ReplayMissingToolCallHandler = (
  input: ReplayMissingToolCallInput,
) => MissingToolCallResolution | Promise<MissingToolCallResolution>;

export interface ReplayStats {
  recordedToolCalls: number;
  replayedFromRecord: number;
  missingToolCalls: number;
  liveFallbackCalls: number;
}

export interface ReplayFromRunRecordInput<TContext = unknown> {
  sourceRunRecord: RunRecord<TContext>;
  agent?: Agent<TContext>;
  agentFactory?: () => Agent<TContext> | Promise<Agent<TContext>>;
  mode: ReplayMode;
  runOptions?: Omit<NonStreamRunOptions<TContext>, "stream">;
  metadataOverrides?: Record<string, unknown>;
  onMissingToolCall?: ReplayMissingToolCallHandler;
}

export interface ReplayFromRunRecordResult<TContext = unknown> {
  result: RunResult<TContext>;
  replayRunRecord?: RunRecord<TContext>;
  replayStats: ReplayStats;
}

function createMissingToolCallError(input: ReplayMissingToolCallInput): Error {
  return new Error(
    [
      `Missing recorded tool output for "${input.toolName}".`,
      `argsHash=${input.argsHash}.`,
      `argsCanonicalJson=${input.argsCanonicalJson}`,
    ].join(" "),
  );
}

type RecordedToolLookupResult =
  | {
      status: "recorded";
      output: unknown;
    }
  | {
      status: "missing";
      input: ReplayMissingToolCallInput;
    };

function buildRecordedToolQueues(
  source: RunRecord<unknown>,
): Map<string, ExtractedToolCall[]> {
  const calls = extractToolCalls(source).filter(
    (call) => call.hasOutput && call.name.length > 0,
  );
  const queues = new Map<string, ExtractedToolCall[]>();
  for (const call of calls) {
    const key = toToolCallKey(call);
    const queue = queues.get(key);
    if (queue) {
      queue.push(call);
      continue;
    }
    queues.set(key, [call]);
  }
  return queues;
}

function findRecordedToolOutput(
  queues: Map<string, ExtractedToolCall[]>,
  toolName: string,
  args: unknown,
  mode: ReplayMode,
): RecordedToolLookupResult {
  const argsCanonicalJson = toCanonicalJson(args);
  const argsHash = sha256(argsCanonicalJson);
  const key = `${toolName}\u001f${argsHash}`;
  const queue = queues.get(key);
  if (queue && queue.length > 0) {
    const matched = queue.shift();
    if (matched) {
      return {
        status: "recorded",
        output: matched.output,
      };
    }
  }

  return {
    status: "missing",
    input: {
      mode,
      toolName,
      arguments: args,
      argsCanonicalJson,
      argsHash,
    },
  };
}

function resolveMissingToolCall(
  mode: ReplayMode,
  input: ReplayMissingToolCallInput,
  handler?: ReplayMissingToolCallHandler,
): Promise<MissingToolCallResolution> | MissingToolCallResolution {
  if (!handler) {
    if (mode === "hybrid") {
      return { action: "use_live" };
    }
    return { action: "throw" };
  }
  return handler(input);
}

function isRunRecordSink<TContext>(
  sink: RunRecordOptions<TContext>["sink"],
): sink is RunRecordSink<TContext> {
  return typeof sink === "object" && sink !== null && "write" in sink;
}

async function writeRunRecordToSink<TContext>(
  sink: RunRecordOptions<TContext>["sink"],
  record: RunRecord<TContext>,
): Promise<void> {
  if (!sink) {
    return;
  }
  if (typeof sink === "function") {
    await sink(record);
    return;
  }
  if (isRunRecordSink(sink)) {
    await sink.write(record);
  }
}

function cloneAgentWithReplayedTools<TContext>(
  sourceAgent: Agent<TContext>,
  mode: ReplayMode,
  queues: Map<string, ExtractedToolCall[]>,
  replayStats: ReplayStats,
  onMissingToolCall?: ReplayMissingToolCallHandler,
  cache: Map<Agent<TContext>, Agent<TContext>> = new Map(),
): Agent<TContext> {
  const existing = cache.get(sourceAgent);
  if (existing) {
    return existing;
  }

  const cloned = new Agent<TContext>({
    name: sourceAgent.name,
    handoffDescription: sourceAgent.handoffDescription,
    instructions: sourceAgent.instructions,
    promptVersion: sourceAgent.promptVersion,
    model: sourceAgent.model,
    modelSettings: sourceAgent.modelSettings,
    tools: [],
    handoffs: [],
    outputGuardrails: sourceAgent.outputGuardrails,
  });
  cache.set(sourceAgent, cloned);

  const wrappedTools: Tool<TContext>[] = sourceAgent.tools.map(
    (toolDefinition) => {
      return {
        name: toolDefinition.name,
        description: toolDefinition.description,
        parameters: toolDefinition.parameters,
        execute: async (input, runContext) => {
          const lookup = findRecordedToolOutput(
            queues,
            toolDefinition.name,
            input,
            mode,
          );
          if (lookup.status === "recorded") {
            replayStats.replayedFromRecord += 1;
            return lookup.output;
          }

          replayStats.missingToolCalls += 1;
          const resolution = await resolveMissingToolCall(
            mode,
            lookup.input,
            onMissingToolCall,
          );

          if (resolution.action === "use_output") {
            replayStats.replayedFromRecord += 1;
            return resolution.output;
          }

          if (resolution.action === "use_live") {
            replayStats.liveFallbackCalls += 1;
            return toolDefinition.execute(input, runContext);
          }

          throw createMissingToolCallError(lookup.input);
        },
      };
    },
  );

  const wrappedHandoffs = sourceAgent.handoffs.map((handoffAgent) =>
    cloneAgentWithReplayedTools(
      handoffAgent,
      mode,
      queues,
      replayStats,
      onMissingToolCall,
      cache,
    ),
  );

  cloned.tools = wrappedTools;
  cloned.handoffs = wrappedHandoffs;
  return cloned;
}

async function resolveReplayAgent<TContext>(
  input: ReplayFromRunRecordInput<TContext>,
): Promise<Agent<TContext>> {
  if (input.agent && input.agentFactory) {
    throw new Error(
      "Replay configuration is ambiguous: provide either agent or agentFactory, not both.",
    );
  }
  if (input.agentFactory) {
    return input.agentFactory();
  }
  if (input.agent) {
    return input.agent;
  }
  throw new Error("Replay configuration is missing an agent or agentFactory.");
}

/**
 * Replays a run from a recorded run-record baseline.
 */
export async function replayFromRunRecord<TContext = unknown>(
  input: ReplayFromRunRecordInput<TContext>,
): Promise<ReplayFromRunRecordResult<TContext>> {
  const baseAgent = await resolveReplayAgent(input);
  const extractedSourceCalls = extractToolCalls(input.sourceRunRecord);
  const replayStats: ReplayStats = {
    recordedToolCalls: extractedSourceCalls.filter((call) => call.hasOutput)
      .length,
    replayedFromRecord: 0,
    missingToolCalls: 0,
    liveFallbackCalls: 0,
  };

  const mode = input.mode;
  const replayAgent =
    mode === "live"
      ? baseAgent
      : cloneAgentWithReplayedTools(
          baseAgent,
          mode,
          buildRecordedToolQueues(input.sourceRunRecord),
          replayStats,
          input.onMissingToolCall,
        );

  const runOptions = input.runOptions ?? {};
  const replayContext =
    typeof runOptions.context === "undefined"
      ? (input.sourceRunRecord.contextSnapshot as TContext)
      : runOptions.context;
  const replayPolicies = runOptions.policies;

  let replayRunRecord: RunRecord<TContext> | undefined;
  const shouldCaptureReplayRecord =
    Boolean(runOptions.record) || Boolean(input.metadataOverrides);
  let replayRecordOptions = runOptions.record;
  if (shouldCaptureReplayRecord) {
    const sink = runOptions.record?.sink;
    replayRecordOptions = {
      ...(runOptions.record ?? {}),
      metadata: {
        ...(runOptions.record?.metadata ?? {}),
        ...(input.metadataOverrides ?? {}),
      },
      sink: async (record) => {
        replayRunRecord = record;
        await writeRunRecordToSink(sink, record);
      },
    };
  }

  const result = await run(replayAgent, input.sourceRunRecord.question, {
    ...runOptions,
    context: replayContext,
    policies: replayPolicies,
    stream: false,
    record: replayRecordOptions,
  });

  return {
    result,
    replayRunRecord,
    replayStats,
  };
}
