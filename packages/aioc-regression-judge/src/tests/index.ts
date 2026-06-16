import assert from "node:assert/strict";
import type {
  RunJudgeInput,
  RunRecord,
  RunRecordComparison,
} from "@axiastudio/aioc";
import {
  REGRESSION_JUDGE_INPUT_SCHEMA_VERSION,
  REGRESSION_JUDGE_PROMPT_VERSION,
  createRunRegressionJudge,
  createRunRegressionJudgeRequest,
  parseRunJudgeResult,
  toBoundedRunJudgeInput,
  type RunRegressionJudgeRequest,
} from "../index.js";

interface TestContext {
  tenantId: string;
  secret: string;
}

function createRunRecord(
  runId: string,
  response: string,
  overrides: Partial<RunRecord<TestContext>> = {},
): RunRecord<TestContext> {
  return {
    runId,
    startedAt: "2026-06-15T10:00:00.000Z",
    completedAt: "2026-06-15T10:00:01.000Z",
    status: "completed",
    agentName: "Explainer",
    providerName: "test-provider",
    model: "test-model",
    question: "Explain photosynthesis.",
    response,
    contextSnapshot: {
      tenantId: "tenant-1",
      secret: "context-secret",
    },
    items: [
      {
        type: "tool_call_item",
        callId: "call-1",
        name: "get_age_range",
        arguments: { studentId: "student-secret" },
      },
      {
        type: "tool_call_output_item",
        callId: "call-1",
        output: {
          status: "ok",
          code: null,
          publicReason: null,
          data: { ageRange: "8-10", privateNote: "tool-secret" },
        },
      },
    ],
    promptSnapshots: [
      {
        timestamp: "2026-06-15T10:00:00.100Z",
        turn: 1,
        agentName: "Explainer",
        model: "test-model",
        promptVersion: "prompt.v1",
        promptHash: "prompt-hash-1",
        promptText: "raw prompt secret",
      },
    ],
    requestFingerprints: [
      {
        timestamp: "2026-06-15T10:00:00.200Z",
        turn: 1,
        agentName: "Explainer",
        providerName: "test-provider",
        model: "test-model",
        runtimeVersion: "test-runtime",
        fingerprintSchemaVersion: "aioc.request_fingerprint.v1",
        requestHash: "request-hash-1",
        systemPromptHash: "system-prompt-hash-1",
        messagesHash: "messages-hash-1",
        toolsHash: "tools-hash-1",
        modelSettingsHash: "model-settings-hash-1",
        messageCount: 1,
        toolCount: 1,
      },
    ],
    policyDecisions: [
      {
        timestamp: "2026-06-15T10:00:00.300Z",
        turn: 1,
        callId: "call-1",
        decision: "allow",
        reason: "allow_age_lookup",
        resource: { kind: "tool", name: "get_age_range" },
      },
    ],
    guardrailDecisions: [],
    metadata: { privateMetadata: "metadata-secret" },
    ...overrides,
  };
}

function createComparison(): RunRecordComparison {
  return {
    equal: false,
    summary: {
      sameFinalResponse: false,
      sameToolCallShape: false,
      samePolicyDecisions: true,
      sameGuardrailDecisions: true,
    },
    metrics: {
      responseLengthA: 24,
      responseLengthB: 48,
      toolCallsA: 0,
      toolCallsB: 1,
      matchedToolCalls: 0,
      missingToolCalls: 0,
      extraToolCalls: 1,
    },
    differences: [
      {
        path: "response",
        kind: "mismatch",
        left: "baseline secret",
        right: "candidate secret",
      },
    ],
  };
}

function createJudgeInput(): RunJudgeInput<
  TestContext,
  Record<string, unknown>
