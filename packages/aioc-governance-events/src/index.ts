import { createHash } from "node:crypto";
import type {
  GuardrailDecisionRecord,
  PolicyDecisionRecord,
  PromptSnapshotRecord,
  RequestFingerprintRecord,
  RunRecord,
  RunRecordSink,
  SuspendedProposal,
} from "@axiastudio/aioc";

export const GOVERNANCE_EVENT_SCHEMA_VERSION = "aioc.governance_event.v0";

export type GovernanceEventType =
  | "aioc.run.completed"
  | "aioc.run.failed"
  | "aioc.policy.allowed"
  | "aioc.policy.denied"
  | "aioc.approval.required"
  | "aioc.guardrail.passed"
  | "aioc.guardrail.triggered";

export type GovernanceEventSeverity = "debug" | "info" | "warn" | "error";

export interface GovernanceEventSubject {
  kind: "run" | "tool" | "handoff" | "guardrail" | "approval";
  name?: string;
  turn?: number;
  callId?: string;
  proposalHash?: string;
  argsHash?: string;
  payloadHash?: string;
}

export interface GovernanceEventPolicy {
  decision?: "allow" | "deny" | "require_approval";
  reason?: string;
  publicReason?: string;
  policyVersion?: string;
  resultMode?: "throw" | "tool_result";
  expiresAt?: string;
}

export interface GovernanceEventTrace {
  promptHash?: string;
  promptVersion?: string;
  requestHash?: string;
  systemPromptHash?: string;
  messagesHash?: string;
  toolsHash?: string;
  modelSettingsHash?: string;
  fingerprintSchemaVersion?: string;
}

export interface GovernanceEvent {
  schemaVersion: typeof GOVERNANCE_EVENT_SCHEMA_VERSION;
  id: string;
  type: GovernanceEventType;
  occurredAt: string;
  severity: GovernanceEventSeverity;

  runId: string;
  agentName: string;
  providerName?: string;
  model?: string;
  status?: "completed" | "failed";

  subject: GovernanceEventSubject;
  policy?: GovernanceEventPolicy;
  trace?: GovernanceEventTrace;

