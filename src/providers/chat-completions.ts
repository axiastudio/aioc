import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "../tool";
import type { AgentInputItem, ModelSettings } from "../types";
import { ModelProvider, ProviderEvent, ProviderRequest } from "./base";

export interface ChatCompletionsProviderOptions {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;
}

type PendingToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type ChatCompletionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
};

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

function toChatMessages(
  items: AgentInputItem[],
  systemPrompt?: string,
): ChatCompletionMessage[] {
  const messages: ChatCompletionMessage[] = [];

  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  for (const item of items) {
    if (item.type === "message") {
      messages.push({
        role: item.role,
        content: item.content,
      });
      continue;
    }

    if (item.type === "tool_call_item") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: item.callId,
            type: "function",
            function: {
              name: item.name,
              arguments: stringifySafe(item.arguments),
            },
          },
        ],
      });
      continue;
    }

    if (item.type === "tool_call_output_item") {
      messages.push({
        role: "tool",
        tool_call_id: item.callId,
        content: stringifySafe(item.output),
      });
    }
  }

  return messages;
}

function toModelSettings(
  modelSettings?: ModelSettings,
): Record<string, unknown> {
  if (!modelSettings) {
    return {};
  }

  const allowed = [
    "temperature",
    "top_p",
    "max_tokens",
    "presence_penalty",
    "frequency_penalty",
    "seed",
    "parallel_tool_calls",
  ];
  const parsed: Record<string, unknown> = {};

  for (const key of allowed) {
    if (typeof modelSettings[key] !== "undefined") {
      parsed[key] = modelSettings[key];
    }
  }

  return parsed;
}

function toTools<TContext>(tools: Tool<TContext>[]): ChatCompletionTool[] {
  return tools.map((definition) => {
    const rawSchema = zodToJsonSchema(definition.parameters, {
      $refStrategy: "none",
    }) as Record<string, unknown>;
    const schema = { ...rawSchema };
    delete schema.$schema;

    return {
      type: "function",
      function: {
        name: definition.name,
        description: definition.description,
        parameters: schema,
      },
    };
  });
}

function buildHeaders(options: ChatCompletionsProviderOptions): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };

  if (options.organization) {
    headers["OpenAI-Organization"] = options.organization;
  }
  if (options.project) {
    headers["OpenAI-Project"] = options.project;
  }

  return headers;
}

function normalizeBaseURL(baseURL?: string): string {
  return (baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
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

export class ChatCompletionsProvider implements ModelProvider {
  private baseURL: string;
  private headers: HeadersInit;

  constructor(options: ChatCompletionsProviderOptions) {
    this.baseURL = normalizeBaseURL(options.baseURL);
    this.headers = buildHeaders(options);
  }

  async *stream<TContext = unknown>(
    request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    const payload: Record<string, unknown> = {
      model: request.model,
      messages: toChatMessages(request.messages, request.systemPrompt),
      tools: request.tools.length > 0 ? toTools(request.tools) : undefined,
      tool_choice: request.tools.length > 0 ? "auto" : undefined,
      stream: true,
      ...toModelSettings(request.modelSettings),
    };

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Chat completions request failed (${response.status}): ${details || response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("Chat completions response has no stream body.");
    }

    const pendingToolCalls = new Map<number, PendingToolCall>();
    let outputText = "";
    let completed = false;

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

      const choice = chunk.choices?.[0];
      if (!choice) {
        continue;
      }

      if (typeof choice.delta?.content === "string") {
        outputText += choice.delta.content;
        yield {
          type: "delta",
          delta: choice.delta.content,
        };
      }

      if (choice.delta?.tool_calls) {
        for (const partialCall of choice.delta.tool_calls) {
          const index = partialCall.index ?? 0;
          const existing = pendingToolCalls.get(index) ?? {
            id: `call_${index}`,
            name: "",
            arguments: "",
          };

          if (partialCall.id) {
            existing.id = partialCall.id;
          }
          if (partialCall.function?.name) {
            existing.name = partialCall.function.name;
          }
          if (partialCall.function?.arguments) {
            existing.arguments += partialCall.function.arguments;
          }

          pendingToolCalls.set(index, existing);
        }
      }

      if (choice.finish_reason && !completed) {
        completed = true;
        if (choice.finish_reason === "tool_calls") {
          for (const call of pendingToolCalls.values()) {
            yield {
              type: "tool_call",
              callId: call.id,
              name: call.name,
              arguments: call.arguments || "{}",
            };
          }
        }

        yield {
          type: "completed",
          message: outputText,
          finishReason: choice.finish_reason,
        };
      }
    }

    if (!completed) {
      if (pendingToolCalls.size > 0) {
        for (const call of pendingToolCalls.values()) {
          yield {
            type: "tool_call",
            callId: call.id,
            name: call.name,
            arguments: call.arguments || "{}",
          };
        }
      }
      yield {
        type: "completed",
        message: outputText,
      };
    }
  }
}
