---
title: AIOC
template: splash
editUrl: false
description: Governance-first TypeScript SDK for agent systems with default-deny tools, handoffs, and application-owned policy enforcement.
hero:
  title: AIOC
  tagline: "<strong>Governance-first agent execution.</strong> Models propose actions. Application-owned policies decide what may execute, and approvals are evidence rather than overrides. Every run can produce a portable <code>RunRecord</code> for audit, replay, and non-regression."
  image:
    html: |
      <div class="aioc-hero-visual" aria-hidden="true">
        <div class="aioc-visual-label">Runtime boundary</div>
        <div class="aioc-flow">
          <span class="aioc-node aioc-node-model">Model</span>
          <span class="aioc-arrow">-&gt;</span>
          <span class="aioc-node aioc-node-proposal">Tool proposal</span>
        </div>
        <div class="aioc-gate">
          <span>Policy gate</span>
          <strong>No policy, no execution</strong>
        </div>
        <div class="aioc-decisions">
          <span>allow</span>
          <span>approval required</span>
          <span>deny</span>
        </div>
        <div class="aioc-record">
          <strong>RunRecord</strong>
          <span>audit</span>
          <span>replay</span>
          <span>compare</span>
        </div>
        <div class="aioc-footnote">Approval evidence is re-evaluated by policy; it never unlocks execution by itself.</div>
      </div>
  actions:
    - text: Quickstart
      link: ./quickstart/
      variant: primary
    - text: Tutorials
      link: ./tutorials/
      variant: secondary
    - text: Reference
      link: ./reference/
      variant: secondary
    - text: GitHub
      link: https://github.com/axiastudio/aioc
      variant: minimal
---

<div class="aioc-payoff">
  <strong>Don’t ask the harness to police itself.</strong>
  <span>Make it produce evidence, then let application-owned policy decide.</span>
</div>

It is designed for applications that must retain full governance control over persistence, tracing, approval, retention, access, deployment, and oversight concerns instead of inheriting those decisions from an SDK, hosted trace store, or framework-owned review workflow.

## Why AIOC

Use `aioc` when an agent can suggest useful actions, but your application must
remain responsible for deciding whether those actions are allowed.

Many agent tools optimize for orchestration, tracing, evaluation, or
human-review workflows. Those capabilities can be valuable, but they often bring
their own assumptions about storage, retention, access, escalation, and audit
semantics.

`aioc` focuses on the lower-level enforcement boundary instead:

- model outputs are proposals, not permissions
- tools and handoffs are deny-by-default unless deterministic policy code allows them
- approval evidence is re-evaluated by policy rather than consumed as an automatic unlock
- audit evidence is emitted as portable `RunRecord` artifacts
- prompt snapshots and request fingerprints support review, replay, and non-regression workflows
- storage, retention, access control, approval semantics, monitoring, and deployment remain application-owned

This makes `aioc` useful when governance is part of your product or operating
environment, not an implementation detail delegated to a generic framework.

The difference is not just that policies exist. `aioc` never asks the runtime to
approve its own execution. A human or external workflow can produce approval
evidence, but the request proceeds only after application-owned policy evaluates
again and no blocking condition still applies.

`RunRecord` is not a framework-owned trace. It is a portable execution artifact
that your application can store, redact, inspect, replay, and compare outside
the runtime that produced it. That distinction matters when auditability must
survive UI choices, vendor choices, retention policies, and future prompt or
policy changes.

## Example Use Case

Imagine an internal support agent that can read account data, draft replies,
create refunds, and escalate cases. The model can propose a refund or handoff,
but `aioc` routes that proposal through deterministic policy first.

Low-risk actions can be allowed automatically, sensitive actions can require
approval, and denied actions never execute. If a reviewer approves the refund,
that approval does not unlock the suspended call by itself; the application
passes approval evidence into a later run, policy evaluates again, and execution
only proceeds if the proposal hash, grant status, expiry, and current context
still satisfy the policy.

Each run can produce a `RunRecord` with prompt snapshots, policy decisions,
request fingerprints, and tool activity. When prompts or policies change, the
team can replay or compare prior runs to check whether behavior changed in an
expected way.

