# MCP Resources and URI Template Matching

Resources represent read-only context data that can be inspected by LLMs without side effects (e.g., file contents, application states, system logs).

1. URI Schemes:
Every resource is identified by a unique URI (e.g. `memo://notes/2026`, `file:///workspace/data/report.json`).

2. Resource Templates:
Servers can expose dynamic resources using RFC 6570 URI Templates (e.g. `docs://corpus/{chunkId}`).
Clients can read resource contents using the `resources/read` method with the parameter `uri`.
Servers may also emit `notifications/resources/updated` when underlying resource data changes, enabling real-time context streaming.
