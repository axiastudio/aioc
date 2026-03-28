---
title: Run-Record Utilities
description: Public utilities for extracting, comparing, and replaying run records.
---

These utilities exist to reduce application boilerplate around `RunRecord` analysis and replay.

## `extractToolCalls(...)`

```ts
extractToolCalls(runRecord)
extractToolCalls(items)
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
  runOptions,
  metadataOverrides,
  onMissingToolCall,
})
```

### Modes

- `live`: run normally
- `strict`: use recorded tool outputs only
- `hybrid`: use recorded outputs when available, otherwise fall back to live execution

### Important Rule

Replay does not bypass policy enforcement.

If replayed tools or handoffs still need authorization in your runtime, provide the relevant policies in `runOptions`.

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
