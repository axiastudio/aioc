import assert from "node:assert/strict";
import { z } from "zod";
import { user } from "../../messages";
import { tool } from "../../tool";
import { ChatCompletionsProvider } from "../../providers/chat-completions";
import type { ProviderEvent } from "../../providers/base";

function createSseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

export async function runChatCompletionsIntegrationTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let capturedBody = "";

  const streamBody = createSseBody([
    `data: ${JSON.stringify({ choices: [{ delta: { content: "Ciao " } }] })}\n\n`,
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: {
                  name: "lookup",
                  arguments: JSON.stringify({ q: "aioc" }),
                },
              },
            ],
          },
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ finish_reason: "tool_calls" }] })}\n\n`,
    "data: [DONE]\n\n",
  ]);

  (globalThis as { fetch: typeof fetch }).fetch = (async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    capturedBody = String(init?.body ?? "");
    return new Response(streamBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  }) as typeof fetch;

  try {
    const lookupTool = tool({
      name: "lookup",
      description: "Lookup docs",
      parameters: z.object({
        q: z.string(),
      }),
      execute: () => ({ ok: true }),
    });

    const provider = new ChatCompletionsProvider({
      apiKey: "test-key",
      baseURL: "https://example.test/v1/",
    });

    const events: ProviderEvent[] = [];
    for await (const event of provider.stream({
      model: "test-model",
      systemPrompt: "System instructions",
      messages: [user("Hi")],
      tools: [lookupTool],
      modelSettings: {
        temperature: 0.1,
        top_p: 0.9,
        ignored_setting: true,
      },
    })) {
      events.push(event);
    }

    const payload = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.equal(payload.model, "test-model");
    assert.equal(payload.stream, true);
    assert.equal(payload.temperature, 0.1);
    assert.equal(payload.top_p, 0.9);
    assert.equal(payload.ignored_setting, undefined);
    assert.equal(payload.tool_choice, "auto");

    const messages = payload.messages as Array<Record<string, unknown>>;
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[0]?.content, "System instructions");
    assert.equal(messages[1]?.role, "user");
    assert.equal(messages[1]?.content, "Hi");

    const tools = payload.tools as Array<Record<string, unknown>>;
    assert.equal(tools.length, 1);
    assert.equal(
      (tools[0]?.function as Record<string, unknown>)?.name,
      "lookup",
    );

    assert.equal(events[0]?.type, "delta");
    assert.equal(
      (events[0] as Extract<ProviderEvent, { type: "delta" }>).delta,
      "Ciao ",
    );
    assert.equal(events[1]?.type, "tool_call");
    assert.equal(
      (events[1] as Extract<ProviderEvent, { type: "tool_call" }>).name,
      "lookup",
    );
    assert.equal(events[2]?.type, "completed");
    assert.equal(
      (events[2] as Extract<ProviderEvent, { type: "completed" }>).finishReason,
      "tool_calls",
    );
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
}
