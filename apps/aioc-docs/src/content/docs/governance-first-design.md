---
title: Governance-First Design
description: Why aioc avoids governance-sensitive built-ins and focuses on deterministic control boundaries instead.
---

`aioc` takes a different path from many agent SDKs.

Many SDKs start from orchestration primitives and then expand by adding built-in capabilities such as sessions, tracing, human-in-the-loop workflows, persistence layers, or external capability integration.

Those features can be useful, but they are not governance-neutral.

## Built-ins Carry Governance Assumptions

A standard session model implies a specific model of memory, retention, and deletion.

A standard tracing system implies decisions about:

- what is stored
- where it is stored
- how long it is retained
- who can inspect it

A built-in approval flow implies a specific model of:

- oversight
- escalation
- audit semantics
- workflow ownership

A built-in external capability layer implies assumptions about:

- trust
- authorization
- capability exposure
- execution boundaries

## AIOC's Position

`aioc` is designed for applications that must retain full control over those governance-sensitive concerns.

For that reason, the SDK does **not** try to own application-level governance through built-in session, tracing, approval, or persistence models.

Instead, it focuses on a smaller and more explicit core:

- deterministic policy gates for tools and handoffs
- auditable `RunRecord` artifacts
- prompt snapshots and request fingerprints
- replay and comparison utilities
- integration surfaces that let the host application own policy, approval, persistence, and oversight

## What This Means In Practice

The goal is not to be governance-complete out of the box.

The goal is to avoid taking governance decisions on behalf of the host application.

That is why `aioc` tries to be strong on:

- deterministic control boundaries
- auditability
- reproducibility
- non-regression tooling

and intentionally weak on:

- baked-in storage models
- baked-in approval workflow semantics
- baked-in memory and retention assumptions
- baked-in governance around external capability layers

## Not “Fewer Features”, but Fewer Hidden Assumptions

This design should not be read as “the SDK does less”.

It should be read as:

- the SDK does not hard-code governance-sensitive workflow decisions
- the host application remains the owner of governance semantics

This is especially relevant in enterprise and public-sector settings, where governance requirements often belong to the application and its operating environment, not to a generic framework.
