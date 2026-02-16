import type { Agent } from "./agent";
import type { RunLogger } from "./logger";

export type ModelSettings = Record<string, unknown>;
export type Role = "user" | "assistant" | "system";

export interface MessageInputItem {
  type: "message";
  role: Role;
  content: string;
  rawItem?: unknown;
}

export interface ToolCallItem {
  type: "tool_call_item";
  callId: string;
  name: string;
  arguments?: unknown;
  rawItem?: unknown;
}

export interface ToolCallOutputItem {
  type: "tool_call_output_item";
  callId: string;
  output?: unknown;
  rawItem?: unknown;
}

export interface RunMessageOutputItem {
  type: "message_output_item";
  content: string;
  rawItem?: unknown;
}

export type AgentInputItem =
  | MessageInputItem
  | ToolCallItem
  | ToolCallOutputItem;

export type RunItem = ToolCallItem | ToolCallOutputItem | RunMessageOutputItem;

export interface RawModelStreamEvent {
  type: "raw_model_stream_event";
  data: {
    delta?: string;
  };
}

export interface AgentUpdatedStreamEvent<TContext = unknown> {
  type: "agent_updated_stream_event";
  agent: Agent<TContext>;
}

export interface RunItemStreamEvent {
  type: "run_item_stream_event";
  item: RunItem;
}

export type RunStreamEvent<TContext = unknown> =
  | RawModelStreamEvent
  | AgentUpdatedStreamEvent<TContext>
  | RunItemStreamEvent;

export type SharedRunOptions<TContext = unknown> = {
  context?: TContext;
  maxTurns?: number;
  logger?: RunLogger;
};

export type StreamRunOptions<TContext = unknown> =
  SharedRunOptions<TContext> & {
    stream: true;
  };

export type NonStreamRunOptions<TContext = unknown> =
  SharedRunOptions<TContext> & {
    stream?: false;
  };

export type IndividualRunOptions<TContext = unknown> =
  | StreamRunOptions<TContext>
  | NonStreamRunOptions<TContext>;

export interface RunResult<TContext = unknown> {
  finalOutput: string;
  history: AgentInputItem[];
  lastAgent: Agent<TContext>;
}
