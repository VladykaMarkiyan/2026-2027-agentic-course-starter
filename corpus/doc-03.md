# MCP Transports: stdio and Server-Sent Events (SSE)

MCP formally defines two standard transport bindings:
1. Standard Input/Output (stdio):
- The host spawns the MCP server as a sub-process.
- Messages are formatted as single-line JSON-RPC strings separated by newline characters (\n or \r\n).
- Stdio servers MUST NOT write arbitrary logging or debugging text to stdout, because doing so corrupts the JSON-RPC parsing pipeline. All non-protocol diagnostics MUST be written to stderr.

2. Server-Sent Events (SSE) over HTTP:
- Designed for distributed or containerized servers.
- The client initiates an HTTP GET request to establish an SSE streaming connection for receiving server-to-client JSON-RPC events.
- Client-to-server messages are delivered via separate HTTP POST requests carrying JSON payloads to a dedicated endpoint specified in the SSE initial handshake.
