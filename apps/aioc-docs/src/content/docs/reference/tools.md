---
title: Tools
description: How tool(...) defines callable capabilities in aioc.
---

Use `tool(...)` to define a callable capability exposed to the model.

## Shape

```ts
const myTool = tool<TContext, TSchema, TOutput>({
  name: string,
  description: string,
  parameters?: z.ZodTypeAny,
  execute: (input, runContext?) => TOutput | Promise<TOutput>,
})
```

## Example

```ts
import { z } from "zod";
import { tool } from "@axiastudio/aioc";

const getFinanceReport = tool<{ actor: { team: string } }>({
  name: "get_finance_report",
  description: "Return the current finance report for the requested quarter.",
  parameters: z.object({
    quarter: z.string(),
  }),
  execute: async ({ quarter }, runContext) => {
    return {
      quarter,
      requestedBy: runContext?.context.actor.team ?? "unknown",
    };
  },
});
```

## What Matters

### `parameters`

Optional. When omitted, `tool(...)` normalizes it to an empty object schema.

The runtime converts it to a JSON schema before sending the tool definition to the provider.

### `execute`

Receives:

- parsed tool input
- optional `RunContext`

It may return synchronously or asynchronously.

### `name`

Must be stable and application-meaningful.

Tool call history, policy decisions, replay utilities, and run-record comparisons all rely on this name.

## Runtime Semantics

A tool definition does **not** mean the tool will execute whenever the model mentions it.

The actual flow is:

1. provider emits a tool call proposal
2. `aioc` parses the arguments
3. policy logic evaluates the proposal
4. only an allowed proposal reaches `execute(...)`

This separation is one of the core technical properties of the runtime.
