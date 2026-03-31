---
title: Policies
description: Deterministic policy helpers and policy configuration.
---

Policies are the runtime gate between model proposals and actual execution.

## Current Stable Outcome Model

Today the stable runtime supports three outcomes:

- `allow`
- `deny`
- `require_approval`

The current public shape is:

```ts
type PolicyDecision = "allow" | "deny" | "require_approval";
type PolicyResultMode = "throw" | "tool_result";
type PolicyDenyMode = PolicyResultMode; // compatibility alias during beta

type PolicyResult = {
  decision: PolicyDecision;
  reason: string;
  publicReason?: string;
  resultMode?: PolicyResultMode;
  denyMode?: PolicyDenyMode;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}
```

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
  runContext: RunContext<TContext>;
  turn: number;
}) => PolicyResult | Promise<PolicyResult>;
```

## Handoff Policy

```ts
type HandoffPolicy<TContext> = (input: {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
  runContext: RunContext<TContext>;
  turn: number;
}) => PolicyResult | Promise<PolicyResult>;
```

## Runtime Rule

If no relevant policy is configured, the runtime denies the proposal.

This means the current stable behavior is default deny.

## `resultMode`

`resultMode` controls how non-allow outcomes are surfaced:

- `throw`: runtime raises a typed policy-denied error
- `tool_result`: runtime sends a normalized envelope back through tool output handling

If you want the model to continue and respond to the user after a deny or approval-required outcome, `tool_result` is the current mechanism.

For backward compatibility during beta, `denyMode` is still accepted as an alias for `resultMode` on `deny(...)`.

## Example

```ts
const toolPolicy: ToolPolicy<{ actor: { groups: string[] } }> = ({ runContext }) => {
  if (!runContext.context.actor.groups.includes("finance")) {
    return deny("deny_missing_finance_group", {
      denyMode: "tool_result",
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

`require_approval` is now part of the runtime contract.

- with `resultMode = "throw"`, runtime raises approval-required typed errors
- with `resultMode = "tool_result"`, runtime emits a normalized envelope with `status = "approval_required"`

Approval workflow, queueing, and resume semantics remain outside the core runtime and are still discussed in:

- `RFC-0004`
- `RFC-0005`
