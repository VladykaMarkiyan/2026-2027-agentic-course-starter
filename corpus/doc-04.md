# MCP Tools: JSON Schema & Invocation Semantics

Tools enable language models to perform actions and query real-time data through external APIs or system calls.

1. Listing Tools (`tools/list`):
The server returns an array of tool descriptors. Each tool MUST have:
- `name`: Unique string identifier (e.g. "search_corpus", "fetch_chunk").
- `description`: Clear human-readable description used by the LLM to decide when to call the tool.
- `inputSchema`: Standard JSON Schema object defining required and optional arguments.

2. Calling Tools (`tools/call`):
The client issues a `tools/call` request with `name` and `arguments`.
The server returns a `content` array containing items of type `text`, `image`, or `resource`. If the tool encounters an execution error, it sets `isError: true` inside the result object rather than throwing a transport-level JSON-RPC protocol error.
