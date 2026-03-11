import { z } from "zod";
import {
  Agent,
  allow,
  replayFromRunRecord,
  setDefaultProvider,
  tool,
  type ModelProvider,
  type ProviderEvent,
  type ProviderRequest,
  type RunRecord,
  type ToolPolicy,
} from "../../index";

interface DemoContext {
  actorId: string;
}

class HybridReplayProvider implements ModelProvider {
  async *stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    const hasToolOutput = request.messages.some(
      (item) => item.type === "tool_call_output_item",
    );

    if (!hasToolOutput) {
      yield {
        type: "tool_call",
        callId: "provider-call-1",
        name: "lookup_customer",
        arguments: JSON.stringify({ customerId: "C-42" }),
      };
      yield {
        type: "tool_call",
        callId: "provider-call-2",
        name: "lookup_customer",
        arguments: JSON.stringify({ customerId: "C-99" }),
      };
      yield { type: "completed", message: "" };
      return;
    }

    yield {
      type: "completed",
      message: "Hybrid replay completed.",
    };
  }
}

const sourceRunRecord: RunRecord<DemoContext> = {
  runId: "source-run-hybrid",
  startedAt: "2026-03-11T08:15:00.000Z",
  completedAt: "2026-03-11T08:15:01.000Z",
  status: "completed",
  agentName: "demo-agent",
  providerName: "DemoProvider",
  model: "demo-model",
  question: "Summarize C-42 and C-99",
  response: "Done",
  contextSnapshot: { actorId: "u-1" },
  items: [
    {
      type: "tool_call_item",
      callId: "source-call-1",
      name: "lookup_customer",
      arguments: { customerId: "C-42" },
    },
    {
      type: "tool_call_output_item",
      callId: "source-call-1",
      output: { source: "recorded", tier: "enterprise", customerId: "C-42" },
    },
  ],
  promptSnapshots: [],
  requestFingerprints: [],
  policyDecisions: [],
  guardrailDecisions: [],
};

async function main(): Promise<void> {
  setDefaultProvider(new HybridReplayProvider());

  let liveExecutions = 0;
  const lookupCustomer = tool<DemoContext>({
    name: "lookup_customer",
    description: "Live lookup fallback for missing recorded output",
    parameters: z.object({ customerId: z.string() }),
    execute: async ({ customerId }) => {
      liveExecutions += 1;
      return {
        source: "live",
        customerId,
      };
    },
  });

  const agent = new Agent<DemoContext>({
    name: "Demo Agent",
    model: "demo-model",
    tools: [lookupCustomer],
  });

  const toolPolicy: ToolPolicy<DemoContext> = () => allow("allow_replay");
  const replay = await replayFromRunRecord({
    sourceRunRecord,
    agent,
    mode: "hybrid",
    runOptions: {
      context: { actorId: "u-1" },
      policies: { toolPolicy },
    },
  });

  process.stdout.write(`finalOutput: ${replay.result.finalOutput}\n`);
  process.stdout.write(`liveExecutions: ${String(liveExecutions)}\n`);
  process.stdout.write(`replayStats: ${JSON.stringify(replay.replayStats)}\n`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
