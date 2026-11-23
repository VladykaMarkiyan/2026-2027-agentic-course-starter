import { describe, it, expect, vi } from 'vitest';
import {
  runMultiAgentPipeline,
  DEFAULT_PIPELINE_BUDGET,
  type ResearcherExecutor,
  type SynthesizerExecutor,
  type PipelineBudget,
} from '../src/agent/multiagent';
import type { Usage } from '../src/cost';

describe('Multi-agent pipeline with resource budget & short-circuiting', () => {
  const validResearchContract = {
    topic: 'TypeScript Brownfield Modernization',
    findings: [
      {
        fact: 'Defu provides prototype-safe object merging without runtime dependencies.',
        source: 'docs/lab4/context.md#L45',
        confidence: 0.98,
      },
      {
        fact: 'Characterization tests caught 3 subtle quirks before refactoring.',
        source: 'docs/lab4/characterization.md#L20',
        confidence: 0.95,
      },
    ],
    hypotheses: ['Adding array deduplication will not break backward compatibility'],
    summary: 'The library is well-tested and safe for modular extensions.',
  };

  const validSynthesisResult = {
    topic: 'TypeScript Brownfield Modernization',
    executiveSummary:
      'Brownfield modernization was verified successfully using golden master tests.',
    verifiedKeyPoints: [
      'Zero production bugs introduced',
      'Rollback verified in under 5 seconds',
    ],
    recommendation: 'Deploy defuDedup to production release cycle.',
    confidenceScore: 0.96,
  };

  it('Run 1 (Normal Run): successfully completes both agents within budget', async () => {
    let now = 1000;
    const fakeClock = () => now;

    const mockResearcher: ResearcherExecutor = vi.fn().mockImplementation(async () => {
      now += 250;
      return {
        turns: 2,
        usage: { inputTokens: 1200, cachedTokens: 0, outputTokens: 350 },
        contract: validResearchContract,
      };
    });

    const mockSynthesizer: SynthesizerExecutor = vi.fn().mockImplementation(async () => {
      now += 180;
      return {
        turns: 1,
        usage: { inputTokens: 950, cachedTokens: 0, outputTokens: 280 },
        synthesis: validSynthesisResult,
      };
    });

    const result = await runMultiAgentPipeline(
      'TypeScript Brownfield Modernization',
      mockResearcher,
      mockSynthesizer,
      DEFAULT_PIPELINE_BUDGET,
      fakeClock,
    );

    expect(result.success).toBe(true);
    expect(result.shortCircuited).toBe(false);
    expect(result.terminationReason).toBe('COMPLETED');
    expect(result.data).toEqual(validSynthesisResult);

    expect(mockResearcher).toHaveBeenCalledTimes(1);
    expect(mockSynthesizer).toHaveBeenCalledTimes(1);

    expect(result.researcherMetrics.status).toBe('success');
    expect(result.researcherMetrics.turns).toBe(2);
    expect(result.synthesizerMetrics.status).toBe('success');
    expect(result.synthesizerMetrics.turns).toBe(1);

    expect(result.totalUsage).toEqual({
      inputTokens: 2150,
      cachedTokens: 0,
      outputTokens: 630,
    });
    expect(result.totalDurationMs).toBe(430);
  });

  it('Run 2 (Short-Circuit Run): halts immediately when Researcher exceeds token budget and NEVER calls Synthesizer', async () => {
    let now = 1000;
    const fakeClock = () => now;

    const mockResearcher: ResearcherExecutor = vi.fn().mockImplementation(async () => {
      now += 300;
      // Over budget: default budget is 10000 input / 2000 output
      return {
        turns: 3,
        usage: { inputTokens: 14500, cachedTokens: 0, outputTokens: 500 },
        contract: validResearchContract,
      };
    });

    const mockSynthesizer: SynthesizerExecutor = vi.fn();

    const result = await runMultiAgentPipeline(
      'Large Knowledge Ingestion',
      mockResearcher,
      mockSynthesizer,
      DEFAULT_PIPELINE_BUDGET,
      fakeClock,
    );

    expect(result.success).toBe(false);
    expect(result.shortCircuited).toBe(true);
    expect(result.terminationReason).toBe('RESEARCHER_BUDGET_EXCEEDED');
    expect(result.data).toBeUndefined();

    // STRICT SHORT-CIRCUIT: Synthesizer must never be invoked
    expect(mockSynthesizer).not.toHaveBeenCalled();
    expect(result.synthesizerMetrics.status).toBe('skipped');
    expect(result.researcherMetrics.status).toBe('budget_exceeded');
    expect(result.researcherMetrics.error).toContain('exceeded limit');
  });

  it('Run 3 (Timeout Run): aborts execution when pipeline timeout is exceeded', async () => {
    let now = 1000;
    const fakeClock = () => now;

    const tightBudget: PipelineBudget = {
      maxResearcherTurns: 5,
      maxSynthesizerTurns: 3,
      maxInputTokens: 10000,
      maxOutputTokens: 2000,
      timeoutMs: 500, // 500ms timeout
    };

    const mockResearcher: ResearcherExecutor = vi.fn().mockImplementation(async () => {
      now += 700; // Exceeds 500ms timeout!
      return {
        turns: 2,
        usage: { inputTokens: 800, cachedTokens: 0, outputTokens: 200 },
        contract: validResearchContract,
      };
    });

    const mockSynthesizer: SynthesizerExecutor = vi.fn();

    const result = await runMultiAgentPipeline(
      'Slow Search Operation',
      mockResearcher,
      mockSynthesizer,
      tightBudget,
      fakeClock,
    );

    expect(result.success).toBe(false);
    expect(result.shortCircuited).toBe(true);
    expect(result.terminationReason).toBe('RESEARCHER_TIMEOUT');
    expect(mockSynthesizer).not.toHaveBeenCalled();
    expect(result.synthesizerMetrics.status).toBe('skipped');
    expect(result.researcherMetrics.status).toBe('timeout');
  });

  it('Short-circuits if Researcher returns malformed data failing schema validation', async () => {
    const mockResearcher: ResearcherExecutor = vi.fn().mockResolvedValue({
      turns: 1,
      usage: { inputTokens: 300, cachedTokens: 0, outputTokens: 50 },
      contract: { topic: 'Invalid', findings: [] }, // Empty findings violates min(1)
    });

    const mockSynthesizer: SynthesizerExecutor = vi.fn();

    const result = await runMultiAgentPipeline(
      'Broken Contract',
      mockResearcher,
      mockSynthesizer,
    );

    expect(result.success).toBe(false);
    expect(result.shortCircuited).toBe(true);
    expect(result.terminationReason).toBe('RESEARCHER_SCHEMA_ERROR');
    expect(mockSynthesizer).not.toHaveBeenCalled();
    expect(result.synthesizerMetrics.status).toBe('skipped');
  });

  it('Halts if Synthesizer exceeds turn budget', async () => {
    const mockResearcher: ResearcherExecutor = vi.fn().mockResolvedValue({
      turns: 2,
      usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 200 },
      contract: validResearchContract,
    });

    const mockSynthesizer: SynthesizerExecutor = vi.fn().mockResolvedValue({
      turns: 5, // Exceeds default limit of 3 turns
      usage: { inputTokens: 800, cachedTokens: 0, outputTokens: 300 },
      synthesis: validSynthesisResult,
    });

    const result = await runMultiAgentPipeline(
      'Looping Synthesizer',
      mockResearcher,
      mockSynthesizer,
    );

    expect(result.success).toBe(false);
    expect(result.shortCircuited).toBe(false); // Researcher ran successfully
    expect(result.terminationReason).toBe('SYNTHESIZER_BUDGET_EXCEEDED');
    expect(result.synthesizerMetrics.status).toBe('budget_exceeded');
  });
});
