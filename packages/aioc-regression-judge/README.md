# @axiastudio/aioc-regression-judge

Experimental companion package for AIOC run-regression suites.

It provides a ready-to-wire judge helper without coupling the package to a
specific model provider. Applications provide the model invocation function;
the package handles bounded judge input projection, prompt construction, and
`RunJudgeResult` parsing.

## Install

```bash
npm install @axiastudio/aioc @axiastudio/aioc-regression-judge
```

## Usage

```ts
import { runRegressionSuite } from "@axiastudio/aioc";
import { createRunRegressionJudge } from "@axiastudio/aioc-regression-judge";

const judge = createRunRegressionJudge({
  judgeModel: "my-judge-model",
  generate: async ({ messages }) => {
    const response = await callYourModel(messages);
    return response.content;
  },
});

const suite = await runRegressionSuite({
  suite: {
    name: "age-adapted-explanation",
    expectation: {
      intent: "Adapt the explanation to the learner age range.",
    },
    cases: [{ baseline }],
  },
  agent: candidateAgent,
  mode: "live",
  judge,
});
```

## Projection Model

The default judge input is bounded. It includes:

- baseline and candidate final outputs;
- deterministic comparison summary and metrics;
- expectation metadata;
- tool call names and output envelope summaries;
- policy and guardrail decision summaries;
- prompt hashes and request fingerprints;
- descriptor metadata, agent ids, and tool ids when descriptors are present.

It excludes by default:

- `contextSnapshot`;
- raw prompt text;
- full message history;
- raw tool output data;
- full comparison differences.

Use `inputMode: "full"` only when the application explicitly accepts sending full
`RunRecord` artifacts to the judge model. Prefer `projection` for application
specific redaction.
