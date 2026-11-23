/**
 * ШАР ПАМʼЯТІ ТА КОМПАКТИФІКАЦІЯ КОНТЕКСТУ (ЛР4, Крок 04).
 *
 * Дворівнева архітектура:
 * 1. Working Memory (короткострокова) — оперативний контекст поточної задачі,
 *    діалог, результати виклику інструментів.
 * 2. Persistent Memory (довгострокова) — збереження структурованих фактів,
 *    висновків та інваріантів у JSON/файлове сховище між сесіями.
 *
 * Механізм компактифікації:
 * - Поріг спрацювання: 75% від maxContextTokens.
 * - Евристики: очищення старих викликів інструментів, агрегація вторинних фактів,
 *   безумовне збереження 100% критичних фактів.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

export type FactPriority = 'critical' | 'secondary';

export interface MemoryFact {
  readonly id: string;
  readonly text: string;
  readonly topic: string;
  readonly priority: FactPriority;
  readonly confidence: number;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

export interface WorkingContextItem {
  readonly id: string;
  readonly type: 'system' | 'message' | 'tool_result' | 'fact';
  readonly content: string;
  readonly estimatedTokens: number;
  readonly priority?: FactPriority | undefined;
  readonly timestamp: number;
}

export interface CompactionMetrics {
  readonly beforeTokens: number;
  readonly afterTokens: number;
  readonly reductionRatio: number;
  readonly criticalPreservedCount: number;
  readonly criticalTotalCount: number;
  readonly secondaryPreservedCount: number;
  readonly secondaryTotalCount: number;
}

/** Інтерфейс довгострокової пам'яті (Persistent Storage). */
export interface IPersistentMemoryStore {
  saveFact(fact: Omit<MemoryFact, 'id' | 'timestamp'>): Promise<MemoryFact>;
  queryFacts(topic?: string, minConfidence?: number): Promise<MemoryFact[]>;
  getAllFacts(): Promise<MemoryFact[]>;
  clear(): Promise<void>;
}

/** JSON-файлове або in-memory сховище довгострокової пам'яті. */
export class JsonPersistentMemoryStore implements IPersistentMemoryStore {
  private facts: Map<string, MemoryFact> = new Map();
  private filePath: string | undefined;

  constructor(filePath?: string) {
    this.filePath = filePath;
    if (filePath && fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed: MemoryFact[] = JSON.parse(raw);
        for (const f of parsed) {
          this.facts.set(f.id, f);
        }
      } catch {
        // Якщо файл пошкоджений, починаємо з чистого аркуша
      }
    }
  }

  async saveFact(factInput: Omit<MemoryFact, 'id' | 'timestamp'>): Promise<MemoryFact> {
    const id = `fact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fact: MemoryFact = {
      text: factInput.text,
      topic: factInput.topic,
      priority: factInput.priority,
      confidence: factInput.confidence,
      ...(factInput.metadata ? { metadata: factInput.metadata } : {}),
      id,
      timestamp: Date.now(),
    };
    this.facts.set(id, fact);
    this.persist();
    return fact;
  }

  async queryFacts(topic?: string, minConfidence = 0): Promise<MemoryFact[]> {
    return Array.from(this.facts.values()).filter(f => {
      if (topic && !f.topic.toLowerCase().includes(topic.toLowerCase())) {
        return false;
      }
      return f.confidence >= minConfidence;
    });
  }

  async getAllFacts(): Promise<MemoryFact[]> {
    return Array.from(this.facts.values());
  }

  async clear(): Promise<void> {
    this.facts.clear();
    this.persist();
  }

  private persist(): void {
    if (this.filePath) {
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.facts.values()), null, 2));
      } catch {
        // Non-blocking in sandboxed environments
      }
    }
  }
}

/** Оцінка токенів за евристикою 1 токен ~ 4 символи. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Робоча пам'ять (Working Memory) із вбудованою компактифікацією. */
export class WorkingMemory {
  private items: WorkingContextItem[] = [];
  readonly maxContextTokens: number;
  readonly thresholdRatio: number;

  constructor(maxContextTokens = 4000, thresholdRatio = 0.75) {
    this.maxContextTokens = maxContextTokens;
    this.thresholdRatio = thresholdRatio;
  }

  addItem(
    type: WorkingContextItem['type'],
    content: string,
    priority?: FactPriority,
  ): WorkingContextItem {
    const item: WorkingContextItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      content,
      estimatedTokens: estimateTokens(content),
      ...(priority !== undefined ? { priority } : {}),
      timestamp: Date.now(),
    };
    this.items.push(item);
    return item;
  }

  getItems(): readonly WorkingContextItem[] {
    return this.items;
  }

  getTotalTokens(): number {
    return this.items.reduce((sum, item) => sum + item.estimatedTokens, 0);
  }

  isCompactionNeeded(): boolean {
    return this.getTotalTokens() >= this.maxContextTokens * this.thresholdRatio;
  }

  /**
   * Алгоритм компактифікації:
   * 1. 100% критичних фактів (priority: 'critical') зберігаються дослівно.
   * 2. Вторинні факти (priority: 'secondary') ранжуються, топ-елементи узагальнюються
   *    у стислий звіт (збереження >= 80%).
   * 3. Старі розлогі логи інструментів (tool_result) та проміжні повідомлення вичищаються.
   */
  compact(): CompactionMetrics {
    const beforeTokens = this.getTotalTokens();

    const criticalItems = this.items.filter(i => i.priority === 'critical');
    const secondaryItems = this.items.filter(i => i.priority === 'secondary');
    const systemItems = this.items.filter(i => i.type === 'system');

    // 100% збереження критичних фактів
    const preservedCritical = [...criticalItems];

    // Збереження вторинних фактів: сортуємо за часом та беремо топ 80-85% або стискаємо
    // Якщо вторинних фактів N, зберігаємо щонайменше Math.ceil(N * 0.8)
    const secondaryTargetCount = Math.max(1, Math.ceil(secondaryItems.length * 0.83));
    const preservedSecondary = secondaryItems.slice(-secondaryTargetCount);

    // Створюємо компактне саммарі вторинних фактів
    const secondarySummaryContent = preservedSecondary
      .map(item => `• ${item.content}`)
      .join('\n');

    // Формуємо оновлений компактний контекст
    const compactedItems: WorkingContextItem[] = [
      ...systemItems,
      ...preservedCritical,
      {
        id: `summary_${Date.now()}`,
        type: 'fact',
        content: `[COMPACTED SECONDARY SUMMARY]:\n${secondarySummaryContent}`,
        estimatedTokens: estimateTokens(secondarySummaryContent),
        priority: 'secondary',
        timestamp: Date.now(),
      },
    ];

    this.items = compactedItems;
    const afterTokens = this.getTotalTokens();

    return {
      beforeTokens,
      afterTokens,
      reductionRatio: Number((1 - afterTokens / beforeTokens).toFixed(2)),
      criticalPreservedCount: preservedCritical.length,
      criticalTotalCount: criticalItems.length,
      secondaryPreservedCount: preservedSecondary.length,
      secondaryTotalCount: secondaryItems.length,
    };
  }

  clear(): void {
    this.items = [];
  }
}
