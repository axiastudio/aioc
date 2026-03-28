---
title: Providers
description: Default provider setup helpers and the low-level custom provider hook.
---

`aioc` executes runs through a default provider.

## High-level Setup Helpers

The simplest options are:

```ts
setupMistral(options?)
setupOpenAI(options?)
setupProvider("mistral", options?)
setupProvider("openai", options?)
```

These helpers:

1. resolve the API key from arguments or environment
2. create the provider instance
3. register it as the runtime default provider

## API Key Resolution

Current environment variable names:

- `MISTRAL_API_KEY`
- `OPENAI_API_KEY`

If the key is missing both in arguments and in the environment, setup throws.

## Minimal Example

```ts
import "dotenv/config";
import { setupMistral } from "@axiastudio/aioc";

setupMistral();
```

## Low-level Setup

For custom providers, the low-level route is:

```ts
setDefaultProvider(provider)
```

The provider must implement:

```ts
interface ModelProvider {
  stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent>;
}
```

## When To Use The Low-level Route

Use `setDefaultProvider(...)` when:

- you are integrating a provider not shipped with `aioc`
- you want a custom stub or scripted provider
- you want to test runtime behavior without a live model

For normal usage, prefer `setupMistral(...)` or `setupOpenAI(...)`.
