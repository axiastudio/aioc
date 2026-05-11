import assert from "node:assert/strict";
import {
  appendUserMessage,
  applyRunResultHistory,
  replaceThreadHistory,
  toThreadHistory,
  type AgentInputItem,
} from "../../index";

interface DemoThread {
  id: string;
  title: string;
  history: AgentInputItem[];
}

function createThread(history: AgentInputItem[] = []): DemoThread {
  return {
    id: "thread-1",
    title: "Finance thread",
    history,
  };
}

export async function runThreadHistoryUnitTests(): Promise<void> {
  {
    const history = toThreadHistory("Hello");

    assert.deepEqual(history, [
      {
        type: "message",
        role: "user",
        content: "Hello",
      },
    ]);
  }

  {
    const input: AgentInputItem[] = [
      {
        type: "message",
        role: "user",
        content: "Existing question",
      },
    ];

    const history = toThreadHistory(input);

    assert.deepEqual(history, input);
    assert.notEqual(history, input);
  }

  {
    const existing: AgentInputItem[] = [
      {
        type: "message",
        role: "assistant",
        content: "Previous answer",
      },
    ];

    const next = appendUserMessage(existing, "Next question");

    assert.equal(existing.length, 1);
    assert.equal(next.length, 2);
    assert.notEqual(next, existing);
    assert.deepEqual(next[1], {
      type: "message",
      role: "user",
      content: "Next question",
    });
  }

  {
    const originalHistory: AgentInputItem[] = [
      {
        type: "message",
        role: "user",
        content: "Old question",
      },
    ];
    const nextHistory: AgentInputItem[] = [
      {
        type: "message",
        role: "assistant",
        content: "New answer",
      },
    ];
    const thread = createThread(originalHistory);

    const nextThread = replaceThreadHistory(thread, nextHistory);

    assert.notEqual(nextThread, thread);
    assert.equal(nextThread.id, thread.id);
    assert.equal(nextThread.title, thread.title);
    assert.deepEqual(nextThread.history, nextHistory);
    assert.notEqual(nextThread.history, nextHistory);
    assert.deepEqual(thread.history, originalHistory);
  }

  {
    const thread = createThread([
      {
        type: "message",
        role: "user",
        content: "Before run",
      },
    ]);
    const result = {
      history: [
        {
          type: "message",
          role: "user",
          content: "Before run",
        },
        {
          type: "message",
          role: "assistant",
          content: "After run",
        },
      ] satisfies AgentInputItem[],
    };

    const nextThread = applyRunResultHistory(thread, result);

    assert.deepEqual(nextThread.history, result.history);
    assert.notEqual(nextThread.history, result.history);
    assert.equal(nextThread.id, "thread-1");
  }
}
