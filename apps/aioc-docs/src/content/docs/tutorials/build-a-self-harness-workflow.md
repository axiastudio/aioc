---
title: Build a Self-Harness Workflow
description: Understand how AIOC can support a self-harness loop with non-regression evidence and application-owned promotion.
---

This tutorial is about the workflow before it is about code.

A self-harness loop can be human-led, LLM-assisted, or increasingly automated.
The risky part is not that a model proposes a harness change. The risky part is
letting that proposal become accepted behavior without replayable evidence.

AIOC is not a self-improvement engine. It is the governance layer underneath a
self-harness workflow: the proposal loop can be bold, while validation and
promotion stay replayable, comparable, and application-owned.

<aside class="self-harness-disclaimer">
  <div class="self-harness-disclaimer-heading">
    <svg class="self-harness-disclaimer-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 L22 21 H2 Z" />
      <path d="M12 8 V14" />
      <circle cx="12" cy="17" r="1" />
    </svg>
    <strong>Teaching example</strong>
  </div>
  <p>
    This tutorial intentionally uses a deliberately aggressive automation model:
    an LLM-assisted proposal harness reads a problematic <code>RunRecord</code>
    and proposes both a candidate harness and the expectation used to validate
    it.
  </p>
  <p>
    This is not a recommendation to let an AI system update, approve, or promote
    itself. In a real system, promotion remains application-owned and should
    match the risk profile of the domain.
  </p>
  <p>
    Because the proposal harness also drafts the expectation, that expectation
    is not treated as ground truth. It is treated as part of the proposal and
    must be reviewed, constrained, or validated according to the application's
    governance model.
  </p>
  <p>
    The point of the example is narrower: if an application chooses to automate
    even part of a self-harness loop, the loop should be grounded in replayable
    evidence. AIOC provides the validation layer: stored <code>RunRecord</code>
    values, candidate replay, deterministic comparison, optional judging, and
    non-regression suites.
  </p>
</aside>

This page tells the story in two phases.

## The Story

Imagine an application has an agent harness called `v1`. The harness produces a
`RunRecord` that does not match what the application expects. In this tutorial's
running example, the agent explains photosynthesis, but the answer is not
adapted to the learner's age.

An LLM-assisted workflow reads the problematic `RunRecord`, diagnoses the issue,
and proposes three artifacts:

- a candidate harness, `v2`;
- a regression suite containing the problematic `RunRecord`;
- an expectation describing the intended improvement.

AIOC then validates the candidate by replaying the baseline record against
`v2`, comparing baseline and candidate behavior, and optionally asking a judge
whether the candidate satisfies the expectation.

If the evidence is acceptable, `v2` can be promoted. Otherwise, the proposal is
rejected or revised.

## Phase 1: First Improvement

Phase 1 creates the first non-regression memory. The application starts with one
reported behavior and ends with either an accepted candidate or a rejected
proposal.

