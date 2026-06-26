import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Agent,
  allow,
  buildAgentHarness,
  loadAgentHarnessDescriptor,
  run,
  runRegressionSuite,
  setupOpenAI,
  tool,
  type RunJudge,
  type RunJudgeResult,
  type RunRecord,
  type RunRegressionExpectation,
  type AgentHarnessDescriptor,
} from "../../src/index";

type ProposalArtifact = {
  diagnosis: string;
  candidateName: "v2";
  candidateDescriptorSource: string;
  suite: {
    name: string;
    expectation: RunRegressionExpectation;
  };
};

const issueReport =
  "The learner profile says the learner is 8 years old, but the answer was not adapted to that age.";
const OPENAI_MODEL = "gpt-4.1-mini";
const AGE_RANGE_TOOL_NAME = "get_age_range";
const AGE_RANGE_TOOL_TARGET = "example://tool/get_age_range";
const MAX_PROPOSAL_RETRIES = 2;
const MAX_PROPOSAL_ATTEMPTS = MAX_PROPOSAL_RETRIES + 1;

const harnessAuthoringNotes = readFileSync(
  join(__dirname, "harness-authoring-notes.md"),
  "utf8",
);

const descriptorV1Text = `
runtime: { entry_agent: explainer, max_turns: 4 }
agents:
  explainer:
    model: ${OPENAI_MODEL}
    instructions: |-
      Explain the requested topic accurately and concisely.
      Do not ask for or infer learner profile data.
`;

function createProposalPrompt(options: {
  reportedRunRecord: RunRecord;
  rejections: string[];
}): string {
  return JSON.stringify(
    {
      task: "Propose a candidate AIOC harness and a validation expectation.",
      issueReport,
      harnessAuthoringNotes,
      baselineDescriptorSource: descriptorV1Text,
      reportedRunRecord: {
        question: options.reportedRunRecord.question,
        response: options.reportedRunRecord.response,
      },
      allowedCapability: {
        toolName: AGE_RANGE_TOOL_NAME,
        target: AGE_RANGE_TOOL_TARGET,
        purpose: "Return the learner age range for the current session.",
      },
      candidateConstraints: {
        candidateName: "v2",
        model: OPENAI_MODEL,
        entryAgent: "explainer",
        maxTurns: 4,
      },
      previousRejections: options.rejections,
    },
    null,
    2,
  );
}

function extractJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("Expected a JSON object in model output.");
  }
  return text.slice(first, last + 1);
}

function parseJsonObject<T>(text: string): T {
  return JSON.parse(extractJsonObject(text)) as T;
}

function parseProposal(text: string): ProposalArtifact {
  const proposal = parseJsonObject<ProposalArtifact>(text);
  if (
    proposal.candidateName !== "v2" ||
    !proposal.candidateDescriptorSource ||
    !proposal.suite?.name ||
    !proposal.suite.expectation?.intent
  ) {
    throw new Error("Proposal output is missing required fields.");
  }
  return proposal;
}

function instructionText(descriptor: AgentHarnessDescriptor): string {
  const entryAgent = descriptor.agents[descriptor.runtime.entry_agent];
  const instructions = entryAgent?.instructions;

  if (typeof instructions === "string") {
    return instructions;
  }

  if (Array.isArray(instructions)) {
    return instructions.map((part) => part.text).join("\n");
  }

  return "";
}

function validateProposalArtifact(
  proposal: ProposalArtifact,
  descriptor: AgentHarnessDescriptor,
): string[] {
  const issues: string[] = [];
  const descriptorTools = descriptor.tools ?? {};
  const toolEntries = Array.isArray(descriptorTools)
    ? []
    : Object.entries(descriptorTools);
  const ageRangeTool = toolEntries.find(
    ([, toolDescriptor]) => toolDescriptor.target === AGE_RANGE_TOOL_TARGET,
  );
  const entryAgent = descriptor.agents[descriptor.runtime.entry_agent];
  const entryAgentTools = entryAgent?.tools ?? [];
  const instructions = instructionText(descriptor);

  if (descriptor.runtime.entry_agent !== "explainer") {
    issues.push("candidate runtime.entry_agent must be explainer");
  }

  if (Array.isArray(descriptorTools)) {
    issues.push(
      "candidate descriptor tools must be a YAML mapping keyed by logical tool id, not a list",
    );
  }

  for (const [toolName, toolDescriptor] of toolEntries) {
    if (toolDescriptor.target !== AGE_RANGE_TOOL_TARGET) {
      issues.push(
        `candidate descriptor declares unsupported tool target ${toolDescriptor.target} for ${toolName}`,
      );
    }
  }

  for (const toolName of entryAgentTools) {
    if (!descriptor.tools?.[toolName]) {
      issues.push(
        `candidate explainer agent references undeclared tool ${toolName}`,
      );
    }
  }

  if (instructions.includes(AGE_RANGE_TOOL_NAME) && !ageRangeTool) {
    issues.push(
      `candidate instructions mention ${AGE_RANGE_TOOL_NAME} but descriptor does not declare a matching tool target`,
    );
  } else if (ageRangeTool && !entryAgentTools.includes(ageRangeTool[0])) {
    issues.push(
      `candidate descriptor declares ${AGE_RANGE_TOOL_NAME} but does not attach it to the explainer agent`,
    );
  }

  for (const toolName of proposal.suite.expectation.shouldUseTools ?? []) {
    if (toolName !== AGE_RANGE_TOOL_NAME) {
      issues.push(`expectation references unsupported tool ${toolName}`);
    }
  }

  return issues;
}

