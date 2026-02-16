# @axiastudio/aioc

AIOC is a lightweight internal agent SDK with an IoC-oriented control plane.

## Goals of this first scaffold

- Keep a familiar API.
- Isolate provider/runtime concerns from application agent logic.
- Enable provider wrappers (including Mistral) behind a stable SDK surface.

## Exposed primitives (v0 scaffold)

- `Agent`, `RunContext`
- `Tool`, `tool(...)`
- `run(...)` with streaming support
- run logger hook via `run(..., { logger })`
- message helpers `user(...)`, `assistant(...)`, `system(...)`
- `setDefaultProvider(...)`
- error classes including `OutputGuardrailTripwireTriggered`
- `OpenAIProvider`, `MistralProvider`

## Example smoke test (Mistral)

```bash
npm run test:mistral -w @axiastudio/aioc
```

Required env:

- `MISTRAL_API_KEY`

Example source:

- `src/examples/mistral-smoke.ts`
