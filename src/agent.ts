import { RunContext } from "./run-context";
import type { OutputGuardrail } from "./guardrails";
import type { Tool } from "./tool";
import type { ModelSettings } from "./types";

export type AgentInstructions<TContext = unknown> =
  | string
  | ((runContext: RunContext<TContext>) => string | Promise<string>);

export type AgentHandoffCondition<TContext = unknown> = (
  runContext: RunContext<TContext>,
) => boolean;

export interface AgentHandoff<TContext = unknown> {
  agent: Agent<TContext>;
  enabled?: AgentHandoffCondition<TContext>;
}

export type AgentHandoffEntry<TContext = unknown> =
  | Agent<TContext>
  | AgentHandoff<TContext>;

export interface AgentConfiguration<TContext = unknown> {
  name: string;
  handoffDescription?: string;
  instructions?: AgentInstructions<TContext>;
  promptVersion?: string;
  model?: string;
  modelSettings?: ModelSettings;
  tools?: Tool<TContext>[];
  handoffs?: AgentHandoffEntry<TContext>[];
  outputGuardrails?: OutputGuardrail<TContext>[];
}

export class Agent<TContext = unknown> {
  name: string;
  handoffDescription: string;
  instructions?: AgentInstructions<TContext>;
  promptVersion?: string;
  model?: string;
  modelSettings?: ModelSettings;
  tools: Tool<TContext>[];
  handoffs: Agent<TContext>[];
  handoffRules: AgentHandoff<TContext>[];
  outputGuardrails: OutputGuardrail<TContext>[];

  constructor(config: AgentConfiguration<TContext>) {
    this.name = config.name;
    this.handoffDescription = config.handoffDescription ?? "";
    this.instructions = config.instructions;
    this.promptVersion = config.promptVersion;
    this.model = config.model;
    this.modelSettings = config.modelSettings;
    this.tools = config.tools ?? [];
    this.handoffRules = (config.handoffs ?? []).map((handoff) =>
      handoff instanceof Agent ? { agent: handoff } : handoff,
    );
    this.handoffs = this.handoffRules.map((rule) => rule.agent);
    this.outputGuardrails = config.outputGuardrails ?? [];
  }

  async resolveInstructions(
    runContext: RunContext<TContext>,
  ): Promise<string | undefined> {
    if (typeof this.instructions === "undefined") {
      return undefined;
    }
    if (typeof this.instructions === "string") {
      return this.instructions;
    }
    return this.instructions(runContext);
  }
}
