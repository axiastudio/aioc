# RFC-0004: Policy Outcomes and Approval Model

- Status: Draft
- Date: 2026-03-27
- Owners: aioc maintainers
- Depends on: RFC-0001, RFC-0002, RFC-0003

## Context

RFC-0002 defines deterministic policy gates for tools and handoffs with two possible policy outcomes: `allow` and `deny`.

That contract is sufficient for default-deny enforcement, but it conflates two materially different situations:

- the action is definitively refused,
- the action must not proceed autonomously and requires explicit approval outside the model loop.

In high-accountability environments, treating both cases as a plain deny loses important meaning:

- audit trails cannot distinguish refusal from escalation,
- host applications cannot build consistent approval workflows on top of runtime outcomes,
- the model cannot be informed deterministically that an action is pending approval rather than permanently blocked.

RFC-0003 already defines `RunRecord` as the canonical audit artifact, but its current policy decision schema cannot represent `approval required` as a first-class state.

## Decision

`aioc` extends the policy outcome model with a third deterministic decision: `require_approval`.

- Policies continue to decide at runtime, not the model.
- `require_approval` blocks execution/transition just like `deny`, but represents a distinct governance state.
- Runtime must surface `require_approval` explicitly through typed errors or normalized tool-result envelopes.
- Audit traces must record `require_approval` distinctly from `deny`.

This RFC defines the policy contract and runtime semantics for that state.

It does **not** define the full approval workflow, reviewer identity model, queueing, or resume semantics after approval.

## Scope

In scope:

- Extend the policy contract beyond `allow | deny`.
- Define runtime semantics for `require_approval`.
- Generalize non-allow delivery mode semantics.
- Extend trace and run-record contracts to capture approval-required outcomes.
- Preserve backward compatibility for existing `allow` / `deny` policies during beta.

Out of scope:

- Approval UI, inboxes, or transport mechanisms.
- Reviewer identity or principal modeling.
- External approval request persistence schemas.
- Resume/retry flow after approval is granted.
- Domain-specific authorization models (RBAC, ABAC, purpose binding, etc.).

## Policy Contracts

```ts
export type PolicyDecision = "allow" | "deny" | "require_approval";
export type PolicyResultMode = "throw" | "tool_result";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  publicReason?: string;
  resultMode?: PolicyResultMode;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyResultOptions {
  publicReason?: string;
  resultMode?: PolicyResultMode;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export function allow(
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult;

export function deny(
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult;

export function requireApproval(
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult;
```

Notes:

- `reason` remains the mandatory deterministic explanation recorded by runtime.
- `publicReason` is the user/model-safe explanation that can be surfaced in tool-result mode.
- `resultMode` applies only to non-allow outcomes (`deny` and `require_approval`).
- If `resultMode` is omitted for a non-allow outcome, runtime MUST treat it as `throw`.
- `expiresAt` is optional, informational only, and does not change runtime semantics.
- `expiresAt`, when present, SHOULD be an RFC 3339 timestamp string. Runtime MUST NOT interpret it as an implicit approval condition.

## Runtime Semantics

1. Model emits a tool or handoff proposal.
2. Runtime builds deterministic policy input and evaluates policy code.
3. If policy returns `decision = "allow"`, execution or transition proceeds.
4. If policy returns `decision = "deny"`, execution or transition is blocked.
5. If policy returns `decision = "require_approval"`, execution or transition is also blocked, but runtime must preserve the distinct outcome.
6. Missing policy, invalid policy output, or policy exceptions remain hard `deny`; runtime must never upgrade them to `require_approval`.
7. Runtime must never auto-approve, auto-retry, or auto-resume a blocked proposal.
8. Invalid or conflicting non-allow delivery-mode configuration MUST be treated as invalid policy output and therefore hard `deny`.

## Non-Allow Delivery Modes

Non-allow decisions (`deny` and `require_approval`) are surfaced in one of two deterministic modes:

- `resultMode = "throw"`: runtime raises a typed error and stops the proposal path.
- `resultMode = "tool_result"`: runtime emits a normalized tool-result envelope and continues without executing the tool or performing the handoff.

`allow` ignores `resultMode`.

If `resultMode` is omitted, runtime MUST behave as if `resultMode = "throw"`.

## Tool Result Envelope

RFC-0002 introduced a normalized tool result envelope for allow and soft-deny paths.

This RFC extends the envelope with an explicit approval-required status:

