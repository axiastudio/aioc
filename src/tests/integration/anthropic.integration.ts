import assert from "node:assert/strict";
import { z } from "zod";
import { user } from "../../messages";
import { AnthropicProvider } from "../../providers/anthropic";
import type { ProviderEvent } from "../../providers/base";
import { tool } from "../../tool";

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

export async function runAnthropicIntegrationTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let capturedBody = "";

  const streamBody = createSseBody([
    `data: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "Ciao " },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Anthropic" },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_stop",
      index: 0,
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "tool_use",
        id: "toolu_1",
        name: "lookup",
      },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_delta",
      index: 1,
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify({ q: "aioc" }),
      },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "content_block_stop",
      index: 1,
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
    })}\n\n`,
    `data: ${JSON.stringify({
      type: "message_stop",
    })}\n\n`,
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

    const provider = new AnthropicProvider({
      apiKey: "test-key",
      baseURL: "https://example.test/v1/",
    });

    const events: ProviderEvent[] = [];
    for await (const event of provider.stream({
      model: "anthropic-test-model",
      systemPrompt: "System instructions",
      messages: [user("Hi")],
      tools: [lookupTool],
      modelSettings: {
        temperature: 0.2,
        top_p: 0.9,
        ignored_setting: true,
      },
    })) {
      events.push(event);
    }

    const payload = JSON.parse(capturedBody) as Record<string, unknown>;
    assert.equal(payload.model, "anthropic-test-model");
    assert.equal(payload.stream, true);
    assert.equal(payload.temperature, 0.2);
    assert.equal(payload.top_p, 0.9);
    assert.equal(payload.ignored_setting, undefined);
    assert.equal(payload.system, "System instructions");
    assert.equal(
      (payload.tool_choice as Record<string, unknown>)?.type,
      "auto",
    );

    const messages = payload.messages as Array<Record<string, unknown>>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "user");

    const content = messages[0]?.content as Array<Record<string, unknown>>;
    assert.equal(content[0]?.type, "text");
    assert.equal(content[0]?.text, "Hi");

    const tools = payload.tools as Array<Record<string, unknown>>;
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.name, "lookup");
    assert.equal(tools[0]?.description, "Lookup docs");

    assert.equal(events[0]?.type, "delta");
    assert.equal(
      (events[0] as Extract<ProviderEvent, { type: "delta" }>).delta,
      "Ciao ",
    );
    assert.equal(events[1]?.type, "delta");
    assert.equal(
      (events[1] as Extract<ProviderEvent, { type: "delta" }>).delta,
      "Anthropic",
    );
    assert.equal(events[2]?.type, "tool_call");
    assert.equal(
      (events[2] as Extract<ProviderEvent, { type: "tool_call" }>).callId,
      "toolu_1",
    );
    assert.equal(
      (events[2] as Extract<ProviderEvent, { type: "tool_call" }>).name,
      "lookup",
    );
    assert.equal(events[3]?.type, "completed");
    assert.equal(
      (events[3] as Extract<ProviderEvent, { type: "completed" }>).message,
      "Ciao Anthropic",
    );
    assert.equal(
      (events[3] as Extract<ProviderEvent, { type: "completed" }>).finishReason,
      "tool_use",
    );
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
}
