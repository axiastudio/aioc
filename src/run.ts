import { Agent } from "./agent";
import { getDefaultProvider } from "./config";
import {
  HandoffPolicyDeniedError,
  MaxTurnsExceededError,
  OutputGuardrailTripwireTriggered,
  ToolCallError,
  ToolCallPolicyDeniedError,
} from "./errors";
import type { RunLogger } from "./logger";
import { user } from "./messages";
import type { PolicyConfiguration, PolicyResult } from "./policy";
import { ModelProvider } from "./providers/base";
import { RunLogEmitter } from "./run-log-emitter";
import { RunContext } from "./run-context";
import type { Tool } from "./tool";
import {
  AgentInputItem,
  IndividualRunOptions,
  RunItemStreamEvent,
  RunMessageOutputItem,
  RunResult,
  RunStreamEvent,
  StreamRunOptions,
} from "./types";
import { z } from "zod";

type PendingToolCall = {
  callId: string;
  name: string;
  arguments: string;
};

type MutableRunState<TContext> = {
  history: AgentInputItem[];
  lastAgent: Agent<TContext>;
};

type HandoffRegistry<TContext> = Map<string, Agent<TContext>>;

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

function resolveAgentModel<TContext>(agent: Agent<TContext>): string {
  const model = agent.model?.trim();
  if (!model) {
    throw new Error(
      `Agent "${agent.name}" has no model configured. Set "model" explicitly.`,
    );
  }
  return model;
}

function sanitizeToolSegment(input: string): string {
  const sanitized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "agent";
}

function buildTurnTools<TContext>(agent: Agent<TContext>): {
  providerTools: Tool<TContext>[];
  handoffRegistry: HandoffRegistry<TContext>;
} {
  const handoffRegistry: HandoffRegistry<TContext> = new Map();
  const handoffTools: Tool<TContext>[] = [];
  const reservedNames = new Set(agent.tools.map((tool) => tool.name));

  for (const handoffAgent of agent.handoffs) {
    const baseName = `handoff_to_${sanitizeToolSegment(handoffAgent.name)}`;
    let toolName = baseName;
    let suffix = 2;

    while (reservedNames.has(toolName) || handoffRegistry.has(toolName)) {
      toolName = `${baseName}_${suffix}`;
      suffix += 1;
    }

    handoffRegistry.set(toolName, handoffAgent);
    reservedNames.add(toolName);

    handoffTools.push({
      name: toolName,
      description: handoffAgent.handoffDescription
        ? `Handoff to agent "${handoffAgent.name}". ${handoffAgent.handoffDescription}`
        : `Handoff to agent "${handoffAgent.name}".`,
      parameters: z.object({}).passthrough(),
      execute: () => ({ handoffTo: handoffAgent.name }),
    });
  }

  return {
    providerTools: [...agent.tools, ...handoffTools],
    handoffRegistry,
  };
}

function toErrorMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return {
    errorName: "Error",
    errorMessage: String(error),
  };
}

function createDeniedPolicyResult(
  reason: string,
  metadata?: Record<string, unknown>,
): PolicyResult {
  return {
    decision: "deny",
    reason,
    metadata,
  };
}

function isPolicyResult(value: unknown): value is PolicyResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PolicyResult>;
  const validDecision =
    candidate.decision === "allow" || candidate.decision === "deny";
  return (
    validDecision &&
    typeof candidate.reason === "string" &&
    candidate.reason.trim().length > 0
  );
}

async function evaluateToolPolicy<TContext>(
  agent: Agent<TContext>,
  call: PendingToolCall,
  parsedArguments: unknown,
  runContext: RunContext<TContext>,
  turn: number,
  policies?: PolicyConfiguration<TContext>,
): Promise<PolicyResult> {
  const policy = policies?.toolPolicy;
  if (!policy) {
    return createDeniedPolicyResult("policy_not_configured");
  }

  let rawResult: unknown;
  try {
    rawResult = await policy({
      agentName: agent.name,
      toolName: call.name,
      rawArguments: call.arguments,
      parsedArguments,
      runContext,
      turn,
    });
  } catch (error) {
    return createDeniedPolicyResult("policy_error", toErrorMetadata(error));
  }

  if (!isPolicyResult(rawResult)) {
    return createDeniedPolicyResult("invalid_policy_result");
  }

  return rawResult;
}

