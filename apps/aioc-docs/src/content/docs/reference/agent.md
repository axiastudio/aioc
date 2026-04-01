---
title: Agent
description: Configuration and behavior of the Agent class.
---

`Agent` is the main runtime unit in `aioc`.

It packages:

- a name
- optional instructions
- an explicit model identifier
- zero or more tools
- zero or more handoff targets
- optional output guardrails

## Constructor Shape

```ts
new Agent<TContext>({
  name: string,
  handoffDescription?: string,
  instructions?: string | ((runContext: RunContext<TContext>) => string | Promise<string>),
  promptVersion?: string,
  model?: string,
  modelSettings?: Record<string, unknown>,
  tools?: Tool<TContext>[],
  handoffs?: Agent<TContext>[],
  outputGuardrails?: OutputGuardrail<TContext>[],
})
```

## Important Fields

### `name`

Required. Used in logs, run records, prompt snapshots, and handoff flow reconstruction.

### `instructions`

Optional.

Can be:

- a static string
- a function resolved at runtime from `RunContext`

If you need context-aware instructions, prefer the function form.

### `promptVersion`

Optional but recommended when you care about auditability and replay analysis.

It lets you attach a stable application-level version label to the resolved instructions captured in `promptSnapshots`.

### `model`

Required in practice.

`run(...)` throws if the active agent has no model configured.

### `tools`

The executable capabilities that the model may propose.

Tool execution is still mediated by deterministic runtime logic and policies.

### `handoffs`

Target agents that may be reached through runtime-managed handoff proposals.

Internally, handoffs are surfaced as reserved tool-like actions so they pass through the same governance boundary as normal tools.

### `handoffDescription`

Used to describe the target agent when exposed as a handoff option to another agent.

## Instruction Resolution

At runtime the SDK resolves instructions through:

```ts
await agent.resolveInstructions(runContext)
```

Most applications do not call this directly. It matters because the resolved text, not only the original function or string, is what gets captured in prompt snapshots when recording is enabled.