  errorName?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ToGovernanceEventsOptions<TContext = unknown> {
  includeRunMetadata?: boolean;
  includePolicyMetadata?: boolean;
  includeGuardrailMetadata?: boolean;
  metadata?:
    | Record<string, unknown>
    | ((record: RunRecord<TContext>) => Record<string, unknown> | undefined);
}

export interface GovernanceEventExporter {
  exportEvents(events: readonly GovernanceEvent[]): Promise<void>;
}

export interface GovernanceEventSinkOptions<
  TContext = unknown,
> extends ToGovernanceEventsOptions<TContext> {
  onExportError?: (error: unknown, record: RunRecord<TContext>) => void;
}

export function toGovernanceEvents<TContext>(
  record: RunRecord<TContext>,
  options: ToGovernanceEventsOptions<TContext> = {},
): GovernanceEvent[] {
  const baseMetadata = resolveMetadata(record, options.metadata);
  const events: GovernanceEvent[] = [
    createRunTerminalEvent(record, options, baseMetadata),
  ];

  const suspendedByCallId = buildSuspendedProposalLookup(record);

  for (const decision of record.policyDecisions) {
    events.push(
      createPolicyEvent(
        record,
        decision,
        suspendedByCallId,
        options,
        baseMetadata,
      ),
    );
  }

  for (const decision of record.guardrailDecisions ?? []) {
    events.push(createGuardrailEvent(record, decision, options, baseMetadata));
  }

  return events;
}

export function createGovernanceEventSink<TContext>(
  exporter: GovernanceEventExporter,
  options: GovernanceEventSinkOptions<TContext> = {},
): RunRecordSink<TContext> {
  return {
    async write(record) {
      try {
        const events = toGovernanceEvents(record, options);
        await exporter.exportEvents(events);
      } catch (error) {
        try {
          options.onExportError?.(error, record);
        } catch {
          // Exporter errors must never make runtime success depend on telemetry.
        }
      }
    },
  };
}

function createRunTerminalEvent<TContext>(
  record: RunRecord<TContext>,
  options: ToGovernanceEventsOptions<TContext>,
  baseMetadata?: Record<string, unknown>,
): GovernanceEvent {
  const type =
    record.status === "completed" ? "aioc.run.completed" : "aioc.run.failed";
  const subject: GovernanceEventSubject = { kind: "run" };
  return compactEvent({
    schemaVersion: GOVERNANCE_EVENT_SCHEMA_VERSION,
    id: createEventId(type, record.runId, "run"),
    type,
    occurredAt: record.completedAt,
    severity: record.status === "completed" ? "info" : "error",
    runId: record.runId,
    agentName: record.agentName,
    providerName: record.providerName,
    model: record.model,
    status: record.status,
    subject,
    trace: createRunTrace(record),
    errorName: record.errorName,
    errorMessage: record.errorMessage,
    metadata: mergeMetadata(
      baseMetadata,
      options.includeRunMetadata ? record.metadata : undefined,
    ),
  });
}

function createPolicyEvent<TContext>(
  record: RunRecord<TContext>,
  decision: PolicyDecisionRecord,
  suspendedByCallId: Map<string, SuspendedProposal>,
  options: ToGovernanceEventsOptions<TContext>,
  baseMetadata?: Record<string, unknown>,
): GovernanceEvent {
  const type = mapPolicyEventType(decision.decision);
  const severity = mapPolicySeverity(decision.decision);
  const suspendedProposal = suspendedByCallId.get(decision.callId);
  const subject = createPolicySubject(decision, suspendedProposal);

  return compactEvent({
    schemaVersion: GOVERNANCE_EVENT_SCHEMA_VERSION,
    id: createEventId(
      type,
      record.runId,
      createPolicySubjectKey(decision, suspendedProposal),
    ),
    type,
    occurredAt: decision.timestamp,
    severity,
    runId: record.runId,
    agentName: record.agentName,
    providerName: record.providerName,
    model: record.model,
    subject,
    policy: {
      decision: decision.decision,
      reason: decision.reason,
      publicReason: decision.publicReason,
      policyVersion: decision.policyVersion,
      resultMode: decision.resultMode,
      expiresAt: decision.expiresAt,
    },
    trace: createTraceForTurn(record, decision.turn),
    metadata: mergeMetadata(
      baseMetadata,
      options.includePolicyMetadata ? decision.metadata : undefined,
    ),
  });
}

function createGuardrailEvent<TContext>(
  record: RunRecord<TContext>,
  decision: GuardrailDecisionRecord,
  options: ToGovernanceEventsOptions<TContext>,
  baseMetadata?: Record<string, unknown>,
): GovernanceEvent {
  const type =
    decision.decision === "pass"
      ? "aioc.guardrail.passed"
      : "aioc.guardrail.triggered";
  const subject: GovernanceEventSubject = {
    kind: "guardrail",
    name: decision.guardrailName,
    turn: decision.turn,
  };

  return compactEvent({
    schemaVersion: GOVERNANCE_EVENT_SCHEMA_VERSION,
    id: createEventId(
      type,
      record.runId,
      `guardrail:${decision.turn}:${decision.guardrailName}:${decision.decision}`,
    ),
    type,
    occurredAt: decision.timestamp,
    severity: decision.decision === "pass" ? "info" : "warn",
    runId: record.runId,
    agentName: record.agentName,
    providerName: record.providerName,
    model: record.model,
    subject,
    trace: createTraceForTurn(record, decision.turn),
    metadata: mergeMetadata(
      baseMetadata,
      options.includeGuardrailMetadata ? decision.metadata : undefined,
    ),
  });
}

function createPolicySubject(
  decision: PolicyDecisionRecord,
  suspendedProposal?: SuspendedProposal,
): GovernanceEventSubject {
  const baseSubject: GovernanceEventSubject = {
    kind:
      decision.decision === "require_approval"
        ? "approval"
        : decision.resource.kind,
    name: decision.resource.name,
    turn: decision.turn,
    callId: decision.callId,
    proposalHash: suspendedProposal?.proposalHash,
  };

  if (suspendedProposal?.kind === "tool") {
    return {
      ...baseSubject,
      name: suspendedProposal.toolName,
      argsHash: hashText(suspendedProposal.argsCanonicalJson),
    };
  }

  if (suspendedProposal?.kind === "handoff") {
    return {
      ...baseSubject,
      name: suspendedProposal.toAgentName,
      payloadHash: hashText(suspendedProposal.payloadCanonicalJson),
    };
  }

  return baseSubject;
}

function createPolicySubjectKey(
  decision: PolicyDecisionRecord,
  suspendedProposal?: SuspendedProposal,
): string {
  if (decision.decision === "require_approval") {
    return `approval:${decision.turn}:${decision.callId}:${
      suspendedProposal?.proposalHash ?? "unknown"
    }`;
  }

  return `policy:${decision.turn}:${decision.callId}:${decision.decision}`;
}

function mapPolicyEventType(
  decision: PolicyDecisionRecord["decision"],
): GovernanceEventType {
  if (decision === "allow") {
    return "aioc.policy.allowed";
  }
  if (decision === "deny") {
    return "aioc.policy.denied";
  }
  return "aioc.approval.required";
}

function mapPolicySeverity(
  decision: PolicyDecisionRecord["decision"],
): GovernanceEventSeverity {
  return decision === "allow" ? "info" : "warn";
}

function createRunTrace<TContext>(
  record: RunRecord<TContext>,
): GovernanceEventTrace | undefined {
  const latestTurn = Math.max(
    0,
    ...record.promptSnapshots.map((snapshot) => snapshot.turn),
    ...record.requestFingerprints.map((fingerprint) => fingerprint.turn),
  );

  if (latestTurn <= 0) {
    return undefined;
  }

  return createTraceForTurn(record, latestTurn);
}

function createTraceForTurn<TContext>(
  record: RunRecord<TContext>,
  turn: number,
): GovernanceEventTrace | undefined {
  const prompt = findLastByTurn(record.promptSnapshots, turn);
  const request = findLastByTurn(record.requestFingerprints, turn);

  const trace: GovernanceEventTrace = {
    promptHash: prompt?.promptHash,
    promptVersion: prompt?.promptVersion,
    requestHash: request?.requestHash,
    systemPromptHash: request?.systemPromptHash,
    messagesHash: request?.messagesHash,
    toolsHash: request?.toolsHash,
    modelSettingsHash: request?.modelSettingsHash,
    fingerprintSchemaVersion: request?.fingerprintSchemaVersion,
  };

  return compactObject(trace);
}

function findLastByTurn<
  TRecord extends PromptSnapshotRecord | RequestFingerprintRecord,
>(records: TRecord[], turn: number): TRecord | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index]?.turn === turn) {
      return records[index];
    }
  }
  return undefined;
}