async function evaluateHandoffPolicy<TContext>(
  fromAgent: Agent<TContext>,
  toAgent: Agent<TContext>,
  call: PendingToolCall,
  handoffPayload: unknown,
  runContext: RunContext<TContext>,
  turn: number,
  policies?: PolicyConfiguration<TContext>,
): Promise<PolicyResult> {
  const policy = policies?.handoffPolicy;
  if (!policy) {
    return createDeniedPolicyResult("policy_not_configured");
  }

  let rawResult: unknown;
  try {
    rawResult = await policy({
      fromAgentName: fromAgent.name,
      toAgentName: toAgent.name,
      handoffPayload,
      runContext,
      turn,
    });
  } catch (error) {
    return createDeniedPolicyResult("policy_error", toErrorMetadata(error));
  }

  if (!isPolicyResult(rawResult)) {
    return createDeniedPolicyResult("invalid_policy_result");
  }

  return rawResult;
}

async function executeToolCall<TContext>(
  agent: Agent<TContext>,
  call: PendingToolCall,
  parsedArguments: unknown,
  runContext: RunContext<TContext>,
  turn: number,
  logEmitter: RunLogEmitter,
  policies?: PolicyConfiguration<TContext>,
): Promise<unknown> {
  const definition = agent.tools.find((tool) => tool.name === call.name);
  if (!definition) {
    throw new ToolCallError(`Tool "${call.name}" is not registered.`);
  }

  const policyResult = await evaluateToolPolicy(
    agent,
    call,
    parsedArguments,
    runContext,
    turn,
    policies,
  );

  await logEmitter.toolPolicyEvaluated(
    agent.name,
    turn,
    call.name,
    call.callId,
    policyResult.decision,
    policyResult.reason,
    policyResult.policyVersion,
    policyResult.metadata,
  );

  if (policyResult.decision !== "allow") {
    throw new ToolCallPolicyDeniedError({
      toolName: call.name,
      policyResult,
    });
  }

  const validated = definition.parameters.parse(parsedArguments);
  return definition.execute(validated, runContext);
}

async function evaluateOutputGuardrails<TContext>(
  agent: Agent<TContext>,
  runContext: RunContext<TContext>,
  history: AgentInputItem[],
  outputText: string,
  logEmitter: RunLogEmitter,
  turn: number,
): Promise<void> {
  for (const guardrail of agent.outputGuardrails) {
    await logEmitter.outputGuardrailStarted(agent.name, turn, guardrail.name);

    const output = await guardrail.execute({
      agent,
      runContext,
      outputText,
      history: [...history],
    });

    if (output.tripwireTriggered) {
      await logEmitter.outputGuardrailTriggered(
        agent.name,
        turn,
        guardrail.name,
        output.reason,
      );
      throw new OutputGuardrailTripwireTriggered({
        guardrail: guardrail.name,
        output,
        outputText,
      });
    }

    await logEmitter.outputGuardrailPassed(agent.name, turn, guardrail.name);
  }
}

