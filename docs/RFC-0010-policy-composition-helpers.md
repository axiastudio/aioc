# RFC-0010: Policy Composition Helpers

- Status: Draft
- Date: 2026-05-22
- Owners: aioc maintainers
- Depends on: RFC-0002, RFC-0004, RFC-0006

## Context

`aioc` currently exposes `ToolPolicy` and `HandoffPolicy` as global policy
functions configured at run level.

That design keeps the runtime control plane explicit and easy to audit, but it
can become verbose when an agent has tools or handoffs with different
governance requirements.

Applications commonly end up writing policy dispatch code such as:

```ts
const toolPolicy: ToolPolicy<Context> = (input) => {
  if (input.toolName === "search_docs") {
    return allow("allow_search_docs");
  }

  if (input.toolName === "export_report") {
    return requireApproval("approval_export_report", {
      resultMode: "tool_result",
      publicReason: "Export requires explicit approval.",
    });
  }

  return deny(`deny_tool_${input.toolName}`);
};
```

This is correct, but it mixes policy logic with dispatch boilerplate. The
problem becomes more visible once applications combine:

- always-allowed low-risk tools,
- approval-required tools,
- domain-specific authorization checks,
- default-deny fallback behavior.

## Decision

`aioc` should add optional policy composition helpers that build normal
`ToolPolicy` and `HandoffPolicy` functions.

The helpers should not change `run(...)`, `RunOptions`, or runtime policy
semantics. They should only reduce boilerplate around dispatching by tool or
handoff target.

The first proposed helpers are:

```ts
export type ToolPolicyMap<TContext = unknown> = Record<
  string,
  ToolPolicy<TContext>
>;

export function composeToolPolicies<TContext = unknown>(
  policies: ToolPolicyMap<TContext>,
): ToolPolicy<TContext>;
```

and:

```ts
export type HandoffPolicyMap<TContext = unknown> = Record<
  string,
  HandoffPolicy<TContext>
>;

export function composeHandoffPolicies<TContext = unknown>(
  policies: HandoffPolicyMap<TContext>,
): HandoffPolicy<TContext>;
```

Both maps may include a `"*"` fallback policy.

## Goals

- Make per-tool and per-handoff policy code easier to read.
- Preserve the existing single `ToolPolicy` and `HandoffPolicy` runtime
  contracts.
- Preserve default-deny behavior when no specific policy and no fallback are
  configured.
- Keep policy composition explicit and deterministic.
- Keep policy helpers compatible with approval-evidence helpers from RFC-0006.

## Non-Goals

- No change to `run(...)`.
- No new `policies.toolPolicies` or `policies.handoffPolicies` runtime option.
- No policy registry.
- No route matching beyond exact names and `"*"`.
- No automatic approval semantics.
- No implicit allow behavior.
- No replacement for custom `ToolPolicy` or `HandoffPolicy` functions.

## Semantics

### Tool Policy Composition

`composeToolPolicies(...)` returns a `ToolPolicy`.

When invoked:

1. It looks for `policies[input.toolName]`.
2. If not found, it looks for `policies["*"]`.
3. If a policy is found, it calls that policy with the original input.
4. If no policy is found, it returns a deterministic deny result.

Recommended fallback denial:

```ts
deny(`deny_unconfigured_tool_${input.toolName}`);
```

The helper must not mutate input, context, or the map.

### Handoff Policy Composition

`composeHandoffPolicies(...)` returns a `HandoffPolicy`.

When invoked:

1. It looks for `policies[input.toAgentName]`.
2. If not found, it looks for `policies["*"]`.
3. If a policy is found, it calls that policy with the original input.
4. If no policy is found, it returns a deterministic deny result.

Recommended fallback denial:

```ts
deny(`deny_unconfigured_handoff_${input.toAgentName}`);
```

The exact key should be the handoff target name because that is the practical
application decision point in most multi-agent flows.

## Example

```ts
const toolPolicy = composeToolPolicies<Context>({
  search_docs: () => allow("allow_search_docs"),

  export_report: ({ proposalHash, runContext }) => {
    if (
      runContext.context.approvedProposalHashes.includes(proposalHash)
    ) {
      return allow("approval_granted");
    }

    return requireApproval("approval_export_report", {
      resultMode: "tool_result",
      publicReason: "Export requires explicit approval.",
    });
  },

  "*": ({ toolName }) => deny(`deny_tool_${toolName}`),
});
```

With RFC-0006 helpers:

```ts
const toolPolicy = composeToolPolicies<Context>({
  search_docs: () => allow("allow_search_docs"),
  export_report: ({ proposalHash, runContext }) => {
    if (findActiveApprovalGrant(proposalHash, runContext.context.grants)) {
      return allow("approval_granted");
    }

    return requireApproval("approval_export_report", {
      resultMode: "tool_result",
      publicReason: "Export requires explicit approval.",
    });
  },
});
```

In the second example, an unconfigured tool remains denied because the composer
has no matching policy and no `"*"` fallback.

## Relation To Approval Evidence Helpers

RFC-0006 standardizes approval evidence helpers.

This RFC does not add new approval semantics. It only makes it easier to attach
approval-aware policy logic to a specific tool or handoff without writing a
manual `if (toolName === "...")` dispatch block.

Approval evidence still flows through policy code:

```text
ApprovalGrant -> ToolPolicy/HandoffPolicy -> allow | deny | require_approval
```

It does not become:

```text
ApprovalGrant -> runtime bypass
```

## Compatibility

This RFC is fully additive.

Existing applications can keep passing handwritten `toolPolicy` and
`handoffPolicy` functions. Composed policies are normal policies and require no
runtime changes.

## Alternatives Considered

### Add `policies.toolPolicies` and `policies.handoffPolicies` to `run(...)`

Rejected for this RFC because it changes the runtime options contract. That may
be worth considering later, but the composition helper solves the immediate
ergonomics problem without touching `run.ts`.

### Keep dispatch entirely application-specific

Rejected because exact-name dispatch is common, repetitive, and not where most
applications differentiate.

### Add richer matching predicates

Rejected for the first version. Predicate-based matching is more flexible but
can obscure auditability and ordering semantics. Exact names plus `"*"` are
enough for the current need.

## Implementation Notes

This RFC should be implemented as optional pure helpers in a dedicated module,
or alongside policy helpers if that keeps the public surface simpler.

A likely initial surface is:

- `src/policy-composition.ts`
- exported from `src/index.ts`

The implementation should reuse existing `allow(...)`, `deny(...)`,
`requireApproval(...)`, `ToolPolicy`, and `HandoffPolicy` contracts. It should
not require changes to `run.ts`.

## Minimal Test Matrix

1. `composeToolPolicies(...)` dispatches to an exact tool-name policy.
2. `composeToolPolicies(...)` dispatches to `"*"` when no exact match exists.
3. `composeToolPolicies(...)` denies when no exact match and no fallback exist.
4. `composeToolPolicies(...)` passes through the original policy input.
5. `composeHandoffPolicies(...)` dispatches to an exact target-agent policy.
6. `composeHandoffPolicies(...)` dispatches to `"*"` when no exact match exists.
7. `composeHandoffPolicies(...)` denies when no exact match and no fallback
   exist.
8. `composeHandoffPolicies(...)` passes through the original policy input.

## Status

Draft. Not implemented.
