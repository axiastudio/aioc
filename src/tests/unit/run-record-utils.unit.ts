import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  allow,
  compareRunRecords,
  extractToolCalls,
  replayFromRunRecord,
  setDefaultProvider,
  tool,
  type RunRecord,
} from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

interface TestContext {
  actorId: string;
}

function createRunRecord(
  overrides: Partial<RunRecord<TestContext>> = {},
): RunRecord<TestContext> {
  return {
    runId: "run-1",
    startedAt: "2026-03-10T10:00:00.000Z",
    completedAt: "2026-03-10T10:00:01.000Z",
    status: "completed",
    agentName: "Agent A",
    providerName: "ScriptedProvider",
    model: "fake-model",
    question: "hello",
    response: "world",
    contextSnapshot: {
      actorId: "actor-1",
    },
    contextRedacted: false,
    items: [],
    promptSnapshots: [],
    requestFingerprints: [],
    policyDecisions: [],
    guardrailDecisions: [],
    metadata: {},
    ...overrides,
  };
}

export async function runRunRecordUtilsUnitTests(): Promise<void> {
  {
    const items = [
      {
        type: "tool_call_item" as const,
        callId: "c1",
        name: "lookup",
        arguments: { b: 2, a: 1 },
      },
      {
        type: "tool_call_output_item" as const,
        callId: "c1",
        output: { ok: true },
      },
      {
        type: "tool_call_item" as const,
        callId: "c2",
        name: "search",
        arguments: { q: "aioc" },
      },
    ];

    const extracted = extractToolCalls(items);
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0]?.callId, "c1");
    assert.equal(extracted[0]?.name, "lookup");
    assert.equal(extracted[0]?.hasOutput, true);
    assert.deepEqual(extracted[0]?.output, { ok: true });
    assert.equal(extracted[0]?.turn, 1);
    assert.equal(extracted[1]?.callId, "c2");
    assert.equal(extracted[1]?.hasOutput, false);
    assert.equal(extracted[1]?.turn, 2);

    const left = extractToolCalls([
      {
        type: "tool_call_item",
        callId: "h1",
        name: "hash",
        arguments: { b: 2, a: 1 },
      },
    ]);
    const right = extractToolCalls([
      {
        type: "tool_call_item",
        callId: "h2",
        name: "hash",
        arguments: { a: 1, b: 2 },
      },
    ]);
    assert.equal(left[0]?.argsCanonicalJson, right[0]?.argsCanonicalJson);
    assert.equal(left[0]?.argsHash, right[0]?.argsHash);
  }

  {
    const recordA = createRunRecord({
      response: "same response",
      items: [
        {
          type: "tool_call_item",
          callId: "c1",
          name: "lookup",
          arguments: { id: "1" },
        },
        {
          type: "tool_call_output_item",
          callId: "c1",
          output: { value: 42 },
        },
      ],
      policyDecisions: [
        {
          timestamp: "2026-03-10T10:00:00.000Z",
          turn: 1,
          callId: "c1",
          decision: "allow",
          reason: "ok",
          resource: {
            kind: "tool",
            name: "lookup",
          },
        },
      ],
    });
    const recordB = createRunRecord({
      ...recordA,
      items: [...recordA.items],
      policyDecisions: [...recordA.policyDecisions],
    });

    const equalComparison = compareRunRecords(recordA, recordB);
    assert.equal(equalComparison.equal, true);
    assert.equal(equalComparison.summary.sameFinalResponse, true);
    assert.equal(equalComparison.summary.sameToolCallShape, true);
    assert.equal(equalComparison.summary.samePolicyDecisions, true);
    assert.equal(equalComparison.differences.length, 0);

    const recordC = createRunRecord({
      ...recordA,
      response: "different response",
      items: [
        {
          type: "tool_call_item",
          callId: "c1",
          name: "lookup",
          arguments: { id: "2" },
        },
        {
          type: "tool_call_output_item",
          callId: "c1",
          output: { value: 99 },
        },
      ],
      policyDecisions: [
        {
          timestamp: "2026-03-10T10:00:00.000Z",
          turn: 1,
          callId: "c1",
          decision: "deny",
          reason: "blocked",
          resource: {
            kind: "tool",
            name: "lookup",
          },
        },
      ],
    });

    const diffComparison = compareRunRecords(recordA, recordC);
    assert.equal(diffComparison.equal, false);
    assert.equal(diffComparison.summary.sameFinalResponse, false);
    assert.equal(diffComparison.summary.sameToolCallShape, false);
    assert.equal(diffComparison.summary.samePolicyDecisions, false);
    assert.ok(
      diffComparison.differences.some(
        (difference) => difference.path === "response",
      ),
    );
    assert.ok(
      diffComparison.differences.some((difference) =>
        difference.path.includes("toolCalls[0].argsHash"),
      ),
    );
    assert.ok(
      diffComparison.differences.some((difference) =>
        difference.path.includes("policyDecisions[0]"),
      ),
    );
  }

  {
    const sourceRunRecord = createRunRecord({
      question: "strict replay",
      items: [
        {
          type: "tool_call_item",
          callId: "src-call-1",
          name: "dangerous_lookup",
          arguments: { id: "42" },
        },
        {
          type: "tool_call_output_item",
          callId: "src-call-1",
          output: { source: "recorded" },
        },
      ],
    });

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "replay-call-1",
            name: "dangerous_lookup",
            arguments: JSON.stringify({ id: "42" }),
          },
        ],
        [{ type: "completed", message: "strict-complete" }],
      ]),
    );

    let liveInvocations = 0;
    const dangerousLookup = tool<TestContext>({
      name: "dangerous_lookup",
      description: "Would fail if called live",
      parameters: z.object({ id: z.string() }),
      execute: () => {
        liveInvocations += 1;
        throw new Error("live execution should not happen in strict mode");
      },
    });

    const agent = new Agent<TestContext>({
      name: "Replay Strict Agent",
      model: "fake-model",
      tools: [dangerousLookup],
    });

    const replayRecordSink: RunRecord<TestContext>[] = [];
    const replay = await replayFromRunRecord({
      sourceRunRecord,
      agent,
      mode: "strict",
      metadataOverrides: {
        scenario: "strict-replay",
      },
      runOptions: {
        policies: {
          toolPolicy: () => allow("allow"),
        },
        record: {
          sink: (record) => {
            replayRecordSink.push(record);
          },
        },
      },
    });

    assert.equal(replay.result.finalOutput, "strict-complete");
    assert.equal(liveInvocations, 0);
    assert.equal(replay.replayStats.recordedToolCalls, 1);
    assert.equal(replay.replayStats.replayedFromRecord, 1);
    assert.equal(replay.replayStats.missingToolCalls, 0);
    assert.equal(replay.replayStats.liveFallbackCalls, 0);
    assert.equal(replayRecordSink.length, 1);
    assert.equal(replay.replayRunRecord?.metadata?.scenario, "strict-replay");
  }

  {
    const sourceRunRecord = createRunRecord({
      question: "strict replay missing output",
      items: [
        {
          type: "tool_call_item",
          callId: "src-call-1",
          name: "dangerous_lookup",
          arguments: { id: "404" },
        },
      ],
    });

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "replay-call-1",
            name: "dangerous_lookup",
            arguments: JSON.stringify({ id: "404" }),
          },
        ],
      ]),
    );

    let liveInvocations = 0;
    const dangerousLookup = tool<TestContext>({
      name: "dangerous_lookup",
      description: "Would fail if called live",
      parameters: z.object({ id: z.string() }),
      execute: () => {
        liveInvocations += 1;
        throw new Error("live execution should not happen");
      },
    });

    const agent = new Agent<TestContext>({
      name: "Replay Strict Missing Agent",
      model: "fake-model",
      tools: [dangerousLookup],
    });

    await assert.rejects(
      () =>
        replayFromRunRecord({
          sourceRunRecord,
          agent,
          mode: "strict",
          runOptions: {
            policies: {
              toolPolicy: () => allow("allow"),
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /dangerous_lookup/);
        assert.match(error.message, /argsCanonicalJson/);
        return true;
      },
    );
    assert.equal(liveInvocations, 0);
  }

  {
    const sourceRunRecord = createRunRecord({
      question: "hybrid replay",
      items: [
        {
          type: "tool_call_item",
          callId: "src-call-1",
          name: "lookup",
          arguments: { id: "1" },
        },
        {
          type: "tool_call_output_item",
          callId: "src-call-1",
          output: { source: "recorded", id: "1" },
        },
      ],
    });

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "replay-call-1",
            name: "lookup",
            arguments: JSON.stringify({ id: "1" }),
          },
          {
            type: "tool_call",
            callId: "replay-call-2",
            name: "lookup",
            arguments: JSON.stringify({ id: "2" }),
          },
        ],
        [{ type: "completed", message: "hybrid-complete" }],
      ]),
    );

    let liveInvocations = 0;
    const lookup = tool<TestContext>({
      name: "lookup",
      description: "Hybrid lookup",
      parameters: z.object({ id: z.string() }),
      execute: ({ id }) => {
        liveInvocations += 1;
        return {
          source: "live",
          id,
        };
      },
    });

    const agent = new Agent<TestContext>({
      name: "Replay Hybrid Agent",
      model: "fake-model",
      tools: [lookup],
    });

    const replay = await replayFromRunRecord({
      sourceRunRecord,
      agent,
      mode: "hybrid",
      runOptions: {
        policies: {
          toolPolicy: () => allow("allow"),
        },
      },
    });

    assert.equal(replay.result.finalOutput, "hybrid-complete");
    assert.equal(liveInvocations, 1);
    assert.equal(replay.replayStats.recordedToolCalls, 1);
    assert.equal(replay.replayStats.replayedFromRecord, 1);
    assert.equal(replay.replayStats.missingToolCalls, 1);
    assert.equal(replay.replayStats.liveFallbackCalls, 1);

    const outputs = replay.result.history.filter(
      (
        item,
      ): item is Extract<
        (typeof replay.result.history)[number],
        { type: "tool_call_output_item" }
      > => item.type === "tool_call_output_item",
    );
    assert.equal(outputs.length, 2);
    assert.deepEqual(outputs[0]?.output, {
      status: "ok",
      code: null,
      publicReason: null,
      data: { source: "recorded", id: "1" },
    });
    assert.deepEqual(outputs[1]?.output, {
      status: "ok",
      code: null,
      publicReason: null,
      data: { source: "live", id: "2" },
    });
  }

  {
    const sourceRunRecord = createRunRecord({
      question: "live replay",
    });

    setDefaultProvider(
      new ScriptedProvider([[{ type: "completed", message: "live-complete" }]]),
    );

    const agent = new Agent<TestContext>({
      name: "Replay Live Agent",
      model: "fake-model",
    });

    const replay = await replayFromRunRecord({
      sourceRunRecord,
      agent,
      mode: "live",
    });
    assert.equal(replay.result.finalOutput, "live-complete");
    assert.equal(replay.replayStats.replayedFromRecord, 0);
  }
}
