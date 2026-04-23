import type { RunRecord } from "@axiastudio/aioc";
import { buildRunRecordPreview } from "./lib/run-record";
import type { InspectRecord } from "./types";

export function createInspectRecord(
  record: RunRecord<unknown>,
  options: {
    sourceName?: string;
    loadedAt?: string;
  } = {},
): InspectRecord {
  return {
    record,
    preview: buildRunRecordPreview(record),
    sourceName: options.sourceName,
    loadedAt: options.loadedAt ?? new Date().toISOString(),
  };
}