```ts
export interface ToolResultEnvelope {
  status: "ok" | "denied" | "approval_required";
  code: string | null;
  publicReason: string | null;
  data: unknown | null;
}
```

- Allow path: `status = "ok"`, `data = <tool_or_handoff_payload>`.
- Deny path in tool-result mode: `status = "denied"`, `code = reason`, `publicReason = publicReason ?? runtime fallback`, `data = null`.
- Approval-required path in tool-result mode: `status = "approval_required"`, `code = reason`, `publicReason = publicReason ?? runtime fallback`, `data = null`.

The envelope is designed to let the model continue coherently:

- `denied` means the request was refused,
- `approval_required` means the request cannot continue autonomously and requires external approval.

## Typed Errors

When `resultMode = "throw"`, runtime MUST expose distinct typed errors:

- `ToolCallPolicyDeniedError`
- `HandoffPolicyDeniedError`
- `ToolCallApprovalRequiredError`
- `HandoffApprovalRequiredError`

All typed errors MUST carry the underlying `PolicyResult`.

## Trace and Run Record Requirements

RFC-0003 is extended as follows:

```ts
export interface PolicyDecisionRecord {
  timestamp: string;
  turn: number;
  callId: string;
  decision: "allow" | "deny" | "require_approval";
  reason: string;
  publicReason?: string;
  resultMode?: "throw" | "tool_result";
  policyVersion?: string;
  resource: {
    kind: "tool" | "handoff";
    name: string;
    action?: string;
    resourceId?: string;
  };
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}
```

For each tool or handoff proposal, runtime MUST emit deterministic traces through at least one enabled channel:

- logger events when `logger` is configured,
- `RunRecord.policyDecisions` when `record` is configured.

Each trace record MUST preserve:

- decision (`allow`, `deny`, `require_approval`)
- internal reason
- `publicReason` when present
- delivery mode (`throw` or `tool_result`) for non-allow outcomes
- `policyVersion` when present
- optional `expiresAt`
- structured metadata when present

Soft `require_approval` outcomes MUST also be persisted in `RunRecord.items` through the normalized tool-result envelope with `status = "approval_required"`.

## Compatibility and Migration

The design goal is a clean pre-stable contract:

- Existing policies returning `allow` or `deny` remain valid when migrated to `resultMode`.
- Existing helper functions `allow(...)` and `deny(...)` remain valid.
- `requireApproval(...)` is additive.

The legacy `denyMode` field is not part of the current runtime contract. Implementations returning `denyMode` MUST be rejected deterministically on the hard-deny path (current runtime reason: `deprecated_policy_field_denyMode`).

## Security and Privacy Notes

- `require_approval` must not leak sensitive internal policy detail to the model by default; `publicReason` remains the safe exposure channel.
- `reason` should remain deterministic and auditable, but not secret-bearing.
- `expiresAt` and metadata may reveal governance structure; host applications should treat them as audit data, not as public output.
- Approval-required outcomes do not weaken default-deny: no autonomous execution path is opened.

## Minimal Test Matrix

1. Tool allow path: policy allows and tool executes.
2. Tool approval-required hard path: runtime raises `ToolCallApprovalRequiredError` and tool does not execute.
3. Handoff approval-required hard path: runtime raises `HandoffApprovalRequiredError` and transition does not occur.
4. Tool approval-required soft path: runtime emits `status = "approval_required"` envelope and does not execute the tool.
5. Handoff approval-required soft path: runtime emits `status = "approval_required"` envelope and does not transition.
6. Policy decision traces preserve `decision`, `reason`, `publicReason`, and `resultMode`.
7. Missing/invalid/throwing policy remains `deny`, never `require_approval`.
8. Existing allow/deny policies remain behaviorally compatible.

## Adoption Plan

1. Extend policy contract types and helper functions.
2. Add approval-required typed errors and envelope status.
3. Extend logger and run-record schemas with `require_approval`, `publicReason`, `resultMode`, and `expiresAt`.
4. Add unit, integration, and regression coverage for non-allow semantics.
5. Draft a follow-up RFC for human oversight workflow and approval lifecycle outside core runtime.

## Implementation Status

- Current runtime implements `allow` / `deny` only.
- `publicReason` and hard/soft deny behavior already exist.
- `require_approval` is not yet implemented.
- Approval workflow, reviewer identity, and resume semantics remain intentionally outside the core contract.
