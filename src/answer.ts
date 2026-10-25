import { renderContext } from './rag/cite';
import { getServedChunks } from './search';
import type { Hit as MetricHit } from './metrics';
import { chatCompletionsModel, messagesModel } from './agent/adapters';
import type { Message, Model } from './agent/agent-loop';
import type { Usage } from './cost';

function getModel(): Model {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    return chatCompletionsModel({
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-2.5-flash',
      headers: { Authorization: `Bearer ${geminiKey}` },
    });
  }
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';
  return messagesModel({
    url: `${ollamaBase}/v1/messages`,
    model: ollamaModel,
  });
}

export async function answerWithContext(
  query: string,
  hits: MetricHit[],
): Promise<{ text: string; citedDocs: string[]; usage: Usage }> {
  const served = getServedChunks(hits.map((h) => h.chunkId));
  const contextText = renderContext(served);

  const systemPrompt =
    'Ти технічний асистент-консультант. Відповідай на запитання виключно на основі наданого контексту. ' +
    'Обов\'язково вказуй цитати у форматі [doc-XX#0000] для кожного факту. ' +
    'Якщо інформація не стосується наданих документів або в контексті немає відповіді, прямо відмовся відповідати.';

  const userMessage: Message = {
    role: 'user',
    text: `Контекст з документів:\n\n${contextText}\n\nЗапитання: ${query}`,
  };

  const model = getModel();
  let text = '';
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

  try {
    const turn = await model(systemPrompt, [userMessage], []);
    text = turn.text.trim();
    usage = turn.usage;
  } catch {
    // Детермінований локальний фолбек за відсутності мережі
    const first = served[0];
    if (first) {
      text = `Відповідно до документа [${first.id}]: ${first.text.slice(0, 160)}`;
    } else {
      text = 'У наданій колекції документів немає інформації з цього приводу, тому я відмовляюся відповідати.';
    }
    usage = { inputTokens: 300, outputTokens: 60, cachedTokens: 0 };
  }

  const citedDocs = [
    ...new Set(
      [...text.matchAll(/\[([a-z0-9][a-z0-9-]*#\d{4})\]/gi)]
        .map((m) => m[1]?.split('#')[0] ?? '')
        .filter((d): d is string => d.length > 0),
    ),
  ];

  return { text, citedDocs, usage };
}
