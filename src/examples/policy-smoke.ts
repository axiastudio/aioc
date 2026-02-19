import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  ToolCallPolicyDeniedError,
  allow,
  deny,
  type ToolPolicy,
  run,
  setDefaultProvider,
  tool,
} from "../index";
import type {
  ModelProvider,
  ProviderEvent,
  ProviderRequest,
} from "../providers/base";

class SequencedProvider implements ModelProvider {
  private readonly turns: ProviderEvent[][];
  private index = 0;

  constructor(turns: ProviderEvent[][]) {
    this.turns = turns;
  }

  async *stream<TContext = unknown>(
    _request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    void _request;
    const events = this.turns[this.index] ?? [];
    this.index += 1;
    for (const event of events) {
      yield event;
    }
  }
}

function createAgent(onExecute: () => void): Agent {
  const ping = tool({
    name: "ping",
    description: "Simple test tool",
    parameters: z.object({}),
    execute: () => {
      onExecute();
      return { ok: true };
    },
  });

  return new Agent({
    name: "Policy smoke agent",
    model: "fake-model",
    tools: [ping],
  });
}

function createToolProposalRun(): ProviderEvent[][] {
  return [
    [
      {
        type: "tool_call",
        callId: "call-1",
        name: "ping",
        arguments: "{}",
      },
    ],
    [{ type: "completed", message: "done" }],
  ];
}

async function runAllowCase(): Promise<void> {
  let executions = 0;
  setDefaultProvider(new SequencedProvider(createToolProposalRun()));

  const toolPolicy: ToolPolicy = () => allow("allow_ping");

  const result = await run(
    createAgent(() => (executions += 1)),
    "hello",
    {
      policies: {
        toolPolicy,
      },
    },
  );

  assert.equal(result.finalOutput, "done");
  assert.equal(executions, 1);
}

async function runMissingPolicyCase(): Promise<void> {
  let executions = 0;
  setDefaultProvider(new SequencedProvider(createToolProposalRun()));

  await assert.rejects(
    () =>
      run(
        createAgent(() => (executions += 1)),
        "hello",
      ),
    (error: unknown) => {
      assert.ok(error instanceof ToolCallPolicyDeniedError);
      assert.equal(error.result.policyResult.reason, "policy_not_configured");
      return true;
    },
  );

  assert.equal(executions, 0);
}

async function runDenyCase(): Promise<void> {
  let executions = 0;
  setDefaultProvider(new SequencedProvider(createToolProposalRun()));

  const toolPolicy: ToolPolicy = () => deny("tool_not_allowlisted");

  await assert.rejects(
    () =>
      run(
        createAgent(() => (executions += 1)),
        "hello",
        {
          policies: {
            toolPolicy,
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ToolCallPolicyDeniedError);
      assert.equal(error.result.policyResult.reason, "tool_not_allowlisted");
      return true;
    },
  );

  assert.equal(executions, 0);
}

async function runPolicyErrorCase(): Promise<void> {
  let executions = 0;
  setDefaultProvider(new SequencedProvider(createToolProposalRun()));

  const toolPolicy: ToolPolicy = () => {
    throw new Error("policy exploded");
  };

  await assert.rejects(
    () =>
      run(
        createAgent(() => (executions += 1)),
        "hello",
        {
          policies: {
            toolPolicy,
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ToolCallPolicyDeniedError);
      assert.equal(error.result.policyResult.reason, "policy_error");
      assert.equal(error.result.policyResult.metadata?.errorName, "Error");
      return true;
    },
  );

  assert.equal(executions, 0);
}

async function runInvalidPolicyResultCase(): Promise<void> {
  let executions = 0;
  setDefaultProvider(new SequencedProvider(createToolProposalRun()));

  const toolPolicy = (() => ({
    decision: "allow",
  })) as unknown as ToolPolicy;

  await assert.rejects(
    () =>
      run(
        createAgent(() => (executions += 1)),
        "hello",
        {
          policies: {
            toolPolicy,
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ToolCallPolicyDeniedError);
      assert.equal(error.result.policyResult.reason, "invalid_policy_result");
      return true;
    },
  );

  assert.equal(executions, 0);
}

async function main(): Promise<void> {
  await runAllowCase();
  await runMissingPolicyCase();
  await runDenyCase();
  await runPolicyErrorCase();
  await runInvalidPolicyResultCase();
  process.stdout.write("Policy smoke passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
