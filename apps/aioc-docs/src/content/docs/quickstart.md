---
title: Quickstart
description: Minimal setup for running a first agent with aioc.
---

Install the SDK:

```bash
npm install @axiastudio/aioc
```

Minimal example:

```ts
import "dotenv/config";
import { Agent, run, setupMistral } from "@axiastudio/aioc";

setupMistral();

const agent = new Agent({
  name: "Hello Agent",
  model: "mistral-small-latest",
  instructions: "Answer in 2 short sentences.",
});

const result = await run(
  agent,
  "In one sentence, what is a deterministic policy gate in an agent SDK?",
);

console.log(result.finalOutput);
```

## What Happens

1. A provider is configured with `setupMistral()`.
2. The `Agent` defines instructions, model, tools, and handoffs.
3. `run(...)` executes the turn loop and returns a structured result.

By default, `run(...)` is non-streaming unless `stream: true` is set.
