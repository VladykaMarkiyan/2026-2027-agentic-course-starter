import { z } from 'zod';

/** Один критерій приймання задачі з черги або spec.md — один запис вердикту. */
export const criterionVerdict = z
  .object({
    /** Ідентифікатор критерію з опису задачі, дослівно. */
    id: z.string().min(1),
    /** unknown — аварійний вихід: даних в артефакті недостатньо для судження. */
    verdict: z.enum(['pass', 'fail', 'unknown']),
    /** Чому саме так. Одне-два речення, без загальних порад. */
    reason: z.string().min(1),
    /** Файл і рядок або цитата з артефакту; порожньо лише для unknown. */
    evidence: z.string(),
  })
  .strict();

export type CriterionVerdict = z.infer<typeof criterionVerdict>;

export const verifyReport = z.object({ results: z.array(criterionVerdict).min(1) }).strict();
export type VerifyReport = z.infer<typeof verifyReport>;

export const verificationReport = z.array(criterionVerdict);
export type VerificationReport = z.infer<typeof verificationReport>;

/** УВАГА: у Лаб. 2 браму валив лише fail. У харнесі блокує все, що не pass:
 *  unknown нікому розбирати вручну, бо прогін автономний. */
export function isBlocked(report: VerifyReport): boolean {
  return report.results.some((r) => r.verdict !== 'pass');
}
