# AI SDK 7 — Human-in-the-Loop Confirmation & Trust Ladder

To prevent unintended state mutations, AI SDK 7 provides mechanisms for interactive human approval before executing sensitive tools.

The Trust Ladder model categorizes tools:
- Level 0 (Read-only, Auto-approved): Inspection and search tools (e.g. `list_files`, `search_corpus`).
- Level 1 (Sensitive / Modifying): Tools that modify files or execute commands (e.g. `write_file`, `bash`).
When a Level 1 tool is invoked, the execution loop suspends, yields a confirmation prompt to the user with tool arguments, and proceeds only upon affirmative verification. If rejected by the user, the agent receives an explicit rejection message and gracefully adjusts its strategy.
