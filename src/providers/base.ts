import type { Tool } from "../tool";
import type { AgentInputItem, ModelSettings } from "../types";

export interface ProviderRequest<TContext = unknown> {
  model: string;
  systemPrompt?: string;
  messages: AgentInputItem[];
  tools: Tool<TContext>[];
  modelSettings?: ModelSettings;
}

export type ProviderEvent =
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "tool_call";
      callId: string;
      name: string;
      arguments: string;
    }
  | {
      type: "completed";
      message: string;
      finishReason?: string;
    };

export interface ModelProvider {
  stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent>;
}
