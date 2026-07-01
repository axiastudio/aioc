---
title: Run-Record Utilities
description: Public utilities for extracting, comparing, and replaying run records.
---

These utilities exist to reduce application boilerplate around `RunRecord` analysis and replay.

## `extractToolCalls(...)`

```ts
extractToolCalls(runRecord);
extractToolCalls(items);
```

Returns an ordered list of normalized tool-call records, including:

- `callId`
- `name`
- raw `arguments`
- optional `output`
- `hasOutput`
- derived `turn`
- canonical JSON and stable argument hash

Use it when you need to inspect or compare tool activity without manually pairing `tool_call_item` and `tool_call_output_item`.

## `compareRunRecords(...)`

```ts
compareRunRecords(left, right, options?)
```

Current options:

```ts
{
  includeSections?: ["response" | "toolCalls" | "policy" | "guardrails" | "metadata"];
  excludeSections?: ["response" | "toolCalls" | "policy" | "guardrails" | "metadata"];
  responseMatchMode?: "exact";
}
```

Returns:

- `equal`
- `summary`
- `metrics`
- `differences`

This is the main comparison surface used by non-regression workflows and visual tools such as `aioc-inspect`.

## `replayFromRunRecord(...)`

```ts
await replayFromRunRecord({
  sourceRunRecord,
  agent,
  mode: "live" | "strict" | "hybrid",
  inputMode: "recorded" | "question",
  runOptions,
  metadataOverrides,
  onMissingToolCall,
});
```

### Modes

- `live`: run normally
- `strict`: use recorded tool outputs only
- `hybrid`: use recorded outputs when available, otherwise fall back to live execution

### Input Mode

By default, replay uses `inputMode: "recorded"`.

That means the new run starts from the same initial normalized input as the
recorded run:

```ts
sourceRunRecord.items.slice(0, sourceRunRecord.inputItemCount);
```

For legacy records without `inputItemCount`, replay falls back to
`sourceRunRecord.requestFingerprints[0].messageCount` when it is valid. If no
input scope can be reconstructed, replay falls back to `sourceRunRecord.question`.

Use `inputMode: "question"` only when you intentionally want prompt-only replay
instead of history-faithful replay.

`replayStats.inputSource` reports which source was used:

- `inputItemCount`
- `requestFingerprint`
- `questionFallback`
- `question`

### Important Rule

Replay does not bypass policy enforcement.

If replayed tools or handoffs still need authorization in your runtime, provide the relevant policies in `runOptions`.

In `strict` and `hybrid` mode, replay preserves the source agent's handoff
rules. Conditional handoffs are still evaluated against the replay
`runContext`; enabled handoffs are exposed to the provider as `handoff_to_*`
tools, while disabled handoffs remain hidden.

Recorded tool outputs are stored as normalized envelopes in `RunRecord.items`.
When strict or hybrid replay reuses a recorded allow output, `aioc` unwraps the
envelope and returns its `data` to the tool wrapper so the runtime can produce a
fresh single envelope. Recorded `denied` and `approval_required` envelopes do not
bypass replay policies.

## Example

```ts
const replay = await replayFromRunRecord({
  sourceRunRecord,
  agent,
  mode: "strict",
  runOptions: {
    policies: {
      toolPolicy: () => allow("allow_replay"),
    },
  },
});

console.log(replay.result.finalOutput);
console.log(replay.replayStats);
```
