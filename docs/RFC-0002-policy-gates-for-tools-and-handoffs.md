# RFC-0002: Deterministic Policy Gates for Tools and Handoffs

- Status: Accepted
- Date: 2026-02-18
- Accepted: 2026-02-26
- Owners: aioc maintainers
- Depends on: RFC-0001
- Related: RFC-0003

## Context

RFC-0001 defines governance invariants but does not yet specify the runtime contract that enforces them on tools and handoffs.

This RFC introduces the minimum API and runtime behavior for deterministic policy gates.

Note (2026-04-01): this RFC is accepted for the introduction of deterministic policy gates, but parts of its original non-allow delivery terminology are historically outdated. The current runtime uses `resultMode` as the canonical non-allow delivery field, and approval-required outcomes are extended by RFC-0004 and RFC-0005.

## Decision

`aioc` introduces explicit policy contracts for tool calls and handoff transitions.

- The model can only propose.
- The runtime decides via deterministic policy evaluation.
- Default behavior is deny unless explicit allow is returned.

## Scope

In scope:

- Tool proposal authorization.
- Handoff proposal authorization.
- Deny/allow decisions with mandatory reasons.
- Trace metadata for auditability.

Out of scope:

- Full handoff orchestration implementation.
- UI-level approval workflows.
- Provider-specific policy behavior.
- Run-level persistence schema and storage adapters (covered by RFC-0003).

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

export interface ToolPolicyInput<TContext = unknown> {
  agentName: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  proposalHash: string;
  argsCanonicalJson: string;
  runContext: RunContext<TContext>;
  turn: number;
}

export interface HandoffPolicyInput<TContext = unknown> {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
  proposalHash: string;
  payloadCanonicalJson: string;
  runContext: RunContext<TContext>;
  turn: number;
}

export type ToolPolicy<TContext = unknown> = (
  input: ToolPolicyInput<TContext>,
) => Promise<PolicyResult> | PolicyResult;

export type HandoffPolicy<TContext = unknown> = (
  input: HandoffPolicyInput<TContext>,
) => Promise<PolicyResult> | PolicyResult;

export interface PolicyConfiguration<TContext = unknown> {
  toolPolicy?: ToolPolicy<TContext>;
  handoffPolicy?: HandoffPolicy<TContext>;
}
```

## Runtime Semantics

1. Model emits a tool or handoff proposal.
2. Runtime builds policy input deterministically.
3. Runtime evaluates corresponding policy.
4. If policy is missing: implicit deny (`reason = "policy_not_configured"`).
5. If policy returns invalid output: deny (`reason = "invalid_policy_result"`).
6. Only `decision = "allow"` can proceed to execution/transition.
7. If `decision = "deny"` and `resultMode = "tool_result"`, runtime returns a denied tool result envelope and continues without tool execution/handoff transition.
8. If `decision = "deny"` and `resultMode` is missing (or `throw`), runtime raises typed denial errors.

## Default-Deny Rules

- Missing policy configuration MUST deny.
- Missing `reason` in policy result MUST be treated as invalid and deny.
- Exceptions thrown by policy MUST deny (`reason = "policy_error"`).

## Tool Result Envelope

Tool and handoff outputs are normalized into a deterministic envelope:

```ts
export interface ToolResultEnvelope {
  status: "ok" | "denied";
  code: string | null;
  publicReason: string | null;
  data: unknown | null;
}
```

- Allow path: `status = "ok"`, `data = <tool_or_handoff_payload>`.
- Soft deny path (`resultMode = "tool_result"`): `status = "denied"`, `code = reason`, `publicReason` from policy (or runtime fallback), `data = null`.

## Trace Requirements

For each proposal, runtime MUST produce deterministic decision traces through at least one enabled channel:

- run logger events (`tool_policy_evaluated`, `handoff_policy_evaluated`) when `logger` is configured
- run record `policyDecisions` when `record` sink is configured

Each trace record carries:

- `agent`
- `turn`
- proposal identifiers (`toolName` or `handoffName`, plus `callId`)
- `decision` (`allow` or `deny`)
- `reason`
- `policyVersion` (when available)
- `metadata` (optional structured details)

## Error Behavior

- Denied tool proposal raises `ToolCallPolicyDeniedError` without executing the tool when non-allow mode is hard (`throw` or omitted).
- Denied handoff proposal raises `HandoffPolicyDeniedError` without transitioning agent when non-allow mode is hard (`throw` or omitted).
- In soft deny mode (`resultMode = "tool_result"`), runtime must not throw and must emit a denied result envelope.
- Policy engine failures must never bypass denial.

## Security and Privacy Notes

- Policy code is the enforcement boundary for data minimization.
- Policies SHOULD inspect arguments/payload for sensitive fields and deny or redact according to privacy rules.
- Trace metadata MUST avoid leaking raw secrets.

## Minimal Test Matrix

1. Tool allow path: policy allows and tool executes.
2. Tool deny path: policy denies and tool does not execute.
3. Tool missing policy: denied by default.
4. Handoff allow path: transition allowed.
5. Handoff deny path: transition blocked.
6. Policy throws: denied with deterministic reason.
7. Invalid policy result: denied.
8. Tool soft deny path: policy denies with `resultMode = "tool_result"` and runtime emits denied envelope without tool execution.
9. Handoff soft deny path: policy denies with `resultMode = "tool_result"` and runtime emits denied envelope without transition.
10. Allow path output: runtime emits normalized envelope with `status = "ok"` and `data`.

## Adoption History (Completed)

1. Add policy contract types and defaults.
2. Integrate tool policy checks before tool execution.
3. Integrate handoff policy checks before any transition.
4. Add trace events for proposals and decisions.
5. Add minimal test matrix and block merge on failures.

## Implementation Status

- Policy contracts and default-deny behavior are implemented.
- Tool and handoff policy gates are enforced in runtime.
- Decision trace events are emitted for both tools and handoffs.
- Hard deny and soft deny (`resultMode = "tool_result"`) are both implemented.
- Unit/integration/regression coverage is present and executed in `test:ci`.
