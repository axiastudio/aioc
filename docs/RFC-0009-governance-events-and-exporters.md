# RFC-0009: Governance Events and Exporters

- Status: Experimental
- Date: 2026-05-21
- Owners: aioc maintainers
- Depends on: RFC-0003, RFC-0004, RFC-0005
- Related: RFC-0008

## Context

`RunRecord` is the canonical `aioc` audit artifact. It is complete enough for
post-incident analysis, replay, non-regression checks, and review of policy,
guardrail, prompt, and request-fingerprint evidence.

Host applications also need smaller event-shaped records for operational
systems:

- observability pipelines,
- event buses,
- SIEM/security analytics,
- compliance evidence collection,
- governance dashboards,
- external governance toolkits.

Those systems usually do not need the full `RunRecord`. They need stable,
redacted, event-level facts such as "policy denied this tool call" or
"approval was required for this proposal".

## Design Notes

The event layer follows a small set of implementation constraints:

- separate canonical governance events from exporter backends,
- keep event delivery non-blocking or isolated from runtime success,
- support batch exporters,
- prefer additive schema evolution,
- include trace/correlation fields,
- keep raw sensitive payloads out of exported events by default,
- keep delivery guarantees outside the core runtime.

The following concerns remain outside `aioc` core:

- built-in SIEM, compliance, or OTel transport,
- identity mesh and trust score registry,
- approval workflow ownership,
- event processor threads or queues inside core runtime,
- external policy action semantics beyond explicit mapping.

## Decision

`aioc` will introduce an experimental governance-event layer derived from
`RunRecord`.

The first implementation should live outside the core runtime package, in an
experimental package such as:

```text
@axiastudio/aioc-governance-events
```

The package should expose:

- a canonical governance event type,
- a pure `toGovernanceEvents(record, options)` mapper,
- a small exporter interface,
- helper utilities for building `RunRecord` sinks.

The core `@axiastudio/aioc` package should continue to own `RunRecord`,
policy gates, replay, and compare. It should not depend on exporter packages.

## Goals

- Preserve `RunRecord` as the complete, replayable audit artifact.
- Derive smaller operational events from `RunRecord`.
- Keep events redacted and hash-first by default.
- Let host applications export to CloudEvents, OpenTelemetry, OCSF/ECS/CEF,
  queues, databases, vendor-specific governance systems, or internal dashboards
  through separate adapters.
- Keep exporter failures out of runtime behavior.
- Make event mapping deterministic and testable.
- Keep the API explicitly experimental until at least one real exporter
  validates the shape.

## Non-Goals

- No SIEM dependency in core.
- No OpenTelemetry dependency in core.
- No vendor governance toolkit dependency in core.
- No approval workflow engine.
- No replacement for `RunRecord`.
- No live per-tool-call runtime callback in this RFC.
- No raw prompt, context, question, response, or tool arguments in exported
  events by default.
- No built-in delivery guarantees in core.

## Event Schema

The experimental schema version is:

```ts
export const GOVERNANCE_EVENT_SCHEMA_VERSION = "aioc.governance_event.v0";
```

Canonical event types:

```ts
export type GovernanceEventType =
  | "aioc.run.completed"
  | "aioc.run.failed"
  | "aioc.policy.allowed"
  | "aioc.policy.denied"
  | "aioc.approval.required"
  | "aioc.guardrail.passed"
  | "aioc.guardrail.triggered";
```

Canonical event envelope:

```ts
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
  schemaVersion: "aioc.governance_event.v0";
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
```

## Event ID Semantics

Event ids should be deterministic by default so retries and batch replays can
be de-duplicated by receivers.

Recommended derivation:

```text
sha256(schemaVersion + "|" + type + "|" + runId + "|" + subject key)
```

Subject key examples:

- run terminal event: `run`
- policy decision: `policy:<turn>:<callId>:<decision>`
- approval event: `approval:<turn>:<callId>:<proposalHash>`
- guardrail event: `guardrail:<turn>:<guardrailName>:<decision>`

Exporter packages may add target-specific ids, but they should preserve the
canonical `GovernanceEvent.id` for idempotency.

## Mapping From RunRecord

`toGovernanceEvents(record, options)` should be a pure function:

