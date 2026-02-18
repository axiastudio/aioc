# RFC-0001: Governance-First Runtime Invariants

- Status: Draft
- Date: 2026-02-18
- Owners: aioc maintainers

## Context

`aioc` is not intended to be a generic orchestration wrapper. Its primary value is a deterministic governance layer around LLM capabilities.

This RFC defines non-negotiable runtime invariants and feature acceptance criteria.

## Decision

All new runtime capabilities (including tools and handoffs) MUST comply with the five invariants below.

## Invariants (Enforcement-Level)

1. **Default deny**
   - Any capability with execution impact is denied unless explicitly allowed.
   - Applies to tools, handoffs, and any action with side effects.

2. **Deterministic policy gate**
   - The model can propose actions, but approval is decided by deterministic policy code.
   - No direct model-driven execution path is allowed.

3. **Mandatory traceability**
   - Every decision is auditable with at least: input reference, active agent, policy/prompt version identifiers, proposal, decision (allow/deny), reason, and outcome.
   - Logging failures must not break runtime execution, but missing required trace fields is a policy violation.

4. **Privacy by design and minimization**
   - Only minimum required data can flow to model/tool/handoff boundaries.
   - Sensitive fields must be redacted or transformed before crossing boundaries.
   - Retention rules and access controls must be explicit and testable.

5. **Non-degeneration gate**
   - Any change to prompts, policies, tools, handoffs, or provider integration must pass regression checks.
   - Regressions on safety, policy compliance, or critical quality thresholds block release.

## Feature Acceptance Criteria

A feature is accepted only if:

1. It defines the exact policy decision point (where allow/deny happens).
2. It has explicit default-deny behavior.
3. It emits required trace fields for all decision outcomes.
4. It documents data classification and boundary filtering.
5. It includes regression tests for normal and adversarial/abuse paths.

## Initial Application

### Tools

- Treat tool calls as model proposals.
- Execute only after deterministic policy validation and schema validation.
- Support deny reasons in trace output.

### Handoffs

- Start with static allowlist graph.
- Enforce one deterministic gate before transition.
- Apply input filtering/minimization before context transfer.

## Non-Goals

- Full autonomous routing without policy constraints.
- Runtime behavior that depends only on prompt wording for safety.
- Feature parity as a primary objective.

## Rollout

1. Introduce policy interfaces and default-deny runtime switches.
2. Add required trace schema and validation.
3. Add regression suite with policy and privacy checks.
4. Gate handoff introduction behind this RFC compliance checklist.
