# MCP Security, Roots and Sandboxing Guidelines

Because MCP servers execute system tools and access local filesystems, robust isolation and permission guards are mandatory:

1. Root Boundaries:
Clients pass authorized root directory paths via `roots/list`. Servers MUST enforce boundary checks using path resolution functions (e.g. verifying that resolved paths start strictly with authorized directory paths).
2. Protection against Path Traversal:
Any attempt to access relative parent paths (such as `../../.env` or `../../etc/passwd`) MUST be intercepted, rejected, and logged as an unauthorized access violation.
3. Secret Scrubbing:
Environment variables containing API keys (e.g. `GOOGLE_GENERATIVE_AI_API_KEY`, `LANGFUSE_SECRET_KEY`) MUST be masked before logging or transmitting context payloads.
