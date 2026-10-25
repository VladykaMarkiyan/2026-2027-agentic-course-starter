# Vercel AI SDK 7 — Core Architecture & Model Providers

Vercel AI SDK 7 provides a unified, provider-agnostic TypeScript abstraction layer for language model generation, tool calling, and structured output.

Key functions:
- `generateText`: Non-streaming execution returning text, tool calls, and normalized usage stats.
- `streamText`: Streaming response delivery with full support for Server-Sent Events (SSE) and token-by-token processing.
- Model Providers: Standardized adapters for Google (`@ai-sdk/google`), Anthropic (`@ai-sdk/anthropic`), and OpenAI/Ollama (`@ai-sdk/openai`).

All model instances conform to the unified `LanguageModelV1` specification, ensuring portability across local and cloud LLM backends.
