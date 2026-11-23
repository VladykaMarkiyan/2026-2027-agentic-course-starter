/**
 * МУЛЬТИАГЕНТНИЙ ПАЙПЛАЙН ІЗ ЖОРСТКИМ БЮДЖЕТОМ (ЛР4, Крок 03).
 *
 * Організує взаємодію двох спеціалізованих агентів:
 * 1. ResearcherAgent — збирає факти, аналізує джерела, формує гіпотези.
 * 2. SynthesizerAgent — валідує контракт дослідника, узгоджує докази та формує фінальний синтез.
 *
 * Обмеження:
 * - Максимальна кількість turns окремо для кожного агента.
 * - Спільний бюджет токенів (input/output).
 * - Загальний таймаут пайплайну.
 * - Short-circuit (аварійне переривання): якщо перший агент перевищив бюджет чи впав,
 *   другий агент не запускається, повертається структурована помилка.
 */

import { z } from 'zod';
import { addUsage, ZERO_USAGE, type Usage } from '../cost';

/** Контракт передачі даних між Researcher та Synthesizer. */
export const ResearchFindingSchema = z.object({
  fact: z.string().min(1, 'Факт не може бути порожнім'),
  source: z.string().min(1, 'Джерело має бути вказане'),
  confidence: z.number().min(0).max(1),
});

export const ResearchContractSchema = z.object({
  topic: z.string().min(1),
  findings: z.array(ResearchFindingSchema).min(1, 'Має бути щонайменше 1 підтверджений факт'),
  hypotheses: z.array(z.string()).default([]),
  summary: z.string().min(1),
});

export type ResearchContract = z.infer<typeof ResearchContractSchema>;

/** Контракт фінального виходу SynthesizerAgent. */
export const SynthesisResultSchema = z.object({
  topic: z.string(),
  executiveSummary: z.string().min(1),
  verifiedKeyPoints: z.array(z.string()).min(1),
  recommendation: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
});

export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;

/** Конфігурація жорсткого бюджету пайплайну. */
export interface PipelineBudget {
  readonly maxResearcherTurns: number;
  readonly maxSynthesizerTurns: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}

export const DEFAULT_PIPELINE_BUDGET: PipelineBudget = {
  maxResearcherTurns: 5,
  maxSynthesizerTurns: 3,
  maxInputTokens: 10000,
  maxOutputTokens: 2000,
  timeoutMs: 30000, // 30 секунд
};

/** Метрики виконання окремого агента. */
export interface AgentRunMetrics {
  readonly role: 'researcher' | 'synthesizer';
  readonly turns: number;
  readonly usage: Usage;
  readonly durationMs: number;
  readonly status: 'success' | 'budget_exceeded' | 'timeout' | 'error' | 'skipped';
  readonly error?: string;
}

/** Підсумковий звіт та результат пайплайну. */
export interface PipelineResult {
  readonly success: boolean;
  readonly data?: SynthesisResult;
  readonly interimResearch?: ResearchContract;
  readonly shortCircuited: boolean;
  readonly terminationReason:
    | 'COMPLETED'
    | 'RESEARCHER_BUDGET_EXCEEDED'
    | 'RESEARCHER_TIMEOUT'
    | 'RESEARCHER_SCHEMA_ERROR'
    | 'RESEARCHER_ERROR'
    | 'SYNTHESIZER_BUDGET_EXCEEDED'
    | 'SYNTHESIZER_TIMEOUT'
    | 'SYNTHESIZER_SCHEMA_ERROR'
    | 'SYNTHESIZER_ERROR';
  readonly totalUsage: Usage;
  readonly totalDurationMs: number;
  readonly researcherMetrics: AgentRunMetrics;
  readonly synthesizerMetrics: AgentRunMetrics;
}

/** Інтерфейс виклику функцій агентів (може бути підтриманий реальними моделями чи моками). */
export type ResearcherExecutor = (
  topic: string,
  context: { turnsRemaining: number; usageRemaining: Usage; timeRemainingMs: number },
) => Promise<{
  readonly turns: number;
  readonly usage: Usage;
  readonly contract: unknown;
}>;

export type SynthesizerExecutor = (
  research: ResearchContract,
  context: { turnsRemaining: number; usageRemaining: Usage; timeRemainingMs: number },
) => Promise<{
  readonly turns: number;
  readonly usage: Usage;
  readonly synthesis: unknown;
}>;

