import type { Agent } from "./agent";
import { extractToolCalls, type ExtractedToolCall } from "./run-record-utils";
import type { StreamedRunResult } from "./run";
import type { AgentInputItem, ToolCallItem, ToolCallOutputItem } from "./types";

export type RunOutputEvent<TContext = unknown> =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "completed";
      finalOutput: string;
      history: AgentInputItem[];
      lastAgent: Agent<TContext>;
      toolCalls: ExtractedToolCall[];
    }
  | {
      type: "agent_updated";
      agent: Agent<TContext>;
    }
  | {
      type: "tool_call";
      item: ToolCallItem;
    }
  | {
      type: "tool_output";
      item: ToolCallOutputItem;
      output: unknown;
      toolCall?: ToolCallItem;
    };

export async function* toRunOutputEvents<TContext = unknown>(
  result: StreamedRunResult<TContext>,
  options?: {
    emitAgentUpdates?: boolean;
    emitToolCalls?: boolean;
    emitToolOutputs?: boolean;
  },
): AsyncIterable<RunOutputEvent<TContext>> {
  const toolCallsById = new Map<string, ToolCallItem>();
  let finalOutput = "";
  let hasSeenInitialAgent = false;

  for await (const event of result.toStream()) {
    if (event.type === "raw_model_stream_event") {
      if (typeof event.data.delta === "string") {
        yield {
          type: "text_delta",
          delta: event.data.delta,
        };
      }
      continue;
    }

    if (event.type === "agent_updated_stream_event") {
      if (!hasSeenInitialAgent) {
        hasSeenInitialAgent = true;
        continue;
      }

      if (options?.emitAgentUpdates) {
        yield {
          type: "agent_updated",
          agent: event.agent,
        };
      }
      continue;
    }

    if (event.item.type === "tool_call_item") {
      toolCallsById.set(event.item.callId, event.item);
      if (options?.emitToolCalls) {
        yield {
          type: "tool_call",
          item: event.item,
        };
      }
      continue;
    }

    if (event.item.type === "tool_call_output_item") {
      if (options?.emitToolOutputs) {
        const toolCall = toolCallsById.get(event.item.callId);
        yield {
          type: "tool_output",
          item: event.item,
          output: event.item.output,
          ...(toolCall ? { toolCall } : {}),
        };
      }
      continue;
    }

    finalOutput = event.item.content;
  }

  const history = [...result.history];

  yield {
    type: "completed",
    finalOutput,
    history,
    lastAgent: result.lastAgent,
    toolCalls: extractToolCalls(history),
  };
}
