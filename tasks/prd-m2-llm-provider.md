# PRD: M2 — LLM Provider (Vercel AI SDK)

## Problem Statement

FeatherBot has config schemas and shared types (M1) but no way to talk to an LLM. M2 establishes the provider layer — the foundational abstraction that lets the agent loop (M4) generate text, stream responses, and call tools against Anthropic, OpenAI, and OpenRouter models via the Vercel AI SDK.

## Goals

1. Install and configure the Vercel AI SDK with three provider adapters (Anthropic, OpenAI, OpenRouter)
2. Define a clean `LLMProvider` interface that the agent loop will consume — no AI SDK types leak beyond the provider module
3. Implement non-streaming generation (`generate()`) with full tool-calling support
4. Implement streaming generation (`stream()`) with tool-calling support
5. Auto-resolve model strings (e.g., `"anthropic/claude-sonnet-4-5-20250929"`) to the correct AI SDK provider + API key
6. Add retry logic with exponential backoff for transient errors (rate limits, 5xx, network)
7. Enrich the M1 `LLMResponse` type with `usage` and `finishReason` fields

## Non-Goals

- Agent loop / ReAct orchestration (M4)
- Context building / system prompt assembly (M6)
- Session management (M7)
- Audio transcription
- Token counting / budget tracking (future milestone)
- Caching / request deduplication

## Reference

- **ARCHITECTURE.md** Section 13 (LLM Providers) — nanobot's LiteLLM pattern
- **ARCHITECTURE.md** Section 18 (FeatherBot TypeScript Architecture) — Vercel AI SDK recommendation
- **packages/core/src/types.ts** — existing `LLMResponse`, `LLMToolCall`, `ToolDefinition` types
- **packages/core/src/config/schema.ts** — `ProviderConfigSchema`, `AgentConfigSchema`

## User Stories

### US-001: AI SDK Dependencies and Provider Types

**As a** developer building FeatherBot
**I want** the Vercel AI SDK installed with provider adapters and a clean provider interface defined
**So that** downstream milestones have a typed contract to program against

**Acceptance Criteria:**

- [ ] `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openrouter` added to `@featherbot/core` dependencies
- [ ] `LLMProvider` interface defined in `packages/core/src/provider/types.ts` with:
  - `generate(options: GenerateOptions): Promise<GenerateResult>`
  - `stream(options: StreamOptions): Promise<StreamResult>`
- [ ] `GenerateOptions` type defined: `model` (string), `messages` (array of role/content), `tools` (optional map of `ToolDefinition`), `maxSteps` (optional number), `temperature` (optional number), `maxTokens` (optional number)
- [ ] `GenerateResult` type defined: `text` (string), `toolCalls` (array), `toolResults` (array), `usage` ({ promptTokens, completionTokens, totalTokens }), `finishReason` (string)
- [ ] `StreamResult` type defined: `textStream` (AsyncIterable\<string\>), `fullStream` (AsyncIterable\<StreamPart\>), `toTextStreamResponse()` method for HTTP streaming, plus a promise-based `result` for final aggregated result (same shape as `GenerateResult`)
- [ ] `StreamPart` discriminated union: `text-delta`, `tool-call`, `tool-result`, `finish`, `error`
- [ ] `LLMMessage` type defined: `{ role: "system" | "user" | "assistant" | "tool"; content: string; toolCallId?: string }`
- [ ] Existing `LLMResponse` in `types.ts` updated: add `usage: { promptTokens: number; completionTokens: number; totalTokens: number }` and `finishReason: string` fields
- [ ] All new types exported from `packages/core/src/index.ts`
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

---

### US-002: Model Resolver

**As a** developer building FeatherBot
**I want** model strings like `"anthropic/claude-sonnet-4-5-20250929"` auto-resolved to the correct AI SDK provider
**So that** users configure a single `model` string and the system picks the right provider and API key

**Acceptance Criteria:**

- [ ] `resolveModel(modelString: string, providerConfig: ProviderConfig)` function in `packages/core/src/provider/model-resolver.ts`
- [ ] Parses `"provider/model-id"` format: splits on first `/` to get provider prefix and model ID
- [ ] Falls back to keyword matching when no `/` prefix:
  - `claude` → anthropic
  - `gpt` / `o1` / `o3` / `o4` → openai
  - Everything else → openrouter
- [ ] Returns an AI SDK `LanguageModel` instance created with the resolved provider + API key
- [ ] Throws a descriptive error if the resolved provider has no API key configured
- [ ] Unit tests covering:
  - Explicit prefix parsing (`anthropic/claude-sonnet-4-5-20250929` → anthropic provider)
  - Keyword fallback (`claude-sonnet-4-5-20250929` → anthropic, `gpt-4o` → openai)
  - OpenRouter fallback for unknown models
  - Missing API key error
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Tests pass (`pnpm test`)

---

### US-003: Non-Streaming Generation (generate)

**As a** developer building FeatherBot
**I want** a `generate()` method that calls the Vercel AI SDK's `generateText` and returns our typed result
**So that** the agent loop can do request-response LLM calls with tool support

**Acceptance Criteria:**

- [ ] `VercelLLMProvider` class in `packages/core/src/provider/vercel-provider.ts` implementing `LLMProvider`
- [ ] `generate()` method:
  - Calls `resolveModel()` to get the `LanguageModel`
  - Maps our `LLMMessage[]` → AI SDK's `messages` format
  - Maps our `ToolDefinition` map → AI SDK's `tools` format (Zod schemas pass through directly)
  - Calls `generateText()` from the `ai` package
  - Maps AI SDK result → our `GenerateResult` type
