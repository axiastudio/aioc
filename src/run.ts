import { Agent } from "./agent";
import { getDefaultProvider } from "./config";
import { MaxTurnsExceededError, ToolCallError } from "./errors";
import { user } from "./messages";
import { ModelProvider } from "./providers/base";
import { RunContext } from "./run-context";
import {
  AgentInputItem,
  IndividualRunOptions,
  RunItemStreamEvent,
  RunMessageOutputItem,
  RunResult,
  RunStreamEvent,
  StreamRunOptions,
} from "./types";

type PendingToolCall = {
  callId: string;
  name: string;
  arguments: string;
};

type MutableRunState<TContext> = {
  history: AgentInputItem[];
  lastAgent: Agent<TContext>;
};

function normalizeInput(input: string | AgentInputItem[]): AgentInputItem[] {
  if (typeof input === "string") {
    return [user(input)];
  }
  return [...input];
}

function parseArguments(rawArguments: string): unknown {
  const trimmed = rawArguments.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return {
      __raw: rawArguments,
    };
  }
}

async function executeToolCall<TContext>(
  agent: Agent<TContext>,
  call: PendingToolCall,
  runContext: RunContext<TContext>,
): Promise<unknown> {
  const definition = agent.tools.find((tool) => tool.name === call.name);
  if (!definition) {
    throw new ToolCallError(`Tool "${call.name}" is not registered.`);
  }

  const parsedArguments = parseArguments(call.arguments);
  const validated = definition.parameters.parse(parsedArguments);
  return definition.execute(validated, runContext);
}

async function* runLoop<TContext>(
  state: MutableRunState<TContext>,
  provider: ModelProvider,
  runContext: RunContext<TContext>,
  maxTurns: number,
): AsyncIterable<RunStreamEvent<TContext>> {
  yield {
    type: "agent_updated_stream_event",
    agent: state.lastAgent,
  };

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const currentAgent = state.lastAgent;
    const providerStream = provider.stream({
      model: currentAgent.model ?? "gpt-4o-mini",
      systemPrompt: await currentAgent.resolveInstructions(runContext),
      messages: state.history,
      tools: currentAgent.tools,
      modelSettings: currentAgent.modelSettings,
    });

    let outputText = "";
    const pendingToolCalls: PendingToolCall[] = [];
    let sawDelta = false;

    for await (const modelEvent of providerStream) {
      if (modelEvent.type === "delta") {
        sawDelta = true;
        outputText += modelEvent.delta;
        yield {
          type: "raw_model_stream_event",
          data: { delta: modelEvent.delta },
        };
        continue;
      }

      if (modelEvent.type === "tool_call") {
        pendingToolCalls.push({
          callId: modelEvent.callId,
          name: modelEvent.name,
          arguments: modelEvent.arguments,
        });
        continue;
      }

      if (!sawDelta && modelEvent.message) {
        outputText = modelEvent.message;
      }
    }

    if (pendingToolCalls.length > 0) {
      for (const call of pendingToolCalls) {
        const callItemArguments = parseArguments(call.arguments);
        const callItem = {
          type: "tool_call_item",
          callId: call.callId,
          name: call.name,
          arguments: callItemArguments,
          rawItem: {
            type: "function_call",
            id: call.callId,
            name: call.name,
            arguments: call.arguments,
          },
        } as const;

        state.history.push(callItem);
        yield {
          type: "run_item_stream_event",
          item: callItem,
        } as RunItemStreamEvent;

        const toolOutput = await executeToolCall(
          currentAgent,
          call,
          runContext,
        );

        const outputItem = {
          type: "tool_call_output_item",
          callId: call.callId,
          output: toolOutput,
          rawItem: {
            type: "function_call_result",
            call_id: call.callId,
            output: toolOutput,
          },
        } as const;

        state.history.push(outputItem);
        yield {
          type: "run_item_stream_event",
          item: outputItem,
        } as RunItemStreamEvent;
      }

      continue;
    }

    const outputItem: RunMessageOutputItem = {
      type: "message_output_item",
      content: outputText,
    };
    yield {
      type: "run_item_stream_event",
      item: outputItem,
    };

    state.history.push({
      type: "message",
      role: "assistant",
      content: outputText,
    });

    return;
  }

  throw new MaxTurnsExceededError(maxTurns);
}

export class StreamedRunResult<TContext = unknown> {
  private consumed = false;
  private stream: AsyncIterable<RunStreamEvent<TContext>>;
  private state: MutableRunState<TContext>;

  constructor(
    stream: AsyncIterable<RunStreamEvent<TContext>>,
    state: MutableRunState<TContext>,
  ) {
    this.stream = stream;
    this.state = state;
  }

  toStream(): AsyncIterable<RunStreamEvent<TContext>> {
    if (this.consumed) {
      throw new Error("This stream can only be consumed once.");
    }
    this.consumed = true;
    return this.stream;
  }

  get history(): AgentInputItem[] {
    return this.state.history;
  }

  get lastAgent(): Agent<TContext> {
    return this.state.lastAgent;
  }
}

export async function run<TContext = unknown>(
  startingAgent: Agent<TContext>,
  input: string | AgentInputItem[],
  options: StreamRunOptions<TContext>,
): Promise<StreamedRunResult<TContext>>;

export async function run<TContext = unknown>(
  startingAgent: Agent<TContext>,
  input: string | AgentInputItem[],
  options?: IndividualRunOptions<TContext>,
): Promise<RunResult<TContext>>;

export async function run<TContext = unknown>(
  startingAgent: Agent<TContext>,
  input: string | AgentInputItem[],
  options: IndividualRunOptions<TContext> = {},
): Promise<StreamedRunResult<TContext> | RunResult<TContext>> {
  const runContext = new RunContext<TContext>(
    (options.context ?? ({} as TContext)) as TContext,
  );
  const state: MutableRunState<TContext> = {
    history: normalizeInput(input),
    lastAgent: startingAgent,
  };

  const provider = getDefaultProvider();
  const maxTurns = options.maxTurns ?? 10;
  const stream = runLoop(state, provider, runContext, maxTurns);

  if (options.stream === true) {
    return new StreamedRunResult(stream, state);
  }

  let finalOutput = "";
  for await (const event of stream) {
    if (
      event.type === "run_item_stream_event" &&
      event.item.type === "message_output_item"
    ) {
      finalOutput = event.item.content;
    }
  }

  return {
    finalOutput,
    history: state.history,
    lastAgent: state.lastAgent,
  };
}
