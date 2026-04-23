import {
  FileJson2,
  FolderSearch,
  GitCompareArrows,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { ComparePage } from "./components/ComparePage";
import { InspectPage } from "./components/InspectPage";
import {
  buttonClassName,
  formatDateTime,
  sectionTitleClassName,
} from "./components/shared";
import { createInspectRecord } from "./inspect-record";
import { isRecordRenderable, parseRunRecordJson, truncateText } from "./lib/run-record";
import type { InspectView, RunSlotId, RunSlotState } from "./types";

const EMPTY_SLOT: RunSlotState = { status: "empty" };

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Unable to read the selected file"));
    reader.readAsText(file);
  });
}

function buildInspectRecord(jsonText: string, sourceName: string): RunSlotState["data"] {
  const record = parseRunRecordJson(jsonText);

  if (!isRecordRenderable(record)) {
    throw new Error("RunRecord shape is not renderable by this MVP");
  }

  return createInspectRecord(record, { sourceName });
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
                {slot.data.sourceName ?? "RunRecord"}
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

      const loaded = buildInspectRecord(text, file.name);
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
      const loaded = buildInspectRecord(jsonText, "Pasted JSON");
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
          inspectRecord={slot.data}
          compareRecord={otherLoaded}
          label={view.slotId === "file1" ? "File 1" : "File 2"}
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
        leftLabel="File 1"
        rightLabel="File 2"
        onBack={() => setView({ name: "home" })}
        onInspectLeft={() => setView({ name: "inspect", slotId: "file1" })}
        onInspectRight={() => setView({ name: "inspect", slotId: "file2" })}
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
              ).map(([label, slot]) => (
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
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  }

  return <AppShell>{content}</AppShell>;
}
