# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

toolpick is a TypeScript library for dynamic tool selection in the Vercel AI SDK. Given a large set of AI SDK tools, it picks the most relevant subset per step so the model sees fewer, better tools. Published as an ESM package on npm.

## Commands

- `bun run build` — TypeScript compilation (`tsc`) to `dist/`
- `bun run lint` — Biome linter (`biome check src`)
- `bun run lint:fix` — Biome autofix (`biome check --write src`)
- `bun test src/test` — Run all tests
- `bun test src/test/utils.test.ts` — Run a single test file

Tests use `bun:test` (not vitest/jest). CI runs lint → build → test.

## Architecture

### Search pipeline

Query → SearchEngine → (optional) LLM rerank → adaptive elbow cutoff → `string[]` of tool names

Three search strategies, selected via `options.strategy`:

| Strategy | Engine | Requires |
|----------|--------|----------|
| `hybrid` (default w/o model) | `HybridSearch` — BM25 + TF-IDF fused | Nothing |
| `semantic` | `SemanticSearch` — cosine similarity on embeddings | `embeddingModel` |
| `combined` (default w/ model) | `CombinedSearch` — hybrid + semantic fused | `embeddingModel` |

All engines implement `SearchEngine` (`src/search/types.ts`). Score fusion is shared (`src/search/fusion.ts`) — normalizes two result sets to [0,1] and does weighted sum.

### Integration points (how users plug toolpick into AI SDK)

Three ways to integrate, in `src/integrations/`:

1. **`prepareStep`** (primary) — Returns a `PrepareStepFunction` for `generateText`/`streamText`. Has step-aware escalation: page to next results on miss, expose all tools after 2 consecutive misses.
2. **`middleware`** — `LanguageModelMiddleware` via `transformParams`. Less precise query extraction (provider-level prompt format). Best for single-step calls.
3. **`searchTool`** — Meta-tool agents can call to discover tools outside the current selection.

### Key modules

- `tool-index.ts` — `createToolIndex()` factory. Builds descriptions from tool name + description + param names. Owns the `ToolIndex` interface.
- `query-extractor.ts` — Extracts search query from conversation context. Step 0 uses user prompt; step N uses assistant text (next-action intent) or original prompt + completed tool names.
- `reranker.ts` — LLM re-ranking (`rerank`) and description enrichment (`enrichDescriptions`). Both use `generateText` with `Output.object()` and gracefully fall back on failure.
- `cache.ts` — `fileCache()` for persisting embeddings to disk as JSON.
- `eval/index.ts` — Exported as `toolpick/eval`. Measures Top-1/3/5 accuracy and latency against test cases.

### Peer dependencies

`ai` (>=4.0) and `zod` (>=3.25 || >=4.0). The library imports types and functions from `ai` but does not bundle it.

## Conventions

- ESM-only (`"type": "module"`). Source imports use `.ts` extensions — TypeScript's `rewriteRelativeImportExtensions` rewrites them to `.js` in output.
- Biome for linting (formatter disabled). `noExplicitAny` and `noNonNullAssertion` are relaxed in test files only.
- Tests live in `src/test/` and are excluded from the build (`tsconfig.json` excludes `src/test`).
- Debug logging gated behind `process.env.TOOLPICK_DEBUG`.
