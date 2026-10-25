# MCP Lifecycle, Initialization and Capabilities Negotiation

The connection lifecycle consists of three distinct phases:
1. Initialization: The client sends an `initialize` request containing its protocol version (`protocolVersion`), client metadata, and enabled capabilities.
2. Capability Negotiation: The server responds with its `serverInfo` and supported capability flags: `tools` (with optional `listChanged` notifications), `resources` (`subscribe`, `listChanged`), and `prompts`.
3. Initialized Notification: The client confirms readiness by sending an `notifications/initialized` notification. After this handshake, standard operational requests begin.

If an unsupported protocol version is received, the server MUST return an error with JSON-RPC error code -32602 or standard protocol mismatch response.
