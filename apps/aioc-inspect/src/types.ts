import type { RunRecord } from "@axiastudio/aioc";

export type InspectView =
  | { name: "home" }
  | { name: "inspect"; slotId: RunSlotId }
  | { name: "compare" };

export type RunSlotId = "file1" | "file2";

export interface RunRecordPreview {
  runId: string;
  agentName: string;
  startedAt: string;
  status: string;
  question: string;
  model: string;
}

export interface LoadedRunRecord {
  fileName: string;
  loadedAt: string;
  record: RunRecord<unknown>;
  preview: RunRecordPreview;
}

export interface RunSlotState {
  status: "empty" | "invalid" | "loaded";
  fileName?: string;
  error?: string;
  data?: LoadedRunRecord;
}

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

export interface RunRecordComparisonSignals {
  promptVersionA?: string;
  promptVersionB?: string;
  promptHashChanged: boolean;
  requestFingerprintTurnsA: number;
  requestFingerprintTurnsB: number;
  firstRequestHashChanged: boolean;
}

export interface RunRecordComparison {
  equal: boolean;
  summary: RunRecordComparisonSummary;
  metrics: RunRecordComparisonMetrics;
  differences: RunRecordDifference[];
  signals: RunRecordComparisonSignals;
}
