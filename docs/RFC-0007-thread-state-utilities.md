# RFC-0007: Thread History Utilities

- Status: Accepted
- Date: 2026-04-03
- Owners: aioc maintainers
- Depends on: RFC-0005

## Context

`aioc` keeps the core runtime intentionally small:

- `run(...)` accepts a string or `AgentInputItem[]`,
- `RunResult.history` returns the updated execution history,
- approval lifecycle, thread persistence, session lifecycle, and resume UX remain application-owned.

That boundary is correct, but it leaves host applications to repeatedly write the same low-value history-handling glue:

- normalize a user message into the next run input,
- append a previous history safely before the next prompt,
- derive an updated thread state from the latest run result,
- keep application-side thread state aligned with `RunResult.history`.

This repeated code is not policy logic and not product differentiation. It also makes example and demo code noisier than necessary.

## Decision

`aioc` should add a small set of optional thread-history utilities.

These utilities are not a session framework, thread store, or approval-resume mechanism, and do not give the runtime ownership of application threads.

The goals are:

- reduce boilerplate around `AgentInputItem[]` handling,
- make multi-turn input construction and history replacement easier to do correctly,
- keep host applications in control of persistence, UX, approval workflows, and resume behavior,
- avoid introducing a built-in thread store, session middleware, or conversation engine.

## Scope

In scope:

- pure helpers around `AgentInputItem[]`,
- helpers for user-message append,
- helpers for projecting `RunResult.history` back into application-owned thread state,
- generic history-replacement helpers that preserve application-owned thread metadata.

Out of scope:

- persistence adapters,
- built-in thread IDs or thread stores,
- history compaction, summarization, editing, branching, or fork semantics,
- retention, classification, legal-hold, or erase-request metadata,
- notification state,
- approval queues, reviewer workflow, or deterministic resume helpers,
- automatic resume execution,
- replay of `SuspendedProposal`,
- session stores,
- server-side session lifecycle.

## Design Principles

1. Thread state remains application-owned.
2. Utilities operate on plain `AgentInputItem[]`.
3. Utilities must be pure and deterministic.
4. Utilities must not assume a storage model.
5. Utilities may compose with approval-oriented flows, but must not define approval or resume semantics.
6. Utilities should make the common case smaller, not replace explicit control.
7. History utilities must not be presented as a substitute for a session API.

## Proposed Helpers

### Normalize Thread Input

```ts
export function toThreadHistory(
  input: string | AgentInputItem[],
): AgentInputItem[];
```

This helper mirrors the normalization contract of `run(...)` and returns a safe history array.

### Append User Message

```ts
export function appendUserMessage(
  history: readonly AgentInputItem[],
  content: string,
): AgentInputItem[];
```

This helper supports the common pattern:

- keep the existing thread history,
- append one new user message,
- pass the result into the next `run(...)`.

### Replace Thread History

```ts
export function replaceThreadHistory<
  TThread extends { history: AgentInputItem[] },
>(
  thread: TThread,
  history: readonly AgentInputItem[],
): TThread;
```

This helper supports the common application pattern:

- keep thread metadata outside `aioc`,
- replace the stored history immutably,
- preserve all non-history fields owned by the application.

### Apply Run Result History

```ts
export function applyRunResultHistory<
  TContext,
  TThread extends { history: AgentInputItem[] },
>(
  thread: TThread,
  result: Pick<RunResult<TContext>, "history">,
): TThread;
```

This helper is a small convenience wrapper around the common case:

- take an application-owned thread object,
- replace its `history` with `result.history`,
- return a new thread object with the rest of the application metadata preserved.

The helper only requires a `history` field, so it can be used with non-streaming `RunResult` values and with streaming result objects after their stream has been consumed.

## Recommended Usage Pattern

1. The application loads its current thread state.
2. It builds the next input with `appendUserMessage(...)`.
3. It calls `run(...)` with that full input.
4. It applies `result.history` back into its own thread state with `applyRunResultHistory(...)`.
5. It persists the updated thread state using its own storage model.

## Example

```ts
const thread = loadThread(threadId);

const input = appendUserMessage(
  thread.history,
  "Summarize the latest vendor payments report in one paragraph.",
);

const result = await run(agent, input);

const nextThread = applyRunResultHistory(thread, result);
saveThread(threadId, nextThread);
```

## Relation To Approval Resume

These helpers may be used by applications that also implement approval workflows, but they do not define how an approved suspended proposal is resumed.

Deterministic resume of a previously blocked tool call or handoff remains a separate concern. Applications that need high-accountability approval flows should treat the suspended proposal as the canonical execution artifact and use a dedicated resume mechanism rather than model a resume as a new user message.

## Why This Stays Outside The Runtime Core

The runtime should continue to treat thread state as input and output, not as an owned lifecycle.

That preserves the right architectural split:

- runtime owns execution,
- applications own persistence, session lifecycle, approval resume, UX, and workflow,
- utilities reduce boilerplate around history arrays without turning `aioc` into a session framework.

## Security and Privacy Notes

- Thread history may contain user prompts, tool outputs, and approval-related messages.
- These helpers must not add or derive extra content beyond what the application already provides.
- Applications remain responsible for retention, redaction, and storage protection of thread history.

## Alternatives Considered

### 1. Keep thread handling entirely application-specific

Rejected because the repeated logic is simple, common, and not a place where most applications should differ.

### 2. Introduce a built-in thread store

Rejected because that would move `aioc` toward an application framework and force storage and lifecycle assumptions that do not belong in the core runtime.

### 3. Add resume semantics directly to `run(...)`

Rejected because resume UX, deterministic replay, and thread lifecycle remain application concerns, not runtime concerns.

## Implementation Notes

This RFC should be implemented as optional pure helpers in a dedicated module.

A likely initial surface is:

- `src/thread-history.ts`
- exported from `src/index.ts`

These helpers should not require changes to `run.ts`.

## Minimal Test Matrix

1. `toThreadHistory(...)` returns a cloned history array for array input.
2. `toThreadHistory(...)` converts string input into a single user message.
3. `appendUserMessage(...)` appends exactly one user message without mutating the original history.
4. `replaceThreadHistory(...)` replaces stored history without mutating the original thread object.
5. `applyRunResultHistory(...)` replaces stored history with `result.history`.
6. `applyRunResultHistory(...)` preserves non-history application metadata.

## Non-Goals

This RFC does not standardize:

- thread identifiers,
- persistence schemas,
- history compaction or summarization,
- branch/fork/merge semantics for conversation state,
- approval request states,
- notification workflows,
- deterministic replay or resume of suspended proposals,
- background resume jobs,
- session middleware.

Those concerns remain application-owned.

## Status

Accepted. Implemented in `src/thread-history.ts`.
