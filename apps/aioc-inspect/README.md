# aioc-inspect

`aioc-inspect` is a private reference example UI for visual `RunRecord` analysis.

It is included in the repository to show one possible way to inspect and compare `RunRecord` artifacts produced by applications built with `@axiastudio/aioc`.

## Positioning

- reference example application, not a hosted service
- experimental and stateless by design
- intended for implementors, not end users
- focused on visual inspection of existing `RunRecord` artifacts

The purpose of `aioc-inspect` is to demonstrate the value of the `RunRecord` contract and to make visual analysis patterns concrete. It should not be interpreted as the official or only UI for `aioc`.

## Current Scope

- load one or two JSON files containing a single `RunRecord`
- inspect one run visually
- compare two runs visually
- navigate across related tool calls and policy decisions
- reconstruct handoff flow from the recorded audit trail

## Out of Scope

- persistence
- backend service integration
- authentication or authorization
- production hardening
- large-scale historical search

## Run Locally

```bash
cd apps/aioc-inspect
npm install
npm run dev
```

## Notes

- Data is kept in memory only for the current browser session.
- The app currently performs minimal structural validation on input JSON.
- Some visual flows, such as handoff transitions, are reconstructed from the recorded `RunRecord` rather than from dedicated first-class events.