<svg class="self-harness-diagram" viewBox="0 0 1000 1170" role="img" aria-labelledby="phase1-title phase1-desc">
  <title id="phase1-title">Phase 1 self-harness flow</title>
  <desc id="phase1-desc">
    Harness v1 produces a problematic RunRecord. An LLM-assisted diagnosis
    proposes harness v2, creates suite #1 and expectation #1, and AIOC validates
    the candidate before the application promotes or rejects it.
  </desc>
  <defs>
    <marker id="phase1-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
      <path class="diagram-arrow-head" d="M 0 0 L 10 5 L 0 10 z" />
    </marker>
  </defs>

  <rect class="diagram-surface" x="12" y="12" width="976" height="1146" rx="14" />

  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 500 125 L 500 170" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 445 235 C 310 295 330 340 330 375" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 555 235 C 705 275 755 285 755 315" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 755 385 L 755 430" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 330 455 C 330 520 435 510 435 555" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 755 500 C 755 540 645 515 645 555" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 420 635 C 235 670 190 690 190 735" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 500 635 L 500 735" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 580 635 C 760 675 805 690 805 735" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 190 795 C 265 835 370 865 410 910" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 500 795 L 500 835" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 805 795 C 735 835 640 865 590 910" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 455 1015 C 405 1040 380 1045 360 1050" />
  <path class="diagram-edge" marker-end="url(#phase1-arrow)" d="M 545 1015 C 595 1040 655 1045 675 1050" />

  <g class="diagram-node">
    <rect class="diagram-box" x="340" y="45" width="320" height="80" />
    <text class="diagram-text" x="500" y="78" text-anchor="middle">
      <tspan x="500">Harness v1 produces</tspan>
      <tspan x="500" dy="25">problematic RunRecord #1</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="360" y="170" width="280" height="65" />
    <text class="diagram-text" x="500" y="211" text-anchor="middle">LLM-assisted diagnosis</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="170" y="375" width="320" height="80" />
    <text class="diagram-text" x="330" y="408" text-anchor="middle">
      <tspan x="330">Propose candidate harness</tspan>
      <tspan x="330" dy="25">v2</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="625" y="315" width="260" height="70" />
    <text class="diagram-text" x="755" y="358" text-anchor="middle">Create suite #1</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="625" y="430" width="260" height="70" />
    <text class="diagram-text" x="755" y="473" text-anchor="middle">Expectation #1</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="340" y="555" width="320" height="80" />
    <text class="diagram-text" x="500" y="588" text-anchor="middle">
      <tspan x="500">AIOC replays RunRecord #1</tspan>
      <tspan x="500" dy="25">against v2</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="40" y="735" width="300" height="60" />
    <text class="diagram-text diagram-small" x="190" y="773" text-anchor="middle">Candidate RunRecord #1</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="350" y="735" width="300" height="60" />
    <text class="diagram-text diagram-small" x="500" y="773" text-anchor="middle">Deterministic comparison</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="680" y="735" width="250" height="60" />
    <text class="diagram-text diagram-small" x="805" y="773" text-anchor="middle">Optional judge verdict</text>
  </g>

  <g class="diagram-node">
    <polygon class="diagram-box diagram-decision" points="500,835 620,930 500,1025 380,930" />
    <text class="diagram-text" x="500" y="938" text-anchor="middle">Evidence acceptable?</text>
  </g>

  <g class="diagram-node diagram-outcomes">
    <text class="diagram-text diagram-label" x="400" y="1038" text-anchor="middle">yes</text>
    <text class="diagram-text diagram-label" x="640" y="1038" text-anchor="middle">no</text>
    <rect class="diagram-box diagram-accept" x="250" y="1050" width="220" height="60" />
    <text class="diagram-text" x="360" y="1088" text-anchor="middle">Promote v2</text>
    <rect class="diagram-box diagram-reject" x="545" y="1050" width="260" height="60" />
    <text class="diagram-text" x="675" y="1088" text-anchor="middle">Reject or revise</text>
  </g>
</svg>

The important boundary is promotion. AIOC can produce evidence, but it does not
decide that `v2` should go to production. The application decides whether the
evidence is sufficient.

After Phase 1, suite #1 becomes part of the harness history. It is no longer
just a test for one old bug. It is a behavioral claim the application chose to
preserve.

## Phase 2: Non-Regression Memory

Phase 2 is where the workflow becomes more interesting.

Later, the accepted `v2` harness produces a different problematic `RunRecord`.
The same LLM-assisted loop can diagnose the new issue and propose a candidate
`v3`, plus a new suite and expectation.

But validation is no longer only about the new issue. AIOC also reruns the
suite created in Phase 1. The candidate must fix the new problem without
regressing behavior that was previously accepted.

