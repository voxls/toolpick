# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Bun workspace monorepo containing packages for dynamic tool selection in the Vercel AI SDK.

### Packages

| Package | Path | Description |
|---------|------|-------------|
| `@voxls/toolpick` | `packages/toolpick` | Core library — given a large set of AI SDK tools, picks the most relevant subset per step |
| `@voxls/toolpick-cache-redis` | `packages/toolpick-cache-redis` | Redis-based embedding cache implementing `EmbeddingCacheOptions` from `@voxls/toolpick` |

## Commands

Root-level (runs across all packages):

- `bun run build` — Build all packages (toolpick first, then cache-redis)
- `bun run lint` — Biome linter across all packages
- `bun run lint:fix` — Biome autofix across all packages
- `bun run test` — Run all tests across all packages

Per-package:

- `bun run --filter '@voxls/toolpick' test` — Run toolpick tests only
- `bun run --filter '@voxls/toolpick-cache-redis' test` — Run cache-redis tests only

Tests use `bun:test` (not vitest/jest). CI runs lint → build → test.

## Architecture

### Search pipeline (`@voxls/toolpick`)

Query → SearchEngine → (optional) LLM rerank → adaptive elbow cutoff → `string[]` of tool names

Three search strategies, selected via `options.strategy`:

| Strategy | Engine | Requires |
|----------|--------|----------|
| `hybrid` (default w/o model) | `HybridSearch` — BM25 + TF-IDF fused | Nothing |
| `semantic` | `SemanticSearch` — cosine similarity on embeddings | `embeddingModel` |
| `combined` (default w/ model) | `CombinedSearch` — hybrid + semantic fused | `embeddingModel` |

All engines implement `SearchEngine` (`src/search/types.ts`). Score fusion is shared (`src/search/fusion.ts`) — normalizes two result sets to [0,1] and does weighted sum.

### Integration points (how users plug toolpick into AI SDK)

Three ways to integrate, in `packages/toolpick/src/integrations/`:

1. **`prepareStep`** (primary) — Returns a `PrepareStepFunction` for `generateText`/`streamText`. Has step-aware escalation: page to next results on miss, expose all tools after 2 consecutive misses.
2. **`middleware`** — `LanguageModelMiddleware` via `transformParams`. Less precise query extraction (provider-level prompt format). Best for single-step calls.
3. **`searchTool`** — Meta-tool agents can call to discover tools outside the current selection.

### Key modules (`@voxls/toolpick`)

- `tool-index.ts` — `createToolIndex()` factory. Builds descriptions from tool name + description + param names. Owns the `ToolIndex` interface.
- `query-extractor.ts` — Extracts search query from conversation context. Step 0 uses user prompt; step N uses assistant text (next-action intent) or original prompt + completed tool names.
- `reranker.ts` — LLM re-ranking (`rerank`) and description enrichment (`enrichDescriptions`). Both use `generateText` with `Output.object()` and gracefully fall back on failure.
- `cache.ts` — `fileCache()` for persisting embeddings to disk as JSON.
- `eval/index.ts` — Exported as `@voxls/toolpick/eval`. Measures Top-1/3/5 accuracy and latency against test cases.

### Redis cache (`@voxls/toolpick-cache-redis`)

- `redisCache(options?)` — Factory returning `EmbeddingCacheOptions` backed by Redis (via ioredis). Lazy connection, optional TTL, key prefix namespacing.
- Peers on `@voxls/toolpick` for the `EmbeddingCacheOptions` type.

### Peer dependencies

`@voxls/toolpick`: `ai` (>=4.0) and `zod` (>=3.25 || >=4.0).
`@voxls/toolpick-cache-redis`: `@voxls/toolpick` (>=0.1.0).

## Conventions

- Bun workspaces (`"workspaces": ["packages/*"]` in root `package.json`).
- ESM-only (`"type": "module"`). Source imports use `.ts` extensions — TypeScript's `rewriteRelativeImportExtensions` rewrites them to `.js` in output.
- Shared `tsconfig.base.json` at root, extended by each package.
- Biome for linting (formatter disabled). `noExplicitAny` and `noNonNullAssertion` are relaxed in test files only.
- Tests live in `packages/*/src/test/` and are excluded from the build.
- Debug logging gated behind `process.env.TOOLPICK_DEBUG`.
