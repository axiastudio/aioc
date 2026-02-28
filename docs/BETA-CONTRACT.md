# Beta Contract (0.1.0-beta.1)

## Purpose

This document defines the pre-beta freeze for `aioc` and the runtime/API surface that is expected to remain stable for the `0.1.0-beta.1` milestone.

During this freeze, behavior and types listed here are treated as contract-level and can only change through explicit documented exceptions.

## Scope

This contract applies to:

- `0.1.0-alpha.5` and following pre-beta candidates
- the first beta release target: `0.1.0-beta.1`

## Frozen Runtime Behavior

1. Model proposals are never execution permissions.
2. Tool calls and handoff transitions are default-deny unless policy returns explicit `allow`.
3. Missing policy, thrown policy, or invalid policy result map to deterministic deny reasons.
4. `run(...)` defaults to non-stream mode when `stream` is omitted.
5. Tool and handoff outputs use the normalized envelope shape.
6. Run record emission remains best-effort and must not alter runtime success/failure semantics.

## Frozen Public Surface

### Agent and Context

- `Agent<TContext>` configuration fields:
  - `name`
  - `handoffDescription`
  - `instructions`
  - `promptVersion`
  - `model`
  - `modelSettings`
  - `tools`
  - `handoffs`
  - `outputGuardrails`
- `RunContext<TContext>` shape and usage.

### Run API

- `run(...)` overloads for stream and non-stream usage.
- shared options shape:
  - `context`
  - `maxTurns`
  - `logger`
  - `policies`
  - `record`
- `RunStreamEvent` and `RunResult` output contracts.

### Policy API

- `PolicyResult` fields and semantics:
  - `decision`
  - `reason`
  - `publicReason`
  - `denyMode`
  - `policyVersion`
  - `metadata`
- policy input contracts:
  - `ToolPolicyInput`
  - `HandoffPolicyInput`
- policy helpers: `allow(...)`, `deny(...)`.

### Tool/Handoff Output Envelope

```ts
interface ToolResultEnvelope {
  status: "ok" | "denied";
  code: string | null;
  publicReason: string | null;
  data: unknown | null;
}
```

### Errors

- `MaxTurnsExceededError`
- `ToolCallPolicyDeniedError`
- `HandoffPolicyDeniedError`
- `OutputGuardrailTripwireTriggered`

Typed error class names and error categories are frozen; message text is not guaranteed stable.

### Run Record Surface

- `RunRecord<TContext>` top-level fields:
  - `runId`
  - `startedAt`
  - `completedAt`
  - `status`
  - `agentName`
  - `providerName`
  - `model`
  - `question`
  - `response`
  - `contextSnapshot`
  - `contextRedacted`
  - `items`
  - `promptSnapshots`
  - `requestFingerprints`
  - `policyDecisions`
  - `guardrailDecisions`
  - `errorName`
  - `errorMessage`
  - `metadata`
- `RunRecordOptions<TContext>` fields:
  - `runId`
  - `metadata`
  - `contextRedactor`
  - `includePromptText`
  - `sink`

## Not Frozen for Beta

The following remain intentionally flexible during pre-beta:

- logger event schema details and exact event naming
- example file structure and tutorial narrative
- provider-specific internal payload construction details
- non-core metadata conventions (except recommended `metadata.appBuildVersion`)
- exact human-readable error messages

## Change Policy During Freeze

Breaking changes to frozen items are not allowed unless:

1. a critical correctness/security issue is identified,
2. the exception is documented in this file,
3. release notes explicitly call out migration impact.

## Beta Exit Criteria

To ship `0.1.0-beta.1`, all items below must hold:

1. RFC-0001, RFC-0002, RFC-0003 are `Accepted`.
2. This contract matches implemented runtime behavior.
3. `npm run test:ci` passes.
4. No open P0 issues on frozen surfaces.
