---
title: Run Regression Suite With Judge
description: Replay a baseline RunRecord against a modified harness, compare the candidate run, and add an optional LLM judge.
---

This tutorial shows how to evaluate a harness change with AIOC run-regression
utilities and the experimental `@axiastudio/aioc-regression-judge` companion
package.

You will build a small suite that:

- records a baseline `RunRecord` from a simple explainer harness;
- modifies the harness so it calls a `get_age_range` tool;
- replays the same initial input against the modified harness;
- compares baseline and candidate records deterministically;
- asks an LLM judge whether the candidate improved in the expected direction.

The judge is advisory. It does not replace deterministic comparison, and it is
not a runtime policy decision. The deterministic layer tells you what changed;
the judge helps assess whether the change is acceptable for the stated intent.

## Prerequisites

Install the core package and the judge companion package:

```bash
npm install @axiastudio/aioc @axiastudio/aioc-regression-judge dotenv
```

Set an OpenAI API key:

```bash
OPENAI_API_KEY=...
```

The same flow can use another provider, but the example below uses OpenAI to
keep the tutorial focused on the regression workflow.

## Step 1: Define the Baseline Harness

The baseline harness answers directly. It does not know the learner age range.

```ts
import "dotenv/config";
import {
  Agent,
  allow,
  buildAgentHarness,
  loadAgentHarnessDescriptor,
  run,
  runRegressionSuite,
  setupOpenAI,
  tool,
  type AgentInputItem,
  type RunRecord,
  type ToolPolicy,
} from "@axiastudio/aioc";
import {
  createRunRegressionJudge,
  type RunRegressionJudgeMessage,
} from "@axiastudio/aioc-regression-judge";

const descriptorV1 = loadAgentHarnessDescriptor(`
runtime: { entry_agent: explainer, max_turns: 4 }
agents:
  explainer:
    model: gpt-4.1-mini
    instructions: Explain the requested topic clearly and concisely.
`);
```

The descriptor is intentionally small. The point is to create a recorded
baseline behavior that future harness changes can be compared against.

## Step 2: Define the Candidate Harness

The candidate harness introduces a tool and instructs the model to adapt the
answer to the learner age range.

