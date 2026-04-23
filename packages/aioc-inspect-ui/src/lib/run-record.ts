import type {
  AgentInputItem,
  GuardrailDecisionRecord,
  PolicyDecisionRecord,
  PromptSnapshotRecord,
  RequestFingerprintRecord,
  RunRecord,
} from "@axiastudio/aioc";
import type {
  ExtractedToolCall,
  HandoffAttempt,
  HandoffFlow,
  RunRecordComparison,
  RunRecordComparisonMetrics,
  RunRecordComparisonSummary,
  RunRecordDifference,
  RunRecordPreview,
  RunRecordScope,
} from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sortObjectKeys(value[key]);
      return accumulator;
    }, {});
}

export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hasRequiredRecordFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.runId === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    typeof value.status === "string" &&
    typeof value.agentName === "string" &&
    typeof value.question === "string" &&
    typeof value.response === "string" &&
    Array.isArray(value.items) &&
    Array.isArray(value.promptSnapshots) &&
    Array.isArray(value.requestFingerprints) &&
    Array.isArray(value.policyDecisions)
  );
}

export function parseRunRecordJson(jsonText: string): RunRecord<unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON file");
  }

  if (Array.isArray(parsed)) {
    throw new Error("Expected a single RunRecord object");
  }

  if (!isObject(parsed) || !hasRequiredRecordFields(parsed)) {
    throw new Error("Missing required RunRecord fields");
  }

  return parsed as unknown as RunRecord<unknown>;
}

export function buildRunRecordPreview(
  record: RunRecord<unknown>,
): RunRecordPreview {
  const scope = deriveRunRecordScope(record);

  return {
    runId: record.runId,
    agentName: record.agentName,
    startedAt: record.startedAt,
    status: record.status,
    currentUserMessage: scope.currentUserMessage,
    model: record.model ?? "n/a",
  };
}

export function truncateText(value: string, maxLength = 96): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function findLastUserMessage(items: AgentInputItem[]): string | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item?.type === "message" &&
      item.role === "user" &&
      item.content.trim().length > 0
    ) {
      return item.content.trim();
    }
  }

  return undefined;
}

function findLastUserMessageIndex(items: AgentInputItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item?.type === "message" &&
      item.role === "user" &&
      item.content.trim().length > 0
    ) {
      return index;
    }
  }

  return -1;
}

export function deriveRunRecordScope(
  record: RunRecord<unknown>,
): RunRecordScope {
  const inputItemCount = record.requestFingerprints[0]?.messageCount;
  const hasScopedInput =
    Number.isInteger(inputItemCount) &&
    typeof inputItemCount === "number" &&
    inputItemCount >= 0 &&
    inputItemCount <= record.items.length;
  const inputItems = hasScopedInput
    ? record.items.slice(0, inputItemCount)
    : [];
  const emittedItems = hasScopedInput
    ? record.items.slice(inputItemCount)
    : record.items;
  const currentUserMessageIndex = findLastUserMessageIndex(inputItems);
  const historyItems =
    currentUserMessageIndex >= 0
      ? inputItems.slice(0, currentUserMessageIndex)
      : inputItems;
  const currentUserMessage =
    findLastUserMessage(inputItems) ??
    findLastUserMessage(record.items) ??
    record.question;

  return {
    inputItems,
    historyItems,
    emittedItems,
    inputItemCount: inputItems.length,
    historyItemCount: historyItems.length,
    emittedItemCount: emittedItems.length,
    fallbackUsed: !hasScopedInput,
    currentUserMessage,
    recordedQuestion: record.question,
  };
}

function extractToolCallsFromItems(items: AgentInputItem[]): ExtractedToolCall[] {
  const orderedCalls: ExtractedToolCall[] = [];
  const callsById = new Map<string, ExtractedToolCall>();
  let toolTurn = 0;

  for (const item of items) {
    if (item.type === "tool_call_item") {
      toolTurn += 1;
      const rawArguments = item.arguments ?? {};
      const argsCanonicalJson = toCanonicalJson(rawArguments);
      const extracted: ExtractedToolCall = {
        callId: item.callId,
        name: item.name,
        arguments: rawArguments,
        hasOutput: false,
        turn: toolTurn,
        argsCanonicalJson,
        argsHash: hashString(argsCanonicalJson),
      };
      callsById.set(item.callId, extracted);
      orderedCalls.push(extracted);
      continue;
    }

    if (item.type === "tool_call_output_item") {
      const existing = callsById.get(item.callId);

      if (!existing) {
        orderedCalls.push({
          callId: item.callId,
          name: "(missing tool_call_item)",
          arguments: {},
          output: item.output,
          hasOutput: true,
          argsCanonicalJson: "{}",
          argsHash: hashString("{}"),
        });
        continue;
      }

      existing.output = item.output;
      existing.hasOutput = true;
    }
  }

  return orderedCalls;
}