/** Головний виконавець мультиагентного пайплайну. */
export async function runMultiAgentPipeline(
  topic: string,
  researcher: ResearcherExecutor,
  synthesizer: SynthesizerExecutor,
  budget: PipelineBudget = DEFAULT_PIPELINE_BUDGET,
  clock: () => number = () => Date.now(),
): Promise<PipelineResult> {
  const startTime = clock();
  let accumulatedUsage: Usage = ZERO_USAGE;

  const getRemainingTime = () => budget.timeoutMs - (clock() - startTime);

  // ----------------------------------------------------
  // ЕТАП 1: Запуск ResearcherAgent
  // ----------------------------------------------------
  if (getRemainingTime() <= 0) {
    const duration = clock() - startTime;
    return {
      success: false,
      shortCircuited: true,
      terminationReason: 'RESEARCHER_TIMEOUT',
      totalUsage: accumulatedUsage,
      totalDurationMs: duration,
      researcherMetrics: {
        role: 'researcher',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: duration,
        status: 'timeout',
        error: 'Pipeline timed out before researcher could start',
      },
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: 0,
        status: 'skipped',
      },
    };
  }

  const researcherStartTime = clock();
  let researcherResult: Awaited<ReturnType<ResearcherExecutor>>;
  try {
    researcherResult = await researcher(topic, {
      turnsRemaining: budget.maxResearcherTurns,
      usageRemaining: {
        inputTokens: budget.maxInputTokens,
        cachedTokens: 0,
        outputTokens: budget.maxOutputTokens,
      },
      timeRemainingMs: getRemainingTime(),
    });
  } catch (err) {
    const duration = clock() - researcherStartTime;
    return {
      success: false,
      shortCircuited: true,
      terminationReason: 'RESEARCHER_ERROR',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics: {
        role: 'researcher',
        turns: 1,
        usage: ZERO_USAGE,
        durationMs: duration,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: 0,
        status: 'skipped',
      },
    };
  }

  const researcherDuration = clock() - researcherStartTime;
  accumulatedUsage = addUsage(accumulatedUsage, researcherResult.usage);

  // Перевірка таймауту після дослідника
  if (getRemainingTime() <= 0) {
    return {
      success: false,
      shortCircuited: true,
      terminationReason: 'RESEARCHER_TIMEOUT',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics: {
        role: 'researcher',
        turns: researcherResult.turns,
        usage: researcherResult.usage,
        durationMs: researcherDuration,
        status: 'timeout',
        error: `Researcher exceeded pipeline timeout of ${budget.timeoutMs}ms`,
      },
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: 0,
        status: 'skipped',
      },
    };
  }

  // Перевірка перевищення бюджету turns
  if (researcherResult.turns > budget.maxResearcherTurns) {
    return {
      success: false,
      shortCircuited: true,
      terminationReason: 'RESEARCHER_BUDGET_EXCEEDED',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics: {
        role: 'researcher',
        turns: researcherResult.turns,
        usage: researcherResult.usage,
        durationMs: researcherDuration,
        status: 'budget_exceeded',
        error: `Researcher turns (${researcherResult.turns}) exceeded limit (${budget.maxResearcherTurns})`,
      },
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: 0,
        status: 'skipped',
      },
    };
  }

  // Перевірка перевищення бюджету токенів
  if (
    accumulatedUsage.inputTokens > budget.maxInputTokens ||
    accumulatedUsage.outputTokens > budget.maxOutputTokens
  ) {
    return {
      success: false,
      shortCircuited: true,
      terminationReason: 'RESEARCHER_BUDGET_EXCEEDED',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics: {
        role: 'researcher',
        turns: researcherResult.turns,
        usage: researcherResult.usage,
        durationMs: researcherDuration,
        status: 'budget_exceeded',
        error: `Researcher token usage (${accumulatedUsage.inputTokens} in / ${accumulatedUsage.outputTokens} out) exceeded limit (${budget.maxInputTokens} in / ${budget.maxOutputTokens} out)`,
      },
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: 0,
        status: 'skipped',
      },
    };
  }

  // Валідація контракту дослідника через Zod
  const validatedContract = ResearchContractSchema.safeParse(researcherResult.contract);
  if (!validatedContract.success) {
    return {
      success: false,
      shortCircuited: true,
      terminationReason: 'RESEARCHER_SCHEMA_ERROR',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics: {
        role: 'researcher',
        turns: researcherResult.turns,
        usage: researcherResult.usage,
        durationMs: researcherDuration,
        status: 'error',
        error: `Contract schema validation failed: ${validatedContract.error.message}`,
      },
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 0,
        usage: ZERO_USAGE,
        durationMs: 0,
        status: 'skipped',
      },
    };
  }

  const researcherMetrics: AgentRunMetrics = {
    role: 'researcher',
    turns: researcherResult.turns,
    usage: researcherResult.usage,
    durationMs: researcherDuration,
    status: 'success',
  };

  // ----------------------------------------------------
  // ЕТАП 2: Запуск SynthesizerAgent (тільки якщо перший успішний)
  // ----------------------------------------------------
  const synthesizerStartTime = clock();
  let synthesizerResult: Awaited<ReturnType<SynthesizerExecutor>>;
  try {
    synthesizerResult = await synthesizer(validatedContract.data, {
      turnsRemaining: budget.maxSynthesizerTurns,
      usageRemaining: {
        inputTokens: Math.max(0, budget.maxInputTokens - accumulatedUsage.inputTokens),
        cachedTokens: 0,
        outputTokens: Math.max(0, budget.maxOutputTokens - accumulatedUsage.outputTokens),
      },
      timeRemainingMs: getRemainingTime(),
    });
  } catch (err) {
    const duration = clock() - synthesizerStartTime;
    return {
      success: false,
      shortCircuited: false,
      interimResearch: validatedContract.data,
      terminationReason: 'SYNTHESIZER_ERROR',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics,
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: 1,
        usage: ZERO_USAGE,
        durationMs: duration,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const synthesizerDuration = clock() - synthesizerStartTime;
  accumulatedUsage = addUsage(accumulatedUsage, synthesizerResult.usage);

  // Перевірка таймауту синтезатора
  if (getRemainingTime() < 0) {
    return {
      success: false,
      shortCircuited: false,
      interimResearch: validatedContract.data,
      terminationReason: 'SYNTHESIZER_TIMEOUT',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics,
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: synthesizerResult.turns,
        usage: synthesizerResult.usage,
        durationMs: synthesizerDuration,
        status: 'timeout',
        error: `Synthesizer exceeded remaining pipeline timeout`,
      },
    };
  }

  // Перевірка ліміту turns синтезатора
  if (synthesizerResult.turns > budget.maxSynthesizerTurns) {
    return {
      success: false,
      shortCircuited: false,
      interimResearch: validatedContract.data,
      terminationReason: 'SYNTHESIZER_BUDGET_EXCEEDED',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics,
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: synthesizerResult.turns,
        usage: synthesizerResult.usage,
        durationMs: synthesizerDuration,
        status: 'budget_exceeded',
        error: `Synthesizer turns (${synthesizerResult.turns}) exceeded limit (${budget.maxSynthesizerTurns})`,
      },
    };
  }

  // Перевірка загального ліміту токенів
  if (
    accumulatedUsage.inputTokens > budget.maxInputTokens ||
    accumulatedUsage.outputTokens > budget.maxOutputTokens
  ) {
    return {
      success: false,
      shortCircuited: false,
      interimResearch: validatedContract.data,
      terminationReason: 'SYNTHESIZER_BUDGET_EXCEEDED',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics,
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: synthesizerResult.turns,
        usage: synthesizerResult.usage,
        durationMs: synthesizerDuration,
        status: 'budget_exceeded',
        error: `Total token usage (${accumulatedUsage.inputTokens} in / ${accumulatedUsage.outputTokens} out) exceeded limit (${budget.maxInputTokens} in / ${budget.maxOutputTokens} out)`,
      },
    };
  }

  // Валідація контракту синтезатора через Zod
  const validatedSynthesis = SynthesisResultSchema.safeParse(synthesizerResult.synthesis);
  if (!validatedSynthesis.success) {
    return {
      success: false,
      shortCircuited: false,
      interimResearch: validatedContract.data,
      terminationReason: 'SYNTHESIZER_SCHEMA_ERROR',
      totalUsage: accumulatedUsage,
      totalDurationMs: clock() - startTime,
      researcherMetrics,
      synthesizerMetrics: {
        role: 'synthesizer',
        turns: synthesizerResult.turns,
        usage: synthesizerResult.usage,
        durationMs: synthesizerDuration,
        status: 'error',
        error: `Synthesis schema validation failed: ${validatedSynthesis.error.message}`,
      },
    };
  }

  // Повний успіх
  return {
    success: true,
    data: validatedSynthesis.data,
    interimResearch: validatedContract.data,
    shortCircuited: false,
    terminationReason: 'COMPLETED',
    totalUsage: accumulatedUsage,
    totalDurationMs: clock() - startTime,
    researcherMetrics,
    synthesizerMetrics: {
      role: 'synthesizer',
      turns: synthesizerResult.turns,
      usage: synthesizerResult.usage,
      durationMs: synthesizerDuration,
      status: 'success',
    },
  };
}