async function* runLoop<TContext>(
  state: MutableRunState<TContext>,
  provider: ModelProvider,
  runContext: RunContext<TContext>,
  maxTurns: number,
  logger?: RunLogger,
  policies?: PolicyConfiguration<TContext>,
): AsyncIterable<RunStreamEvent<TContext>> {
  const logEmitter = new RunLogEmitter(logger);
  await logEmitter.runStarted(
    state.lastAgent.name,
    maxTurns,
    state.history.length,
  );
  yield {
    type: "agent_updated_stream_event",
    agent: state.lastAgent,
  };
  await logEmitter.agentActivated(state.lastAgent.name, 1);

  let activeTurn = 0;

  try {
    for (let turn = 0; turn < maxTurns; turn += 1) {
      activeTurn = turn + 1;
      const currentAgent = state.lastAgent;
      await logEmitter.turnStarted(currentAgent.name, activeTurn);
      const { providerTools, handoffRegistry } = buildTurnTools(currentAgent);

      const providerStream = provider.stream({
        model: resolveAgentModel(currentAgent),
        systemPrompt: await currentAgent.resolveInstructions(runContext),
        messages: state.history,
        tools: providerTools,
        modelSettings: currentAgent.modelSettings,
      });

      let outputText = "";
      const pendingToolCalls: PendingToolCall[] = [];
      let sawDelta = false;
      const hasOutputGuardrails = currentAgent.outputGuardrails.length > 0;
      const bufferedDeltas: string[] = [];

      for await (const modelEvent of providerStream) {
        if (modelEvent.type === "delta") {
          sawDelta = true;
          outputText += modelEvent.delta;
          if (hasOutputGuardrails) {
            bufferedDeltas.push(modelEvent.delta);
          } else {
            yield {
              type: "raw_model_stream_event",
              data: { delta: modelEvent.delta },
            };
          }
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

      if (hasOutputGuardrails) {
        await evaluateOutputGuardrails(
          currentAgent,
          runContext,
          state.history,
          outputText,
          logEmitter,
          activeTurn,
        );

        for (const delta of bufferedDeltas) {
          yield {
            type: "raw_model_stream_event",
            data: { delta },
          };
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

          await logEmitter.toolCallStarted(
            currentAgent.name,
            activeTurn,
            call.name,
            call.callId,
          );

          const handoffTarget = handoffRegistry.get(call.name);
          let toolOutput: unknown;
          try {
            if (handoffTarget) {
              const handoffPolicyResult = await evaluateHandoffPolicy(
                currentAgent,
                handoffTarget,
                call,
                callItemArguments,
                runContext,
                activeTurn,
                policies,
              );

              await logEmitter.handoffPolicyEvaluated(
                currentAgent.name,
                activeTurn,
                call.name,
                call.callId,
                handoffTarget.name,
                handoffPolicyResult.decision,
                handoffPolicyResult.reason,
                handoffPolicyResult.policyVersion,
                handoffPolicyResult.metadata,
              );

              if (handoffPolicyResult.decision !== "allow") {
                throw new HandoffPolicyDeniedError({
                  fromAgent: currentAgent.name,
                  toAgent: handoffTarget.name,
                  policyResult: handoffPolicyResult,
                });
              }

              toolOutput = {
                handoffTo: handoffTarget.name,
                accepted: true,
                payload: callItemArguments,
              };
              state.lastAgent = handoffTarget;
            } else {
              toolOutput = await executeToolCall(
                currentAgent,
                call,
                callItemArguments,
                runContext,
                activeTurn,
                logEmitter,
                policies,
              );
            }
          } catch (error) {
            await logEmitter.toolCallFailed(
              currentAgent.name,
              activeTurn,
              call.name,
              call.callId,
              error,
            );
            throw error;
          }

          await logEmitter.toolCallCompleted(
            currentAgent.name,
            activeTurn,
            call.name,
            call.callId,
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

          if (handoffTarget) {
            yield {
              type: "agent_updated_stream_event",
              agent: state.lastAgent,
            };
            await logEmitter.agentActivated(state.lastAgent.name, activeTurn);
          }
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

      await logEmitter.runCompleted(
        currentAgent.name,
        activeTurn,
        outputText.length,
      );

      return;
    }

    throw new MaxTurnsExceededError(maxTurns);
  } catch (error) {
    await logEmitter.runFailed(
      state.lastAgent.name,
      activeTurn || undefined,
      error,
    );
    throw error;
  }
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
  const stream = runLoop(
    state,
    provider,
    runContext,
    maxTurns,
    options.logger,
    options.policies,
  );

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
