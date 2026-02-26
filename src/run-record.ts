import type { AgentInputItem } from "./types";

export type RunRecordStatus = "completed" | "failed";

export interface PolicyResourceSnapshot {
  kind: "tool" | "handoff";
  name: string;
  action?: string;
  resourceId?: string;
}

export interface PolicyDecisionRecord {
  timestamp: string;
  turn: number;
  callId: string;
  decision: "allow" | "deny";
  reason: string;
  policyVersion?: string;
  resource: PolicyResourceSnapshot;
  metadata?: Record<string, unknown>;
}

export interface GuardrailDecisionRecord {
  timestamp: string;
  turn: number;
  guardrailName: string;
  decision: "pass" | "triggered";
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface PromptSnapshotRecord {
  timestamp: string;
  turn: number;
  agentName: string;
  model?: string;
  promptVersion?: string;
  promptHash: string;
  promptText?: string;
}

export interface RequestFingerprintRecord {
  timestamp: string;
  turn: number;
  agentName: string;
  providerName: string;
  model: string;
  runtimeVersion: string;
  fingerprintSchemaVersion: string;
  requestHash: string;
  systemPromptHash: string;
  messagesHash: string;
  toolsHash: string;
  modelSettingsHash: string;
  messageCount: number;
  toolCount: number;
}

export interface RunRecord<TContext = unknown> {
  runId: string;
  startedAt: string;
  completedAt: string;
  status: RunRecordStatus;
  agentName: string;
  providerName?: string;
  model?: string;
  question: string;
  response: string;
  contextSnapshot: TContext;
  contextRedacted?: boolean;
  items: AgentInputItem[];
  promptSnapshots: PromptSnapshotRecord[];
  requestFingerprints: RequestFingerprintRecord[];
  policyDecisions: PolicyDecisionRecord[];
  guardrailDecisions?: GuardrailDecisionRecord[];
  errorName?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface RunRecordContextRedactionResult<TContext = unknown> {
  contextSnapshot: TContext;
  contextRedacted: boolean;
}

export type RunRecordContextRedactor<TContext = unknown> = (
  context: TContext,
) =>
  | RunRecordContextRedactionResult<TContext>
  | Promise<RunRecordContextRedactionResult<TContext>>;

export type RunRecordWriter<TContext = unknown> = (
  record: RunRecord<TContext>,
) => Promise<void> | void;

export interface RunRecordSink<TContext = unknown> {
  write: RunRecordWriter<TContext>;
}

export interface RunRecordOptions<TContext = unknown> {
  runId?: string;
  metadata?: Record<string, unknown>;
  contextRedactor?: RunRecordContextRedactor<TContext>;
  includePromptText?: boolean;
  sink?: RunRecordSink<TContext> | RunRecordWriter<TContext>;
}
