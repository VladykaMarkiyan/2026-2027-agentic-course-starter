# AI SDK 7 — Multi-Step Agent Loops and Tool Calling

AI SDK 7 supports autonomous multi-step execution loops using the `maxSteps` parameter in `generateText` or `streamText`.

1. Tool Definition:
Tools are created using the `tool({ description, parameters, execute })` helper, where `parameters` is defined via Zod schemas.
2. Autonomous Execution:
When the model emits a tool call, the SDK automatically executes the corresponding `execute()` callback, feeds the returned result back to the model as a `tool_result` message, and continues the conversation until:
- The model outputs a final textual answer without tool calls.
- The execution reaches the configured `maxSteps` threshold.
3. Usage Aggregation:
The SDK returns cumulative `usage` metrics (`promptTokens`, `completionTokens`, `totalTokens`) spanning all intermediate iterative steps.
