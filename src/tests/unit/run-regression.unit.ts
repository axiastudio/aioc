import assert from "node:assert/strict";
import {
  Agent,
  runRegressionCase,
  runRegressionSuite,
  setDefaultProvider,
  summarizeRunRegressionResults,
  type RunRecord,
  type RunRecordComparison,
  type RunRegressionResult,
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
    startedAt: "2026-06-14T10:00:00.000Z",
    completedAt: "2026-06-14T10:00:01.000Z",
    status: "completed",
    agentName: "Regression Agent",
    question: "Explain photosynthesis.",
    response: "Plants use sunlight to make food.",
    contextSnapshot: {
      actorId: "actor-1",
    },
    items: [],
    promptSnapshots: [],
    requestFingerprints: [],
    policyDecisions: [],
    metadata: {},
    ...overrides,
  };
}

function createComparison(
  overrides: Partial<RunRecordComparison> = {},
): RunRecordComparison {
  return {
    equal: true,
    summary: {
      sameFinalResponse: true,
      sameToolCallShape: true,
      samePolicyDecisions: true,
      sameGuardrailDecisions: true,
    },
    metrics: {
      responseLengthA: 0,
      responseLengthB: 0,
      toolCallsA: 0,
      toolCallsB: 0,
      matchedToolCalls: 0,
      missingToolCalls: 0,
      extraToolCalls: 0,
    },
    differences: [],
    ...overrides,
  };
}

function createRegressionResult(
  overrides: Partial<RunRegressionResult<TestContext>> = {},
): RunRegressionResult<TestContext> {
  return {
    name: "photosynthesis-age-10",
    baseline: createRunRecord({ runId: "baseline-1" }),
    candidate: createRunRecord({ runId: "candidate-1" }),
    comparison: createComparison(),
    ...overrides,
  };
}

