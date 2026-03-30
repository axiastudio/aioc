---
title: AIOC
template: splash
editUrl: false
description: Governance-first Agent SDK for LLM agents with deterministic policy gates, auditable run records, and high-accountability runtime patterns.
hero:
  title: AIOC
  tagline: Governance-first Agent SDK
  actions:
    - text: Quickstart
      link: ./quickstart/
      variant: primary
    - text: Reference
      link: ./reference/
      variant: secondary
    - text: GitHub
      link: https://github.com/axiastudio/aioc
      variant: minimal
---

`aioc` is a TypeScript SDK for agent systems where models can propose actions, but deterministic runtime components decide what is actually allowed to happen.

It is designed for applications that must retain full governance control over persistence, tracing, approval, and oversight concerns, instead of inheriting those decisions from the SDK.

## Status

`aioc` is currently in beta and is not production-ready yet.

The current documentation mixes:

- stable runtime behavior you can use today
- draft RFC material for approval-related extensions that are not implemented yet

## What Stable Means

`aioc` will leave beta when its governance-first runtime model is stable enough to serve as a dependable foundation for high-accountability applications: core APIs are compatibility-managed, audit artifacts and replay workflows are dependable, and the project has been validated through real implementation use.

## Install

```bash
npm install @axiastudio/aioc
```

## What You Get Today

- deterministic policy gates for tools and handoffs
- `RunRecord` audit artifacts with prompt snapshots and request fingerprints
- replay and comparison utilities for non-regression analysis
- provider setup helpers for Mistral and OpenAI

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
- Read [`Governance-First Design`](./governance-first-design/) for the design position behind the runtime.
- Use [`Reference`](./reference/) for the current public runtime surface.
- Use [`Run Records`](./run-records/) if you are evaluating auditability, replay, and regression workflows.
- Use [`Governance`](./governance/) for RFCs, contracts, and privacy baseline documents.
