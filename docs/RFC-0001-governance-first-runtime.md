# RFC-0001: Governance-First Runtime Invariants

- Status: Accepted
- Date: 2026-02-18
- Accepted: 2026-02-26
- Owners: aioc maintainers

## Context

`aioc` is not intended to be a generic orchestration wrapper. Its primary value is a deterministic governance layer around LLM capabilities.

This RFC defines non-negotiable runtime invariants and feature acceptance criteria.

## Decision

All new runtime capabilities (including tools and handoffs) MUST comply with the six invariants below.

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

6. **Bias and misalignment control**
   - Runtime must expose hooks to detect and block unsafe or misaligned outputs.
   - Deployments must define monitoring and mitigation loops for bias/misalignment incidents.

## Feature Acceptance Criteria

A feature is accepted only if:

1. It defines the exact policy decision point (where allow/deny happens).
2. It has explicit default-deny behavior.
3. It emits required trace fields for all decision outcomes.
4. It documents data classification and boundary filtering.
5. It includes regression tests for normal and adversarial/abuse paths.
6. It documents how bias/misalignment risks are monitored and mitigated.

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

## Implementation Status (as of 2026-02-26)

1. Default deny and deterministic policy gates are implemented for tools and handoffs.
2. Traceability is implemented through logger events (when enabled) and run records (when configured), including prompt snapshots and request fingerprints.
3. Privacy hooks are partially implemented (`contextRedactor`, optional prompt text capture); retention and access controls remain application-side.
4. Non-degeneration baseline is partially implemented via unit/integration/regression suites.
5. Bias/misalignment control is partially implemented via output guardrail hooks and auditable decision records; domain-specific evaluation sets remain application-side.
