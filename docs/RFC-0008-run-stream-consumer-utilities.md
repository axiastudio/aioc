# RFC-0008: Run Stream Consumer Utilities

- Status: Draft
- Date: 2026-05-11
- Owners: aioc maintainers

## Context

`run(..., { stream: true })` exposes a public `RunStreamEvent` union.

That contract is intentionally explicit, but host applications that only need common streaming behavior still need to branch on low-level event shapes such as:

- `raw_model_stream_event`
- `run_item_stream_event`
- `message_output_item`
- `tool_call_item`
- `tool_call_output_item`
- `agent_updated_stream_event`

This makes application code noisier than necessary and couples UI/API adapters to the full stream event structure.

The issue is ergonomic rather than architectural: stream events should remain public, but applications should have a stable helper for consuming the common cases.

## Decision

`aioc` should add a small optional stream consumer helper.

The helper should sit above `RunStreamEvent` and should not replace the event contract.

The goals are:

- reduce repetitive event-dispatch code in host applications,
- preserve streaming order and backpressure,
- preserve the one-shot nature of `StreamedRunResult.toStream()`,
- keep raw stream events available for advanced consumers,
- avoid introducing a UI-specific streaming protocol.

## Scope

In scope:

- consuming an `AsyncIterable<RunStreamEvent<TContext>>`,
- invoking optional callbacks for common event categories,
- preserving the original event order,
- rethrowing stream errors,
- keeping the helper provider-neutral.

Out of scope:

- transport adapters for HTTP, SSE, WebSocket, or framework-specific APIs,
- buffering policies,
- retry semantics,
- resumable streaming,
- event persistence,
- frontend rendering primitives,
- replacement of the public `RunStreamEvent` union.

## Proposed Helper

```ts
export interface ConsumeRunStreamHandlers<TContext = unknown> {
  onTextDelta?: (delta: string) => void | Promise<void>;
  onToolCall?: (item: ToolCallItem) => void | Promise<void>;
  onToolOutput?: (item: ToolCallOutputItem) => void | Promise<void>;
  onMessage?: (item: RunMessageOutputItem) => void | Promise<void>;
  onAgentUpdated?: (agent: Agent<TContext>) => void | Promise<void>;
  onEvent?: (event: RunStreamEvent<TContext>) => void | Promise<void>;
}

export async function consumeRunStream<TContext = unknown>(
  stream: AsyncIterable<RunStreamEvent<TContext>>,
  handlers: ConsumeRunStreamHandlers<TContext>,
): Promise<void>;
```

## Semantics

- The helper consumes the provided stream exactly once.
- `onEvent` is called for every event before category-specific callbacks.
- `onTextDelta` is called for `raw_model_stream_event.data.delta` when present.
- `onToolCall`, `onToolOutput`, and `onMessage` are called for matching `run_item_stream_event.item` variants.
- `onAgentUpdated` is called for `agent_updated_stream_event`.
- Handler calls are awaited in event order.
- Errors from the stream or handlers are propagated.

## Example

```ts
const streamed = await run(agent, input, { stream: true });

await consumeRunStream(streamed.toStream(), {
  onTextDelta: (delta) => response.write(delta),
  onToolCall: (item) => auditToolCall(item),
  onToolOutput: (item) => auditToolOutput(item),
});
```

## Relation To RFC-0007

RFC-0007 covers thread history utilities.

This RFC covers stream consumption.

The two utilities may be used together, but they solve different problems:

- RFC-0007 reduces boilerplate around application-owned conversation state,
- RFC-0008 reduces boilerplate around streaming event dispatch.

## Security and Privacy Notes

- Stream events may contain model output, tool arguments, tool outputs, and handoff information.
- The helper must not redact, persist, or transform sensitive data.
- Applications remain responsible for transport security, persistence, redaction, and access control.

## Alternatives Considered

### 1. Keep stream consumption fully manual

Rejected because the event-dispatch boilerplate is common and low-value.

### 2. Replace `RunStreamEvent` with a higher-level stream protocol

Rejected because advanced consumers need access to the explicit runtime event contract.

### 3. Provide HTTP or SSE adapters directly

Rejected for the initial scope because transport concerns are framework-specific and should not drive the core helper design.

## Implementation Notes

This RFC is intentionally not part of RFC-0007 implementation.

A likely initial surface is:

- `src/run-stream-consumer.ts`
- exported from `src/index.ts`

## Minimal Test Matrix

1. Calls `onEvent` for every event.
2. Calls `onTextDelta` for raw model deltas.
3. Calls item-specific handlers for tool calls, tool outputs, and message outputs.
4. Calls `onAgentUpdated` for agent updates.
5. Awaits async handlers in stream order.
6. Propagates stream and handler errors.

## Status

Draft. Not implemented.