## What AIOC Is Not

`aioc` is intentionally not a full agent platform, observability dashboard, hosted evaluation suite, or human-review product.
Those tools can be valuable, but tracing and review workflows are not governance by themselves. `aioc` is a governance kernel that can feed enterprise control planes without requiring the control plane to own the runtime semantics.

## Status

The current stable release is `0.2.8`.
The stable line started with `0.1.0`.

The current documentation covers:

- stable `0.1.x` runtime behavior you can use today
- accepted RFC material implemented in the current stable release
- implemented `0.2.x` additions, including the Agent Harness Descriptor API
- draft or experimental RFC material for future stabilization work that is still
  evolving

## Stable Scope

`aioc` `0.1.0` stabilizes the governance-first runtime model as a dependable foundation for high-accountability applications: core APIs are compatibility-managed, audit artifacts and replay workflows are dependable, and the project has been validated through real implementation use.

`aioc` `0.1.1` keeps that stable model and adds thread-history helpers, the run-output stream adapter, and provider-specific instruction-role documentation.

`aioc` `0.1.2` adds approval evidence helpers for application-owned approval workflows.

`aioc` `0.2.x` adds runtime utilities and the Agent Harness Descriptor API. The descriptor contract is part of the supported `0.2.x` surface for controlled configuration and evaluation workflows; future `0.x` changes should include migration guidance.

`aioc` `0.2.2` completes the descriptor instruction-composition surface with reusable `instruction_parts`, ordered `instructions_sequence`, and boolean `where` gates.

`aioc` `0.2.3` adds RFC-0010 policy composition helpers for exact-name tool and handoff policy dispatch without changing runtime enforcement semantics.

`aioc` `0.2.4` adds experimental governance-event packages and an OpenTelemetry Logs exporter for reduced, operational observability events derived from `RunRecord` values.

`aioc` `0.2.5` makes replay history-faithful by recording the initial input scope in `RunRecord` and replaying from it by default.

`aioc` `0.2.6` adds descriptor-level conditional agent handoffs with boolean `where` gates that filter unavailable handoff tools before provider requests.

`aioc` `0.2.7` adds run-regression suite utilities and the experimental
`@axiastudio/aioc-regression-judge` companion package for bounded LLM judge
inputs and structured judge results.

`aioc` `0.2.8` fixes replay agent cloning so strict and hybrid replay preserve
conditional handoff rules and expose enabled `handoff_to_*` tools.

## Install

```bash
npm install @axiastudio/aioc
```

## What You Get Today

- deterministic policy gates for tools and handoffs
- `RunRecord` audit artifacts with prompt snapshots and request fingerprints
- replay and comparison utilities for non-regression analysis
- provider setup helpers for Mistral and OpenAI
- thread-history helpers for application-owned conversation state
- a run-output stream adapter for UI deltas plus final run data

## Technical Focus

The project currently focuses on three technical areas:

- controlled execution through policy gates for tools and handoffs
- structured auditability through `RunRecord`, prompt snapshots, and request fingerprints
- verifiable iteration through replay and comparison utilities

## What This Site Covers

- a concise technical introduction to the runtime model
- the key public concepts you need to build with `aioc`
- a compact manual reference for the most important public APIs
- run-record and governance-oriented documentation in a navigable format

## Source of Truth

The normative governance documents remain in the repository root under `/docs`.

This site is a documentation app living in `/apps/aioc-docs` and imports those documents into a browsable Starlight site.

## Where To Go Next

- Start with [`Quickstart`](./quickstart/) for the minimal setup path.
- Follow [`Tutorials`](./tutorials/) for guided end-to-end workflows.
- Read [`Governance-First Design`](./governance-first-design/) for the design position behind the runtime.
- Use [`Reference`](./reference/) for the current public runtime surface.
- Use [`Run Records`](./run-records/) if you are evaluating auditability, replay, and regression workflows.
- Use [`Governance`](./governance/) for RFCs, contracts, and privacy baseline documents.
