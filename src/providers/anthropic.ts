import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "../tool";
import type { AgentInputItem, ModelSettings } from "../types";
import type { ModelProvider, ProviderEvent, ProviderRequest } from "./base";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL?: string;
  anthropicVersion?: string;
  headers?: Record<string, string>;
}

type AnthropicMessage = {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type PendingToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type StreamChunk = {
  type: string;
  index?: number;
  content_block?: {
    type?: "text" | "tool_use" | string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: "text_delta" | "input_json_delta" | string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
};

type ToolUseState = {
  type: "tool_use";
  id: string;
  name: string;
  inputJson: string;
};

type TextState = {
  type: "text";
};

type BlockState = ToolUseState | TextState;

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, "");
}

function toJsonSchema(schema: unknown): Record<string, unknown> {
  const convert = zodToJsonSchema as unknown as (
    value: unknown,
    options?: unknown,
  ) => unknown;
  return convert(schema, { $refStrategy: "none" }) as Record<string, unknown>;
}

function stringifySafe(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function toContentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return stringifySafe(value);
}

function pushMessage(
  messages: AnthropicMessage[],
  role: "user" | "assistant",
  block: Record<string, unknown>,
): void {
  const last = messages[messages.length - 1];
  if (last && last.role === role) {
    last.content.push(block);
    return;
  }
  messages.push({
    role,
    content: [block],
  });
}

function toAnthropicMessages(items: AgentInputItem[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  for (const item of items) {
    if (item.type === "message") {
      const role = item.role === "assistant" ? "assistant" : "user";
      pushMessage(messages, role, {
        type: "text",
        text: toContentText(item.content),
      });
      continue;
    }

    if (item.type === "tool_call_item") {
      pushMessage(messages, "assistant", {
        type: "tool_use",
        id: item.callId,
        name: item.name,
        input:
          item.arguments && typeof item.arguments === "object"
            ? item.arguments
            : {},
      });
      continue;
    }

    if (item.type === "tool_call_output_item") {
      pushMessage(messages, "user", {
        type: "tool_result",
        tool_use_id: item.callId,
        content: stringifySafe(item.output),
      });
    }
  }

  return messages;
}

function toModelSettings(
  modelSettings?: ModelSettings,
): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  const allowed = ["max_tokens", "temperature", "top_p", "top_k"];

  if (!modelSettings) {
    parsed.max_tokens = DEFAULT_MAX_TOKENS;
    return parsed;
  }

  for (const key of allowed) {
    if (typeof modelSettings[key] !== "undefined") {
      parsed[key] = modelSettings[key];
    }
  }

  if (typeof parsed.max_tokens === "undefined") {
    parsed.max_tokens = DEFAULT_MAX_TOKENS;
  }

  return parsed;
}

function toTools<TContext>(tools: Tool<TContext>[]): AnthropicTool[] {
  return tools.map((definition) => {
    const schema = { ...toJsonSchema(definition.parameters) };
    delete schema.$schema;
    return {
      name: definition.name,
      description: definition.description,
      input_schema: schema,
    };
  });
}

async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const payloadLines = rawEvent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/, ""));

      if (payloadLines.length > 0) {
        yield payloadLines.join("\n");
      }

      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    buffer += finalChunk;
  }

  const remaining = buffer.trim();
  if (!remaining) {
    return;
  }

  const payloadLines = remaining
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""));
  if (payloadLines.length > 0) {
    yield payloadLines.join("\n");
  }
}

export class AnthropicProvider implements ModelProvider {
  private readonly baseURL: string;
  private readonly headers: HeadersInit;

  constructor(options: AnthropicProviderOptions) {
    this.baseURL = normalizeBaseURL(options.baseURL ?? DEFAULT_BASE_URL);
    this.headers = {
      "x-api-key": options.apiKey,
      "anthropic-version":
        options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };
  }

  async *stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    const payload: Record<string, unknown> = {
      model: request.model,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
      tools: request.tools.length > 0 ? toTools(request.tools) : undefined,
      tool_choice: request.tools.length > 0 ? { type: "auto" } : undefined,
      stream: true,
      ...toModelSettings(request.modelSettings),
    };

    const response = await fetch(`${this.baseURL}/messages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Anthropic messages request failed (${response.status}): ${details || response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("Anthropic response has no stream body.");
    }

    const blockStates = new Map<number, BlockState>();
    const pendingToolCalls = new Map<number, PendingToolCall>();
    let outputText = "";
    let completed = false;
    let finishReason: string | undefined;

    const finalizeToolCall = (index: number): void => {
      const state = blockStates.get(index);
      if (!state || state.type !== "tool_use") {
        return;
      }
      pendingToolCalls.set(index, {
        id: state.id,
        name: state.name,
        arguments: state.inputJson || "{}",
      });
      blockStates.delete(index);
    };

    for await (const rawEvent of parseSseEvents(response.body)) {
      if (rawEvent === "[DONE]") {
        continue;
      }

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(rawEvent) as StreamChunk;
      } catch {
        continue;
      }

      if (chunk.type === "content_block_start") {
        const index = chunk.index ?? 0;
        const block = chunk.content_block;
        if (block?.type === "text") {
          blockStates.set(index, { type: "text" });
          if (typeof block.text === "string" && block.text.length > 0) {
            outputText += block.text;
            yield { type: "delta", delta: block.text };
          }
          continue;
        }

        if (block?.type === "tool_use") {
          const rawInput = block.input;
          const inputJson =
            typeof rawInput === "undefined" ? "" : stringifySafe(rawInput);
          blockStates.set(index, {
            type: "tool_use",
            id: block.id ?? `tool_use_${index}`,
            name: block.name ?? "",
            inputJson,
          });
          continue;
        }
      }

      if (chunk.type === "content_block_delta") {
        const index = chunk.index ?? 0;
        const state = blockStates.get(index);
        if (!state) {
          continue;
        }

        if (
          state.type === "text" &&
          chunk.delta?.type === "text_delta" &&
          typeof chunk.delta.text === "string"
        ) {
          outputText += chunk.delta.text;
          yield { type: "delta", delta: chunk.delta.text };
          continue;
        }

        if (
          state.type === "tool_use" &&
          chunk.delta?.type === "input_json_delta" &&
          typeof chunk.delta.partial_json === "string"
        ) {
          state.inputJson += chunk.delta.partial_json;
          blockStates.set(index, state);
          continue;
        }
      }

      if (chunk.type === "content_block_stop") {
        finalizeToolCall(chunk.index ?? 0);
        continue;
      }

      if (chunk.type === "message_delta") {
        finishReason = chunk.delta?.stop_reason ?? undefined;
        continue;
      }

      if (chunk.type === "message_stop") {
        completed = true;
        for (const [index, state] of blockStates.entries()) {
          if (state.type === "tool_use") {
            finalizeToolCall(index);
          }
        }
        for (const call of pendingToolCalls.values()) {
          yield {
            type: "tool_call",
            callId: call.id,
            name: call.name,
            arguments: call.arguments || "{}",
          };
        }
        yield {
          type: "completed",
          message: outputText,
          finishReason,
        };
        break;
      }
    }

    if (!completed) {
      for (const [index, state] of blockStates.entries()) {
        if (state.type === "tool_use") {
          finalizeToolCall(index);
        }
      }
      for (const call of pendingToolCalls.values()) {
        yield {
          type: "tool_call",
          callId: call.id,
          name: call.name,
          arguments: call.arguments || "{}",
        };
      }
      yield {
        type: "completed",
        message: outputText,
        finishReason,
      };
    }
  }
}
