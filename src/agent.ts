import { RunContext } from "./run-context";
import type { Tool } from "./tool";
import type { ModelSettings } from "./types";

export type AgentInstructions<TContext = unknown> =
  | string
  | ((runContext: RunContext<TContext>) => string | Promise<string>);

export interface AgentConfiguration<TContext = unknown> {
  name: string;
  handoffDescription?: string;
  instructions?: AgentInstructions<TContext>;
  model?: string;
  modelSettings?: ModelSettings;
  tools?: Tool<TContext>[];
  handoffs?: Agent<TContext>[];
}

export class Agent<TContext = unknown> {
  name: string;
  handoffDescription: string;
  instructions?: AgentInstructions<TContext>;
  model?: string;
  modelSettings?: ModelSettings;
  tools: Tool<TContext>[];
  handoffs: Agent<TContext>[];

  constructor(config: AgentConfiguration<TContext>) {
    this.name = config.name;
    this.handoffDescription = config.handoffDescription ?? "";
    this.instructions = config.instructions;
    this.model = config.model;
    this.modelSettings = config.modelSettings;
    this.tools = config.tools ?? [];
    this.handoffs = config.handoffs ?? [];
  }

  static create<TContext = unknown>(
    config: AgentConfiguration<TContext>,
  ): Agent<TContext> {
    return new Agent(config);
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
