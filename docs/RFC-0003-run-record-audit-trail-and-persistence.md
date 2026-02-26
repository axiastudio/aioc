# RFC-0003: Run Records, Audit Trail, and Persistence Adapters

- Status: Draft
- Date: 2026-02-19
- Owners: aioc maintainers
- Depends on: RFC-0001, RFC-0002

## Context

`aioc` already enforces deterministic policy gates for tools and handoffs (RFC-0002), but governance needs a stable run-level audit artifact to support:

- post-incident analysis (hallucinations, bias, unexpected behavior),
- reproducibility and regression checks after corrections,
- historical review of why access was allowed or denied at a given time.

To avoid binding `aioc` to one storage model, persistence must be adapter-based.

## Decision

`aioc` defines a standard `RunRecord` contract emitted by runtime and written through a pluggable sink.

- Runtime collects decision evidence during execution.
- Runtime emits one consolidated run record at completion or failure.
- Record writing is best-effort and must never alter runtime execution flow.
- Persistence is delegated to host applications via sink/adapter.

## Scope

In scope:

- Canonical run-level schema (`RunRecord`).
- Policy decision records with mandatory `reason`.
- Optional guardrail decision records.
- Per-turn request fingerprint records at runtime-provider boundary.
- Context snapshot redaction hook before persistence.
- Sink adapter interface for persistence targets (DB, queue, object storage, etc.).

Out of scope:

- Storage engine choices and migrations.
- Retention policies and access governance implementation details.
- Replay execution engine.

## Terminology

- `sink`: destination writer for run records. In practice, an adapter provided by the host app.
- `adapter`: application-side component that maps `RunRecord` into target persistence entities.

## Contract

```ts
export interface RunRecord<TContext = unknown> {
  runId: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed";
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

export interface PolicyDecisionRecord {
  timestamp: string;
  turn: number;
  callId: string;
  decision: "allow" | "deny";
  reason: string;
  policyVersion?: string;
  resource: {
    kind: "tool" | "handoff";
    name: string;
    action?: string;
    resourceId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface RunRecordOptions<TContext = unknown> {
  runId?: string;
  metadata?: Record<string, unknown>;
  includePromptText?: boolean;
  contextRedactor?: (
    context: TContext,
  ) =>
    | { contextSnapshot: TContext; contextRedacted: boolean }
    | Promise<{ contextSnapshot: TContext; contextRedacted: boolean }>;
  sink?:
    | { write: (record: RunRecord<TContext>) => Promise<void> | void }
    | ((record: RunRecord<TContext>) => Promise<void> | void);
}
```

## Runtime Semantics

1. Runtime initializes record state (`runId`, `startedAt`, extracted `question`).
2. Runtime captures a context snapshot; if `contextRedactor` exists, it runs before persistence.
3. During execution, runtime appends prompt snapshots per turn (`promptHash` always, optional `promptText`).
4. During execution, runtime appends request fingerprints per turn (full request hash + segmented hashes).
5. During execution, runtime appends tool/handoff policy outcomes and guardrail outcomes.
6. `items` preserve normalized tool result envelopes (`{ status, code, publicReason, data }`) for allow outcomes and soft-deny outcomes.
7. On completion/failure, runtime emits exactly one run record through the configured sink.
8. Sink failures are swallowed by design and must not change run success/failure semantics.
9. Streaming mode emits record when stream finishes or fails.

## Security and Privacy Notes

- `contextRedactor` is the primary hook for data minimization before persistence.
- `reason` in policy decisions should explain authorization outcomes without leaking secrets.
- Sink adapters must enforce storage-side controls (retention, encryption, access controls).
- Trace metadata must remain structured and scrubbed of sensitive values.
- `metadata.appBuildVersion` is a recommended convention to correlate drift with host-application source/build versions.

## Minimal Test Matrix

1. Completed run emits one record with final response.
2. Failed run emits one record with `errorName` and `errorMessage`.
3. Prompt snapshots are captured with stable hash for each turn.
4. Request fingerprints are captured with stable full/segment hashes for each turn.
5. Tool/handoff policy decisions are included with reason and decision.
6. Soft-deny tool/handoff outcomes are persisted in `items` as denied envelopes.
7. Context redactor output is persisted with `contextRedacted = true`.
8. Sink write exception does not fail runtime.
9. Record emission remains single-shot in stream and non-stream modes.

## Rollout Plan

1. Stabilize the record schema and option types.
2. Expose `record` in shared run options.
3. Add unit/regression coverage for emission semantics.
4. Publish integration examples for adapter-based persistence.
5. Promote RFC to `Accepted` after schema review.

## Implementation Status

- Runtime record emission is implemented behind `run(..., { record })`.
- Policy decision and guardrail decision capture are wired into runtime.
- Prompt snapshot and request fingerprint capture are wired into runtime.
- Context redaction and sink adapter interfaces are implemented.
- Unit coverage exists for run record behavior and failure handling.
