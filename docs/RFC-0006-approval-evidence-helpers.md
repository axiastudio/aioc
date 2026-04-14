# RFC-0006: Approval Evidence Helpers

- Status: Draft
- Date: 2026-04-03
- Owners: aioc maintainers
- Depends on: RFC-0003, RFC-0004, RFC-0005

## Context

RFC-0004 and RFC-0005 establish the core approval model:

- policy code can return `require_approval`,
- runtime surfaces a canonical `SuspendedProposal`,
- host applications own approval queues, reviewer workflow, and resume UX,
- approval evidence must re-enter policy evaluation deterministically.

That split is correct, but it leaves a repeated layer of application glue code that most host applications will otherwise reinvent:

- converting `SuspendedProposal` into an approval-request seed,
- matching approval evidence to `proposalHash`,
- filtering expired or revoked grants,
- projecting grants into a context shape that policy code can consume.

This repeated code is not where applications should differentiate. It is also easy to implement inconsistently, which weakens auditability and makes approval-aware policy examples look more complex than they need to be.

## Decision

`aioc` should add a small set of optional application-side approval helpers.

These helpers are not a workflow engine and do not move approval lifecycle ownership into the core runtime.

This RFC intentionally covers only the approval-evidence slice of the broader approval story.

It is not the full Approval Workflow Kit. Deterministic resume helpers, timeout/escalation behavior, queue adapters, and reference workflow UI remain follow-up concerns.

The design goals are:

- reduce boilerplate around approval evidence,
- keep `proposalHash` as the canonical matching key,
- preserve application ownership of storage, workflow, and UI,
- keep policy code as the only enforcement point that can turn approval evidence into `allow`.

## Scope

In scope:

- minimal helper types for approval grants and request seeding,
- helper functions for matching approval evidence by `proposalHash`,
- helper functions for filtering invalid grants,
- helper functions that produce policy-friendly approval evidence projections.

Out of scope:

- approval queue storage schemas,
- reviewer identity modeling,
- signatures, segregation of duties, or organizational escalation chains,
- deterministic or idempotent resume orchestration,
- automatic execution after approval,
- timeout, escalation, or SLA-clock behavior,
- built-in HTTP APIs, inboxes, persistence adapters, or queue adapters,
- workflow UI or approval triage screens,
- thread state utilities beyond what is strictly needed to shape approval evidence.

## Design Principles

1. Approval remains application-owned.
2. Runtime remains unaware of queue state, reviewer workflow, and grant persistence.
3. `proposalHash` remains the canonical binding key.
4. Policy code remains the only enforcement point.
5. Helpers must be pure and composable.
6. Helpers must not force a single application context shape.
7. Helpers should standardize the evidence layer without pre-committing a workflow engine design.

## Proposed Contracts

### Approval Grant

```ts
export interface ApprovalGrant {
  proposalHash: string;
  approvedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  metadata?: Record<string, unknown>;
}
```

Notes:

- `proposalHash` MUST identify the exact suspended proposal being approved.
- `approvedAt` SHOULD be an RFC 3339 timestamp string.
- `approvedAt` is application audit data; when projection helpers need a stable winner across multiple active grants for the same `proposalHash`, the most recent `approvedAt` SHOULD win.
- `expiresAt` and `revokedAt` are optional application-level constraints.
- `ApprovalGrant.expiresAt` is distinct from policy-level expiry metadata carried on `SuspendedProposal` and `ApprovalRequestSeed`; one governs grant validity, the other records policy-side intent.
- Runtime does not consume `ApprovalGrant` directly; these helpers are application-facing.

### Approval Request Seed

```ts
export interface ApprovalRequestSeed {
  proposalHash: string;
  kind: "tool" | "handoff";
  reason: string;
  publicReason?: string;
  policyVersion?: string;
  expiresAt?: string;
  resourceName: string;
  canonicalPayloadJson: string;
}
```

Notes:

- `ApprovalRequestSeed` is not a storage schema.
- It is the smallest normalized artifact that an application can use to create its own approval request record.
- `resourceName` is `toolName` for tool proposals and `toAgentName` for handoff proposals.
- `canonicalPayloadJson` is `argsCanonicalJson` for tools and `payloadCanonicalJson` for handoffs.
- `ApprovalRequestSeed` is not a replay artifact; deterministic resume remains defined outside this RFC.

## Proposed Helpers

### Request Seeding

```ts
export function createApprovalRequestSeed(
  proposal: SuspendedProposal,
): ApprovalRequestSeed;
```

This helper extracts a stable, application-usable seed from a `SuspendedProposal` without forcing a queue model.

### Grant Validation

```ts
export function isApprovalGrantActive(
  grant: ApprovalGrant,
  now?: string,
): boolean;
```

Semantics:

- returns `false` if `revokedAt` is present,
- returns `false` if `expiresAt` is present and is earlier than `now`,
- otherwise returns `true`.

### Grant Lookup

