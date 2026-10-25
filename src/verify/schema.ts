import { z } from 'zod';

/** Один критерій приймання зі spec.md — один запис вердикту. */
export const criterionVerdict = z
  .object({
    /** Номер критерію з docs/lab2/spec.md, дослівно (наприклад "A1", "A2"). */
    id: z.string().min(1),
    /** unknown — аварійний вихід: даних у наданій зміні недостатньо для судження. */
    verdict: z.enum(['pass', 'fail', 'unknown']),
    /** Чому саме так. Одне-два лаконічні речення. */
    reason: z.string().min(1),
    /** Посилання на файл і рядок у diff або фрагмент коду, що доводить вердикт. */
    evidence: z.string().min(1),
  })
  .strict();

export type CriterionVerdict = z.infer<typeof criterionVerdict>;

export const verificationReport = z.array(criterionVerdict);
export type VerificationReport = z.infer<typeof verificationReport>;
