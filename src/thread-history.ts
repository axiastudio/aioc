import { user } from "./messages";
import type { AgentInputItem, RunResult } from "./types";

export interface ThreadHistoryState {
  history: AgentInputItem[];
}

export type RunHistorySource<TContext = unknown> = Pick<
  RunResult<TContext>,
  "history"
>;

export function toThreadHistory(
  input: string | readonly AgentInputItem[],
): AgentInputItem[] {
  if (typeof input === "string") {
    return [user(input)];
  }

  return [...input];
}

export function appendUserMessage(
  history: readonly AgentInputItem[],
  content: string,
): AgentInputItem[] {
  return [...history, user(content)];
}

export function replaceThreadHistory<TThread extends ThreadHistoryState>(
  thread: TThread,
  history: readonly AgentInputItem[],
): TThread {
  return {
    ...thread,
    history: [...history],
  };
}

export function applyRunResultHistory<
  TContext,
  TThread extends ThreadHistoryState,
>(thread: TThread, result: RunHistorySource<TContext>): TThread {
  return replaceThreadHistory(thread, result.history);
}
