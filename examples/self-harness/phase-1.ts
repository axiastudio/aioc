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
  type RunRecord,
  type RunRegressionExpectation,
  type AgentHarnessDescriptor,
} from "@axiastudio/aioc";
import { createRunRegressionJudge } from "@axiastudio/aioc-regression-judge";

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
const TOOL_CAPABILITIES = [
  {
    toolName: "get_age_range",
    target: "example://tool/get_age_range",
    purpose: "Return the learner age range for the current session.",
  },
  {
    toolName: "get_session_color",
    target: "example://tool/get_session_color",
    purpose: "Return the learner's selected UI color for the current session.",
  },
  {
    toolName: "get_classroom_name",
    target: "example://tool/get_classroom_name",
    purpose: "Return the classroom name associated with the current session.",
  },
];
const ALLOWED_TOOL_NAMES = new Set(
  TOOL_CAPABILITIES.map((capability) => capability.toolName),
);
const ALLOWED_TOOL_TARGETS = new Set(
  TOOL_CAPABILITIES.map((capability) => capability.target),
);
const MAX_PROPOSAL_ATTEMPTS = 3;

const harnessAuthoringNotes = readFileSync(
  join(__dirname, "harness-authoring-notes.md"),
  "utf8",
);
const reportedRunRecord = JSON.parse(
  readFileSync(join(__dirname, "reported-runrecord-1.json"), "utf8"),
) as RunRecord;
const descriptorV1Text = readFileSync(
  join(__dirname, "harness-v1.yaml"),
  "utf8",
);

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
      allowedCapabilities: TOOL_CAPABILITIES,
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
    if (!ALLOWED_TOOL_TARGETS.has(toolDescriptor.target)) {
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

  for (const capability of TOOL_CAPABILITIES) {
    const descriptorTool = toolEntries.find(
      ([, toolDescriptor]) => toolDescriptor.target === capability.target,
    );

    if (instructions.includes(capability.toolName) && !descriptorTool) {
      issues.push(
        `candidate instructions mention ${capability.toolName} but descriptor does not declare a matching tool target`,
      );
    } else if (descriptorTool && !entryAgentTools.includes(descriptorTool[0])) {
      issues.push(
        `candidate descriptor declares ${capability.toolName} but does not attach it to the explainer agent`,
      );
    }
  }

  for (const toolName of proposal.suite.expectation.shouldUseTools ?? []) {
    if (!ALLOWED_TOOL_NAMES.has(toolName)) {
      issues.push(`expectation references unsupported tool ${toolName}`);
    }
  }

  return issues;
}

function usedTool(record: RunRecord, toolName: string): boolean {
  return record.policyDecisions.some(
    (decision) =>
      decision.resource.kind === "tool" &&
      decision.resource.name === toolName &&
      decision.decision === "allow",
  );
}

function missingExpectedTools(
  record: RunRecord,
  expectation: RunRegressionExpectation,
): string[] {
  return (expectation.shouldUseTools ?? []).filter(
    (toolName) => !usedTool(record, toolName),
  );
}

function finalVerdictSummary(options: {
  promote: boolean;
  judgeVerdict?: string;
  missingTools: string[];
}): string {
  if (options.promote) {
    return "The candidate evidence is acceptable: the judge passed and every expected tool was observed.";
  }

  if (options.judgeVerdict !== "pass" && options.missingTools.length > 0) {
    return `The candidate is not ready: the judge did not pass and the run missed expected tool usage (${options.missingTools.join(", ")}).`;
  }

  if (options.judgeVerdict !== "pass") {
    return "The candidate is not ready: the judge did not accept the expected behavior.";
  }

  return `The candidate is not ready: the judge passed, but the run missed expected tool usage (${options.missingTools.join(", ")}).`;
}

function printProposalAttempt(
  attempt: number,
  proposal: ProposalArtifact,
): void {
  process.stdout.write(
    `=== Proposal attempt ${attempt}/${MAX_PROPOSAL_ATTEMPTS} ===\n`,
  );
  process.stdout.write(`diagnosis: ${proposal.diagnosis}\n`);
  process.stdout.write(`candidate: ${proposal.candidateName}\n`);
  process.stdout.write(`suite: ${proposal.suite.name}\n`);
  process.stdout.write("expectation:\n");
  process.stdout.write(
    `${JSON.stringify(proposal.suite.expectation, null, 2)}\n\n`,
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

You may use any allowed capability if it is the best fix. You may also propose an instruction-only change.
If the candidate uses a tool, the descriptor must declare the tool target and attach the tool to the agent.
If the candidate uses data from a tool, it must not ask the user for the same data.
If using a tool is part of the intended improvement, include that tool name in expectation.shouldUseTools.
Use the harness authoring notes in the prompt payload for descriptor YAML syntax.
The candidate descriptor must define one entry agent named explainer and use model ${OPENAI_MODEL}.
Do not decide promotion.`,
  });

  const getAgeRange = tool({
    name: "get_age_range",
    description: "Return the learner age range for this session.",
    execute: async () => ({ ageRange: "8" }),
  });
  const getSessionColor = tool({
    name: "get_session_color",
    description: "Return the learner's selected UI color for this session.",
    execute: async () => ({ color: "green" }),
  });
  const getClassroomName = tool({
    name: "get_classroom_name",
    description: "Return the classroom name for this session.",
    execute: async () => ({ classroomName: "Oak Room" }),
  });

  process.stdout.write("=== Reported RunRecord #1 ===\n");
  process.stdout.write(`${reportedRunRecord.response}\n\n`);
  const toolPolicy = () => allow("allow_example_tool");

  const judge = createRunRegressionJudge({
    judgeModel: OPENAI_MODEL,
    generate: async ({ messages }) => {
      const judgeRun = await run(
        new Agent({
          name: "Self-Harness Evidence Judge",
          model: OPENAI_MODEL,
          instructions:
            messages.find((message) => message.role === "system")?.content ??
            "Return JSON only.",
        }),
        messages
          .filter((message) => message.role === "user")
          .map((message) => message.content)
          .join("\n\n"),
      );
      return judgeRun.finalOutput;
    },
  });

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
        "example://tool/get_age_range": getAgeRange,
        "example://tool/get_session_color": getSessionColor,
        "example://tool/get_classroom_name": getClassroomName,
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
    if (!result) {
      throw new Error("Missing validation result.");
    }

    const missingTools = missingExpectedTools(
      result.candidate,
      proposal.suite.expectation,
    );
    const promote =
      result.judge?.verdict === "pass" && missingTools.length === 0;

    process.stdout.write("=== Final verdict ===\n");
    process.stdout.write(`judge: ${result.judge?.verdict ?? "missing"}\n`);
    process.stdout.write(`decision: ${promote ? "promote v2" : "reject"}\n`);
    process.stdout.write(
      `summary: ${finalVerdictSummary({
        promote,
        judgeVerdict: result.judge?.verdict,
        missingTools,
      })}\n\n`,
    );

    if (promote) {
      return;
    }

    rejections.push(
      `attempt ${attempt}: judge verdict ${result.judge?.verdict ?? "missing"}; missing expected tools: ${missingTools.length > 0 ? missingTools.join(", ") : "none"}`,
    );
  }

  process.stdout.write("=== Retry limit reached ===\n");
  process.stdout.write(
    `No proposal was accepted after ${MAX_PROPOSAL_ATTEMPTS} attempts.\n`,
  );
  process.stdout.write("decision: reject\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
