---
title: Thread History Utilities
description: Small helpers for application-owned conversation history.
---

Thread history utilities reduce boilerplate around `AgentInputItem[]`.

They do not add a session store, persistence layer, or conversation engine.

The application still owns:

- thread identifiers
- persistence
- retention
- approval resume UX
- session lifecycle

`aioc` only helps build and replace the history array passed to `run(...)`.

## `toThreadHistory(...)`

```ts
toThreadHistory(input: string | readonly AgentInputItem[]): AgentInputItem[]
```

Normalizes input using the same public shape accepted by `run(...)`.

```ts
const history = toThreadHistory("Summarize the report.");
```

String input becomes one user message.

Array input is shallow-cloned.

## `appendUserMessage(...)`

```ts
appendUserMessage(
  history: readonly AgentInputItem[],
  content: string,
): AgentInputItem[]
```

Returns a new history array with one user message appended.

```ts
const input = appendUserMessage(thread.history, request.message);
const result = await run(agent, input);
```

The original history array is not mutated.

## `replaceThreadHistory(...)`

```ts
replaceThreadHistory<TThread extends { history: AgentInputItem[] }>(
  thread: TThread,
  history: readonly AgentInputItem[],
): TThread
```

Returns a new thread object with `history` replaced and other application-owned fields preserved.

```ts
const nextThread = replaceThreadHistory(thread, result.history);
```

## `applyRunResultHistory(...)`

```ts
applyRunResultHistory<TContext, TThread extends { history: AgentInputItem[] }>(
  thread: TThread,
  result: Pick<RunResult<TContext>, "history">,
): TThread
```

Convenience wrapper for the common pattern of saving the latest run history back into application-owned thread state.

```ts
const input = appendUserMessage(thread.history, request.message);
const result = await run(agent, input);
const nextThread = applyRunResultHistory(thread, result);
```

The helper only requires a `history` field on the result-like object, so it can also be used after consuming a streaming run result.

## Recommended Pattern

```ts
const thread = await loadThread(threadId);

const input = appendUserMessage(thread.history, request.message);
const result = await run(agent, input, { context });

const nextThread = applyRunResultHistory(thread, result);
await saveThread(nextThread);
```

This keeps the boundary explicit:

- application owns thread state and persistence
- `aioc` owns execution history returned by `run(...)`
- helpers remove low-value array glue without hiding the lifecycle