function buildSuspendedProposalLookup<TContext>(
  record: RunRecord<TContext>,
): Map<string, SuspendedProposal> {
  const proposals = new Map<string, SuspendedProposal>();
  for (const proposal of record.suspendedProposals ?? []) {
    proposals.set(proposal.callId, proposal);
  }
  return proposals;
}

function createEventId(
  type: GovernanceEventType,
  runId: string,
  subjectKey: string,
): string {
  return hashText(
    `${GOVERNANCE_EVENT_SCHEMA_VERSION}|${type}|${runId}|${subjectKey}`,
  );
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function resolveMetadata<TContext>(
  record: RunRecord<TContext>,
  metadata?:
    | Record<string, unknown>
    | ((record: RunRecord<TContext>) => Record<string, unknown> | undefined),
): Record<string, unknown> | undefined {
  if (typeof metadata === "function") {
    return metadata(record);
  }
  return metadata;
}

function mergeMetadata(
  ...entries: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry) {
      Object.assign(merged, entry);
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function compactEvent(event: GovernanceEvent): GovernanceEvent {
  return compactObject(event) ?? event;
}

function compactObject<T extends object>(input: T): T | undefined {
  const output: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "undefined") {
      output[key as keyof T] = value as T[keyof T];
    }
  }
  return Object.keys(output).length > 0 ? (output as T) : undefined;
}