export function extractToolCalls(record: RunRecord<unknown>): ExtractedToolCall[];
export function extractToolCalls(items: AgentInputItem[]): ExtractedToolCall[];
export function extractToolCalls(
  input: RunRecord<unknown> | AgentInputItem[],
): ExtractedToolCall[] {
  return extractToolCallsFromItems(Array.isArray(input) ? input : input.items);
}

function buildActivatedAgentPath(record: RunRecord<unknown>): string[] {
  const path: string[] = [];

  for (const snapshot of record.promptSnapshots) {
    const agentName = snapshot.agentName.trim();
    if (!agentName) {
      continue;
    }

    if (path[path.length - 1] !== agentName) {
      path.push(agentName);
    }
  }

  if (path.length === 0 && record.agentName.trim()) {
    path.push(record.agentName.trim());
  }

  return path;
}

function getAgentNameByTurn(record: RunRecord<unknown>): Map<number, string> {
  const agentsByTurn = new Map<number, string>();

  for (const snapshot of record.promptSnapshots) {
    if (!agentsByTurn.has(snapshot.turn)) {
      agentsByTurn.set(snapshot.turn, snapshot.agentName);
    }
  }

  return agentsByTurn;
}

function readHandoffTargetFromOutput(output: unknown): string | undefined {
  if (!isObject(output)) {
    return undefined;
  }

  const data = output.data;
  if (!isObject(data) || typeof data.handoffTo !== "string") {
    return undefined;
  }

  return data.handoffTo;
}

function inferHandoffTargetFromToolName(toolName: string): string | undefined {
  if (!toolName.startsWith("handoff_to_")) {
    return undefined;
  }

  return toolName.replace(/^handoff_to_/, "");
}

export function extractHandoffFlow(
  record: RunRecord<unknown>,
  items: AgentInputItem[] = record.items,
): HandoffFlow {
  const toolCalls = extractToolCalls(items);
  const handoffCalls = toolCalls.filter((call) =>
    call.name.startsWith("handoff_to_"),
  );
  const handoffDecisions = record.policyDecisions.filter(
    (decision) => decision.resource.kind === "handoff",
  );
  const decisionsByCallId = new Map(
    handoffDecisions.map((decision) => [decision.callId, decision]),
  );
  const toolCallsByCallId = new Map(
    handoffCalls.map((toolCall) => [toolCall.callId, toolCall]),
  );
  const agentsByTurn = getAgentNameByTurn(record);
  const attemptIds = new Set<string>([
    ...handoffCalls.map((call) => call.callId),
    ...handoffDecisions.map((decision) => decision.callId),
  ]);

  const attempts: HandoffAttempt[] = [...attemptIds]
    .map((callId) => {
      const toolCall = toolCallsByCallId.get(callId);
      const decision = decisionsByCallId.get(callId);
      const turn = decision?.turn ?? toolCall?.turn;
      const decisionValue: HandoffAttempt["decision"] =
        decision?.decision === "allow" || decision?.decision === "deny"
          ? decision.decision
          : "unknown";
      const fromAgent =
        (typeof turn === "number" ? agentsByTurn.get(turn) : undefined) ??
        "unknown";
      const toAgent =
        decision?.resource.name ??
        (toolCall ? readHandoffTargetFromOutput(toolCall.output) : undefined) ??
        (toolCall ? inferHandoffTargetFromToolName(toolCall.name) : undefined) ??
        "unknown";

      return {
        callId,
        turn,
        fromAgent,
        toAgent,
        decision: decisionValue,
        reason: decision?.reason,
        policyVersion: decision?.policyVersion,
      };
    })
    .sort((left, right) => (left.turn ?? Number.MAX_SAFE_INTEGER) - (right.turn ?? Number.MAX_SAFE_INTEGER));

  return {
    activatedAgentPath: buildActivatedAgentPath(record),
    attempts,
    acceptedCount: attempts.filter((attempt) => attempt.decision === "allow")
      .length,
    deniedCount: attempts.filter((attempt) => attempt.decision === "deny")
      .length,
  };
}

