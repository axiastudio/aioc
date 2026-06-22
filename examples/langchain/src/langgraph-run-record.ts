import "dotenv/config";
import type { RunRecord } from "@axiastudio/aioc";
import { ChatOpenAI } from "@langchain/openai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  withAiocRunRecord,
  type LangGraphRunRecordContext,
} from "./lib/aioc-langgraph";

const SupportState = Annotation.Root({
  question: Annotation<string>(),
  answer: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => "",
  }),
});

const model = new ChatOpenAI({
  model: process.env.AIOC_EXAMPLE_MODEL ?? "gpt-4.1-mini",
  temperature: 0,
});

const answerQuestion: typeof SupportState.Node = async (state) => {
  const response = await model.invoke([
    [
      "system",
      "Answer in two short sentences. If the answer is uncertain, say so.",
    ],
    ["user", state.question],
  ]);

  return {
    answer: String(response.content),
  };
};

function summarizeRecord(
  record: RunRecord<LangGraphRunRecordContext<unknown, unknown>>,
) {
  return {
    status: record.status,
    providerName: record.providerName,
    agentName: record.agentName,
    question: record.question,
    response: record.response,
    contextRedacted: record.contextRedacted,
    policyDecisions: record.policyDecisions.length,
    requestFingerprints: record.requestFingerprints.length,
  };
}

async function main(): Promise<void> {
  type RedactedGraphContext = LangGraphRunRecordContext<unknown, unknown>;

  const records: RunRecord<RedactedGraphContext>[] = [];

  const graph = new StateGraph(SupportState)
    .addNode("answerQuestion", answerQuestion)
    .addEdge(START, "answerQuestion")
    .addEdge("answerQuestion", END)
    .compile();

  const recordedGraph = withAiocRunRecord(graph, {
    runnableName: "support-answer-graph",
    record: {
      metadata: { example: "langgraph-run-record" },
      contextRedactor: (
        context,
      ): {
        contextSnapshot: RedactedGraphContext;
        contextRedacted: true;
      } => ({
        contextSnapshot: {
          integration: context.integration,
          runnableName: context.runnableName,
          input: "[redacted]",
          output: context.output ? "[redacted]" : undefined,
          error: context.error,
        },
        contextRedacted: true,
      }),
      sink: (record) => {
        records.push(record);
      },
    },
  });

  const result = await recordedGraph.invoke({
    question: "What is a policy gate in an agent runtime?",
  });

  process.stdout.write("\nLangGraph result\n");
  process.stdout.write(`${result.answer}\n`);
  process.stdout.write("\nGraph-level RunRecord summary\n");
  process.stdout.write(
    `${JSON.stringify(summarizeRecord(records[0]), null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
