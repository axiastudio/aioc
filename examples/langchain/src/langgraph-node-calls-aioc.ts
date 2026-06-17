import "dotenv/config";
import {
  Agent,
  allow,
  deny,
  run,
  setupOpenAI,
  tool,
  type RunRecord,
  type ToolPolicy,
} from "@axiastudio/aioc";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

interface CalculatorContext {
  actor: {
    userId: string;
    groups: string[];
  };
}

const CalculatorState = Annotation.Root({
  question: Annotation<string>(),
  answer: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => "",
  }),
  policyDecisions: Annotation<unknown[]>({
    reducer: (_current, next) => next,
    default: () => [],
  }),
});

const add = tool<CalculatorContext>({
  name: "add",
  description: "Add two numbers.",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: ({ a, b }) => a + b,
});

const multiply = tool<CalculatorContext>({
  name: "multiply",
  description: "Multiply two numbers.",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: ({ a, b }) => a * b,
});

const divide = tool<CalculatorContext>({
  name: "divide",
  description: "Divide two numbers.",
  parameters: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: ({ a, b }) => a / b,
});

const calculatorAgent = new Agent<CalculatorContext>({
  name: "Governed Calculator Agent",
  model: process.env.AIOC_EXAMPLE_MODEL ?? "gpt-4.1-mini",
  instructions:
    "You are a calculator. Use the available arithmetic tool before answering.",
  tools: [add, multiply, divide],
});

const toolPolicy: ToolPolicy<CalculatorContext> = ({ runContext, toolName }) => {
  if (!runContext.context.actor.groups.includes("calculator")) {
    return deny("deny_missing_calculator_group", {
      resultMode: "tool_result",
      publicReason: "You are not allowed to use calculator tools.",
    });
  }

  if (toolName === "divide") {
    return deny("deny_division_requires_review", {
      resultMode: "tool_result",
      publicReason: "Division requires a separate review in this example.",
    });
  }

  if (toolName === "add" || toolName === "multiply") {
    return allow("allow_basic_arithmetic");
  }

  return deny("deny_unknown_tool", { resultMode: "tool_result" });
};

const governedCalculator: typeof CalculatorState.Node = async (state) => {
  const records: RunRecord<CalculatorContext>[] = [];

  const result = await run(calculatorAgent, state.question, {
    context: {
      actor: {
        userId: "langgraph-user-42",
        groups: ["calculator"],
      },
    },
    maxTurns: 4,
    policies: { toolPolicy },
    record: {
      includePromptText: false,
      metadata: { example: "langgraph-node-calls-aioc" },
      contextRedactor: (context) => ({
        contextSnapshot: {
          actor: {
            ...context.actor,
            userId: "[redacted]",
          },
        },
        contextRedacted: true,
      }),
      sink: (record) => {
        records.push(record);
      },
    },
  });

  return {
    answer: result.finalOutput,
    policyDecisions: records[0]?.policyDecisions ?? [],
  };
};

async function main(): Promise<void> {
  setupOpenAI();

  const graph = new StateGraph(CalculatorState)
    .addNode("governedCalculator", governedCalculator)
    .addEdge(START, "governedCalculator")
    .addEdge("governedCalculator", END)
    .compile();

  const result = await graph.invoke({
    question: "Add 3 and 4.",
  });

  process.stdout.write("\nLangGraph result\n");
  process.stdout.write(`${result.answer}\n`);
  process.stdout.write("\naioc governed decisions\n");
  process.stdout.write(`${JSON.stringify(result.policyDecisions, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
