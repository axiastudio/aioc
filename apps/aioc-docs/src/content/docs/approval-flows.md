---
title: Approval Flows
description: How approval-required actions move from blocked proposal to policy reevaluation.
---

`require_approval` blocks execution, but it does not define an approval product.

`aioc` gives you the runtime contract:

- a typed approval-required outcome
- a canonical `SuspendedProposal`
- a stable `proposalHash`
- helper functions for request seeding and grant projection

Your application still owns:

- approval requests
- reviewer workflow
- notifications
- thread UX
- resume actions

## What Gets Blocked

When the model proposes a tool call or a handoff:

1. runtime evaluates policy
2. policy returns `require_approval`
3. runtime does **not** execute the tool or transition the handoff
4. runtime constructs a `SuspendedProposal`

That proposal contains:

- the operational proposal itself
- canonical arguments or payload
- `proposalHash`
- policy-facing metadata such as `reason`, `publicReason`, `policyVersion`, and `expiresAt`

`proposalHash` identifies the proposal, not the approval workflow.

## What The App Stores

The host application should create its own approval request from the `SuspendedProposal`.

`createApprovalRequestSeed(...)` extracts the minimum stable data needed to
start that application-owned approval request:

```ts
const approvalRequest = createApprovalRequestSeed(suspendedProposal);
```

The most important binding key is:

- `proposalHash`

The rest is application-specific:

- request status (`pending`, `approved`, `rejected`, `expired`, `dismissed`)
- reviewer identity
- timestamps
- business justification
- notification state

`aioc` does not prescribe this storage model.

`ApprovalRequestSeed` is intentionally not a storage schema. Treat it as the
stable seed for your own approval-request record.

## How Approval Evidence Re-Enters Policy

The usual pattern is:

1. the application stores approval externally
2. later it makes that approval evidence available to the next `run(...)`
3. policy checks whether the current `proposalHash` is approved
4. policy returns `allow` or `require_approval`

Minimal example:

```ts
const grants = loadApprovalGrantsForThread(threadId);

const context = {
  approvedProposalHashes: toApprovedProposalHashes(grants),
};

type ApprovalEvidenceContext = {
  approvedProposalHashes: string[];
};

const toolPolicy: ToolPolicy<ApprovalEvidenceContext> = ({
  proposalHash,
  runContext,
}) => {
  if (runContext.context.approvedProposalHashes.includes(proposalHash)) {
    return allow("approval_granted");
  }

  return requireApproval("approval_export_report", {
    publicReason: "Export requires explicit approval.",
  });
};
```

Applications that need reviewer or workflow metadata can pass richer evidence
instead:

```ts
const context = {
  activeApprovalGrants: toActiveApprovalGrantMap(grants),
};
```

The policy still decides what the grant means.

This is why `ToolPolicyInput` and `HandoffPolicyInput` expose:

- `proposalHash`
- canonical payload (`argsCanonicalJson` or `payloadCanonicalJson`)

The policy should not need to reimplement fingerprint logic.

## Why Policy Remains The Enforcement Point

Approval does not execute anything by itself.

The sequence is:

1. proposal is blocked
2. app records approval externally
3. app starts a new run with approval evidence in `context`
4. policy evaluates again
5. only `allow` permits execution

This matters because a stored approval may still be insufficient:

- wrong proposal hash
- expired grant
- revoked grant
- additional contextual deny conditions

If the runtime converted `approved hash => allow` by itself, it would be taking governance decisions away from the application.

## Tool Policy vs Handoff Policy

- `ToolPolicy` governs capability execution
- `HandoffPolicy` governs transfer of control between agents

The approval pattern is the same in both cases:

- runtime blocks a proposal
- app stores approval externally
- policy reevaluates using `proposalHash`

## Privacy Note

If approval evidence is passed through `context`, remember that `record.contextSnapshot` may persist it in `RunRecord`.

If that data is sensitive, use:

- `record.contextRedactor`

to avoid storing approval details in clear text.

## Example

See:

- `npm run example:approval-evidence`
- `src/examples/basic/approval-evidence.ts`