export async function runRunRegressionUnitTests(): Promise<void> {
  {
    const inputItems = [
      {
        type: "message" as const,
        role: "user" as const,
        content: "Explain photosynthesis for a 10 year old.",
      },
    ];
    const baseline = createRunRecord({
      runId: "baseline-run",
      question: "Explain photosynthesis for a 10 year old.",
      response: "Baseline generic answer.",
      inputItemCount: inputItems.length,
      items: inputItems,
    });
    const provider = new ScriptedProvider([
      [{ type: "completed", message: "Candidate age-adapted answer." }],
    ]);
    setDefaultProvider(provider);

    const agent = new Agent<TestContext>({
      name: "Regression Candidate Agent",
      model: "fake-model",
    });
    const result = await runRegressionCase({
      name: "photosynthesis-age-10",
      baseline,
      agent,
      mode: "live",
    });

    assert.equal(result.name, "photosynthesis-age-10");
    assert.equal(result.baseline.runId, "baseline-run");
    assert.equal(result.candidate.response, "Candidate age-adapted answer.");
    assert.equal(result.comparison.equal, false);
    assert.equal(result.comparison.summary.sameFinalResponse, false);
    assert.deepEqual(provider.requests[0]?.messages, inputItems);
  }

  {
    const summary = summarizeRunRegressionResults([
      createRegressionResult({
        comparison: createComparison({
          equal: false,
          summary: {
            sameFinalResponse: false,
            sameToolCallShape: false,
            samePolicyDecisions: true,
            sameGuardrailDecisions: true,
          },
        }),
        judge: {
          verdict: "warn",
          summary: "Age adaptation is partial.",
          findings: [],
        },
      }),
    ]);

    assert.equal(summary.status, "warn");
    assert.deepEqual(summary.totals, {
      cases: 1,
      passed: 0,
      warned: 1,
      failed: 0,
    });
    assert.equal(summary.cases[0]?.name, "photosynthesis-age-10");
    assert.equal(summary.cases[0]?.status, "warn");
    assert.equal(summary.cases[0]?.baselineRunId, "baseline-1");
    assert.equal(summary.cases[0]?.candidateRunId, "candidate-1");
    assert.equal(summary.cases[0]?.signals.finalOutputChanged, true);
    assert.equal(summary.cases[0]?.signals.toolsChanged, true);
    assert.equal(summary.cases[0]?.signals.policyChanged, false);
    assert.deepEqual(summary.cases[0]?.judge, {
      verdict: "warn",
      summary: "Age adaptation is partial.",
    });
  }

  {
    const summary = summarizeRunRegressionResults([
      createRegressionResult({
        candidate: createRunRecord({
          runId: "candidate-failed",
          status: "failed",
        }),
      }),
    ]);

    assert.equal(summary.status, "fail");
    assert.equal(summary.totals.failed, 1);
    assert.equal(summary.cases[0]?.signals.statusChanged, true);
  }

  {
    const summary = summarizeRunRegressionResults(
      [
        createRegressionResult({
          comparison: createComparison({
            equal: false,
            summary: {
              sameFinalResponse: false,
              sameToolCallShape: true,
              samePolicyDecisions: true,
              sameGuardrailDecisions: true,
            },
          }),
        }),
      ],
      {
        suite: "age-adapted-explanation",
        classifyCase: () => "pass",
      },
    );

    assert.equal(summary.suite, "age-adapted-explanation");
    assert.equal(summary.status, "pass");
    assert.deepEqual(summary.totals, {
      cases: 1,
      passed: 1,
      warned: 0,
      failed: 0,
    });
    assert.equal(summary.cases[0]?.status, "pass");
    assert.equal(summary.cases[0]?.signals.finalOutputChanged, true);
  }

  {
    const baselineA = createRunRecord({
      runId: "baseline-a",
      question: "Explain photosynthesis.",
      response: "Baseline photosynthesis answer.",
      inputItemCount: 1,
      items: [
        {
          type: "message",
          role: "user",
          content: "Explain photosynthesis.",
        },
      ],
    });
    const baselineB = createRunRecord({
      runId: "baseline-b",
      question: "Explain gravity.",
      response: "Baseline gravity answer.",
      inputItemCount: 1,
      items: [
        {
          type: "message",
          role: "user",
          content: "Explain gravity.",
        },
      ],
    });
    const provider = new ScriptedProvider([
      [{ type: "completed", message: "Candidate photosynthesis answer." }],
      [{ type: "completed", message: "Candidate gravity answer." }],
    ]);
    setDefaultProvider(provider);

    const agent = new Agent<TestContext>({
      name: "Regression Suite Candidate Agent",
      model: "fake-model",
    });
    const expectation = {
      intent: "Use simpler wording for the user's age range.",
    };
    const judgedRunIds: string[] = [];
    const suite = await runRegressionSuite({
      suite: {
        name: "age-adapted-explanation",
        expectation,
        cases: [
          {
            baseline: baselineA,
          },
          {
            name: "gravity-age-8",
            baseline: baselineB,
          },
        ],
      },
      agent,
      mode: "live",
      baselineDescriptor: { version: "v1" },
      candidateDescriptor: { version: "v2" },
      judge: (input) => {
        judgedRunIds.push(input.candidate.runId);
        assert.equal(input.expectation, expectation);
        assert.deepEqual(input.baselineDescriptor, { version: "v1" });
        assert.deepEqual(input.candidateDescriptor, { version: "v2" });

        return {
          verdict: "pass",
          summary: `Judged ${input.expectation?.intent ?? "without expectation"}`,
          findings: [],
        };
      },
    });

    assert.equal(suite.name, "age-adapted-explanation");
    assert.equal(suite.expectation, expectation);
    assert.equal(suite.results.length, 2);
    assert.equal(suite.results[0]?.name, "baseline-a");
    assert.equal(suite.results[1]?.name, "gravity-age-8");
    assert.equal(suite.results[0]?.judge?.verdict, "pass");
    assert.equal(suite.results[1]?.judge?.verdict, "pass");
    assert.equal(suite.summary.suite, "age-adapted-explanation");
    assert.equal(suite.summary.status, "warn");
    assert.deepEqual(suite.summary.totals, {
      cases: 2,
      passed: 0,
      warned: 2,
      failed: 0,
    });
    assert.deepEqual(judgedRunIds, [
      suite.results[0]?.candidate.runId,
      suite.results[1]?.candidate.runId,
    ]);
    assert.equal(provider.requests.length, 2);
    assert.deepEqual(provider.requests[0]?.messages, baselineA.items);
    assert.deepEqual(provider.requests[1]?.messages, baselineB.items);
  }
}
