import "dotenv/config";
import {
  allow,
  buildAgentHarness,
  loadAgentHarnessDescriptor,
  replayFromRunRecord,
  run,
  setupOpenAI,
  tool,
  type AgentInputItem,
  type RunRecord,
  type ToolPolicy,
} from "../../../src/index";

const descriptorV1 = loadAgentHarnessDescriptor(`
metadata: { version: explainer.v1 }
runtime: { entry_agent: explainer, max_turns: 4 }
agents:
  explainer:
    model: gpt-4.1-mini
    instructions: Explain the requested topic clearly and concisely.
`);

const descriptorV2 = loadAgentHarnessDescriptor(`
metadata: { version: explainer.v2 }
runtime: { entry_agent: explainer, max_turns: 4 }
tools:
  get_age_range: { target: example://tool/get_age_range }
agents:
  explainer:
    model: gpt-4.1-mini
    tools: [get_age_range]
    instructions: |-
      Explain the requested topic clearly and concisely.
      Before answering, call get_age_range exactly once.
      Adapt the explanation to the returned learner age range.
`);

async function main(): Promise<void> {
  setupOpenAI();
  // setupMistral();

  const initialInput: AgentInputItem[] = [
    {
      type: "message",
      role: "system",
      content: "Contract: answer in one short paragraph.",
    },
    { type: "message", role: "user", content: "Explain photosynthesis." },
  ];

  const harnessV1 = buildAgentHarness(descriptorV1);

  // First run: record the current harness behavior. The RunRecord is the source
  // artifact that the candidate harness will replay from.
  const records: RunRecord[] = [];
  await run(harnessV1.entryAgent, initialInput, {
    ...harnessV1.runOptions,
    record: {
      metadata: { harness: harnessV1.metadata },
      sink: (record) => {
        records.push(record);
      },
    },
  });

  const sourceRunRecord = records[0];
  if (!sourceRunRecord) {
    throw new Error("Missing source RunRecord.");
  }

  // Candidate harness: the new tool is part of the contract, but the real
  // integration is intentionally not ready yet.
  const getAgeRange = tool({
    name: "get_age_range",
    description: "Return the learner age range.",
    execute: () => {
      throw new Error("get_age_range is not implemented yet.");
    },
  });

  const harnessV2 = buildAgentHarness(descriptorV2, {
    registryVersion: "candidate-registry@2",
    tools: { "example://tool/get_age_range": getAgeRange },
  });

  const toolPolicy: ToolPolicy = () => allow("allow_replay");

  // Strict replay normally fails when the candidate asks for a tool output that
  // does not exist in the source RunRecord. Here we mock that output explicitly.
  const replay = await replayFromRunRecord({
    sourceRunRecord,
    agent: harnessV2.entryAgent,
    mode: "strict",
    onMissingToolCall: ({ toolName }) => {
      if (toolName === "get_age_range") {
        return { action: "use_output", output: { ageRange: "8-10" } };
      }
      return { action: "throw" };
    },
    metadataOverrides: {
      replayOfRunId: sourceRunRecord.runId,
      harness: harnessV2.metadata,
    },
    runOptions: {
      ...harnessV2.runOptions,
      policies: { toolPolicy },
      record: {},
    },
  });

  process.stdout.write(
    [
      `v1: ${sourceRunRecord.response}`,
      `v2: ${replay.result.finalOutput}`,
    ].join("\n"),
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
