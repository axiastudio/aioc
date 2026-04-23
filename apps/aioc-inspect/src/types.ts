import type { InspectRecord } from "@axiastudio/aioc-inspect-ui";

export type InspectView =
  | { name: "home" }
  | { name: "inspect"; slotId: RunSlotId }
  | { name: "compare" };

export type RunSlotId = "file1" | "file2";

export interface RunSlotState {
  status: "empty" | "invalid" | "loaded";
  fileName?: string;
  error?: string;
  data?: InspectRecord;
}