```ts
export interface ToGovernanceEventsOptions<TContext = unknown> {
  includeRunMetadata?: boolean;
  includePolicyMetadata?: boolean;
  includeGuardrailMetadata?: boolean;
  metadata?:
    | Record<string, unknown>
    | ((record: RunRecord<TContext>) => Record<string, unknown> | undefined);
}

export function toGovernanceEvents<TContext>(
  record: RunRecord<TContext>,
  options?: ToGovernanceEventsOptions<TContext>,
): GovernanceEvent[];
```

Mapping rules:

1. Emit exactly one terminal run event:
   - `record.status === "completed"` maps to `aioc.run.completed`.
   - `record.status === "failed"` maps to `aioc.run.failed`.
2. Emit one policy event for each `PolicyDecisionRecord`:
   - `allow` maps to `aioc.policy.allowed`.
   - `deny` maps to `aioc.policy.denied`.
   - `require_approval` maps to `aioc.approval.required`.
3. Emit one guardrail event for each `GuardrailDecisionRecord`:
   - `pass` maps to `aioc.guardrail.passed`.
   - `triggered` maps to `aioc.guardrail.triggered`.
4. If a suspended proposal matches a policy decision by `callId`, enrich the
   `aioc.approval.required` event with `proposalHash`.
5. For tool proposals, include names and hashes computed from canonical
   arguments when available, not raw arguments by default.
6. For handoff proposals, include hashes and agent names, not raw payloads by
   default.
7. Attach the nearest same-turn prompt/request hashes when available.
8. Do not export `contextSnapshot`, `question`, `response`, `items`,
   `promptText`, `rawArguments`, `parsedArguments`, `argsCanonicalJson`,
   `handoffPayload`, or `payloadCanonicalJson` by default.

## Severity Mapping

Recommended default severity:

```text
aioc.run.completed       info
aioc.run.failed          error
aioc.policy.allowed      info
aioc.policy.denied       warn
aioc.approval.required   warn
aioc.guardrail.passed    info
aioc.guardrail.triggered warn
```

Host applications may remap severities in exporter-specific packages.

## Exporter Contract

The canonical exporter interface should be batch-oriented:

```ts
export interface GovernanceEventExporter {
  exportEvents(events: readonly GovernanceEvent[]): Promise<void>;
}
```

A helper can adapt an exporter into a `RunRecordSink`:

```ts
export interface GovernanceEventSinkOptions<
  TContext = unknown,
> extends ToGovernanceEventsOptions<TContext> {
  onExportError?: (error: unknown, record: RunRecord<TContext>) => void;
}

export function createGovernanceEventSink<TContext>(
  exporter: GovernanceEventExporter,
  options?: GovernanceEventSinkOptions<TContext>,
): RunRecordSink<TContext>;
```

Sink behavior:

- derive events with `toGovernanceEvents`,
- call `exporter.exportEvents(events)`,
- surface exporter errors only through `onExportError`,
- never mutate the `RunRecord`,
- never make runtime success depend on exporter success.

Host applications that require delivery guarantees should write the full
`RunRecord` to durable storage or a durable queue first, then export events
from a worker.

## Package Plan

Recommended package sequence:

```text
@axiastudio/aioc-governance-events
  Experimental canonical event schema, mapper, exporter contract, sink helper.

@axiastudio/aioc-export-cloudevents
  Adapter from GovernanceEvent to CloudEvents.

@axiastudio/aioc-export-otel
  Adapter from GovernanceEvent to OpenTelemetry Logs.

@axiastudio/aioc-export-ocsf
  Security/SIEM-oriented adapter, OCSF-first.

@axiastudio/aioc-export-vendor
  Optional adapter pattern for vendor-specific governance systems.
```

The first package should have no hard dependency on CloudEvents, OTel, OCSF,
or any vendor SDK.

## Example Usage

Direct sink usage:

```ts
const exporter = createCloudEventsExporter({
  endpoint: process.env.GOVERNANCE_EVENTS_URL!,
});

await run(agent, userMessage, {
  context,
  policies,
  record: {
    includePromptText: false,
    contextRedactor,
    sink: createGovernanceEventSink(exporter, {
      includeRunMetadata: true,
    }),
  },
});
```