function parseJudgeResult(output: string): RunJudgeResult {
  const parsed = parseJsonObject<{ verdict?: string; summary?: string }>(output);
  const verdict =
    parsed.verdict === "pass" ||
    parsed.verdict === "warn" ||
    parsed.verdict === "fail"
      ? parsed.verdict
      : "fail";

  return {
    verdict,
    summary: parsed.summary ?? "Judge did not provide a summary.",
    findings: [],
  };
}

function usedTool(record: RunRecord, toolName: string): boolean {
  return record.policyDecisions.some(
    (decision) =>
      decision.resource.kind === "tool" &&
      decision.resource.name === toolName &&
      decision.decision === "allow",
  );
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function printProposalAttempt(attempt: number, proposal: ProposalArtifact): void {
  process.stdout.write(
    `=== Proposal attempt ${attempt}/${MAX_PROPOSAL_ATTEMPTS} ===\n`,
  );
  process.stdout.write(`diagnosis: ${proposal.diagnosis}\n`);
  process.stdout.write(`candidate: ${proposal.candidateName}\n`);
  process.stdout.write(`suite: ${proposal.suite.name}\n`);
  process.stdout.write(
    `expectation: ${proposal.suite.expectation.intent}\n\n`,
  );
  process.stdout.write("=== Candidate descriptor ===\n");
  process.stdout.write(`${proposal.candidateDescriptorSource.trim()}\n\n`);
}

function printReject(reasons: string[]): void {
  process.stdout.write("status: fail\n");
  for (const reason of reasons) {
    process.stdout.write(`- ${reason}\n`);
  }
  process.stdout.write("decision: reject\n\n");
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  setupOpenAI();

  const descriptorV1 = loadAgentHarnessDescriptor(descriptorV1Text);
  const harnessV1 = buildAgentHarness(descriptorV1);
  const input = "Explain photosynthesis.";

  let reportedRunRecord: RunRecord | undefined;
  await run(harnessV1.entryAgent, input, {
    ...harnessV1.runOptions,
    record: {
      metadata: {
        provider: "openai",
        harness: harnessV1.metadata,
        issue: issueReport,
      },
      sink: (record) => {
        reportedRunRecord = record;
      },
    },
  });

  if (!reportedRunRecord) {
    throw new Error("Missing reported RunRecord.");
  }

  const proposalAuthor = new Agent({
    name: "Self-Harness Proposal Author",
    model: OPENAI_MODEL,
    instructions: `Return only JSON. No Markdown.

Schema:
{
  "diagnosis": "short explanation of the issue",
  "candidateName": "v2",
  "candidateDescriptorSource": "AIOC YAML descriptor",
  "suite": {
    "name": "short-suite-name",
    "expectation": {
      "intent": "what should improve",
      "shouldUseTools": ["optional allowed tool names"],
      "shouldImprove": ["..."],
      "shouldPreserve": ["..."]
    }
  }
}

You may use the allowed capability if it is the best fix. You may also propose an instruction-only change.
If the candidate uses a tool, the descriptor must declare the tool target and attach the tool to the agent.
If the candidate uses profile data from a tool, it must not ask the user for the same data.
Use the harness authoring notes in the prompt payload for descriptor YAML syntax.
The candidate descriptor must define one entry agent named explainer and use model ${OPENAI_MODEL}.
Do not decide promotion.`,
  });

  const getAgeRange = tool({
    name: AGE_RANGE_TOOL_NAME,
    description: "Return the learner age range for this session.",
    execute: async () => ({ ageRange: "8" }),
  });

  process.stdout.write("=== Reported RunRecord #1 ===\n");
  process.stdout.write(`${reportedRunRecord.response}\n\n`);
  const toolPolicy = () => allow("allow_example_age_range_tool");

  const judgeAgent = new Agent({
    name: "Self-Harness Evidence Judge",
    model: OPENAI_MODEL,
    instructions: `Return only JSON. No Markdown.

Schema:
{
  "verdict": "pass" | "warn" | "fail",
  "summary": "one short sentence"
}

Pass only if the candidate appears to satisfy the expectation, used ${AGE_RANGE_TOOL_NAME}, and preserved factual correctness.`,
  });

  const judge: RunJudge = async ({
    baseline,
    candidate,
    comparison,
    expectation,
  }): Promise<RunJudgeResult> => {
    const judgeRun = await run(
      judgeAgent,
      JSON.stringify(
        {
          issueReport,
          expectation,
          baseline: {
            response: baseline.response,
          },
          candidate: {
            response: candidate.response,
            usedGetAgeRange: usedTool(candidate, AGE_RANGE_TOOL_NAME),
          },
          deterministicComparison: comparison.summary,
        },
        null,
        2,
      ),
    );
    return parseJudgeResult(judgeRun.finalOutput);
  };

  const rejections: string[] = [];

  for (let attempt = 1; attempt <= MAX_PROPOSAL_ATTEMPTS; attempt += 1) {
    const proposalRun = await run(
      proposalAuthor,
      createProposalPrompt({
        reportedRunRecord,
        rejections,
      }),
    );

    let proposal: ProposalArtifact;
    try {
      proposal = parseProposal(proposalRun.finalOutput);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Could not parse proposal.";
      process.stdout.write(
        `=== Proposal attempt ${attempt}/${MAX_PROPOSAL_ATTEMPTS} ===\n`,
      );
      process.stdout.write("raw output:\n");
      process.stdout.write(`${proposalRun.finalOutput}\n\n`);
      process.stdout.write("=== Static proposal check ===\n");
      printReject([reason]);
      rejections.push(`attempt ${attempt}: ${reason}`);
      continue;
    }

    printProposalAttempt(attempt, proposal);

    let descriptorV2: AgentHarnessDescriptor;
    try {
      descriptorV2 = loadAgentHarnessDescriptor(
        proposal.candidateDescriptorSource,
      );
    } catch (error) {
      const reason =
        error instanceof Error
          ? `candidate descriptor is not valid AIOC YAML: ${error.message}`
          : "candidate descriptor is not valid AIOC YAML";
      process.stdout.write("=== Static proposal check ===\n");
      printReject([reason]);
      rejections.push(`attempt ${attempt}: ${reason}`);
      continue;
    }

    const proposalIssues = validateProposalArtifact(proposal, descriptorV2);
    process.stdout.write("=== Static proposal check ===\n");
    if (proposalIssues.length > 0) {
      printReject(proposalIssues);
      rejections.push(`attempt ${attempt}: ${proposalIssues.join("; ")}`);
      continue;
    }
    process.stdout.write("status: pass\n\n");

    if (!force) {
      process.stdout.write("=== Dry run boundary ===\n");
      process.stdout.write(
        "Candidate replay is blocked by default. Re-run with --force to execute v2 against RunRecord #1.\n",
      );
      return;
    }

    const harnessV2 = buildAgentHarness(descriptorV2, {
      tools: {
        [AGE_RANGE_TOOL_TARGET]: getAgeRange,
      },
    });

    const validation = await runRegressionSuite({
      suite: {
        name: proposal.suite.name,
        expectation: proposal.suite.expectation,
        cases: [{ name: "reported-runrecord-1", baseline: reportedRunRecord }],
      },
      agent: harnessV2.entryAgent,
      mode: "live",
      baselineDescriptor: descriptorV1,
      candidateDescriptor: descriptorV2,
      judge,
      runOptions: {
        ...harnessV2.runOptions,
        policies: { toolPolicy },
        record: {
          metadata: {
            provider: "openai",
            harness: harnessV2.metadata,
            proposal: proposal.candidateName,
          },
        },
      },
    });

    const result = validation.results[0];
    const summary = validation.summary.cases[0];
    if (!result || !summary) {
      throw new Error("Missing validation result.");
    }

    const promote =
      result.judge?.verdict === "pass" &&
      usedTool(result.candidate, AGE_RANGE_TOOL_NAME);

    process.stdout.write("=== Candidate RunRecord #1 ===\n");
    process.stdout.write(`${result.candidate.response}\n\n`);

    process.stdout.write("=== AIOC validation ===\n");
    process.stdout.write(`summary status: ${validation.summary.status}\n`);
    process.stdout.write(
      `final output changed: ${yesNo(summary.signals.finalOutputChanged)}\n`,
    );
    process.stdout.write(
      `tool calls changed: ${yesNo(summary.signals.toolsChanged)}\n`,
    );
    process.stdout.write(`judge: ${result.judge?.verdict ?? "missing"}\n`);
    process.stdout.write(`decision: ${promote ? "promote v2" : "reject"}\n\n`);

    if (promote) {
      return;
    }

    rejections.push(
      `attempt ${attempt}: judge verdict ${result.judge?.verdict ?? "missing"}; used ${AGE_RANGE_TOOL_NAME}: ${yesNo(usedTool(result.candidate, AGE_RANGE_TOOL_NAME))}`,
    );
  }

  process.stdout.write("=== Retry limit reached ===\n");
  process.stdout.write(
    `No proposal was accepted after ${MAX_PROPOSAL_ATTEMPTS} attempts (${MAX_PROPOSAL_RETRIES} retries).\n`,
  );
  process.stdout.write("decision: reject\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
