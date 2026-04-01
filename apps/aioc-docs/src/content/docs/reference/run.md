---
title: run(...)
description: The main runtime entrypoint for executing an agent turn loop.
---

`run(...)` is the main execution entrypoint.

## Signatures

```ts
run(agent, input, { stream: true, ...options }): Promise<StreamedRunResult<TContext>>

run(agent, input, options?): Promise<RunResult<TContext>>
```

Where:

- `agent` is the starting `Agent`
- `input` is either `string` or `AgentInputItem[]`
- `stream` defaults to `false`

## Non-streaming Result

```ts
type RunResult<TContext> = {
  finalOutput: string;
  history: AgentInputItem[];
  lastAgent: Agent<TContext>;
}
```

## Streaming Result

When `stream: true`, `run(...)` returns `StreamedRunResult<TContext>`.

The important API is:

```ts
result.toStream(): AsyncIterable<RunStreamEvent<TContext>>
```

The stream can be consumed only once.

`StreamedRunResult` also exposes:

- `history`
- `lastAgent`

## Options

The current shared option surface is:

```ts
{
  context?: TContext;
  maxTurns?: number;
  logger?: RunLogger;
  policies?: PolicyConfiguration<TContext>;
  record?: RunRecordOptions<TContext>;
}
```

## Important Operational Notes

### Default provider

`run(...)` uses the configured default provider.

If no default provider has been set, runtime execution fails.

### Model requirement

The active agent must have `model` configured.

### Default max turns

If omitted, `maxTurns` defaults to `10`.

### Input normalization

If `input` is a string, it is normalized to a single user message item.

### Runtime logging

If `logger` is configured, `run(...)` emits structured runtime events during execution.

See [`Logging`](../reference/logger/).

## Example

```ts
const result = await run(agent, "Summarize report Q1.", {
  context: { actor: { groups: ["finance"] } },
  policies: { toolPolicy },
  record: {
    includePromptText: true,
    sink: (record) => records.push(record),
  },
});

console.log(result.finalOutput);
```