<svg class="self-harness-diagram" viewBox="0 0 1000 1210" role="img" aria-labelledby="phase2-title phase2-desc">
  <title id="phase2-title">Phase 2 self-harness flow</title>
  <desc id="phase2-desc">
    Harness v2 produces a new problematic RunRecord. The workflow proposes
    harness v3 and a new suite, then AIOC validates both the new issue and the
    previously accepted suite before promotion.
  </desc>
  <defs>
    <marker id="phase2-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
      <path class="diagram-arrow-head" d="M 0 0 L 10 5 L 0 10 z" />
    </marker>
  </defs>

  <rect class="diagram-surface" x="12" y="12" width="976" height="1186" rx="14" />

  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 500 125 L 500 170" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 445 235 C 310 295 330 340 330 375" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 555 235 C 705 275 755 285 755 315" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 755 385 L 755 430" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 330 455 C 330 520 360 530 360 560" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 755 500 C 755 535 680 535 680 560" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 420 640 C 500 690 560 690 560 735" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 680 640 L 680 735" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 430 640 C 300 690 180 690 180 735" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 680 640 C 790 690 850 690 850 735" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 180 795 C 255 845 365 870 415 925" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 450 795 C 460 835 475 860 485 875" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 650 795 C 630 840 590 875 570 920" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 850 795 C 730 845 635 880 590 925" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 455 1060 C 405 1080 380 1085 360 1090" />
  <path class="diagram-edge" marker-end="url(#phase2-arrow)" d="M 545 1060 C 595 1080 655 1085 675 1090" />

  <g class="diagram-node">
    <rect class="diagram-box" x="340" y="45" width="320" height="80" />
    <text class="diagram-text" x="500" y="78" text-anchor="middle">
      <tspan x="500">Harness v2 produces</tspan>
      <tspan x="500" dy="25">problematic RunRecord #2</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="360" y="170" width="280" height="65" />
    <text class="diagram-text" x="500" y="211" text-anchor="middle">LLM-assisted diagnosis</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="170" y="375" width="320" height="80" />
    <text class="diagram-text" x="330" y="408" text-anchor="middle">
      <tspan x="330">Propose candidate harness</tspan>
      <tspan x="330" dy="25">v3</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="625" y="315" width="260" height="70" />
    <text class="diagram-text" x="755" y="358" text-anchor="middle">Create suite #2</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="625" y="430" width="260" height="70" />
    <text class="diagram-text" x="755" y="473" text-anchor="middle">Expectation #2</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="220" y="560" width="280" height="80" />
    <text class="diagram-text diagram-small" x="360" y="592" text-anchor="middle">
      <tspan x="360">Replay RunRecord #2</tspan>
      <tspan x="360" dy="23">against v3</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="540" y="560" width="280" height="80" />
    <text class="diagram-text diagram-small" x="680" y="592" text-anchor="middle">
      <tspan x="680">Rerun suite #1</tspan>
      <tspan x="680" dy="23">as non-regression memory</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="45" y="735" width="270" height="60" />
    <text class="diagram-text diagram-small" x="180" y="773" text-anchor="middle">Candidate RunRecord #2</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="335" y="735" width="230" height="60" />
    <text class="diagram-text diagram-small" x="450" y="773" text-anchor="middle">New comparison</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="585" y="735" width="210" height="60" />
    <text class="diagram-text diagram-small" x="690" y="773" text-anchor="middle">Judge verdict</text>
  </g>

  <g class="diagram-node">
    <rect class="diagram-box" x="815" y="735" width="150" height="60" />
    <text class="diagram-text diagram-small" x="890" y="761" text-anchor="middle">
      <tspan x="890">Suite #1</tspan>
      <tspan x="890" dy="21">result</tspan>
    </text>
  </g>

  <g class="diagram-node">
    <polygon class="diagram-box diagram-decision" points="500,850 635,960 500,1070 365,960" />
    <text class="diagram-text" x="500" y="947" text-anchor="middle">
      <tspan x="500">Fix new issue and</tspan>
      <tspan x="500" dy="25">preserve suite #1?</tspan>
    </text>
  </g>

  <g class="diagram-node diagram-outcomes">
    <text class="diagram-text diagram-label" x="400" y="1078" text-anchor="middle">yes</text>
    <text class="diagram-text diagram-label" x="640" y="1078" text-anchor="middle">no</text>
    <rect class="diagram-box diagram-accept" x="250" y="1090" width="220" height="60" />
    <text class="diagram-text" x="360" y="1128" text-anchor="middle">Promote v3</text>
    <rect class="diagram-box diagram-reject" x="545" y="1090" width="260" height="60" />
    <text class="diagram-text" x="675" y="1128" text-anchor="middle">Reject or revise</text>
  </g>
</svg>

Each accepted harness change becomes part of the future non-regression
boundary. The harness can keep changing, but every accepted lesson becomes a
test.

## Why This Fits AIOC

Self-harness work can sound like it points away from governance. In practice,
the more autonomous the proposal loop becomes, the more important governance
evidence becomes.

Separate the workflow into three loops:

- proposal loop: human-led, LLM-assisted, or automated;
- validation loop: replayable, comparable, and auditable;
- promotion loop: application-owned.

AIOC belongs in the validation loop. It helps the application answer concrete
questions:

- Which `RunRecord` motivated the change?
- What expectation describes the intended improvement?
- What did the candidate produce when replayed against that record?
- What changed in response, tool calls, policies, guardrails, metadata, and
  descriptors?
- Did an optional judge agree that the change satisfied the expectation?
- Which previously accepted suites were rerun?

That is the core claim:

> AIOC is not a self-improvement engine. It is the governance layer underneath
> one.

Self-harness proposals can be bold. Promotion should be boring.

## Phase 1 Implementation

The runnable Phase 1 example lives in the repository:

```text
examples/self-harness/phase-1.ts
```

It starts from a stored report:

```text
examples/self-harness/reported-runrecord-1.json
```

and a baseline harness descriptor:

```text
examples/self-harness/harness-v1.yaml
```

The JSON report stands in for production persistence, issue intake, or any
other place where the application stores the behavior it wants to investigate.
In this example, the record contains a photosynthesis question and the original
answer. The answer is factually useful, but it is not adapted to an eight-year
old learner.

Run the example from the repository root:

```bash
OPENAI_API_KEY=... npm run example:self-harness
```

By default, the example is a dry run. It does not execute the candidate harness.
It only asks the proposal harness to draft:

- a diagnosis;
- a candidate `v2` harness descriptor;
- a suite name;
- an expectation for the reported case.

The proposal harness receives the smallest useful context:

