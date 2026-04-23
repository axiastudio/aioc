import { Check, Copy, X } from "lucide-react";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { formatJson } from "../lib/run-record";
import type { HandoffFlow, RunRecordScope } from "../types";

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function buttonClassName(enabled: boolean, centered = false): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition";
  const enabledClasses =
    "border-slate-900 bg-slate-950 text-white hover:bg-slate-800";
  const disabledClasses =
    "cursor-not-allowed border-slate-300 bg-white text-slate-400";

  return `${base} ${centered ? "min-w-44" : "w-full"} ${
    enabled ? enabledClasses : disabledClasses
  }`;
}

export function sectionTitleClassName(): string {
  return "text-xs font-semibold uppercase tracking-[0.24em] text-slate-500";
}

function toAnchorSegment(value: string | number): string {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "item";
}

export function toolCallAnchorId(callId: string): string {
  return `tool-call-${toAnchorSegment(callId)}`;
}

export function policyDecisionAnchorId(callId: string, turn?: number): string {
  return `policy-decision-${toAnchorSegment(callId)}-${toAnchorSegment(
    turn ?? "na",
  )}`;
}

function revealTarget(targetId: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  const parentDetails = target.closest("details");
  if (parentDetails instanceof HTMLDetailsElement) {
    parentDetails.open = true;
  }

  requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", `#${targetId}`);
  });
}

export function AgentChip({ name }: { name: string }): ReactElement {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold tracking-[0.08em] text-slate-800 shadow-sm">
      {name}
    </span>
  );
}

export function InPageLink({
  targetId,
  children,
}: {
  targetId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <a
      href={`#${targetId}`}
      className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
      onClick={(event) => {
        event.preventDefault();
        revealTarget(targetId);
      }}
    >
      {children}
    </a>
  );
}

const JSON_TOKEN_PATTERN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?::)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function jsonTokenClassName(token: string): string {
  if (token.startsWith('"') && token.endsWith('":')) {
    return "text-sky-300";
  }

  if (token.startsWith('"')) {
    return "text-emerald-300";
  }

  if (token === "true" || token === "false") {
    return "text-amber-300";
  }

  if (token === "null") {
    return "text-slate-400";
  }

  return "text-fuchsia-300";
}

function renderHighlightedJson(jsonText: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of jsonText.matchAll(JSON_TOKEN_PATTERN)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(jsonText.slice(lastIndex, index));
    }

    nodes.push(
      <span key={`json-token-${matchIndex}`} className={jsonTokenClassName(token)}>
        {token}
      </span>,
    );

    lastIndex = index + token.length;
    matchIndex += 1;
  }

  if (lastIndex < jsonText.length) {
    nodes.push(jsonText.slice(lastIndex));
  }

  return nodes;
}