- [ ] Tool calls in the result are mapped to our `LLMToolCall` shape (id, name, arguments)
- [ ] Usage stats (promptTokens, completionTokens, totalTokens) are captured
- [ ] `finishReason` is captured (e.g., "stop", "tool-calls", "length")
- [ ] Graceful error handling: LLM errors return error text as content (never throw to caller), matching nanobot's pattern
- [ ] Unit tests with mocked `generateText`:
  - Simple text response
  - Response with tool calls
  - Error handling (returns error as content)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Tests pass (`pnpm test`)

---

### US-004: Streaming Generation (stream)

**As a** developer building FeatherBot
**I want** a `stream()` method that calls the Vercel AI SDK's `streamText` and returns streamable results
**So that** the agent can stream responses to users in real-time

**Acceptance Criteria:**

- [ ] `stream()` method on `VercelLLMProvider`:
  - Same input mapping as `generate()` (model resolution, messages, tools)
  - Calls `streamText()` from the `ai` package
  - Returns our `StreamResult` type wrapping the AI SDK stream
- [ ] `textStream` provides an `AsyncIterable<string>` of text deltas
- [ ] `fullStream` provides an `AsyncIterable<StreamPart>` with discriminated events (text-delta, tool-call, tool-result, finish, error)
- [ ] `result` property resolves to the final aggregated `GenerateResult` after the stream completes
- [ ] Graceful error handling: stream errors emit an error `StreamPart` rather than throwing
- [ ] Unit tests with mocked `streamText`:
  - Streaming text deltas
  - Streaming with tool calls
  - Error during stream
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Tests pass (`pnpm test`)

---

### US-005: Retry with Exponential Backoff

**As a** developer building FeatherBot
**I want** transient LLM errors automatically retried with exponential backoff
**So that** temporary rate limits and network blips don't fail the entire request

**Acceptance Criteria:**

- [ ] `withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>` utility in `packages/core/src/provider/retry.ts`
- [ ] `RetryOptions`: `maxRetries` (default 3), `baseDelayMs` (default 1000), `maxDelayMs` (default 30000)
- [ ] Exponential backoff formula: `min(baseDelay * 2^attempt, maxDelay)` + jitter (random ±25%)
- [ ] Only retries on transient errors:
  - HTTP 429 (rate limit)
  - HTTP 500, 502, 503, 504 (server errors)
  - Network errors (ECONNRESET, ETIMEDOUT, etc.)
- [ ] Non-retryable errors (400, 401, 403, 404) throw immediately
- [ ] `VercelLLMProvider.generate()` and `stream()` wrapped with `withRetry`
- [ ] Unit tests:
  - Successful retry after transient error
  - Gives up after maxRetries
  - Non-retryable errors throw immediately
  - Backoff delay increases exponentially
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Tests pass (`pnpm test`)

---

### US-006: Provider Factory and Exports

**As a** developer building FeatherBot
**I want** a single factory function that creates a configured `LLMProvider` from the app config
**So that** the CLI and gateway can instantiate the provider in one call

**Acceptance Criteria:**

- [ ] `createProvider(config: FeatherBotConfig): LLMProvider` function in `packages/core/src/provider/index.ts`
- [ ] Uses `config.providers` for API keys, `config.agents.defaults` for model/temperature/maxTokens defaults
- [ ] Defaults from config are used when `GenerateOptions` doesn't override them
- [ ] Provider module exports from `packages/core/src/provider/index.ts`:
  - `createProvider` (factory function)
  - All types from `provider/types.ts`
  - `resolveModel` (for advanced use cases)
- [ ] All provider exports re-exported from `packages/core/src/index.ts`
- [ ] Integration test: create provider from default config, verify it's a valid `LLMProvider` instance
- [ ] Clean up `provider/.gitkeep` (replaced by real files)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Tests pass (`pnpm test`)

---

## Dependencies

- **M1 complete** — config schemas, shared types, monorepo structure
- **External packages:** `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openrouter`

## Technical Notes

### Vercel AI SDK Usage Patterns

```typescript
// Non-streaming
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const result = await generateText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  messages: [...],
  tools: { toolName: { description: "...", parameters: zodSchema, execute: async (params) => "result" } },
  maxSteps: 20,
});

// Streaming
import { streamText } from "ai";

const result = streamText({
  model: anthropic("claude-sonnet-4-5-20250929"),
  messages: [...],
  tools: { ... },
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Model String Resolution (nanobot pattern)

```
"anthropic/claude-sonnet-4-5-20250929" → provider: anthropic, model: claude-sonnet-4-5-20250929
"openai/gpt-4o"                       → provider: openai, model: gpt-4o
"gpt-4o"                              → provider: openai (keyword: "gpt")
"claude-sonnet-4-5-20250929"           → provider: anthropic (keyword: "claude")
"deepseek/deepseek-r1"                → provider: openrouter (fallback)
```

### Error Handling Convention

All LLM errors should be caught and returned as content strings, never thrown to the caller. This matches nanobot's pattern and prevents the agent loop from crashing on LLM failures:

```typescript
try {
  const result = await generateText({ ... });
  return mapToGenerateResult(result);
} catch (error) {
  return { text: `[LLM Error] ${error.message}`, toolCalls: [], usage: { ... }, finishReason: "error" };
}
```

### Boundary Principle

AI SDK types (`GenerateTextResult`, `StreamTextResult`, etc.) are used **only** inside `packages/core/src/provider/`. Everything exported from the provider module uses our own interfaces (`LLMProvider`, `GenerateResult`, `StreamResult`). This keeps the rest of the codebase vendor-independent.