> {
  return {
    baseline: createRunRecord("baseline-1", "Plants make food from sunlight."),
    candidate: createRunRecord(
      "candidate-1",
      "Plants use sunlight like a tiny kitchen to make their food.",
    ),
    comparison: createComparison(),
    expectation: {
      intent: "Adapt the explanation to the learner age range.",
      shouldUseTools: ["get_age_range"],
    },
    baselineDescriptor: {
      descriptor_version: "aioc.agent_graph.v0",
      metadata: { version: "v1" },
      runtime: { entry_agent: "explainer", max_turns: 4 },
      agents: {
        explainer: { instructions: "prompt secret" },
      },
    },
    candidateDescriptor: {
      metadata: { version: "v2" },
      tools: { get_age_range: { target: "example://tool/get_age_range" } },
      agents: {
        explainer: { instructions: "candidate prompt secret" },
      },
    },
  };
}

async function main(): Promise<void> {
  {
    const projection = toBoundedRunJudgeInput(createJudgeInput());
    const serialized = JSON.stringify(projection);

    assert.equal(
      projection.schemaVersion,
      REGRESSION_JUDGE_INPUT_SCHEMA_VERSION,
    );
    assert.equal(projection.candidate.toolCalls[0]?.name, "get_age_range");
    assert.equal(projection.candidate.toolCalls[0]?.output?.dataPresent, true);
    assert.equal(projection.comparison.metrics.extraToolCalls, 1);
    assert.deepEqual(projection.candidateDescriptor?.tools, ["get_age_range"]);
    assert.doesNotMatch(serialized, /context-secret/);
    assert.doesNotMatch(serialized, /tool-secret/);
    assert.doesNotMatch(serialized, /raw prompt secret/);
    assert.doesNotMatch(serialized, /candidate secret/);
    assert.doesNotMatch(serialized, /prompt secret/);
  }

  {
    const request = createRunRegressionJudgeRequest(createJudgeInput());

    assert.equal(request.promptVersion, REGRESSION_JUDGE_PROMPT_VERSION);
    assert.equal(request.messages.length, 2);
    assert.match(request.messages[0]?.content ?? "", /AIOC RunRecord/);
    assert.match(
      request.messages[1]?.content ?? "",
      /aioc\.regression_judge_input\.v0/,
    );
  }

  {
    const input = createJudgeInput();
    input.candidate = createRunRecord("candidate-raw-output", "Candidate.", {
      items: [
        {
          type: "tool_call_item",
          callId: "call-raw",
          name: "raw_tool",
          arguments: { value: "private" },
        },
        {
          type: "tool_call_output_item",
          callId: "call-raw",
          output: { status: 200, data: "raw-secret" },
        },
      ],
    });

    const projection = toBoundedRunJudgeInput(input);
    const output = projection.candidate.toolCalls[0]?.output;

    assert.equal(output?.status, undefined);
    assert.equal(output?.dataPresent, true);
    assert.doesNotMatch(JSON.stringify(projection), /raw-secret/);
  }

  {
    let observedRequest: RunRegressionJudgeRequest | undefined;
    const judge = createRunRegressionJudge<
      TestContext,
      Record<string, unknown>
    >({
      judgeModel: "test-judge-model",
      generate: (request) => {
        observedRequest = request;
        return {
          verdict: "pass",
          summary: "Candidate follows the expected direction.",
          findings: [
            {
              severity: "info",
              reason: "The candidate added age-adapted wording.",
            },
          ],
        };
      },
    });

    const result = await judge(createJudgeInput());

    assert.ok(observedRequest);
    assert.equal(result.verdict, "pass");
    assert.equal(result.judgeModel, "test-judge-model");
    assert.equal(result.judgePromptVersion, REGRESSION_JUDGE_PROMPT_VERSION);
    assert.equal(result.findings.length, 1);
  }

  {
    const result = parseRunJudgeResult(
      '```json\n{"verdict":"warn","summary":"Partial improvement."}\n```',
    );

    assert.equal(result.verdict, "warn");
    assert.deepEqual(result.findings, []);
  }

  {
    assert.throws(
      () => parseRunJudgeResult({ verdict: "maybe", summary: "Invalid." }),
      /verdict must be pass, warn, or fail/,
    );
  }

  process.stdout.write("Regression judge tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
