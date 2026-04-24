# @axiastudio/aioc-inspect-ui

Reusable React components for inspecting and comparing AIOC `RunRecord` artifacts.

## Install

```bash
npm install @axiastudio/aioc-inspect-ui @axiastudio/aioc react react-dom
```

## Usage

```tsx
import {
  InspectPage,
  createInspectRecord,
} from "@axiastudio/aioc-inspect-ui";

export function RunRecordInspect({ runRecord }: { runRecord: unknown }) {
  return (
    <InspectPage
      inspectRecord={createInspectRecord(runRecord, {
        sourceName: "run-record.json",
      })}
    />
  );
}
```

## Tailwind CSS

The components use Tailwind utility classes. If your app uses Tailwind CSS v4,
include the package build output in your source scan.

For a Vite app with CSS in `src/index.css`:

```css
@import "tailwindcss";
@source "../node_modules/@axiastudio/aioc-inspect-ui/dist";
```

The package does not currently ship a standalone stylesheet.
