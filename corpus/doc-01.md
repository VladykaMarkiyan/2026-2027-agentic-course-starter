# Model Context Protocol (MCP) — Overview and Architecture

The Model Context Protocol (MCP) is an open specification that standardizes how host applications (such as IDEs, desktop agents, and chat interfaces) provide contextual data, execution tools, and customizable prompts to Large Language Models.

MCP adopts a client-host-server architecture:
1. Host: The application coordinating the user interface and the language model lifecycle (e.g. Claude Desktop, VS Code, OpenCode).
2. Client: The component within the host maintaining isolated 1:1 connections to individual MCP servers.
3. Server: A standalone lightweight process that exposes contextual capabilities: Tools, Resources, and Prompts.

Communication is strictly asynchronous and based on JSON-RPC 2.0 messages exchanged over standard transport mechanisms such as standard input/output (stdio) or Server-Sent Events (SSE).