```ts
export function findActiveApprovalGrant(
  proposalHash: string,
  grants: ApprovalGrant[],
  now?: string,
): ApprovalGrant | null;
```

This helper performs the canonical lookup by `proposalHash` and applies the activity check.

### Policy-Friendly Projection

```ts
export function toApprovedProposalHashes(
  grants: ApprovalGrant[],
  now?: string,
): string[];
```

This helper supports the simplest policy pattern:

```ts
if (runContext.context.approvedProposalHashes.includes(proposalHash)) {
  return allow("approval_granted");
}
```

It deliberately does not force applications to use that pattern. Applications may instead pass full grants or grant maps into context.

### Grant Map Projection

```ts
export function toActiveApprovalGrantMap(
  grants: ApprovalGrant[],
  now?: string,
): Record<string, ApprovalGrant>;
```

This helper supports policy or orchestration glue that needs more than a boolean approval signal, for example reviewer or workflow metadata carried in `ApprovalGrant.metadata`.

Semantics:

- includes only active grants,
- keys the result by `proposalHash`,
- if multiple active grants exist for the same `proposalHash`, the grant with the most recent `approvedAt` wins.

## Recommended Usage Pattern

1. Runtime blocks a proposal with `require_approval`.
2. The application reads `SuspendedProposal` from the error or `RunRecord`.
3. The application calls `createApprovalRequestSeed(...)`.
4. The application stores its own approval request record.
5. A reviewer approves that request, producing an application-side `ApprovalGrant`.
6. Before resume, the application projects active grants into a policy-friendly context value.
7. Policy code evaluates the proposal again and decides `allow` or `require_approval`.

## Example

```ts
const grants = loadApprovalGrantsForThread(threadId);

const context = {
  approvedProposalHashes: toApprovedProposalHashes(grants),
};

const toolPolicy: ToolPolicy<typeof context> = ({ proposalHash, runContext }) => {
  if (runContext.context.approvedProposalHashes.includes(proposalHash)) {
    return allow("approval_granted", {
      policyVersion: "finance-export-policy.v1",
    });
  }

  return requireApproval("approval_export_report", {
    resultMode: "tool_result",
    publicReason: "Sensitive report exports require explicit approval.",
    policyVersion: "finance-export-policy.v1",
  });
};
```

Applications that need richer metadata can pass `toActiveApprovalGrantMap(grants)` into context instead of, or alongside, `toApprovedProposalHashes(grants)`.

## Relation To Broader Approval Work

This RFC standardizes the evidence layer only.

Follow-up RFCs may build on top of it to cover:

- deterministic resume helpers,
- timeout or escalation contracts,
- queue adapters,
- reference workflow UX.

## Security and Privacy Notes

- `ApprovalGrant.metadata` may contain reviewer or workflow information; applications should treat it as audit data, not model-visible data.
- `ApprovalRequestSeed` is derived from `SuspendedProposal`, which may be sensitive.
- Helpers should remain data-minimizing and avoid duplicating proposal payloads beyond what is necessary for application-owned workflow.
- These helpers must not encourage applications to pass unnecessary approval data into `runContext.context`.

## Alternatives Considered

### 1. Keep all approval glue entirely application-specific

Rejected because it keeps the core boundary pure but leaves repeated, low-value boilerplate in every serious host application.

### 2. Introduce a built-in approval queue or approval store

Rejected because that would move `aioc` too far toward an application framework and would force workflow assumptions that do not belong in the core runtime.

### 3. Let runtime auto-consume approval grants

Rejected because it would break the governance model. Approval evidence must still flow through policy code, not around it.

## Implementation Notes

This RFC should be implemented as optional pure helpers in a dedicated module.

A likely initial surface is:

- `src/approval-helpers.ts`
- exported from `src/index.ts`

The helpers should not require changes to `run.ts` or provider abstractions.

## Minimal Test Matrix

1. `createApprovalRequestSeed(...)` produces the correct seed for a suspended tool proposal.
2. `createApprovalRequestSeed(...)` produces the correct seed for a suspended handoff proposal.
3. `isApprovalGrantActive(...)` returns `false` for revoked grants.
4. `isApprovalGrantActive(...)` returns `false` for expired grants.
5. `findActiveApprovalGrant(...)` returns the correct active grant by `proposalHash`.
6. `toApprovedProposalHashes(...)` excludes expired or revoked grants.
7. `toActiveApprovalGrantMap(...)` excludes inactive grants and indexes active grants by `proposalHash`.
8. `toActiveApprovalGrantMap(...)` prefers the most recent `approvedAt` when multiple active grants share a `proposalHash`.

## Non-Goals

This RFC does not standardize:

- approval request IDs,
- reviewer principals,
- queue states,
- thread persistence,
- resume APIs,
- timeout or escalation mechanics,
- queue adapters,
- workflow UI.

Those concerns remain application-owned.

## Status

Draft. Not implemented.
