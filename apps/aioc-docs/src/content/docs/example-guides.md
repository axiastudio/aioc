---
title: Examples
description: Canonical examples and how to run them from the repository root.
---

All example commands are run from the repository root.

Most live examples use `AIOC_EXAMPLE_PROVIDER=openai` or
`AIOC_EXAMPLE_PROVIDER=mistral` plus the matching provider API key. Optionally
set `AIOC_EXAMPLE_MODEL` to override the default live model.

## Start Here

- `npm run example:hello`
- `npm run example:policy`
- `npm run example:approval-required`
- `npm run example:tool-policy`
- `npm run example:policy-composition`

These are the compact examples intended for first reading. They cover the
smallest useful agent run, policy gates, approval-required results, tool
execution, and exact-name policy composition.

## Approval and Audit

- `npm run example:approval-evidence`
- `npm run example:run-record`

`example:approval-evidence` shows how an external approval can be projected
into policy context and reevaluated deterministically. `example:run-record`
shows how to persist a redacted `RunRecord` through a sink.

## RunRecord Utility Snippets

- `npm run example:rru:01-extract`
- `npm run example:rru:02-compare`
- `npm run example:rru:03-replay-strict`
- `npm run example:rru:04-replay-hybrid`

These examples are deterministic and runnable without a live provider. They are
small reference snippets for extracting tool calls, comparing records, and
replaying recorded runs.

## Harness Descriptor Examples

- `npm run example:harness-rerun`
- `npm run example:harness`

`example:harness-rerun` is the compact descriptor example: it configures OpenAI
from `OPENAI_API_KEY`, declares the model in inline YAML, records a source run,
and replays it against a modified harness while mocking a newly introduced tool
output.

`example:harness` is the fuller descriptor example. It demonstrates reusable
`instruction_parts`, ordered `instructions_sequence`, boolean `where` gates,
tool registry binding, and descriptor hashing.

## Advanced Workflows

- `npm run example:non-regression`
- `npm run example:run-regression`
- `npm run example:run-regression-judge`

`example:non-regression` compares `RunRecord` outputs across two harness
versions. It uses a live provider and is educational rather than deterministic.

`example:run-regression` records a baseline `RunRecord`, runs a modified
OpenAI-backed harness through `runRegressionSuite(...)`, and prints the
deterministic comparison summary without using a judge.

`example:run-regression-judge` extends the same age-adapted regression flow with
`createRunRegressionJudge(...)`. The judge package builds the bounded judge
input and prompt; the example supplies the actual OpenAI-backed model call.

## Optional LangChain Interoperability

Optional LangChain examples live in `/examples/langchain` and use an isolated
`package.json`, so LangChain dependencies do not become runtime dependencies of
`@axiastudio/aioc`.

They demonstrate two composition patterns:

- **aioc-first, LangChain-extended**: aioc owns the governed agent run while
  LangChain provides OSS components behind aioc tools. The RAG example mirrors
  the LangChain RAG tutorial domain and uses a LangChain retriever inside a
  policy-gated aioc tool.
- **LangGraph-orchestrated, aioc-governed**: LangGraph owns workflow
  orchestration while selected graph nodes call `aioc.run(...)` for sensitive
  capability execution. The LangGraph example mirrors the calculator quickstart
  domain and routes the governed step through aioc policy and `RunRecord`
  capture.

In both patterns, execution-impacting capabilities should cross the aioc
governance boundary. LangChain supplies breadth and orchestration; aioc supplies
default-deny authorization, deterministic policy decisions, and portable audit
evidence.

## Canonical Guide

For the curated learning path, see the repository document:

- `/docs/CANONICAL-EXAMPLES.md`

For the approval model and policy-reevaluation flow, see:

- `/approval-flows/`
