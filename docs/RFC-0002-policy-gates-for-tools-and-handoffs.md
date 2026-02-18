# RFC-0002: Deterministic Policy Gates for Tools and Handoffs

- Status: Accepted
- Date: 2026-02-18
- Accepted on: 2026-02-18
- Owners: aioc maintainers
- Depends on: RFC-0001

## Context

RFC-0001 defines governance invariants but does not yet specify the runtime contract that enforces them on tools and handoffs.

This RFC introduces the minimum API and runtime behavior for deterministic policy gates.

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

## Policy Contracts

```ts
export type PolicyDecision = "allow" | "deny";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  policyVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolPolicyInput<TContext = unknown> {
  agentName: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  runContext: RunContext<TContext>;
  turn: number;
}

export interface HandoffPolicyInput<TContext = unknown> {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
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

## Default-Deny Rules

- Missing policy configuration MUST deny.
- Missing `reason` in policy result MUST be treated as invalid and deny.
- Exceptions thrown by policy MUST deny (`reason = "policy_error"`).

## Trace Requirements

For each proposal, runtime MUST emit trace fields through:

- `tool_policy_evaluated` for tool proposals
- `handoff_policy_evaluated` for handoff proposals

Each event carries:

- `agent`
- `turn`
- proposal identifiers (`toolName` or `handoffName`, plus `callId`)
- `decision` (`allow` or `deny`)
- `reason`
- `policyVersion` (when available)
- `metadata` (optional structured details)

## Error Behavior

- Denied tool proposal returns a typed runtime error without executing the tool.
- Denied handoff proposal raises a typed runtime error without transitioning agent.
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

## Rollout Plan

1. Add policy contract types and defaults.
2. Integrate tool policy checks before tool execution.
3. Integrate handoff policy checks before any transition.
4. Add trace events for proposals and decisions.
5. Add minimal test matrix and block merge on failures.

## Implementation Status

- Policy contracts and default-deny behavior are implemented.
- Tool and handoff policy gates are enforced in runtime.
- Decision trace events are emitted for both tools and handoffs.
- Unit/integration/regression coverage is present and executed in `test:ci`.
