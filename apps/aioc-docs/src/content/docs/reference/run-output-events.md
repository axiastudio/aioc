---
title: Run Output Events
description: Stream text deltas while collecting final run output and tool calls.
---

`toRunOutputEvents(...)` adapts a streamed run result into a smaller output-oriented event stream.

Use it when an application needs to:

- stream text deltas to a UI
- receive one final completion event
- inspect final history and paired tool outputs

The low-level `RunStreamEvent` contract remains available through `StreamedRunResult.toStream()`.

## Signature

```ts
toRunOutputEvents(
  result: StreamedRunResult<TContext>,
  options?: {
    emitAgentUpdates?: boolean;
    emitToolCalls?: boolean;
    emitToolOutputs?: boolean;
  },
): AsyncIterable<RunOutputEvent<TContext>>
```

## Default Events

By default, the adapter yields only:

- `text_delta`
- `completed`

```ts
const streamed = await run(agent, input, { stream: true });

for await (const event of toRunOutputEvents(streamed)) {
  if (event.type === "text_delta") {
    response.write(event.delta);
    continue;
  }

  console.log(event.finalOutput);
  console.log(event.toolCalls);
}
```

## `completed`

The final event contains:

```ts
{
  type: "completed";
  finalOutput: string;
  history: AgentInputItem[];
  lastAgent: Agent<TContext>;
  toolCalls: ExtractedToolCall[];
}
```

`history` is a shallow copy of the streamed result history.

`toolCalls` is derived with `extractToolCalls(...)`, so tool calls and tool outputs are paired by `callId`.

## Optional Live Events

Additional live events are opt-in:

```ts
for await (const event of toRunOutputEvents(streamed, {
  emitAgentUpdates: true,
  emitToolCalls: true,
  emitToolOutputs: true,
})) {
  if (event.type === "agent_updated") {
    console.log(event.agent.name);
  }

  if (event.type === "tool_call") {
    console.log(event.item.name);
  }

  if (event.type === "tool_output") {
    console.log(event.output);
  }
}
```

Options only affect live events.

The `completed` event always includes final `toolCalls`.

The initial agent activation is not emitted as `agent_updated`; that live event is reserved for later agent changes.

## Error Behavior

If the underlying stream fails, the error is propagated.

No `completed` event is yielded after a stream error.
