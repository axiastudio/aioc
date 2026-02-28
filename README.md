# @axiastudio/aioc

AIOC is a governance-first SDK for LLM agents: models can propose actions, while deterministic policies and runtime controls enforce decisions.
It provides default-deny gates for tools and handoffs, end-to-end auditability (run records, prompt snapshots, request fingerprints), and a foundation for verifiable iteration on prompts and policies.
AIOC is designed for enterprise and public-sector contexts with privacy-by-design and AI Act-aligned governance requirements.

Project home: [https://github.com/axiastudio/aioc](https://github.com/axiastudio/aioc)

## Release status

This package is currently in alpha and is not production-ready.
Breaking changes may occur before a stable release.
Alpha contract reference: `docs/ALPHA-CONTRACT.md`.
Pre-beta contract freeze reference: `docs/BETA-CONTRACT.md`.

## Contact

If you want to collaborate or provide feedback, write to `tiziano.lattisi@axia.studio`.

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
- `docs/RFC-0002-policy-gates-for-tools-and-handoffs.md`
- `docs/RFC-0003-run-record-audit-trail-and-persistence.md`
- `docs/ALPHA-CONTRACT.md`
- `docs/BETA-CONTRACT.md`

## Goals of this first scaffold

- Keep a familiar API.
- Isolate provider/runtime concerns from application agent logic.
- Enable provider wrappers (including Mistral) behind a stable SDK surface.

## Exposed primitives (v0 scaffold)

- `Agent`, `RunContext`
- optional `Agent.promptVersion` to version resolved instructions
- `Tool`, `tool(...)`
- agent handoffs via `Agent({ handoffs: [...] })`
- `run(...)` with streaming support
- run logger hook via `run(..., { logger })`
- deterministic policy gates via `run(..., { policies })` (tool execution and handoff transitions are default-deny without explicit allow policy)
- policy helpers `allow(...)` and `deny(...)` for deterministic policy results (including optional `publicReason` and `denyMode`)
- tool/handoff call outputs are normalized in an envelope: `{ status, code, publicReason, data }`
- provider setup helpers `setupMistral(...)`, `setupOpenAI(...)`, `setupProvider(...)`
- stdout logger helper `createStdoutLogger(...)` (opt-in)
- run record hook via `run(..., { record })` for external persistence/audit adapters
- run record prompt snapshots per turn (`turn`, `agentName`, `promptVersion`, `promptHash`, optional `promptText`)
- run record request fingerprints per turn (`requestHash`, segment hashes, `runtimeVersion`, `fingerprintSchemaVersion`)
- JSON helper `toJsonValue(...)` to map runtime artifacts (for example `RunRecord.items`) into JSON-safe values for storage adapters
- message helpers `user(...)`, `assistant(...)`, `system(...)`
- `setDefaultProvider(...)`
- error classes including `OutputGuardrailTripwireTriggered`
- `OpenAIProvider`, `MistralProvider`

Provider setup notes:

- `setupMistral()` reads `MISTRAL_API_KEY` from env if no `apiKey` is passed.
- `setupOpenAI()` reads `OPENAI_API_KEY` from env if no `apiKey` is passed.
- `setupProvider("mistral" | "openai", ...)` provides a single entrypoint.
- `run(...)` defaults to non-stream mode (`stream: false`).

Policy deny notes:

- Default deny behavior raises typed runtime errors (`ToolCallPolicyDeniedError` / `HandoffPolicyDeniedError`).
- Policies can choose `denyMode: "tool_result"` to return a denied tool result to the model without throwing.

Run record metadata convention:

- `record.metadata.appBuildVersion` is a recommended field to correlate run drift with application-layer source/build changes.

## Test Commands

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:regression`
- `npm run test:ci`

## Python Alpha Port

Python runtime is available under `py/` (Python 3.11+), with governance-first parity against core TS semantics:

- `Agent`, `RunContext`, `run(...)` (stream/non-stream), tool registration, handoff
- deterministic default-deny policy gates for tool/handoff
- unified tool/handoff output envelope `{ status, code, publicReason, data }`
- typed runtime errors for deny/guardrail/max-turns
- run record sink adapter + context redaction + policy/guardrail decision capture
- provider setup helpers: `setup_mistral()`, `setup_openai()`, `setup_provider()`
- JSON-safe helper `to_json_value(...)`

Python test command:

- `cd py && python3 -m unittest discover -s tests -p 'test_*.py'`

Python examples:

- `cd py && python3 examples/basic/hello_world.py`
- `cd py && python3 examples/basic/tool_policy_allow_deny.py`
- `cd py && python3 examples/basic/run_record_sink.py`

Migration mapping reference:

- `docs/TS-PY-MIGRATION.md`

## License

- Project license: `MIT` (`LICENSE`)
- Third-party notices: `THIRD_PARTY_NOTICES.md`
