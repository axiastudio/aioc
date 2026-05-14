# RFC-0008: Run Output Stream Adapter

- Status: Draft
- Date: 2026-05-11
- Owners: aioc maintainers

## Context

`run(..., { stream: true })` exposes a public `RunStreamEvent` union.

That low-level contract is intentionally explicit and should remain available to advanced consumers.

However, many host applications have a more specific and common need:

- stream text deltas to a UI while the model is responding,
- keep the final assistant message,
- access the final run history,
- access paired tool calls and tool outputs after the run completes,
- persist the last active agent.

Those applications often do not need to process tool outputs live while deltas are still being emitted. They need the tool outputs after completion, usually to derive application metadata such as references, citations, audit summaries, or persistence records.

The common pattern is therefore not a generic event callback problem. It is a run-output adaptation problem:

- deltas are useful during the stream,
- final output and tool outputs are useful at completion.

Callback-based stream consumers also do not compose well with application APIs implemented as async generators, because `yield` must happen in the generator body rather than inside callback handlers.

## Decision

`aioc` should add a small optional adapter for streamed run results.

The adapter should consume a `StreamedRunResult<TContext>` and produce a simpler async iterable:

- `text_delta` events during the run,
- one final `completed` event containing final output, history, last agent, and paired tool calls.

By default, the adapter should emit only:

- `text_delta`,
- `completed`.

Additional live events may be enabled explicitly for applications that need them.

This adapter should sit above `RunStreamEvent` and should not replace the low-level stream contract.

The goals are:

- support UI streaming without forcing applications to branch on low-level event strings,
- expose final run data in one completion event,
- preserve access to tool outputs after completion,
- keep the default event stream small,
- allow opt-in live events for agent updates, tool calls, or tool outputs,
- preserve streaming order for deltas,
- preserve the one-shot nature of `StreamedRunResult.toStream()`,
- keep raw stream events available for advanced consumers.

## Scope

In scope:

- consuming a `StreamedRunResult<TContext>`,
- yielding text deltas while streaming,
- tracking the final assistant message,
- exposing `history` and `lastAgent` after stream completion,
- exposing paired tool calls and tool outputs after stream completion,
- optionally yielding live agent updates,
- optionally yielding live tool calls and tool outputs,
- preserving provider neutrality.

Out of scope:

- transport adapters for HTTP, SSE, WebSocket, or framework-specific APIs,
- retry semantics,
- resumable streaming,
- event persistence,
- frontend rendering primitives,
- a fully lossless replacement for `RunStreamEvent`,
- replacement of the public `RunStreamEvent` union.

## Proposed Helper

```ts
export type RunOutputEvent<TContext = unknown> =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "completed";
      finalOutput: string;
      history: AgentInputItem[];
      lastAgent: Agent<TContext>;
      toolCalls: ExtractedToolCall[];
    }
  | {
      type: "agent_updated";
      agent: Agent<TContext>;
    }
  | {
      type: "tool_call";
      item: ToolCallItem;
    }
  | {
      type: "tool_output";
      item: ToolCallOutputItem;
      output: unknown;
      toolCall?: ToolCallItem;
    };

export async function* toRunOutputEvents<TContext = unknown>(
  result: StreamedRunResult<TContext>,
  options?: {
    emitAgentUpdates?: boolean;
    emitToolCalls?: boolean;
    emitToolOutputs?: boolean;
  },
): AsyncIterable<RunOutputEvent<TContext>>;
```

`ExtractedToolCall` is the existing run-record utility shape produced by `extractToolCalls(...)`.

This keeps `tool_call_item` and `tool_call_output_item` pairing inside `aioc`, where the runtime history contract is known.

## Semantics

- The helper consumes `result.toStream()` exactly once.
- A `text_delta` event is yielded for each `raw_model_stream_event.data.delta` when present.
- By default, only `text_delta` and `completed` events are yielded.
- An `agent_updated` event is yielded when the active agent changes only if `emitAgentUpdates` is `true`.
- A `tool_call` event is yielded for live tool calls only if `emitToolCalls` is `true`.
- A `tool_output` event is yielded for live tool outputs only if `emitToolOutputs` is `true`.
- Live `tool_output` events include the matching `tool_call` item when it has already been observed in the stream.
- The final assistant message is read from `message_output_item`.
- After the underlying stream completes, the helper yields exactly one `completed` event.
- `completed.finalOutput` is the final assistant message content, or an empty string if no final message was emitted.
- `completed.history` is `result.history`.
- `completed.lastAgent` is `result.lastAgent`.
- `completed.toolCalls` is computed from `result.history` with `extractToolCalls(result.history)`.
- Tool outputs are not discarded; they remain available through `completed.toolCalls[].output` even when `emitToolOutputs` is not enabled.
- Options affect only additional live events. They do not change the content of `completed`.
- Errors from the underlying stream are propagated.

