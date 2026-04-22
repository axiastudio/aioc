import {
  Check,
  Copy,
  FileJson2,
  FolderSearch,
  GitCompareArrows,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  buildRunRecordPreview,
  compareRunRecords,
  deriveRunRecordScope,
  extractToolCalls,
  extractHandoffFlow,
  formatJson,
  formatNumberList,
  formatStringList,
  isRecordRenderable,
  parseRunRecordJson,
  summarizeFingerprintTurns,
  summarizeGuardrailNames,
  summarizePolicyReasons,
  summarizePromptVersions,
  truncateText,
} from "./lib/run-record";
import type {
  HandoffFlow,
  LoadedRunRecord,
  RunRecordScope,
  InspectView,
  RunSlotId,
  RunSlotState,
} from "./types";

const EMPTY_SLOT: RunSlotState = { status: "empty" };

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the selected file"));
    reader.readAsText(file);
  });
}

function buildLoadedRunRecord(
  jsonText: string,
  sourceName: string,
): LoadedRunRecord {
  const record = parseRunRecordJson(jsonText);

  if (!isRecordRenderable(record)) {
    throw new Error("RunRecord shape is not renderable by this MVP");
  }

  return {
    fileName: sourceName,
    loadedAt: new Date().toISOString(),
    record,
    preview: buildRunRecordPreview(record),
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buttonClassName(enabled: boolean, centered = false): string {
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

function sectionTitleClassName(): string {
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

function toolCallAnchorId(callId: string): string {
  return `tool-call-${toAnchorSegment(callId)}`;
}

function policyDecisionAnchorId(callId: string, turn?: number): string {
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

function AgentChip({ name }: { name: string }): ReactElement {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold tracking-[0.08em] text-slate-800 shadow-sm">
      {name}
    </span>
  );
}

function InPageLink({
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

interface SlotCardProps {
  slotId: RunSlotId;
  slot: RunSlotState;
  jsonDraft: string;
  onFileSelected: (slotId: RunSlotId, file: File) => void;
  onJsonDraftChange: (slotId: RunSlotId, value: string) => void;
  onJsonSubmit: (slotId: RunSlotId) => void;
  onClear: (slotId: RunSlotId) => void;
  onInspect: (slotId: RunSlotId) => void;
}

function SlotCard({
  slotId,
  slot,
  jsonDraft,
  onFileSelected,
  onJsonDraftChange,
  onJsonSubmit,
  onClear,
  onInspect,
}: SlotCardProps): ReactElement {
  const label = slotId === "file1" ? "File 1" : "File 2";
  const hasJsonDraft = jsonDraft.trim().length > 0;

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className={sectionTitleClassName()}>{label}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            RunRecord Input Slot
          </h2>
        </div>
        {slot.status !== "empty" ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={() => onClear(slotId)}
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        <label
          className="flex min-h-44 cursor-pointer flex-col justify-between rounded-[1.5rem] border border-dashed border-slate-300 bg-[linear-gradient(145deg,rgba(255,255,255,0.8),rgba(248,250,252,0.95))] p-5 transition hover:border-slate-400 hover:bg-slate-50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files.item(0);
            if (file) {
              onFileSelected(slotId, file);
            }
          }}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-950 p-3 text-white">
              <FileJson2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-950">
                Drop a single RunRecord JSON file here
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Or click to browse from disk.
              </p>
            </div>
          </div>

          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.item(0);
              if (file) {
                onFileSelected(slotId, file);
              }
              event.currentTarget.value = "";
            }}
          />

          <div className="mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm text-slate-500">
              The selected file is mirrored into the textbox below for quick edits.
            </p>
          </div>
        </label>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={sectionTitleClassName()}>Paste JSON</p>
              <p className="mt-2 text-sm text-slate-500">
                Paste a single RunRecord object and load it directly into this slot.
              </p>
            </div>
          </div>
          <textarea
            value={jsonDraft}
            rows={12}
            className="mt-4 w-full resize-y rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            placeholder='{"runId":"...","agentName":"...","status":"completed","question":"...","response":"...","items":[],"policyDecisions":[],"startedAt":"...","endedAt":"..."}'
            onChange={(event) => onJsonDraftChange(slotId, event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                onJsonSubmit(slotId);
              }
            }}
          />
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500">
              Use Cmd/Ctrl+Enter to load the pasted JSON.
            </p>
            <button
              type="button"
              className={buttonClassName(hasJsonDraft, true)}
              disabled={!hasJsonDraft}
              onClick={() => onJsonSubmit(slotId)}
            >
              <FileJson2 className="h-4 w-4" />
              Load JSON
            </button>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
          {slot.status === "empty" ? (
            <p className="text-sm text-slate-500">No RunRecord loaded yet.</p>
          ) : null}

          {slot.status === "invalid" ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-rose-700">Invalid input</p>
              {slot.fileName ? (
                <p className="text-sm font-medium text-rose-600">
                  {slot.fileName}
                </p>
              ) : null}
              <p className="text-sm text-rose-600">{slot.error}</p>
            </div>
          ) : null}

          {slot.status === "loaded" && slot.data ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-950">
                {slot.data.fileName}
              </p>
              <dl className="grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <dt>Agent</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {slot.data.preview.agentName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Status</dt>
                  <dd className="text-right font-medium capitalize text-slate-900">
                    {slot.data.preview.status}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Started</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {formatDateTime(slot.data.preview.startedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Current Message</dt>
                  <dd className="max-w-[18rem] text-right font-medium text-slate-900">
                    {truncateText(slot.data.preview.currentUserMessage, 72)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          className={buttonClassName(slot.status === "loaded")}
          disabled={slot.status !== "loaded"}
          onClick={() => onInspect(slotId)}
        >
          <Search className="h-4 w-4" />
          Inspect
        </button>
      </div>
    </section>
  );
}

function JsonPanel({
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

function Section({
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

function FormattedResponse({ text, tone = "dark" }: { text: string; tone?: "dark" | "light" }): ReactElement {
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

function InputHistoryItemCard({
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
          <p className={sectionTitleClassName()}>
            Input Item {index + 1}
          </p>
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

function HandoffFlowPanel({
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

function InspectPage({
  loaded,
  otherLoaded,
  slotId,
  onBack,
  onCompare,
}: {
  loaded: LoadedRunRecord;
  otherLoaded?: LoadedRunRecord;
  slotId: RunSlotId;
  onBack: () => void;
  onCompare: () => void;
}): ReactElement {
  const record = loaded.record;
  const scope = useMemo(() => deriveRunRecordScope(record), [record]);
  const toolCalls = useMemo(
    () => extractToolCalls(scope.emittedItems),
    [scope.emittedItems],
  );
  const handoffFlow = useMemo(
    () => extractHandoffFlow(record, scope.emittedItems),
    [record, scope.emittedItems],
  );
  const policyDecisionsByCallId = useMemo(() => {
    const grouped = new Map<string, typeof record.policyDecisions>();

    for (const decision of record.policyDecisions) {
      const existing = grouped.get(decision.callId);
      if (existing) {
        existing.push(decision);
      } else {
        grouped.set(decision.callId, [decision]);
      }
    }

    return grouped;
  }, [record]);

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={sectionTitleClassName()}>
              {slotId === "file1" ? "File 1" : "File 2"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              {record.agentName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              {scope.currentUserMessage}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={onBack}
            >
              Back
            </button>
            <button
              type="button"
              className={buttonClassName(Boolean(otherLoaded), true)}
              disabled={!otherLoaded}
              onClick={onCompare}
            >
              <GitCompareArrows className="h-4 w-4" />
              Compare
            </button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-6 text-sm text-slate-600 md:grid-cols-4">
          <div className="min-w-0">
            <dt className={sectionTitleClassName()}>Run ID</dt>
            <dd className="mt-2 break-all font-medium text-slate-900">
              {record.runId}
            </dd>
          </div>
          <div>
            <dt className={sectionTitleClassName()}>Status</dt>
            <dd className="mt-2 font-medium capitalize text-slate-900">
              {record.status}
            </dd>
          </div>
          <div>
            <dt className={sectionTitleClassName()}>Started</dt>
            <dd className="mt-2 font-medium text-slate-900">
              {formatDateTime(record.startedAt)}
            </dd>
          </div>
          <div>
            <dt className={sectionTitleClassName()}>Model</dt>
            <dd className="mt-2 font-medium text-slate-900">
              {record.model ?? "n/a"}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6">
        <Section
          title="Overview"
          summary="Current user message, final response, run scope, metadata, and context visibility."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-4">
              <div>
                <p className={sectionTitleClassName()}>Current User Message</p>
                <p className="mt-2 rounded-[1.25rem] bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {scope.currentUserMessage}
                </p>
              </div>
              <div>
                <p className={sectionTitleClassName()}>Final Response</p>
                <div className="mt-2 rounded-[1.25rem] bg-slate-950 p-4">
                  <FormattedResponse text={record.response} tone="dark" />
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Run Scope</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 font-medium">
                    {scope.inputItemCount} input items
                  </span>
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 font-medium">
                    {scope.emittedItemCount} emitted items
                  </span>
                  {scope.inputItemCount > 1 ? (
                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-800">
                      History-backed run
                    </span>
                  ) : null}
                  {scope.fallbackUsed ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-800">
                      Scope fallback: full trajectory
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {scope.fallbackUsed
                    ? "The first request fingerprint did not expose a usable messageCount, so the page is showing the full trajectory as the current run."
                    : "The page is scoped to the current run by splitting the recorded trajectory into input history and emitted items."}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Recorded Question Field</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {scope.recordedQuestion}
                </p>
              </div>
            </div>
            <div className="min-w-0 space-y-4">
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Handoff Flow</p>
                <p className="mt-2 text-sm text-slate-500">Current run only.</p>
                <div className="mt-3">
                  <HandoffFlowPanel flow={handoffFlow} showLinks />
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Metadata</p>
                <JsonPanel copyable value={record.metadata ?? {}} />
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                <p className={sectionTitleClassName()}>Context Snapshot</p>
                <p className="mt-2 text-sm text-slate-500">
                  Redacted: {record.contextRedacted ? "yes" : "no"}
                </p>
                <div className="mt-3">
                  <JsonPanel
                    copyable
                    value={record.contextSnapshot}
                    maxHeightClassName="max-h-[26rem]"
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Tools"
          summary={`Extracted ${toolCalls.length} tool calls emitted during this run.`}
        >
          <div className="space-y-4">
            {toolCalls.length === 0 ? (
              <p className="text-sm text-slate-500">
                No tool calls found for the current run.
              </p>
            ) : null}
            {toolCalls.map((call) => {
              const relatedPolicyDecisions =
                policyDecisionsByCallId.get(call.callId) ?? [];

              return (
                <article
                  id={toolCallAnchorId(call.callId)}
                  key={`${call.callId}-${call.name}`}
                  className="scroll-mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 target:border-sky-300 target:bg-sky-50 target:ring-4 target:ring-sky-100"
                >
                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                    <div>
                      <p className={sectionTitleClassName()}>Turn</p>
                      <p className="mt-2 font-medium text-slate-900">
                        {call.turn ?? "n/a"}
                      </p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Tool</p>
                      <p className="mt-2 font-medium text-slate-900">{call.name}</p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Call ID</p>
                      <p className="mt-2 break-all font-medium text-slate-900">
                        {call.callId}
                      </p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Args Hash</p>
                      <p className="mt-2 break-all font-mono text-xs text-slate-900">
                        {call.argsHash}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {relatedPolicyDecisions.length > 0 ? (
                      relatedPolicyDecisions.map((decision) => (
                        <InPageLink
                          key={`${decision.callId}-${decision.turn}`}
                          targetId={policyDecisionAnchorId(
                            decision.callId,
                            decision.turn,
                          )}
                        >
                          Open policy
                        </InPageLink>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        No linked policy decision.
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="min-w-0">
                      <p className={sectionTitleClassName()}>Arguments</p>
                      <div className="mt-2">
                        <JsonPanel
                          copyable
                          value={call.arguments}
                          maxHeightClassName="max-h-[26rem]"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className={sectionTitleClassName()}>
                        Output {call.hasOutput ? "" : "(missing)"}
                      </p>
                      <div className="mt-2">
                        <JsonPanel
                          copyable
                          value={call.output ?? null}
                          maxHeightClassName="max-h-[26rem]"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>

        <Section
          title="Input History"
          summary={
            scope.historyItemCount > 0
              ? `Items already present before the current user message: ${scope.historyItemCount}.`
              : scope.fallbackUsed
                ? "Scope reconstruction fell back to the full trajectory, so input history could not be separated."
                : "No prior history was present in the run input."
          }
          defaultOpen={false}
        >
          <div className="space-y-4">
            {scope.historyItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                {scope.fallbackUsed
                  ? "Unable to separate input history from emitted items for this record."
                  : "This run started from a single prompt with no prior history items."}
              </p>
            ) : null}
            {scope.historyItems.map((item, index) => (
              <InputHistoryItemCard
                key={`input-history-${index}-${item.type}`}
                item={item}
                index={index}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Policies"
          summary={formatStringList(summarizePolicyReasons(record.policyDecisions))}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {record.policyDecisions.length === 0 ? (
              <p className="text-sm text-slate-500">No policy decisions found.</p>
            ) : null}
            {record.policyDecisions.map((decision) => (
              <article
                id={policyDecisionAnchorId(decision.callId, decision.turn)}
                key={`${decision.callId}-${decision.turn}-${decision.timestamp}`}
                className="scroll-mt-6 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 target:border-sky-300 target:bg-sky-50 target:ring-4 target:ring-sky-100"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Decision</p>
                    <p className="mt-2 font-medium capitalize text-slate-900">
                      {decision.decision}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Resource</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.resource.kind}:{decision.resource.name}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Policy Version</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.policyVersion ?? "n/a"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <InPageLink targetId={toolCallAnchorId(decision.callId)}>
                    Open related tool call
                  </InPageLink>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-700">
                  {decision.reason}
                </p>
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Guardrails"
          summary={formatStringList(
            summarizeGuardrailNames(record.guardrailDecisions ?? []),
          )}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {(record.guardrailDecisions ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No guardrail decisions found.</p>
            ) : null}
            {(record.guardrailDecisions ?? []).map((decision) => (
              <article
                key={`${decision.guardrailName}-${decision.turn}-${decision.timestamp}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Guardrail</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.guardrailName}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Decision</p>
                    <p className="mt-2 font-medium capitalize text-slate-900">
                      {decision.decision}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Reason</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {decision.reason ?? "n/a"}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Prompts"
          summary={formatStringList(summarizePromptVersions(record.promptSnapshots))}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {record.promptSnapshots.map((snapshot) => (
              <article
                key={`${snapshot.turn}-${snapshot.timestamp}-${snapshot.promptHash}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Version</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.promptVersion ?? "n/a"}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Agent</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.agentName}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Model</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {snapshot.model ?? "n/a"}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className={sectionTitleClassName()}>Prompt Hash</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-900">
                    {snapshot.promptHash}
                  </p>
                </div>
                {snapshot.promptText ? (
                  <div className="mt-4">
                    <p className={sectionTitleClassName()}>Prompt Text</p>
                    <div className="mt-2">
                      <JsonPanel copyable value={snapshot.promptText} />
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Section>

        <Section
          title="Fingerprints"
          summary={formatNumberList(
            summarizeFingerprintTurns(record.requestFingerprints),
          )}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {record.requestFingerprints.map((fingerprint) => (
              <article
                key={`${fingerprint.turn}-${fingerprint.timestamp}-${fingerprint.requestHash}`}
                className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-5">
                  <div>
                    <p className={sectionTitleClassName()}>Turn</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.turn}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Provider</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.providerName}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Model</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.model}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Messages</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.messageCount}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Tools</p>
                    <p className="mt-2 font-medium text-slate-900">
                      {fingerprint.toolCount}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className={sectionTitleClassName()}>Request Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.requestHash}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>System Prompt Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.systemPromptHash}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Messages Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.messagesHash}
                    </p>
                  </div>
                  <div>
                    <p className={sectionTitleClassName()}>Tools Hash</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">
                      {fingerprint.toolsHash}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section title="Raw JSON" summary="Complete RunRecord payload." defaultOpen={false}>
          <JsonPanel copyable value={record} maxHeightClassName="max-h-[26rem]" />
        </Section>
      </div>
    </div>
  );
}

function ComparePage({
  left,
  right,
  onBack,
  onInspect,
}: {
  left: LoadedRunRecord;
  right: LoadedRunRecord;
  onBack: () => void;
  onInspect: (slotId: RunSlotId) => void;
}): ReactElement {
  const comparison = useMemo(
    () => compareRunRecords(left.record, right.record),
    [left.record, right.record],
  );
  const leftScope = useMemo(() => deriveRunRecordScope(left.record), [left.record]);
  const rightScope = useMemo(
    () => deriveRunRecordScope(right.record),
    [right.record],
  );
  const leftTools = useMemo(
    () => extractToolCalls(leftScope.emittedItems),
    [leftScope.emittedItems],
  );
  const rightTools = useMemo(
    () => extractToolCalls(rightScope.emittedItems),
    [rightScope.emittedItems],
  );
  const leftHandoffFlow = useMemo(
    () => extractHandoffFlow(left.record, leftScope.emittedItems),
    [left.record, leftScope.emittedItems],
  );
  const rightHandoffFlow = useMemo(
    () => extractHandoffFlow(right.record, rightScope.emittedItems),
    [right.record, rightScope.emittedItems],
  );

  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={sectionTitleClassName()}>Compare</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              File 1 vs File 2
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Read the deltas first, then drill into each run only if needed.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={onBack}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => onInspect("file1")}
            >
              Inspect File 1
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={() => onInspect("file2")}
            >
              Inspect File 2
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[left, right].map((entry, index) => (
            <article
              key={entry.fileName}
              className="min-w-0 rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4"
            >
              <p className={sectionTitleClassName()}>
                {index === 0 ? "File 1" : "File 2"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {entry.record.agentName}
              </p>
              <p className="mt-1 text-sm text-slate-500">{entry.fileName}</p>
              <dl className="mt-4 grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between gap-4">
                  <dt>Status</dt>
                  <dd className="font-medium capitalize text-slate-900">
                    {entry.record.status}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Started</dt>
                  <dd className="font-medium text-slate-900">
                    {formatDateTime(entry.record.startedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Prompt Version</dt>
                  <dd className="font-medium text-slate-900">
                    {entry.record.promptSnapshots[0]?.promptVersion ?? "n/a"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Current Message</dt>
                  <dd className="max-w-[18rem] text-right font-medium text-slate-900">
                    {truncateText(
                      index === 0
                        ? leftScope.currentUserMessage
                        : rightScope.currentUserMessage,
                      72,
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </header>

      <div className="grid gap-6">
        <Section
          title="Summary"
          summary="Fast read on whether behavior stayed aligned."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Equal</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.equal ? "yes" : "no"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Final Response</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.summary.sameFinalResponse ? "same" : "different"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Tool Shape</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.summary.sameToolCallShape ? "same" : "different"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Policies</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {comparison.summary.samePolicyDecisions ? "same" : "different"}
              </p>
            </article>
          </div>
        </Section>

        <Section
          title="Handoff Flow"
          summary="Current-run handoff path and attempt outcomes for both files."
          defaultOpen={false}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>File 1</p>
              <div className="mt-3">
                <HandoffFlowPanel flow={leftHandoffFlow} />
              </div>
            </div>
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>File 2</p>
              <div className="mt-3">
                <HandoffFlowPanel flow={rightHandoffFlow} />
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Metrics"
          summary="Structural counts and current-run tool matching metrics."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Response Length</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.responseLengthA} vs{" "}
                {comparison.metrics.responseLengthB}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Tool Calls</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.toolCallsA} vs {comparison.metrics.toolCallsB}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Matched</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.matchedToolCalls}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Missing / Extra</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.metrics.missingToolCalls} /{" "}
                {comparison.metrics.extraToolCalls}
              </p>
            </article>
          </div>
        </Section>

        <Section title="Response" summary="Exact final output comparison.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <p className={sectionTitleClassName()}>File 1</p>
              <div className="mt-2 rounded-[1.25rem] bg-slate-50 p-4">
                <FormattedResponse text={left.record.response} tone="light" />
              </div>
            </div>
            <div className="min-w-0">
              <p className={sectionTitleClassName()}>File 2</p>
              <div className="mt-2 rounded-[1.25rem] bg-slate-50 p-4">
                <FormattedResponse text={right.record.response} tone="light" />
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Tool Calls"
          summary="Current-run sequence and normalized argument shape."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>File 1</p>
              <div className="mt-3 space-y-3">
                {leftTools.map((call) => (
                  <article key={call.callId} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {call.turn ?? "n/a"}. {call.name}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {call.argsHash}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>File 2</p>
              <div className="mt-3 space-y-3">
                {rightTools.map((call) => (
                  <article key={call.callId} className="rounded-2xl bg-white p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {call.turn ?? "n/a"}. {call.name}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {call.argsHash}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Prompt & Fingerprint Signals"
          summary="Quick indicators useful for non-regression triage."
          defaultOpen={false}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Prompt Version</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.promptVersionA ?? "n/a"} vs{" "}
                {comparison.signals.promptVersionB ?? "n/a"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Prompt Hash Changed</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.promptHashChanged ? "yes" : "no"}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>Fingerprint Turns</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.requestFingerprintTurnsA} vs{" "}
                {comparison.signals.requestFingerprintTurnsB}
              </p>
            </article>
            <article className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className={sectionTitleClassName()}>First Request Hash</p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {comparison.signals.firstRequestHashChanged ? "changed" : "same"}
              </p>
            </article>
          </div>
        </Section>

        <Section
          title="Structured Differences"
          summary={`${comparison.differences.length} difference entries.`}
          defaultOpen={false}
        >
          {comparison.differences.length === 0 ? (
            <p className="text-sm text-slate-500">No differences recorded.</p>
          ) : (
            <div className="space-y-4">
              {comparison.differences.map((difference, index) => (
                <article
                  key={`${difference.path}-${index}`}
                  className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className={sectionTitleClassName()}>Path</p>
                      <p className="mt-2 font-medium text-slate-900">
                        {difference.path}
                      </p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Kind</p>
                      <p className="mt-2 font-medium text-slate-900">
                        {difference.kind}
                      </p>
                    </div>
                    <div>
                      <p className={sectionTitleClassName()}>Preview</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {truncateText(formatJson(difference.left ?? null), 40)} vs{" "}
                        {truncateText(formatJson(difference.right ?? null), 40)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.22),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">
              aioc-inspect
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950">
              Reference UI example for visual RunRecord analysis.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Load one or two RunRecord artifacts, inspect the execution trail, and
              compare behavioral changes in a stateless reference application for
              implementors.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/80 bg-white/70 px-5 py-4 text-sm text-slate-600 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
            Experimental. Session-only. No persistence.
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function App(): ReactElement {
  const [slots, setSlots] = useState<Record<RunSlotId, RunSlotState>>({
    file1: EMPTY_SLOT,
    file2: EMPTY_SLOT,
  });
  const [jsonDrafts, setJsonDrafts] = useState<Record<RunSlotId, string>>({
    file1: "",
    file2: "",
  });
  const [view, setView] = useState<InspectView>({ name: "home" });

  async function handleFileSelected(slotId: RunSlotId, file: File): Promise<void> {
    let text = "";

    try {
      text = await readFileText(file);
      setJsonDrafts((current) => ({
        ...current,
        [slotId]: text,
      }));

      const loaded = buildLoadedRunRecord(text, file.name);
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "loaded",
          fileName: file.name,
          data: loaded,
        },
      }));
    } catch (error) {
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "invalid",
          fileName: file.name,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  function handleJsonDraftChange(slotId: RunSlotId, value: string): void {
    setJsonDrafts((current) => ({
      ...current,
      [slotId]: value,
    }));
  }

  function handleJsonSubmit(slotId: RunSlotId): void {
    const jsonText = jsonDrafts[slotId];

    if (jsonText.trim().length === 0) {
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "invalid",
          fileName: "Pasted JSON",
          error: "Paste a RunRecord JSON payload before loading it.",
        },
      }));
      return;
    }

    try {
      const loaded = buildLoadedRunRecord(jsonText, "Pasted JSON");
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "loaded",
          fileName: "Pasted JSON",
          data: loaded,
        },
      }));
    } catch (error) {
      setSlots((current) => ({
        ...current,
        [slotId]: {
          status: "invalid",
          fileName: "Pasted JSON",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  function clearSlot(slotId: RunSlotId): void {
    setSlots((current) => ({
      ...current,
      [slotId]: EMPTY_SLOT,
    }));
    setJsonDrafts((current) => ({
      ...current,
      [slotId]: "",
    }));

    setView((current) => {
      if (current.name === "inspect" && current.slotId === slotId) {
        return { name: "home" };
      }
      if (
        current.name === "compare" &&
        (slotId === "file1" || slotId === "file2")
      ) {
        return { name: "home" };
      }
      return current;
    });
  }

  const leftLoaded = slots.file1.status === "loaded" ? slots.file1.data : undefined;
  const rightLoaded =
    slots.file2.status === "loaded" ? slots.file2.data : undefined;

  let content: ReactElement;

  if (view.name === "inspect") {
    const slot = slots[view.slotId];
    if (slot.status === "loaded" && slot.data) {
      const otherSlotId = view.slotId === "file1" ? "file2" : "file1";
      const otherLoaded =
        slots[otherSlotId].status === "loaded" ? slots[otherSlotId].data : undefined;
      content = (
        <InspectPage
          loaded={slot.data}
          otherLoaded={otherLoaded}
          slotId={view.slotId}
          onBack={() => setView({ name: "home" })}
          onCompare={() => setView({ name: "compare" })}
        />
      );
    } else {
      content = (
        <div className="rounded-[2rem] border border-slate-200 bg-white/85 p-8 text-sm text-slate-600">
          Selected slot is empty. Go back and load a RunRecord first.
        </div>
      );
    }
  } else if (view.name === "compare" && leftLoaded && rightLoaded) {
    content = (
      <ComparePage
        left={leftLoaded}
        right={rightLoaded}
        onBack={() => setView({ name: "home" })}
        onInspect={(slotId) => setView({ name: "inspect", slotId })}
      />
    );
  } else {
    content = (
      <div className="space-y-8">
        <div className="grid gap-6 xl:grid-cols-2">
          <SlotCard
            slotId="file1"
            slot={slots.file1}
            jsonDraft={jsonDrafts.file1}
            onFileSelected={(slotId, file) => {
              void handleFileSelected(slotId, file);
            }}
            onJsonDraftChange={handleJsonDraftChange}
            onJsonSubmit={handleJsonSubmit}
            onClear={clearSlot}
            onInspect={(slotId) => setView({ name: "inspect", slotId })}
          />
          <SlotCard
            slotId="file2"
            slot={slots.file2}
            jsonDraft={jsonDrafts.file2}
            onFileSelected={(slotId, file) => {
              void handleFileSelected(slotId, file);
            }}
            onJsonDraftChange={handleJsonDraftChange}
            onJsonSubmit={handleJsonSubmit}
            onClear={clearSlot}
            onInspect={(slotId) => setView({ name: "inspect", slotId })}
          />
        </div>

        <section className="flex justify-center">
          <button
            type="button"
            className={buttonClassName(Boolean(leftLoaded && rightLoaded), true)}
            disabled={!leftLoaded || !rightLoaded}
            onClick={() => setView({ name: "compare" })}
          >
            <GitCompareArrows className="h-4 w-4" />
            Compare
          </button>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-950 p-3 text-white">
                <FolderSearch className="h-5 w-5" />
              </div>
              <div>
                <p className={sectionTitleClassName()}>MVP Scope</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Single-run inspection, dual-run comparison
                </h2>
              </div>
            </div>
            <div className="mt-5 grid gap-4 text-sm leading-7 text-slate-600 md:grid-cols-3">
              <p>
                Each slot accepts one JSON file or pasted JSON containing a single
                RunRecord object.
              </p>
              <p>
                Inspect a slot independently or compare both records once both are
                loaded.
              </p>
              <p>
                Data is kept in memory only for the current browser session.
              </p>
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className={sectionTitleClassName()}>Current Session</p>
            <div className="mt-5 grid gap-4 text-sm">
              {(
                [
                  ["File 1", slots.file1],
                  ["File 2", slots.file2],
                ] as Array<[string, RunSlotState]>
              ).map(
                ([label, slot]) => (
                  <div
                    key={label}
                    className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4"
                  >
                    <p className="font-medium">{label}</p>
                    <p className="mt-2 text-slate-300">
                      {slot.status === "loaded" && slot.data
                        ? `${slot.data.preview.agentName} • ${truncateText(
                            slot.data.preview.currentUserMessage,
                            56,
                          )}`
                        : slot.status === "invalid"
                          ? slot.error
                          : "Empty"}
                    </p>
                  </div>
                ),
              )}
            </div>
          </article>
        </section>
      </div>
    );
  }

  return <AppShell>{content}</AppShell>;
}
