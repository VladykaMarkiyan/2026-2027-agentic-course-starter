# MCP Prompts and Parameterized Workflows

Prompts are predefined, user-controlled templates exposed by servers to guide user interactions and structure complex multi-step reasoning.

1. Listing Prompts (`prompts/list`):
Returns available prompt workflows with names, descriptions, and argument declarations.

2. Getting Prompts (`prompts/get`):
Takes a prompt `name` and optional key-value `arguments`. The server returns an array of formatted message objects (with roles `user` or `assistant`) and optional attached embedded resources.
Prompts are explicitly invoked by human intent (e.g. via slash commands in UI clients like /review or /summarize), serving as a human-controlled bridge into agent capabilities.
