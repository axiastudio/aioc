---
title: Policies
description: Deterministic policy helpers and policy configuration.
---

Policies are the runtime gate between model proposals and actual execution.

They are deterministic authorization functions.

They do not:

- execute tools
- manage approval workflow
- mutate conversation state
- inspect final text output after generation

Those concerns belong to tool execution, host-application workflow, and output guardrails respectively.

## What Policies Do

At runtime, the model can propose actions.

Policies decide whether those proposed actions may proceed.

In practice:

1. the model proposes a tool call or handoff
2. runtime constructs the policy input
3. policy returns a `PolicyResult`
4. runtime either executes, blocks, or suspends the proposal based on that result

This is why policies are a core part of the governance boundary in `aioc`.

## Current Stable Outcome Model

Today the stable runtime supports three outcomes:

- `allow`
- `deny`
- `require_approval`

The current public shape is:

```ts
type PolicyDecision = "allow" | "deny" | "require_approval";
type PolicyResultMode = "throw" | "tool_result";

type PolicyResult = {
  decision: PolicyDecision;
  reason: string;
  publicReason?: string;
  resultMode?: PolicyResultMode;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}
```

## `PolicyResult` Semantics

`PolicyResult` is the contract between policy code and runtime enforcement.

The main fields have different roles:

- `decision`: whether the proposal is allowed, denied, or requires approval
- `reason`: machine-oriented code recorded in logs, errors, and run records
- `publicReason`: user-facing explanation suitable for surfacing outside the runtime
- `resultMode`: how non-allow outcomes are surfaced by the runtime
- `policyVersion`: application-level policy label for auditability
- `expiresAt`: optional expiration metadata for the policy outcome
- `metadata`: additional structured details for audit or diagnostics

## Helpers

```ts
allow(reason, options?)
deny(reason, options?)
requireApproval(reason, options?)
```

These helpers build `PolicyResult` objects without forcing your application to assemble them manually.

## Tool Policy

```ts
type ToolPolicy<TContext> = (input: {
  agentName: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  proposalHash: string;
  argsCanonicalJson: string;
  runContext: RunContext<TContext>;
  turn: number;
}) => PolicyResult | Promise<PolicyResult>;
```

`ToolPolicy` is the deterministic authorization function for tool execution.

It receives both semantic and operational views of the proposal:

- semantic: `toolName`, `parsedArguments`, `runContext`
- operational: `proposalHash`, `argsCanonicalJson`

`proposalHash` identifies the operational proposal itself. It can be matched against external approval evidence without recomputing the fingerprint in policy code.

## Handoff Policy

```ts
type HandoffPolicy<TContext> = (input: {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
  proposalHash: string;
  payloadCanonicalJson: string;
  runContext: RunContext<TContext>;
  turn: number;
}) => PolicyResult | Promise<PolicyResult>;
```

`HandoffPolicy` is the deterministic authorization function for control transfer between agents.

It uses the same outcome model, but the proposal being governed is:

- source agent
- target agent
- handoff payload

## Tool Policy vs Handoff Policy

- `ToolPolicy` governs capability execution
- `HandoffPolicy` governs transfer of control between agents

Both receive:

- `proposalHash`
- canonical payload
- `runContext`
- `turn`

Both return the same `PolicyResult` contract.

## Runtime Rule

If no relevant policy is configured, the runtime denies the proposal.

This means the current stable behavior is default deny.

## `resultMode`

`resultMode` controls how non-allow outcomes are surfaced:

- `throw`: runtime raises a typed policy-denied error
- `tool_result`: runtime sends a normalized envelope back through tool output handling

If you want the model to continue and respond to the user after a deny or approval-required outcome, `tool_result` is the current mechanism.

Legacy `denyMode` is no longer supported. Use `resultMode`.

For non-allow outcomes:

- omitted `resultMode` defaults to `throw`
- `throw` raises typed runtime errors
- `tool_result` returns a normalized envelope through tool output handling

This distinction matters because it changes whether the blocked proposal is handled as control flow or as a structured tool result visible to the model.

## Runtime Consequences

The runtime applies `PolicyResult` like this:

- `allow` -> execution continues
- `deny` + `throw` -> typed denied error
- `deny` + `tool_result` -> normalized envelope with `status = "denied"`
- `require_approval` + `throw` -> typed approval-required error with `SuspendedProposal`
- `require_approval` + `tool_result` -> normalized envelope with `status = "approval_required"`

## Example

```ts
const toolPolicy: ToolPolicy<{ actor: { groups: string[] } }> = ({ runContext }) => {
  if (!runContext.context.actor.groups.includes("finance")) {
    return deny("deny_missing_finance_group", {
      resultMode: "tool_result",
      publicReason: "You are not authorized to access this report.",
      policyVersion: "finance-policy.v1",
    });
  }

  return allow("allow_finance_group_access", {
    policyVersion: "finance-policy.v1",
  });
};
```

## Approval-Oriented Outcomes

`require_approval` is part of the runtime contract.

- with `resultMode = "throw"`, runtime raises approval-required typed errors
- with `resultMode = "tool_result"`, runtime emits a normalized envelope with `status = "approval_required"`

Approval workflow, queueing, and resume semantics remain outside the core runtime and are still discussed in:

- `RFC-0004`
- `RFC-0005`
- `/approval-flows/`

## Related Concepts

- See `/reference/agent/` for how agents define the capability surface a policy governs.
- See `/approval-flows/` for the application-level pattern around `proposalHash` and approval evidence.
