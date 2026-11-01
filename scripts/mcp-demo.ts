/**
 * ДРУГИЙ БІК (крок 09): застосунок викликає ті самі інструменти.
 * Запуск: npx tsx scripts/mcp-demo.ts "код помилки E-418"
 */
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const query = process.argv[2] ?? 'Model Context Protocol';

const client = new Client({ name: 'lab2-app', version: '1.0.0' });

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const transport = new StdioClientTransport({
  command: cmd,
  args: ['tsx', 'src/mcp/server.ts'],
  // НЕ ...process.env: інакше ви віддаєте серверу всі секрети застосунку.
  // MCP_CLIENT_LABEL — підпис у журналі сервера: за ним видно, що виклик ЗВІДСИ.
  env: { ...getDefaultEnvironment(), MCP_CLIENT_LABEL: 'lab2-app' },
  stderr: 'pipe',
});

function show(result: Awaited<ReturnType<typeof client.callTool>>): void {
  // Тип блоку перевіряємо ДО читання .text — це канонічна форма з документації.
  for (const block of result.content) {
    if (block.type === 'text') console.log(block.text);
  }
  if (result.isError) console.log('^ це ВІДМОВА сервера, і вона очікувана');
}

async function main(): Promise<void> {
  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    console.log('--- ЗАРЕЄСТРОВАНІ ІНСТРУМЕНТИ ---');
    for (const tool of tools) console.log(`${tool.name} — ${tool.description}`);

    console.log('\n--- ВИКЛИК 1: search_corpus ---');
    show(await client.callTool({ name: 'search_corpus', arguments: { query, topK: 3 } }));

    console.log('\n--- ВИКЛИК 2: fetch_chunk (успішний) ---');
    show(await client.callTool({ name: 'fetch_chunk', arguments: { id: 'doc-01#0000' } }));

    console.log('\n--- ВИКЛИК 3: fetch_chunk (відмова на id поза індексом) ---');
    // третій виклик навмисно за межею: доказ, що застосунок бачить відмову
    show(await client.callTool({ name: 'fetch_chunk', arguments: { id: 'doc-99#0000' } }));
  } finally {
    // без close() процес сервера залишиться живим — порада з документації
    await client.close();
  }
}

main().catch((err) => {
  console.error('Помилка в mcp-demo:', err);
  process.exit(1);
});
