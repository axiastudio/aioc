# RFC-0005: Suspended Proposals and Approval Lifecycle

- Status: Draft
- Date: 2026-03-28
- Owners: aioc maintainers
- Depends on: RFC-0001, RFC-0002, RFC-0003, RFC-0004

## Context

RFC-0004 introduces `require_approval` as a first-class policy outcome, but stops at the policy/runtime boundary.

That is the correct scope for the core decision model, but a host application still needs a deterministic way to:

- capture the exact proposal that was blocked,
- create and track an approval request outside the model loop,
- resume later without giving the LLM unchecked control over whether or how the action is retried.

Without a shared lifecycle model, different host applications will invent incompatible patterns for:

- what exactly is being approved,
- how approval is linked back to a blocked proposal,
- how a resumed execution differs from a fresh model proposal,
- how to audit user-facing thread behavior versus execution behavior.

## Decision

`aioc` defines a canonical `SuspendedProposal` artifact and a minimal approval lifecycle around it.

- The runtime owns the blocked proposal artifact.
- The host application owns approval queues, reviewer workflows, notifications, and conversation UX.
- Approval never directly executes a tool or handoff.
- A granted approval only provides external evidence that can later allow the policy to return `allow`.
- The recommended resume strategy is deterministic replay of the exact suspended proposal.

## Scope

In scope:

- Canonical shape of a blocked proposal (`SuspendedProposal`).
- Minimal lifecycle vocabulary for host applications handling approval-required actions.
- How runtime surfaces a suspended proposal in hard and soft approval-required paths.
- How approval relates to later re-execution without bypassing policy evaluation.

Out of scope:

- Approval queue storage engines and schemas.
- Reviewer identity, signatures, segregation of duties, or organizational approval chains.
- Notification channels and inbox UX.
- Conversation/thread UX (`block`, `fork`, `continue without action`, etc.).
- Automatic execution after approval is granted.

## Terminology

- `suspended proposal`: the exact tool call or handoff proposal blocked by `require_approval`.
- `approval request`: application-side artifact created from a suspended proposal and exposed to human review.
- `approval grant`: application-side evidence that a specific suspended proposal has been approved.
- `resume`: a later execution attempt in which the application presents approval evidence and re-evaluates the suspended proposal through policy code.

## Suspended Proposal Contract

```ts
export interface SuspendedProposalBase {
  timestamp: string;
  runId: string;
  turn: number;
  callId: string;
  agentName: string;
  proposalHash: string;
  reason: string;
  publicReason?: string;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SuspendedToolProposal extends SuspendedProposalBase {
  kind: "tool";
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  argsCanonicalJson: string;
}

export interface SuspendedHandoffProposal extends SuspendedProposalBase {
  kind: "handoff";
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
  payloadCanonicalJson: string;
}

export type SuspendedProposal =
  | SuspendedToolProposal
  | SuspendedHandoffProposal;
```

Normative notes:

- `proposalHash` MUST be stable for the same proposal content across deterministic replays.
- `proposalHash` MUST be derived from canonical proposal content, not from transient identifiers alone.
- `callId` links the artifact to the originating run, but MUST NOT be treated as the replay matching key by itself.
- `expiresAt` is informational and inherited from RFC-0004; runtime MUST NOT auto-execute based on it.

## Runtime Surface

When a policy returns `require_approval`, runtime MUST construct one `SuspendedProposal`.

### Hard Path (`resultMode = "throw"`)

Runtime MUST raise a typed approval-required error that carries:

- the original `PolicyResult`,
- the `SuspendedProposal`.

### Soft Path (`resultMode = "tool_result"`)

Runtime MUST:

- emit the normalized tool result envelope with `status = "approval_required"`,
- preserve the approval-required decision in trace channels,
- persist the corresponding `SuspendedProposal` in the run-level audit artifact when run recording is enabled.

Host applications that need approval workflows in soft mode SHOULD enable at least one durable trace channel, typically run recording.

## Run Record Extension

RFC-0003 is extended with a dedicated collection of suspended proposals:

```ts
export interface RunRecord<TContext = unknown> {
  // existing fields omitted
  suspendedProposals?: SuspendedProposal[];
}
```

