---
title: Approval Evidence Helpers
description: Application-side helpers for approval request seeds and grant projection.
---

Approval evidence helpers reduce boilerplate around approval-required flows.

They do not add an approval workflow engine, queue, store, or automatic resume
behavior.

The application still owns:

- approval request persistence
- reviewer workflow
- grant lifecycle
- resume UX
- policy-specific authorization logic

`aioc` only standardizes small data transformations around
`SuspendedProposal`, `ApprovalGrant`, and `proposalHash`.

## Types

```ts
type ApprovalGrant = {
  proposalHash: string;
  approvedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  metadata?: Record<string, unknown>;
};
```

`ApprovalGrant` is application-side evidence that a specific suspended proposal
was approved.

Runtime does not consume grants directly. Policy code decides how to interpret
them.

```ts
type ApprovalRequestSeed = {
  proposalHash: string;
  kind: "tool" | "handoff";
  reason: string;
  publicReason?: string;
  policyVersion?: string;
  expiresAt?: string;
  resourceName: string;
  canonicalPayloadJson: string;
};
```

`ApprovalRequestSeed` is a compact starting point for the application approval
request record.

It is not a storage schema.

## `createApprovalRequestSeed(...)`

```ts
createApprovalRequestSeed(proposal: SuspendedProposal): ApprovalRequestSeed
```

Builds an approval-request seed from the `SuspendedProposal` carried by an
approval-required error or stored in a `RunRecord`.

For tool proposals:

- `resourceName` is the tool name
- `canonicalPayloadJson` is `argsCanonicalJson`

For handoff proposals:

- `resourceName` is the target agent name
- `canonicalPayloadJson` is `payloadCanonicalJson`

```ts
try {
  await run(agent, input, { context, policies });
} catch (error) {
  if (!(error instanceof ToolCallApprovalRequiredError)) {
    throw error;
  }

  const approvalRequest = createApprovalRequestSeed(
    error.result.suspendedProposal,
  );

  await approvalQueue.save(approvalRequest);
}
```

## `isApprovalGrantActive(...)`

```ts
isApprovalGrantActive(grant: ApprovalGrant, now?: string): boolean
```

Returns `false` when:

- `revokedAt` is present
- `expiresAt` is present and earlier than `now`

Otherwise returns `true`.

If `now` is omitted, the helper uses the current time.

## `findActiveApprovalGrant(...)`

```ts
findActiveApprovalGrant(
  proposalHash: string,
  grants: readonly ApprovalGrant[],
  now?: string,
): ApprovalGrant | null
```

Finds an active grant for a proposal hash.

If multiple active grants exist for the same proposal, the one with the most
recent `approvedAt` wins.

```ts
const grant = findActiveApprovalGrant(proposalHash, grants);

if (grant) {
  return allow("approval_granted");
}
```

## `toApprovedProposalHashes(...)`

```ts
toApprovedProposalHashes(
  grants: readonly ApprovalGrant[],
  now?: string,
): string[]
```

Projects active grants into the simplest policy-friendly context shape.

```ts
const context = {
  approvedProposalHashes: toApprovedProposalHashes(grants),
};
```

Policy code can then remain explicit:

```ts
const toolPolicy: ToolPolicy<typeof context> = ({
  proposalHash,
  runContext,
}) => {
  if (runContext.context.approvedProposalHashes.includes(proposalHash)) {
    return allow("approval_granted");
  }

  return requireApproval("approval_export_report", {
    resultMode: "tool_result",
    publicReason: "Export requires explicit approval.",
  });
};
```

## `toActiveApprovalGrantMap(...)`

```ts
toActiveApprovalGrantMap(
  grants: readonly ApprovalGrant[],
  now?: string,
): Record<string, ApprovalGrant>
```

Projects active grants into a map keyed by `proposalHash`.

Use this when policy code needs grant metadata, for example reviewer or
workflow information.

```ts
const context = {
  activeApprovalGrants: toActiveApprovalGrantMap(grants),
};

const grant = context.activeApprovalGrants[proposalHash];
```

## Enforcement Boundary

Approval grants do not execute tools or handoffs.

The boundary remains:

```text
ApprovalGrant -> policy reevaluation -> allow | deny | require_approval
```

This keeps approval evidence inside the deterministic policy path instead of
turning it into a runtime bypass.