export function JsonPanel({
  value,
  maxHeightClassName,
  copyable = false,
}: {
  value: unknown;
  maxHeightClassName?: string;
  copyable?: boolean;
}): ReactElement {
  const jsonText = formatJson(value);
  const heightClassName = maxHeightClassName ?? "";
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  async function handleCopy(): Promise<void> {
    try {
      if (
        typeof navigator === "undefined" ||
        typeof navigator.clipboard?.writeText !== "function"
      ) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(jsonText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => {
      setCopyState("idle");
    }, 1400);
  }

  return (
    <div className="group relative">
      {copyable ? (
        <button
          type="button"
          aria-label="Copy JSON to clipboard"
          title={copyState === "error" ? "Copy failed" : "Copy JSON"}
          className="absolute right-3 top-3 z-10 inline-flex items-center justify-center rounded-full border border-white/15 bg-slate-900/85 p-2 text-slate-200 opacity-0 shadow-sm transition hover:border-sky-300/60 hover:bg-slate-800 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyState === "copied" ? (
            <Check className="h-4 w-4 text-emerald-300" />
          ) : copyState === "error" ? (
            <X className="h-4 w-4 text-rose-300" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      ) : null}
      <pre
        className={`w-full max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[1.25rem] border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100 ${copyable ? "pr-14" : ""} ${heightClassName}`.trim()}
      >
        <code>{renderHighlightedJson(jsonText)}</code>
      </pre>
    </div>
  );
}

export function Section({
  title,
  summary,
  children,
  defaultOpen = true,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactElement {
  return (
    <details
      open={defaultOpen}
      className="w-full min-w-0 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <p className={sectionTitleClassName()}>{title}</p>
          {summary ? (
            <p className="mt-2 text-sm text-slate-500">{summary}</p>
          ) : null}
        </div>
      </summary>
      <div className="mt-5 min-w-0">{children}</div>
    </details>
  );
}

function renderInlineFormattedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\\\([^)]*\\\))/g;
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    if (fullMatch.startsWith("**") && fullMatch.endsWith("**")) {
      nodes.push(
        <strong key={`inline-strong-${matchIndex}`}>
          {fullMatch.slice(2, -2)}
        </strong>,
      );
    } else if (fullMatch.startsWith("`") && fullMatch.endsWith("`")) {
      nodes.push(
        <code
          key={`inline-code-${matchIndex}`}
          className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[0.95em]"
        >
          {fullMatch.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <span
          key={`inline-math-${matchIndex}`}
          className="font-mono text-[0.95em]"
        >
          {fullMatch}
        </span>,
      );
    }

    lastIndex = index + fullMatch.length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function FormattedResponse({
  text,
  tone = "dark",
}: {
  text: string;
  tone?: "dark" | "light";
}): ReactElement {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const textClassName =
    tone === "dark" ? "text-slate-100" : "text-slate-700";
  const mutedClassName =
    tone === "dark" ? "text-slate-400" : "text-slate-500";

  if (blocks.length === 0) {
    return <p className={`text-sm leading-7 ${mutedClassName}`}>No response recorded.</p>;
  }

  return (
    <div className={`space-y-4 text-sm leading-7 ${textClassName}`}>
      {blocks.map((block, blockIndex) => {
        const lines = block
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        const unorderedList = lines.every((line) => /^[-*]\s+/.test(line));
        const orderedList = lines.every((line) => /^\d+\.\s+/.test(line));

        if (unorderedList) {
          return (
            <ul
              key={`response-block-${blockIndex}`}
              className="list-disc space-y-2 pl-5"
            >
              {lines.map((line, lineIndex) => (
                <li key={`response-line-${blockIndex}-${lineIndex}`}>
                  {renderInlineFormattedText(line.replace(/^[-*]\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        if (orderedList) {
          return (
            <ol
              key={`response-block-${blockIndex}`}
              className="list-decimal space-y-2 pl-5"
            >
              {lines.map((line, lineIndex) => (
                <li key={`response-line-${blockIndex}-${lineIndex}`}>
                  {renderInlineFormattedText(line.replace(/^\d+\.\s+/, ""))}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`response-block-${blockIndex}`}>
            {lines.map((line, lineIndex) => (
              <span key={`response-line-${blockIndex}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInlineFormattedText(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inputHistoryItemTitle(item: RunRecordScope["inputItems"][number]): string {
  if (item.type === "message") {
    return item.role === "user" ? "User message" : `${item.role} message`;
  }

  if (item.type === "tool_call_item") {
    return `Tool call: ${item.name}`;
  }

  return `Tool output: ${item.callId}`;
}

export function InputHistoryItemCard({
  item,
  index,
}: {
  item: RunRecordScope["historyItems"][number];
  index: number;
}): ReactElement {
  return (
    <article className="w-full min-w-0 overflow-hidden rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={sectionTitleClassName()}>Input Item {index + 1}</p>
          <p className="mt-2 break-words text-sm font-medium text-slate-900">
            {inputHistoryItemTitle(item)}
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700">
          {item.type}
        </span>
      </div>
      {item.type === "message" ? (
        <p className="mt-3 break-words whitespace-pre-wrap rounded-[1rem] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700">
          {item.content}
        </p>
      ) : (
        <div className="mt-3 min-w-0">
          <JsonPanel
            copyable
            maxHeightClassName="max-h-[26rem]"
            value={
              item.type === "tool_call_item"
                ? {
                    callId: item.callId,
                    name: item.name,
                    arguments: item.arguments ?? {},
                  }
                : {
                    callId: item.callId,
                    output: item.output ?? null,
                  }
            }
          />
        </div>
      )}
    </article>
  );
}

export function HandoffFlowPanel({
  flow,
  showLinks = false,
}: {
  flow: HandoffFlow;
  showLinks?: boolean;
}): ReactElement {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-900">Activated agent path</p>
        {flow.activatedAgentPath.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {flow.activatedAgentPath.map((agentName, index) => (
              <div key={`${agentName}-${index}`} className="flex items-center gap-2">
                <AgentChip name={agentName} />
                {index < flow.activatedAgentPath.length - 1 ? (
                  <span className="text-slate-400" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M4 12H18"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M13 7L18 12L13 17"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-7 text-slate-700">
            No activated agents recorded.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>{flow.attempts.length} attempts</span>
          <span>{flow.acceptedCount} accepted</span>
          <span>{flow.deniedCount} denied</span>
        </div>

        {flow.attempts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No handoff attempts found.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {flow.attempts.map((attempt) => (
              <article
                key={`${attempt.callId}-${attempt.turn ?? "na"}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AgentChip name={attempt.fromAgent} />
                      <span className="text-slate-400" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M4 12H18"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                          <path
                            d="M13 7L18 12L13 17"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <AgentChip name={attempt.toAgent} />
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      Turn {attempt.turn ?? "n/a"} • {attempt.callId}
                    </p>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${
                      attempt.decision === "allow"
                        ? "bg-emerald-100 text-emerald-800"
                        : attempt.decision === "deny"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {attempt.decision}
                  </span>
                </div>
                {attempt.reason ? (
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {attempt.reason}
                  </p>
                ) : null}
                {showLinks ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <InPageLink targetId={toolCallAnchorId(attempt.callId)}>
                      Open tool call
                    </InPageLink>
                    {attempt.decision !== "unknown" ? (
                      <InPageLink
                        targetId={policyDecisionAnchorId(
                          attempt.callId,
                          attempt.turn,
                        )}
                      >
                        Open policy
                      </InPageLink>
                    ) : null}
                  </div>
                ) : null}
                {attempt.policyVersion ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Policy version: {attempt.policyVersion}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
