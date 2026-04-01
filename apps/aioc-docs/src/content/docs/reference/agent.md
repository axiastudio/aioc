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

It is intentionally a thin declarative object.

`Agent` describes the active runtime node for a turn, but it does not orchestrate the run loop itself. Turn execution, provider calls, policy enforcement, tool execution, and handoff transitions are handled by `run(...)`.

## What `Agent` Is

Use `Agent` to define:

- runtime identity
- prompt source
- model binding
- capability surface
- output checks

Do not think of it as:

- a workflow engine
- a session object
- a policy engine
- a tool executor

Those concerns live elsewhere in the runtime.

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

## `TContext`

`Agent<TContext>` carries the application context type that flows through the runtime.

That same `TContext` is what your:

- dynamic instructions
- tools
- policies
- handoffs
- output guardrails

see through `RunContext<TContext>`.

If your application context is:

```ts
type AppContext = {
  tenantId: string;
  approvedProposalHashes: string[];
};
```

then `new Agent<AppContext>(...)` ensures the same context shape is visible everywhere that runtime logic depends on it.

## Important Fields

### `name`

Required. Used in logs, run records, prompt snapshots, and handoff flow reconstruction.

### `instructions`

Optional.

Can be:

- a static string
- a function resolved at runtime from `RunContext`

If you need context-aware instructions, prefer the function form.

Example:

```ts
const agent = new Agent<AppContext>({
  name: "Finance Agent",
  model: "gpt-4.1-mini",
  instructions: ({ context }) =>
    `You are the finance agent for tenant ${context.tenantId}.`,
});
```

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

This field matters because handoffs are surfaced to the model as reserved tool-like actions. `handoffDescription` is therefore routing-oriented text, not just human-facing metadata.

## How `run(...)` Uses an Agent Each Turn

For every turn, the runtime treats the active `Agent` as the source of turn configuration.

At a high level, `run(...)`:

1. selects the current active agent
2. resolves `instructions`
3. records `promptVersion`
4. sends `model` and `modelSettings` to the provider
5. exposes `tools` and `handoffs` for that turn
6. applies `outputGuardrails` to the final text output when configured

If a handoff is accepted, the active agent changes and the next turn is configured from the target agent instead.

## Agent vs Policies vs Guardrails

These concepts are adjacent, but they are not interchangeable.

- `Agent` defines prompt, model, tools, handoffs, and output guardrails
- `ToolPolicy` and `HandoffPolicy` decide whether proposed actions are allowed
- `OutputGuardrail` inspects generated final text after the model responds

This separation is intentional:

- `Agent` defines the capability surface
- policies govern whether actions may execute
- guardrails check the assistant output after generation

## Instruction Resolution

At runtime the SDK resolves instructions through:

```ts
await agent.resolveInstructions(runContext)
```

Most applications do not call this directly. It matters because the resolved text, not only the original function or string, is what gets captured in prompt snapshots when recording is enabled.
