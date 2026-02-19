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
  policyDecisions: PolicyDecisionRecord[];
  guardrailDecisions?: GuardrailDecisionRecord[];
  errorName?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}
