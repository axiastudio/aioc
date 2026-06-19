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
} from "../src";

const descriptorV1 = loadAgentHarnessDescriptor(`
runtime: { entry_agent: explainer, max_turns: 4 }
agents:
  explainer:
    model: gpt-4.1-mini
    instructions: Explain the requested topic clearly and concisely.
`);

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

async function main(): Promise<void> {
  setupOpenAI();

  const input: AgentInputItem[] = [
    { type: "message", role: "user", content: "Explain photosynthesis." },
  ];

  const harnessV1 = buildAgentHarness(descriptorV1);
  let baseline: RunRecord | undefined;

  // In a real app this RunRecord would usually come from persistence.
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

  const getAgeRange = tool({
    name: "get_age_range",
    description: "Return the learner age range.",
    execute: async () => ({ ageRange: "8-10" }),
  });

  const harnessV2 = buildAgentHarness(descriptorV2, {
    tools: { "example://tool/get_age_range": getAgeRange },
  });
  const toolPolicy: ToolPolicy = () => allow("allow_example_tool");
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

  const result = suite.results[0];
  if (!result) {
    throw new Error("Missing regression result.");
  }

  process.stdout.write(`baseline: ${result.baseline.response}\n\n`);
  process.stdout.write(`candidate: ${result.candidate.response}\n\n`);
  process.stdout.write(
    `judge: ${result.judge?.verdict ?? "missing"} - ${
      result.judge?.summary ?? "No judge summary."
    }\n\n`,
  );
  process.stdout.write("suite summary:\n");
  process.stdout.write(`${JSON.stringify(suite.summary, null, 2)}\n`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
