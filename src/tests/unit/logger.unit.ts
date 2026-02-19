import assert from "node:assert/strict";
import { createStdoutLogger, type RunLogEvent } from "../../index";

function createEvent(overrides: Partial<RunLogEvent> = {}): RunLogEvent {
  return {
    timestamp: new Date().toISOString(),
    level: "info",
    type: "run_started",
    agent: "Test agent",
    maxTurns: 8,
    historyItems: 1,
    ...overrides,
  } as RunLogEvent;
}

export async function runLoggerUnitTests(): Promise<void> {
  {
    const writes: string[] = [];
    const logger = createStdoutLogger({
      write: (message) => {
        writes.push(message);
      },
    });

    logger.log(createEvent({ type: "agent_activated" }));
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0] ?? "{}").type, "agent_activated");
  }

  {
    const writes: string[] = [];
    const logger = createStdoutLogger({
      minLevel: "warn",
      write: (message) => {
        writes.push(message);
      },
    });

    logger.log(createEvent({ level: "info", type: "agent_activated" }));
    logger.log(createEvent({ level: "error", type: "run_failed" }));
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0] ?? "{}").type, "run_failed");
  }

  {
    const writes: string[] = [];
    const logger = createStdoutLogger({
      events: ["tool_policy_evaluated"],
      pretty: true,
      write: (message) => {
        writes.push(message);
      },
    });

    logger.log(
      createEvent({
        type: "tool_policy_evaluated",
        toolName: "get_finance_report",
        callId: "call-1",
        decision: "allow",
        reason: "allow_finance_group_access",
      }),
    );
    logger.log(createEvent({ type: "agent_activated" }));

    assert.equal(writes.length, 1);
    assert.equal(
      writes[0]?.includes(
        "tool=get_finance_report decision=allow reason=allow_finance_group_access",
      ),
      true,
    );
  }
}
