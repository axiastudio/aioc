import { z } from "zod";
import {
  Agent,
  allow,
  compareRunRecords,
  extractToolCalls,
  type ModelProvider,
  run,
  setDefaultProvider,
  tool,
  type RunRecord,
  type ToolPolicy,
} from "../../index";
import {
  DirectSummaryProvider,
  ProfileLookupProvider,
} from "./prompt-sensitive-provider";

interface SupportContext {
  actor: {
    userId: string;
    groups: string[];
  };
}

function listToolCallNames(record: RunRecord<SupportContext>): string[] {
  return extractToolCalls(record).map((call) => call.name);
}

function extractHandoffCalls(record: RunRecord<SupportContext>): string[] {
  return listToolCallNames(record).filter((name) =>
    name.startsWith("handoff_to_"),
  );
}

function setDifference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((entry) => !rightSet.has(entry));
}

function compareRecords(
  baseline: RunRecord<SupportContext>,
  candidate: RunRecord<SupportContext>,
): Record<string, unknown> {
  const baselineTools = listToolCallNames(baseline);
  const candidateTools = listToolCallNames(candidate);
  const comparison = compareRunRecords(baseline, candidate, {
    includeSections: [
      "response",
      "toolCalls",
      "policy",
      "guardrails",
      "metadata",
    ],
    responseMatchMode: "exact",
  });

  return {
    equal: comparison.equal,
    comparisonSummary: comparison.summary,
    comparisonMetrics: comparison.metrics,
    comparisonDifferences: comparison.differences,
    finalOutputChanged: !comparison.summary.sameFinalResponse,
    promptVersion: {
      baseline: baseline.promptSnapshots[0]?.promptVersion ?? null,
      candidate: candidate.promptSnapshots[0]?.promptVersion ?? null,
    },
    promptHashChanged:
      baseline.promptSnapshots[0]?.promptHash !==
      candidate.promptSnapshots[0]?.promptHash,
    toolsCalled: {
      baseline: baselineTools,
      candidate: candidateTools,
    },
    removedTools: setDifference(baselineTools, candidateTools),
    addedTools: setDifference(candidateTools, baselineTools),
    handoffsCalled: {
      baseline: extractHandoffCalls(baseline),
      candidate: extractHandoffCalls(candidate),
    },
    policyDecisionCount: {
      baseline: baseline.policyDecisions.length,
      candidate: candidate.policyDecisions.length,
    },
    requestFingerprintTurns: {
      baseline: baseline.requestFingerprints.length,
      candidate: candidate.requestFingerprints.length,
    },
    firstRequestHashChanged:
      baseline.requestFingerprints[0]?.requestHash !==
      candidate.requestFingerprints[0]?.requestHash,
  };
}

async function executeVersion(
  label: "v1" | "v2",
  agent: Agent<SupportContext>,
  toolPolicy: ToolPolicy<SupportContext>,
  provider: ModelProvider,
): Promise<RunRecord<SupportContext>> {
  setDefaultProvider(provider);
  const records: RunRecord<SupportContext>[] = [];

  const result = await run(
    agent,
    "Can you summarize customer C-42 and suggest the next action?",
    {
      context: {
        actor: {
          userId: "u-123",
          groups: ["support"],
        },
      },
      policies: { toolPolicy },
      maxTurns: 6,
      record: {
        includePromptText: true,
        metadata: {
          scenario: "non-regression-v1-v2",
          version: label,
          appBuildVersion: "demo-app.2.0.0",
        },
        contextRedactor: (context) => ({
          contextSnapshot: {
            actor: {
              ...context.actor,
              userId: "[redacted-user-id]",
            },
          },
          contextRedacted: true,
        }),
        sink: (record) => {
          records.push(record);
        },
      },
    },
  );

  process.stdout.write(`[${label}] assistant: ${result.finalOutput}\n`);

  if (records.length !== 1) {
    throw new Error(
      `Expected one run record for ${label}, got ${records.length}`,
    );
  }
  return records[0] as RunRecord<SupportContext>;
}

async function main(): Promise<void> {
  const baselineProvider = new ProfileLookupProvider();
  const candidateProvider = new DirectSummaryProvider();

  const getCustomerProfile = tool<SupportContext>({
    name: "get_customer_profile",
    description: "Returns profile attributes for a customer id.",
    parameters: z.object({
      customerId: z.string(),
    }),
    execute: async ({ customerId }) => ({
      customerId,
      segment: "enterprise",
      riskScore: 18,
      renewalWindowDays: 34,
    }),
  });

  const supportAgentV1 = new Agent<SupportContext>({
    name: "Customer Support Agent",
    model: "prompt-sensitive-model",
    promptVersion: "customer-support.v1",
    instructions:
      "For customer summaries, CALL_PROFILE_TOOL before giving the final answer.",
    tools: [getCustomerProfile],
  });

  const supportAgentV2 = new Agent<SupportContext>({
    name: "Customer Support Agent",
    model: "prompt-sensitive-model",
    promptVersion: "customer-support.v2",
    instructions:
      "Answer directly for this request and do not use external lookups unless strictly required.",
    tools: [getCustomerProfile],
  });

  const toolPolicy: ToolPolicy<SupportContext> = () =>
    allow("allow_support_profile_lookup", {
      policyVersion: "support-policy.v1",
    });

  const baseline = await executeVersion(
    "v1",
    supportAgentV1,
    toolPolicy,
    baselineProvider,
  );
  const candidate = await executeVersion(
    "v2",
    supportAgentV2,
    toolPolicy,
    candidateProvider,
  );

  const diff = compareRecords(baseline, candidate);
  process.stdout.write("\n=== RunRecord diff (v1 -> v2) ===\n");
  process.stdout.write(`${JSON.stringify(diff, null, 2)}\n`);

  process.stdout.write(
    "\nTip: the same pattern can detect handoff regressions by tracking tools named 'handoff_to_*'.\n",
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
