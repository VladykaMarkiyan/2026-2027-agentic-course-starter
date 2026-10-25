# Langfuse Trace Model and OpenTelemetry Integration

Langfuse provides open-source observability tailored for LLM applications and agent pipelines.

1. Trace Hierarchy:
- Trace: Top-level container representing an end-to-end user transaction or agent turn.
- Spans: Intermediate stages, such as document retrieval, vector database queries, and tool invocations.
- Generations: Dedicated LLM execution spans tracking input messages, output text, latency, token usage, and cost.

2. OpenTelemetry Export:
Integration is achieved via `LangfuseSpanProcessor` implementing OpenTelemetry's `SpanProcessor` interface. In serverless and Next.js environments, immediate export mode with asynchronous flushes via Next.js `after()` ensures zero data loss on function termination.
