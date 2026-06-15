import assert from "node:assert/strict";
import {
  Agent,
  runRegressionCase,
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
    const expectation = {
      intent: "Adapt the explanation to the user's age range.",
      shouldImprove: ["age-appropriate wording"],
    };
    let judgeSawCandidateRunId: string | undefined;
    const result = await runRegressionCase({
      name: "photosynthesis-age-10",
      baseline,
      agent,
      mode: "live",
      expectation,
      baselineDescriptor: { version: "v1" },
      candidateDescriptor: { version: "v2" },
      judge: (input) => {
        judgeSawCandidateRunId = input.candidate.runId;
        assert.equal(input.baseline.runId, "baseline-run");
        assert.equal(input.comparison.summary.sameFinalResponse, false);
        assert.equal(input.expectation?.intent, expectation.intent);
        assert.deepEqual(input.baselineDescriptor, { version: "v1" });
        assert.deepEqual(input.candidateDescriptor, { version: "v2" });
        return {
          verdict: "pass",
          summary: "Candidate answer follows the expected direction.",
          findings: [],
        };
      },
    });

    assert.equal(result.name, "photosynthesis-age-10");
    assert.equal(result.baseline.runId, "baseline-run");
    assert.equal(result.candidate.response, "Candidate age-adapted answer.");
    assert.equal(result.comparison.equal, false);
    assert.equal(result.comparison.summary.sameFinalResponse, false);
    assert.equal(result.expectation, expectation);
    assert.equal(result.judge?.verdict, "pass");
    assert.equal(judgeSawCandidateRunId, result.candidate.runId);
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
}