Durable queue usage:

```ts
await run(agent, userMessage, {
  context,
  policies,
  record: {
    includePromptText: false,
    contextRedactor,
    sink: async (record) => {
      await runRecordStore.save(record);
      await queue.publish("aioc.run-record.ready", {
        runId: record.runId,
        record,
      });
    },
  },
});
```

Worker-side export:

```ts
const events = toGovernanceEvents(record, {
  includeRunMetadata: true,
});

await exporter.exportEvents(events);
```

## Privacy And Security

- `RunRecord` remains the complete artifact; governance events are reduced
  operational facts.
- Exported events must be safe to route through broader observability and
  security systems.
- Raw prompts and context are not exportable in v0; this RFC does not define
  an option to include them.
- Metadata export must be opt-in because application metadata can contain
  tenant, user, or policy-sensitive fields.
- Policy `reason` and `publicReason` are included because they are already part
  of the audit trail, but applications should keep them sanitized.
- Exporter packages must document target-specific retention, access-control,
  and transport-security expectations.

## Compatibility With Existing aioc Contracts

This RFC does not change:

- `RunRecord`,
- `RunRecordOptions`,
- `RunRecordSink`,
- policy evaluation,
- approval lifecycle,
- replay semantics,
- stream output utilities.

The event layer is derived from existing artifacts. It should be removable
without affecting runtime behavior.

## Test Matrix

Minimum tests for `@axiastudio/aioc-governance-events`:

1. Completed run maps to one `aioc.run.completed` event.
2. Failed run maps to one `aioc.run.failed` event with error fields.
3. Policy `allow` maps to `aioc.policy.allowed`.
4. Policy `deny` maps to `aioc.policy.denied`.
5. Policy `require_approval` maps to `aioc.approval.required`.
6. Suspended tool proposal enriches approval event with `proposalHash`.
7. Suspended handoff proposal enriches approval event with `proposalHash`.
8. Guardrail `pass` maps to `aioc.guardrail.passed`.
9. Guardrail `triggered` maps to `aioc.guardrail.triggered`.
10. Prompt text, context snapshot, raw arguments, parsed arguments, and payloads
    are not exported.
11. Event ids are deterministic for the same `RunRecord`.
12. Sink helper calls the exporter once with the derived batch.
13. Sink helper invokes `onExportError` on exporter failure.
14. Exporter failure does not throw from the sink helper by default.

## Open Questions

1. Should event names remain `aioc.*` or use a package-neutral namespace such as
   `governance.*` for external adapters?
2. Should `question` and `response` ever be exportable, or should that remain
   strictly a `RunRecord` concern?
3. Should run terminal events include counts for policy decisions, guardrails,
   prompt snapshots, and request fingerprints?
4. Should there be a first-party durable queue helper, or should durable
   delivery stay fully application-owned?
5. Should a future `aioc-export-otel` extension also support span events, or
   should governance events remain logs-only?

## Implementation Status

`@axiastudio/aioc-governance-events` now implements the experimental v0 schema,
`toGovernanceEvents(record, options)`, the batch exporter contract, and
`createGovernanceEventSink(...)`.

The `@axiastudio/aioc-governance-events` package intentionally does not include
CloudEvents, OpenTelemetry, OCSF, or vendor-specific adapters. Those adapters
should validate the canonical event shape before RFC-0009 is promoted out of
experimental status.

`@axiastudio/aioc-export-otel` now implements the first adapter. It maps
governance events to OpenTelemetry Logs and intentionally does not configure an
OpenTelemetry SDK, processor, collector, OTLP endpoint, or delivery guarantee.
A local `ConsoleLogRecordExporter` smoke example validates the mapping without
requiring a collector.

## Adoption Plan

1. Keep this RFC `Experimental`.
2. Implement `@axiastudio/aioc-governance-events` with only the mapper,
   schema, exporter contract, and sink helper. Completed by the initial
   experimental package.
3. Validate the schema with one real exporter, preferably CloudEvents or OTel.
   Initial OTel Logs adapter implemented.
4. Add a canonical example that stores the full `RunRecord` and exports reduced
   governance events.
5. Revisit event schema stability after practical usage.
