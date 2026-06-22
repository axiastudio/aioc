import type {
  AgentInputItem,
  RunRecord,
  RunRecordOptions,
} from "@axiastudio/aioc";

type Invokable<RunInput, RunOutput> = {
  invoke(input: RunInput, ...rest: unknown[]): Promise<RunOutput>;
};

export interface LangGraphRunRecordContext<
  RunInput = unknown,
  RunOutput = unknown,
> {
  integration: "langgraph";
  runnableName: string;
  input: RunInput;
  output?: RunOutput;
  error?: {
    name: string;
    message: string;
  };
}

export interface WithAiocRunRecordOptions<
  RunInput = unknown,
  RunOutput = unknown,
> {
  record: RunRecordOptions<LangGraphRunRecordContext<RunInput, RunOutput>>;
  runnableName?: string;
}

function createRunId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `langgraph_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toErrorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

function stringifyForRecord(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function inputToHistoryItem(input: unknown): AgentInputItem {
  return {
    type: "message",
    role: "user",
    content: stringifyForRecord(input),
  };
}

function outputToHistoryItem(output: unknown): AgentInputItem {
  return {
    type: "message",
    role: "assistant",
    content: stringifyForRecord(output),
  };
}

async function writeRunRecord<TContext>(
  options: RunRecordOptions<TContext>,
  record: RunRecord<TContext>,
): Promise<void> {
  const sink = options.sink;
  if (!sink) return;

  try {
    if (typeof sink === "function") {
      await sink(record);
      return;
    }

    await sink.write(record);
  } catch {
    // Recording must not change LangGraph runtime behavior.
  }
}

async function resolveContextSnapshot<TContext>(
  context: TContext,
  options: RunRecordOptions<TContext>,
): Promise<{ contextSnapshot: TContext; contextRedacted: boolean }> {
  if (!options.contextRedactor) {
    return {
      contextSnapshot: context,
      contextRedacted: false,
    };
  }

  try {
    return await options.contextRedactor(context);
  } catch {
    return {
      contextSnapshot: context,
      contextRedacted: false,
    };
  }
}

function resolveRunnableName(app: unknown, fallback?: string): string {
  if (fallback) return fallback;

  if (
    app &&
    typeof app === "object" &&
    "name" in app &&
    typeof app.name === "string" &&
    app.name.length > 0
  ) {
    return app.name;
  }

  return "LangGraph";
}

export function withAiocRunRecord<
  TApp extends Invokable<RunInput, RunOutput>,
  RunInput = Parameters<TApp["invoke"]>[0],
  RunOutput = Awaited<ReturnType<TApp["invoke"]>>,
>(app: TApp, options: WithAiocRunRecordOptions<RunInput, RunOutput>): TApp {
  const runnableName = resolveRunnableName(app, options.runnableName);

  return new Proxy(app, {
    get(target, property, receiver) {
      if (property !== "invoke") {
        return Reflect.get(target, property, receiver);
      }

      return async (
        input: RunInput,
        ...rest: unknown[]
      ): Promise<RunOutput> => {
        const startedAt = new Date().toISOString();
        const runId = options.record.runId ?? createRunId();
        const inputItem = inputToHistoryItem(input);

        try {
          const output = await target.invoke(input, ...rest);
          const outputItem = outputToHistoryItem(output);
          const context: LangGraphRunRecordContext<RunInput, RunOutput> = {
            integration: "langgraph" as const,
            runnableName,
            input,
            output,
          };
          const contextSnapshot = await resolveContextSnapshot(
            context,
            options.record,
          );

          await writeRunRecord(options.record, {
            runId,
            startedAt,
            completedAt: new Date().toISOString(),
            status: "completed",
            agentName: runnableName,
            providerName: "LangGraph",
            question: stringifyForRecord(input),
            response: stringifyForRecord(output),
            contextSnapshot: contextSnapshot.contextSnapshot,
            contextRedacted: contextSnapshot.contextRedacted,
            items: [inputItem, outputItem],
            inputItemCount: 1,
            promptSnapshots: [],
            requestFingerprints: [],
            policyDecisions: [],
            metadata: {
              ...options.record.metadata,
              integration: "langgraph",
              runnableName,
            },
          });

          return output;
        } catch (error) {
          const errorSummary = toErrorSummary(error);
          const context: LangGraphRunRecordContext<RunInput, RunOutput> = {
            integration: "langgraph" as const,
            runnableName,
            input,
            error: errorSummary,
          };
          const contextSnapshot = await resolveContextSnapshot(
            context,
            options.record,
          );

          await writeRunRecord(options.record, {
            runId,
            startedAt,
            completedAt: new Date().toISOString(),
            status: "failed",
            agentName: runnableName,
            providerName: "LangGraph",
            question: stringifyForRecord(input),
            response: "",
            contextSnapshot: contextSnapshot.contextSnapshot,
            contextRedacted: contextSnapshot.contextRedacted,
            items: [inputItem],
            inputItemCount: 1,
            promptSnapshots: [],
            requestFingerprints: [],
            policyDecisions: [],
            errorName: errorSummary.name,
            errorMessage: errorSummary.message,
            metadata: {
              ...options.record.metadata,
              integration: "langgraph",
              runnableName,
            },
          });

          throw error;
        }
      };
    },
  });
}
