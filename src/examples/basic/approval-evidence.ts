import "dotenv/config";
import {
  Agent,
  ToolCallApprovalRequiredError,
  allow,
  requireApproval,
  run,
  tool,
  type ToolPolicy,
} from "../../index";
import { getExampleProviderConfig } from "../support/live-provider";

type ApprovalEvidenceContext = {
  approvedProposalHashes: string[];
};

async function main(): Promise<void> {
  const { setup, model } = getExampleProviderConfig();
  setup();

  const export_report = tool({
    name: "export_report",
    description: "Export the report.",
    execute: async () => ({ exported: true }),
  });

  const toolPolicy: ToolPolicy<ApprovalEvidenceContext> = ({
    proposalHash,
    runContext,
  }) => {
    if (runContext.context.approvedProposalHashes.includes(proposalHash)) {
      return allow("approval_granted");
    }

    return requireApproval("approval_export_report", {
      publicReason: "Export requires explicit approval.",
    });
  };

  const agent = new Agent<ApprovalEvidenceContext>({
    name: "Approval evidence agent",
    model,
    instructions: "Use export_report if the user asks to export the report.",
    tools: [export_report],
  });

  let approvedProposalHash = "";

  try {
    await run(agent, "Export the report.", {
      context: { approvedProposalHashes: [] },
      policies: { toolPolicy },
    });
  } catch (error) {
    if (!(error instanceof ToolCallApprovalRequiredError)) {
      throw error;
    }

    approvedProposalHash = error.result.suspendedProposal.proposalHash;
    process.stdout.write(`pending approval hash: ${approvedProposalHash}\n`);
  }

  const approvedResult = await run(agent, "Export the report.", {
    context: { approvedProposalHashes: [approvedProposalHash] },
    policies: { toolPolicy },
  });

  const outputItem = approvedResult.history.find(
    (item) => item.type === "tool_call_output_item",
  );

  process.stdout.write(
    `tool output: ${JSON.stringify(
      outputItem && "output" in outputItem ? outputItem.output : null,
    )}\n`,
  );
  process.stdout.write(`assistant: ${approvedResult.finalOutput}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
