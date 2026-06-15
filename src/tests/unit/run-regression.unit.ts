import assert from "node:assert/strict";
import {
  summarizeRunRegressionResults,
  type RunRecord,
  type RunRecordComparison,
  type RunRegressionResult,
} from "../../index";

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