function toToolShapeKey(call: ExtractedToolCall): string {
  return `${call.name}::${call.argsHash}`;
}

function countToolShapes(toolCalls: ExtractedToolCall[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const call of toolCalls) {
    const key = toToolShapeKey(call);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function compareCanonicalArray(
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
    const leftEntry = left[index];
    const rightEntry = right[index];

    if (typeof leftEntry === "undefined") {
      same = false;
      differences.push({
        path: `${path}[${index}]`,
        kind: "missing_left",
        right: rightEntry,
      });
      continue;
    }

    if (typeof rightEntry === "undefined") {
      same = false;
      differences.push({
        path: `${path}[${index}]`,
        kind: "missing_right",
        left: leftEntry,
      });
      continue;
    }

    if (toCanonicalJson(leftEntry) !== toCanonicalJson(rightEntry)) {
      same = false;
      differences.push({
        path: `${path}[${index}]`,
        kind: "mismatch",
        left: leftEntry,
        right: rightEntry,
      });
    }
  }

  return same;
}

export function compareRunRecords(
  left: RunRecord<unknown>,
  right: RunRecord<unknown>,
): RunRecordComparison {
  const differences: RunRecordDifference[] = [];
  const leftScope = deriveRunRecordScope(left);
  const rightScope = deriveRunRecordScope(right);
  const toolCallsLeft = extractToolCalls(leftScope.emittedItems);
  const toolCallsRight = extractToolCalls(rightScope.emittedItems);
  const leftCounts = countToolShapes(toolCallsLeft);
  const rightCounts = countToolShapes(toolCallsRight);
  const allToolKeys = new Set([...leftCounts.keys(), ...rightCounts.keys()]);

  const metrics: RunRecordComparisonMetrics = {
    responseLengthA: left.response.length,
    responseLengthB: right.response.length,
    toolCallsA: toolCallsLeft.length,
    toolCallsB: toolCallsRight.length,
    matchedToolCalls: 0,
    missingToolCalls: 0,
    extraToolCalls: 0,
  };

  for (const key of allToolKeys) {
    const leftCount = leftCounts.get(key) ?? 0;
    const rightCount = rightCounts.get(key) ?? 0;
    metrics.matchedToolCalls += Math.min(leftCount, rightCount);
    metrics.missingToolCalls += Math.max(0, leftCount - rightCount);
    metrics.extraToolCalls += Math.max(0, rightCount - leftCount);

    if (leftCount !== rightCount) {
      differences.push({
        path: `toolCalls[${key}]`,
        kind: "mismatch",
        left: leftCount,
        right: rightCount,
      });
    }
  }

  const sameFinalResponse = left.response === right.response;
  if (!sameFinalResponse) {
    differences.push({
      path: "response",
      kind: "mismatch",
      left: left.response,
      right: right.response,
    });
  }

  const sameToolCallShape =
    metrics.toolCallsA === metrics.toolCallsB &&
    metrics.missingToolCalls === 0 &&
    metrics.extraToolCalls === 0;

  const samePolicyDecisions = compareCanonicalArray(
    "policyDecisions",
    left.policyDecisions,
    right.policyDecisions,
    differences,
  );

  const sameGuardrailDecisions = compareCanonicalArray(
    "guardrailDecisions",
    left.guardrailDecisions ?? [],
    right.guardrailDecisions ?? [],
    differences,
  );

  const metadataLeft = left.metadata ?? {};
  const metadataRight = right.metadata ?? {};
  if (toCanonicalJson(metadataLeft) !== toCanonicalJson(metadataRight)) {
    differences.push({
      path: "metadata",
      kind: "mismatch",
      left: metadataLeft,
      right: metadataRight,
    });
  }

  const summary: RunRecordComparisonSummary = {
    sameFinalResponse,
    sameToolCallShape,
    samePolicyDecisions,
    sameGuardrailDecisions,
  };

  return {
    equal:
      sameFinalResponse &&
      sameToolCallShape &&
      samePolicyDecisions &&
      sameGuardrailDecisions &&
      toCanonicalJson(metadataLeft) === toCanonicalJson(metadataRight),
    summary,
    metrics,
    differences,
    signals: {
      promptVersionA: left.promptSnapshots[0]?.promptVersion,
      promptVersionB: right.promptSnapshots[0]?.promptVersion,
      promptHashChanged:
        left.promptSnapshots[0]?.promptHash !== right.promptSnapshots[0]?.promptHash,
      requestFingerprintTurnsA: left.requestFingerprints.length,
      requestFingerprintTurnsB: right.requestFingerprints.length,
      firstRequestHashChanged:
        left.requestFingerprints[0]?.requestHash !==
        right.requestFingerprints[0]?.requestHash,
    },
  };
}

function isAgentInputItem(item: unknown): item is AgentInputItem {
  return (
    isObject(item) &&
    typeof item.type === "string" &&
    ["message", "tool_call_item", "tool_call_output_item"].includes(item.type)
  );
}

function isPromptSnapshotRecord(value: unknown): value is PromptSnapshotRecord {
  return (
    isObject(value) &&
    typeof value.timestamp === "string" &&
    typeof value.turn === "number" &&
    typeof value.agentName === "string" &&
    typeof value.promptHash === "string"
  );
}

function isRequestFingerprintRecord(
  value: unknown,
): value is RequestFingerprintRecord {
  return (
    isObject(value) &&
    typeof value.timestamp === "string" &&
    typeof value.turn === "number" &&
    typeof value.agentName === "string" &&
    typeof value.providerName === "string" &&
    typeof value.model === "string" &&
    typeof value.requestHash === "string"
  );
}

function isPolicyDecisionRecord(value: unknown): value is PolicyDecisionRecord {
  return (
    isObject(value) &&
    typeof value.timestamp === "string" &&
    typeof value.turn === "number" &&
    typeof value.callId === "string" &&
    typeof value.decision === "string" &&
    typeof value.reason === "string" &&
    isObject(value.resource) &&
    typeof value.resource.kind === "string" &&
    typeof value.resource.name === "string"
  );
}

function isGuardrailDecisionRecord(
  value: unknown,
): value is GuardrailDecisionRecord {
  return (
    isObject(value) &&
    typeof value.timestamp === "string" &&
    typeof value.turn === "number" &&
    typeof value.guardrailName === "string" &&
    typeof value.decision === "string"
  );
}

export function isRecordRenderable(record: RunRecord<unknown>): boolean {
  return (
    Array.isArray(record.items) &&
    record.items.every((item) => isAgentInputItem(item)) &&
    Array.isArray(record.promptSnapshots) &&
    record.promptSnapshots.every((entry) => isPromptSnapshotRecord(entry)) &&
    Array.isArray(record.requestFingerprints) &&
    record.requestFingerprints.every((entry) => isRequestFingerprintRecord(entry)) &&
    Array.isArray(record.policyDecisions) &&
    record.policyDecisions.every((entry) => isPolicyDecisionRecord(entry)) &&
    (typeof record.guardrailDecisions === "undefined" ||
      (Array.isArray(record.guardrailDecisions) &&
        record.guardrailDecisions.every((entry) =>
          isGuardrailDecisionRecord(entry),
        )))
  );
}

export function summarizePolicyReasons(
  decisions: PolicyDecisionRecord[],
): string[] {
  return decisions.map((decision) => decision.reason);
}

export function summarizeGuardrailNames(
  decisions: GuardrailDecisionRecord[],
): string[] {
  return decisions.map((decision) => decision.guardrailName);
}

export function summarizePromptVersions(
  snapshots: PromptSnapshotRecord[],
): string[] {
  return snapshots
    .map((snapshot) => snapshot.promptVersion)
    .filter((version): version is string => typeof version === "string");
}

export function summarizeFingerprintTurns(
  fingerprints: RequestFingerprintRecord[],
): number[] {
  return fingerprints.map((fingerprint) => fingerprint.turn);
}

export function formatStringList(values: string[]): string {
  if (values.length === 0) {
    return "none";
  }

  return values.join(", ");
}

export function formatNumberList(values: number[]): string {
  if (values.length === 0) {
    return "none";
  }

  return values.join(", ");
}

export function hasKeywords(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.toLowerCase().includes(keyword));
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
