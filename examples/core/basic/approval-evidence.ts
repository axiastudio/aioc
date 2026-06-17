import "dotenv/config";
import {
  Agent,
  ToolCallApprovalRequiredError,
  allow,
  createApprovalRequestSeed,
  requireApproval,
  run,
  tool,
  toApprovedProposalHashes,
  type ApprovalGrant,
  type ToolPolicy,
} from "../../../src/index";
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

  let grant: ApprovalGrant | null = null;

  try {
    await run(agent, "Export the report.", {
      context: { approvedProposalHashes: [] },
      policies: { toolPolicy },
    });
  } catch (error) {
    if (!(error instanceof ToolCallApprovalRequiredError)) {
      throw error;
    }

    const approvalRequest = createApprovalRequestSeed(
      error.result.suspendedProposal,
    );
    process.stdout.write(
      `pending approval: ${JSON.stringify(approvalRequest)}\n`,
    );

    grant = {
      proposalHash: approvalRequest.proposalHash,
      approvedAt: "2026-05-22T10:00:00.000Z",
    };
  }

  if (!grant) {
    throw new Error("Expected the first run to require approval.");
  }

  const approvedResult = await run(agent, "Export the report.", {
    context: { approvedProposalHashes: toApprovedProposalHashes([grant]) },
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