`RunRecord.items` remains the execution trajectory artifact.
`suspendedProposals` is the canonical audit artifact for approval-required actions.

Each `require_approval` outcome MUST produce exactly one corresponding `SuspendedProposal` record in the run record when run recording is enabled.

## Minimal Application Lifecycle

Host applications SHOULD model at least the following approval-request states:

- `pending`
- `approved`
- `rejected`
- `expired`
- `dismissed`

Recommended semantics:

- `pending`: approval has been requested and no final decision exists yet.
- `approved`: external approval exists, but no resumed execution has necessarily happened yet.
- `rejected`: approval was explicitly refused by the application-side process.
- `expired`: approval request or grant is no longer valid by application policy.
- `dismissed`: the request was intentionally abandoned, for example because the user chose to continue without that action.

Whether an application also models `consumed`, `revoked`, or other states is out of scope.

## Resume Semantics

Approval does not bypass policy.

The correct sequence is:

1. Runtime blocks a proposal with `require_approval`.
2. The application creates an approval request from the `SuspendedProposal`.
3. A human or external process approves or rejects that request outside the model loop.
4. If approval is granted, the application later initiates a resume attempt.
5. During resume, policy code is evaluated again.
6. Only if policy returns `allow` may runtime execute the tool or perform the handoff.

The application SHOULD resume by replaying the exact suspended proposal.

Re-asking the LLM to generate a new proposal is allowed as an application choice, but is weaker in terms of determinism, auditability, and replay safety. It is therefore NOT RECOMMENDED for high-accountability flows.

## Approval Evidence

This RFC intentionally does not prescribe a single core `ApprovalGrant` type.

Approval evidence remains application-owned and may be provided to policy code through host-defined context, metadata, or other deterministic inputs.

What matters normatively is:

- approval evidence MUST be external to the model,
- approval evidence MUST be bound to a specific suspended proposal,
- policy code MUST remain the only enforcement point that converts `require_approval` into `allow`.

## Thread and UX Independence

The conversation thread and the suspended proposal are distinct concerns.

Applications MAY choose to:

- keep the conversation waiting,
- allow the user to continue on the same thread,
- fork the conversation,
- dismiss the blocked request and continue,
- notify the user later and offer an explicit resume action.

These UX choices do not change the execution contract:

- the suspended proposal remains the canonical object under approval,
- approval does not itself execute anything,
- resumed execution must still pass policy evaluation.

## Security and Privacy Notes

- `SuspendedProposal` may contain sensitive arguments or payloads; host applications MUST treat it as audit data, not as public UI data.
- `publicReason` remains the only user/model-safe explanation channel by default.
- Applications SHOULD avoid duplicating suspended proposal payloads into multiple stores unless required by workflow design.
- Approval lifecycle artifacts should preserve the minimum data required to identify and review the blocked action.

## Minimal Test Matrix

1. Tool approval-required hard path produces a typed error with one `SuspendedProposal`.
2. Handoff approval-required hard path produces a typed error with one `SuspendedProposal`.
3. Soft approval-required tool path records one `SuspendedProposal` when run recording is enabled.
4. Soft approval-required handoff path records one `SuspendedProposal` when run recording is enabled.
5. `proposalHash` remains stable for deterministic replay of the same proposal.
6. Resume without valid external approval evidence remains blocked by policy.
7. Approval evidence can allow policy to return `allow`, but does not bypass reevaluation.
8. Multiple approval-required events in the same run produce distinct suspended proposals.

## Adoption Plan

1. Add `SuspendedProposal` contract and stable proposal hashing helpers.
2. Extend approval-required typed errors to carry `SuspendedProposal`.
3. Extend run recording to persist `suspendedProposals`.
4. Add deterministic replay tests for approval-required flows.
5. Document one end-to-end example with application-side approval request handling.

## Implementation Status

- `aioc` does not yet expose `SuspendedProposal` as a first-class artifact.
- Approval-required typed errors are not yet implemented.
- Run records do not yet persist suspended proposals.
- Approval queues, grants, and notifications remain application-side by design.
