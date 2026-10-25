# OpenTelemetry Semantic Conventions for GenAI and LLMs

OpenTelemetry defines standardized semantic attributes for telemetry spans emitted by generative AI applications:

Key Span Attributes:
- `gen_ai.system`: System identifier (e.g. "openai", "gemini", "anthropic", "ollama").
- `gen_ai.request.model`: The requested model name (e.g. "gemini-2.5-flash", "qwen3:4b").
- `gen_ai.response.model`: The actual model that serviced the request.
- `gen_ai.usage.input_tokens`: Number of prompt tokens processed.
- `gen_ai.usage.output_tokens`: Number of completion tokens generated.
- `gen_ai.operation.name`: Type of operation (e.g. "chat", "embeddings", "tool_execution").

Traces capture spans hierarchically, linking high-level user queries, retrieval spans, and LLM inferences in a single distributed trace tree.
