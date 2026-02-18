# @axiastudio/aioc

AIOC is a lightweight internal agent SDK with an IoC-oriented control plane.

## Project principles

AIOC adopts the following non-negotiable principles:

- **LLM outside the control plane**: critical decisions remain in deterministic components; the LLM supports but does not govern.
- **End-to-end transparency**: each decision is traceable (inputs, context, prompt/policy version, output).
- **Verifiable corrigibility**: prompts, policies, and materials are versioned, editable, and comparable before/after changes.
- **Non-degeneration validation**: each correction must pass regression tests and quality checks.
- **Bias and misalignment control**: continuous monitoring, dedicated tests, and clear mitigation/escalation mechanisms.
- **Privacy by design and data minimization**: collect and process only what is strictly necessary, protect sensitive data by default (redaction, encryption, retention limits), and provide auditable controls for access and deletion.

Governance implementation reference:

- `docs/RFC-0001-governance-first-runtime.md`

## Goals of this first scaffold

- Keep a familiar API.
- Isolate provider/runtime concerns from application agent logic.
- Enable provider wrappers (including Mistral) behind a stable SDK surface.

## Exposed primitives (v0 scaffold)

- `Agent`, `RunContext`
- `Tool`, `tool(...)`
- `run(...)` with streaming support
- run logger hook via `run(..., { logger })`
- deterministic policy gates via `run(..., { policies })` (tool execution is default-deny without explicit allow policy)
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