```ts
const descriptorV2 = loadAgentHarnessDescriptor(`
runtime: { entry_agent: explainer, max_turns: 4 }
tools:
  get_age_range: { target: example://tool/get_age_range }
agents:
  explainer:
    model: gpt-4.1-mini
    tools: [get_age_range]
    instructions: |-
      Explain the requested topic clearly and concisely.
      Before answering, call get_age_range.
      Adapt the explanation to the learner age range.
`);
```

The descriptor declares the tool, but the application still owns the executable
implementation and the policy that authorizes it.

## Step 3: Record a Baseline Run

A regression suite starts from stored baseline `RunRecord` values. In a real
application, these records usually come from persistence. In this tutorial, we
record one baseline in memory.

```ts
setupOpenAI();

const input: AgentInputItem[] = [
  { type: "message", role: "user", content: "Explain photosynthesis." },
];

const harnessV1 = buildAgentHarness(descriptorV1);
let baseline: RunRecord | undefined;

await run(harnessV1.entryAgent, input, {
  ...harnessV1.runOptions,
  record: {
    metadata: { harness: harnessV1.metadata },
    sink: (record) => {
      baseline = record;
    },
  },
});

if (!baseline) {
  throw new Error("Missing baseline RunRecord.");
}
```

The recorded `RunRecord` contains the original input scope. This lets replay
start from the same initial conversation instead of from only the latest user
question.

## Step 4: Bind the Candidate Tool and Policy

The candidate harness references `example://tool/get_age_range`. The application
binds that descriptor target to an executable tool.

```ts
const getAgeRange = tool({
  name: "get_age_range",
  description: "Return the learner age range.",
  execute: async () => ({ ageRange: "8-10" }),
});

const harnessV2 = buildAgentHarness(descriptorV2, {
  tools: { "example://tool/get_age_range": getAgeRange },
});

const toolPolicy: ToolPolicy = () => allow("allow_example_tool");
```

The policy is deliberately simple. It keeps the tutorial focused on the
regression workflow. In production, the policy should encode the application's
real authorization rules.

## Step 5: Provide the Judge Model Call

The judge companion package is provider-agnostic. It builds bounded judge input
and prompt messages, but your application still owns the model invocation.

This example uses a normal AIOC `Agent` to call the judge model.

```ts
async function callJudgeModel(
  messages: RunRegressionJudgeMessage[],
): Promise<string> {
  const systemPrompt = messages.find((message) => message.role === "system");
  const userPrompt = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n\n");

  const judgeAgent = new Agent({
    name: "Regression Judge",
    model: "gpt-4.1-mini",
    instructions: systemPrompt?.content ?? "Return a JSON judge result.",
  });

  const result = await run(judgeAgent, userPrompt);
  return result.finalOutput;
}
```

The judge receives a bounded projection by default. It does not receive raw
prompt text, full history, full context snapshots, or raw tool-output data unless
you explicitly choose a different projection.

## Step 6: Run the Suite

Create the judge adapter, then run the suite against the candidate harness.

```ts
const judge = createRunRegressionJudge({
  judgeModel: "gpt-4.1-mini",
  generate: ({ messages }) => callJudgeModel(messages),
});

const suite = await runRegressionSuite({
  suite: {
    name: "age-adapted-explanation",
    expectation: {
      intent: "Adapt the explanation to the learner age range.",
      shouldUseTools: ["get_age_range"],
      shouldImprove: ["age-appropriate wording"],
      shouldPreserve: ["factual correctness"],
    },
    cases: [{ name: "photosynthesis-explanation", baseline }],
  },
  agent: harnessV2.entryAgent,
  mode: "live",
  baselineDescriptor: descriptorV1,
  candidateDescriptor: descriptorV2,
  judge,
  runOptions: {
    ...harnessV2.runOptions,
    policies: { toolPolicy },
    record: { metadata: { harness: harnessV2.metadata } },
  },
});
```

The suite does three things for each case:

- replays the baseline input against the candidate harness;
- compares baseline and candidate `RunRecord` values;
- optionally calls the judge with baseline, candidate, comparison, expectation,
  and descriptor metadata.

## Step 7: Read the Result

The rich result contains the baseline record, candidate record, deterministic
comparison, and optional judge result. The summary is compact enough for CI or
release checks.

```ts
const result = suite.results[0];
if (!result) {
  throw new Error("Missing regression result.");
}

const caseSummary = suite.summary.cases[0];
if (!caseSummary) {
  throw new Error("Missing regression case summary.");
}

const yesNo = (value: boolean): "yes" | "no" => (value ? "yes" : "no");

process.stdout.write(`suite: ${suite.summary.suite ?? "unnamed"}\n`);
process.stdout.write(`status: ${suite.summary.status}\n\n`);
process.stdout.write("baseline response:\n");
process.stdout.write(`${result.baseline.response}\n\n`);
process.stdout.write("candidate response:\n");
process.stdout.write(`${result.candidate.response}\n\n`);
process.stdout.write("deterministic signals:\n");
process.stdout.write(
  `- final output changed: ${yesNo(caseSummary.signals.finalOutputChanged)}\n`,
);
process.stdout.write(
  `- tool calls changed: ${yesNo(caseSummary.signals.toolsChanged)}\n`,
);
process.stdout.write(
  `- policy decisions changed: ${yesNo(caseSummary.signals.policyChanged)}\n\n`,
);
process.stdout.write(
  `judge: ${result.judge?.verdict ?? "missing"} - ${
    result.judge?.summary ?? "No judge summary."
  }\n\n`,
);
process.stdout.write(
  "interpretation: the suite warns because the candidate changed behavior; " +
    "the judge says the change matches the expectation.\n",
);
```

A sample run can produce output like this:

```text
suite: age-adapted-explanation
status: warn

baseline response:
Photosynthesis is the process by which green plants, algae, and some bacteria
convert light energy from the sun into chemical energy stored in glucose...

6 CO2 + 6 H2O + light energy -> C6H12O6 + 6 O2

candidate response:
Photosynthesis is a special process that plants use to make their own food.
Think of it like a recipe...

deterministic signals:
- final output changed: yes
- tool calls changed: yes
- policy decisions changed: yes

judge: pass - The candidate response appropriately adapts the explanation of
photosynthesis to a learner-friendly style using age-appropriate wording, as
signaled by the use of the 'get_age_range' tool. The factual correctness is
preserved.

interpretation: the suite warns because the candidate changed behavior; the
judge says the change matches the expectation.
```

The exact text can vary because the judge is an LLM. Treat it as an advisory
signal layered on top of deterministic comparison.

## Production Notes

For a production regression suite:

- load baseline `RunRecord` values from controlled persistence or fixtures;
- redact or project sensitive data before sending anything to a judge model;
- keep the deterministic `comparison` and `summary` as the primary release
  signal;
- make judge execution optional or separately configurable in CI;
- store candidate records and judge outputs as review artifacts;
- keep tools and policies application-owned, even when the harness is described
  by YAML.

## Full Example

The repository contains a compact runnable version of this tutorial:

```bash
npm run example:run-regression-judge
```

Source file:

```text
packages/aioc-regression-judge/examples/age-adapted-suite-with-judge.ts
```

## Related Reference

- [Run Regression](../reference/run-regression/)
- [Companion Packages](../reference/packages/)
- [Run Record Utilities](../reference/run-record-utils/)
- [Harness Descriptor](../reference/harness-descriptor/)
- [RFC-0012](../governance/current/rfc-0012-run-regression-suites-and-llm-judging/)