## Example

```ts
const streamed = await run(agent, input, { stream: true });

for await (const event of toRunOutputEvents(streamed)) {
  if (event.type === "text_delta") {
    yield new TextDelta({ delta: event.delta });
    continue;
  }

  if (event.type === "completed") {
    yield new TextResponse({ text: event.finalOutput });

    const ragOutput = event.toolCalls.find(
      (call) => call.name === "find_chunks" && call.hasOutput,
    );

    const references = buildReferences(ragOutput?.output, event.finalOutput);

    if (references.length > 0) {
      yield { references };
    }

    yield {
      items: event.history,
      agent: event.lastAgent,
    };
  }
}
```

## Optional Live Events

Applications that need live telemetry or progress can opt into additional events without changing the default stream shape.

```ts
for await (const event of toRunOutputEvents(streamed, {
  emitAgentUpdates: true,
  emitToolCalls: true,
  emitToolOutputs: true,
})) {
  if (event.type === "agent_updated") {
    logger.info({ agent: event.agent.name }, "Agent updated");
  }

  if (event.type === "tool_call") {
    logger.info({ tool: event.item.name }, "Tool called");
  }

  if (event.type === "tool_output") {
    logger.info({ callId: event.item.callId }, "Tool output received");
  }
}
```

These live events are convenience signals.

The authoritative completed view remains `completed.toolCalls`, because it is derived from the final run history and includes paired tool call/output information.

## Relation To Tool Outputs And References

Applications that stream answer text often do not need structured tool outputs until the answer is complete.

For example, a retrieval tool may return chunks to the model. The model may emit inline citation markers such as `[1]` and `[2]` during the text stream. The application can then resolve those markers into structured references after completion by combining:

- `completed.finalOutput`,
- `completed.toolCalls[].output`.

This preserves the live text stream while avoiding live coupling to every tool-output event.

Applications that need live tool progress or live tool-output handling can still consume `result.toStream()` directly.

Applications that only need lightweight live progress can enable `emitToolCalls` or `emitToolOutputs`.

## Relation To RFC-0007

RFC-0007 covers thread history utilities.

This RFC covers streamed run output adaptation.

The two utilities may be used together, but they solve different problems:

- RFC-0007 reduces boilerplate around application-owned conversation state,
- RFC-0008 reduces boilerplate around UI streaming and final output collection.

## Security and Privacy Notes

- Streamed output, tool arguments, tool outputs, and history may contain sensitive data.
- The helper must not redact, persist, or transform sensitive data.
- Applications remain responsible for transport security, persistence, redaction, and access control.
- Tool outputs exposed in `completed.toolCalls` should be treated as application-sensitive data.

## Alternatives Considered

### Callback-based stream consumer

This was the first shape considered.

It is not the primary API because callbacks do not compose well with async-generator APIs that need to `yield` application events.

It may still be useful later as a convenience wrapper around `toRunOutputEvents(...)`.

### Text-only stream adapter

This would keep the API very small, but it would hide tool outputs that applications often need after completion for references, citations, audit metadata, or persistence.

### Always emit every normalized live item

This would preserve more live detail, but it makes the default adapter noisy and mostly renames low-level branches without materially reducing application code.

The selected design keeps the default small and makes live agent/tool events opt-in.

Advanced consumers that need full item-by-item control can use the existing `RunStreamEvent` contract directly.

## Implementation Notes

This RFC is intentionally not part of RFC-0007 implementation.

A likely initial surface is:

- `src/run-output-events.ts`
- exported from `src/index.ts`

The implementation can reuse `extractToolCalls(...)` from `src/run-record-utils.ts` after the stream completes.

## Minimal Test Matrix

1. Yields `text_delta` events for raw model deltas.
2. Does not yield `agent_updated`, `tool_call`, or `tool_output` events by default.
3. Yields `agent_updated` events when `emitAgentUpdates` is `true`.
4. Yields `tool_call` events when `emitToolCalls` is `true`.
5. Yields `tool_output` events when `emitToolOutputs` is `true`.
6. Yields exactly one `completed` event after stream completion.
7. Sets `completed.finalOutput` from the final message output item.
8. Sets `completed.history` from `StreamedRunResult.history`.
9. Sets `completed.lastAgent` from `StreamedRunResult.lastAgent`.
10. Includes paired tool calls and outputs in `completed.toolCalls`.
11. Preserves the one-shot consumption behavior of `StreamedRunResult.toStream()`.
12. Propagates stream errors.

## Status

Draft. Not implemented.