- the baseline `v1` descriptor;
- the reported `RunRecord`;
- the issue report;
- the AIOC descriptor authoring notes used by this example;
- the allowed capabilities, including `get_age_range`;
- previous rejection reasons, when the proposal is being retried.

The candidate is not hardcoded. The proposal harness may decide that the best
candidate is instruction-only, or it may decide to use the allowed tool. The
application does not assume the proposal is correct. It parses the proposed
descriptor, checks that it uses only supported capabilities, verifies that tool
references are declared correctly, and rejects malformed proposals before any
candidate replay happens.

The extra capabilities are intentionally not useful for this issue. They make
the choice visible: the proposal harness must decide that `get_age_range` is the
capability that actually explains and fixes the reported behavior.

Rejected proposals are fed back into the next attempt. The example uses one
initial proposal plus two retries, and it prints every rejected proposal so the
reader can inspect how the loop evolves.

If the static proposal check passes, the default run stops at the dry-run
boundary:

```text
=== Dry run boundary ===
Candidate replay is blocked by default. Re-run with --force to execute v2 against RunRecord #1.
```

This boundary is intentional. Even in a deliberately aggressive automation
model, candidate execution is a separate step.

To execute the candidate replay, pass `--force`:

```bash
OPENAI_API_KEY=... npm run example:self-harness -- --force
```

With `--force`, the application builds the candidate harness, binds the example
tool targets to local tool implementations, and calls `runRegressionSuite(...)`
with the stored `RunRecord` as the baseline case.

AIOC then:

- replays `RunRecord #1` against the candidate harness;
- captures the candidate `RunRecord`;
- compares baseline and candidate behavior;
- invokes `@axiastudio/aioc-regression-judge` for the expectation verdict.

The example prints only the final verdict:

```text
=== Final verdict ===
judge: pass
decision: promote v2
summary: The candidate evidence is acceptable: the judge passed and every expected tool was observed.
```

The judge verdict is evidence, not promotion authority. Promotion remains
application-owned. In this example, the application promotes only if the judge
passes and the candidate actually used every tool declared by the proposed
expectation's `shouldUseTools` field.

## What Comes Next

Phase 1 creates suite #1: the first accepted behavioral memory. Phase 2 will
start from a new problematic `RunRecord #2`, ask for a `v3` candidate, and rerun
suite #1 as non-regression memory before accepting the new candidate.

The implementation stays intentionally small. The point is to show how an
accepted harness change becomes future non-regression memory, not to build a
production-grade self-improvement system.

<style>
  .self-harness-disclaimer {
    margin: 1.25rem 0 1.75rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--sl-color-accent), transparent 25%);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--sl-color-accent), transparent 88%);
    color: var(--sl-color-white);
  }

  .self-harness-disclaimer-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.5rem;
  }

  .self-harness-disclaimer-heading strong {
    font-size: var(--sl-text-lg);
  }

  .self-harness-disclaimer-icon {
    flex: 0 0 auto;
    width: 1.35rem;
    height: 1.35rem;
  }

  .self-harness-disclaimer-icon path:first-child {
    fill: #f6c453;
  }

  .self-harness-disclaimer-icon path:nth-child(2),
  .self-harness-disclaimer-icon circle {
    fill: none;
    stroke: #111827;
    stroke-linecap: round;
    stroke-width: 2;
  }

  .self-harness-disclaimer p {
    margin: 0.65rem 0 0;
    color: var(--sl-color-gray-2);
  }

  .self-harness-disclaimer p:first-of-type {
    margin-top: 0;
  }

  .self-harness-diagram {
    display: block;
    width: 100%;
    height: auto;
    margin: 1.25rem 0 1.75rem;
    overflow: visible;
  }

  .diagram-surface {
    fill: color-mix(in srgb, var(--sl-color-gray-6), transparent 60%);
    stroke: var(--sl-color-gray-5);
    stroke-width: 1.5;
  }

  .diagram-box {
    fill: color-mix(in srgb, var(--sl-color-gray-6), transparent 20%);
    stroke: var(--sl-color-gray-4);
    stroke-width: 1.5;
  }

  .diagram-decision {
    stroke: var(--sl-color-accent);
  }

  .diagram-accept {
    stroke: #8bd67f;
  }

  .diagram-reject {
    stroke: #e8a2bd;
  }

  .diagram-edge {
    fill: none;
    stroke: var(--sl-color-gray-2);
    stroke-width: 2;
  }

  .diagram-arrow-head {
    fill: var(--sl-color-gray-2);
  }

  .diagram-text {
    fill: var(--sl-color-white);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 22px;
    letter-spacing: 0;
  }

  .diagram-small {
    font-size: 19px;
  }

  .diagram-label {
    font-size: 20px;
  }
</style>
