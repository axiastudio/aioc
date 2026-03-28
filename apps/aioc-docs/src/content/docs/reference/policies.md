---
title: Policies
description: Deterministic policy helpers and policy configuration.
---

Policies are the runtime gate between model proposals and actual execution.

## Current Stable Outcome Model

Today the stable runtime supports two outcomes:

- `allow`
- `deny`

The current public shape is:

```ts
type PolicyDecision = "allow" | "deny";
type PolicyDenyMode = "throw" | "tool_result";

type PolicyResult = {
  decision: PolicyDecision;
  reason: string;
  publicReason?: string;
  denyMode?: PolicyDenyMode;
  policyVersion?: string;
  metadata?: Record<string, unknown>;
}
```

## Helpers

```ts
allow(reason, options?)
deny(reason, options?)
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

## `denyMode`

`denyMode` controls how a deny is surfaced:

- `throw`: runtime raises a typed policy-denied error
- `tool_result`: runtime sends a normalized deny envelope back through tool output handling

If you want the model to continue and respond to the user after a deny, `tool_result` is the current mechanism.

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

## Forward-Looking Note

Approval-oriented outcomes such as `require_approval` are currently defined only at the RFC level.

See:

- `RFC-0004`
- `RFC-0005`

They are not part of the current stable runtime contract yet.
