# aioc + LangChain examples

This folder contains optional examples showing how `aioc` can compose with
LangChain OSS components without making LangChain a dependency of the core
runtime package.

## aioc-first RAG

The first example is **aioc-first, LangChain-extended**.

```text
aioc Agent
  -> aioc tool governed by policy
      -> LangChain retriever
          -> indexed blog post chunks
```

`aioc` owns the execution boundary: the model proposes a tool call, deterministic
policy code authorizes it, and a `RunRecord` captures the decision. LangChain
provides the retrieval component behind that governed tool.

The domain intentionally mirrors the LangChain RAG tutorial: answering questions
about Lilian Weng's "LLM Powered Autonomous Agents" blog post. To keep this
example readable, the indexed corpus is represented by a few in-memory chunks
instead of a web loader and text splitter.

Run it with:

```bash
OPENAI_API_KEY=... npm run aioc-first-rag
```

## LangGraph node calls aioc

The second example is **LangGraph-orchestrated, aioc-governed**.

```text
LangGraph workflow
  -> governed calculator node
      -> aioc.run(...)
          -> aioc policy gate + RunRecord
```

The domain mirrors the LangGraph calculator quickstart: arithmetic tools such as
`add`, `multiply`, and `divide`. The difference is that the graph node delegates
the sensitive action to aioc, so tool execution still crosses a deterministic
policy boundary.

Run it with:

```bash
OPENAI_API_KEY=... npm run langgraph-node-calls-aioc
```

## Setup

From this folder:

```bash
npm install
```

Optional environment variables:

- `AIOC_EXAMPLE_MODEL`: chat model used by `aioc` for the agent loop
- `AIOC_LANGCHAIN_EMBEDDING_MODEL`: embedding model used by LangChain retrieval

Defaults:

- `AIOC_EXAMPLE_MODEL=gpt-4.1-mini`
- `AIOC_LANGCHAIN_EMBEDDING_MODEL=text-embedding-3-small`

## Notes

- This is a readable integration example, not a production RAG template.
- It intentionally avoids LangSmith; observability is represented by the aioc
  `RunRecord` printed at the end.
- The example imports `aioc` from the published `@axiastudio/aioc` package.
