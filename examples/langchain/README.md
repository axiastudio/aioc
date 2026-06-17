# aioc + LangChain examples

This folder contains optional examples showing how `aioc` can use LangChain OSS
components without making LangChain a dependency of the core runtime package.

The first example is **aioc-first, LangChain-extended**:

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

## Setup

From this folder:

```bash
npm install
OPENAI_API_KEY=... npm run aioc-first-rag
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
