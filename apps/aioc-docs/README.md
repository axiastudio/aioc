# aioc-docs

`aioc-docs` is the Starlight documentation app for the `aioc` repository.

## Positioning

- lives in the same repository as the SDK sources
- keeps `/docs` as the source of truth for RFCs and contract documents
- renders a navigable site from curated guides plus generated governance pages
- uses a dedicated Node toolchain declared in `.nvmrc`

## Commands

Run from the repository root:

```bash
npm run docs:sync
npm run docs:dev
```

The root `docs:*` commands spawn the docs app from inside `apps/aioc-docs` so it can resolve the Node toolchain configured for this directory.

Build:

```bash
npm run docs:build
```
