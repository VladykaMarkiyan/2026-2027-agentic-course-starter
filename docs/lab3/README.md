# Лабораторна 3 — харнес автономних агентів

- **Студент:** Маркіян Владика
- **Курс:** Інженерія агентних систем (2026–2027)
- **Тема:** Харнес автономних агентів з оцінюванням якості та перевіркою безпеки
- **Репозиторій:** [https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter)
- **Гілка:** `main` · **Зафіксований SHA:** [`58a1fd5`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/58a1fd5)

---

## 1. Таблиця прийняття

| Критерій | Де доказ | Посилання |
|---|---|---|
| **брама · CI зелений на поданому SHA** | GitHub Actions workflow `gates.yml` на SHA `58a1fd5` | [Прогін CI](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/actions) |
| **брама · журнал автономності, ≥ 4 сесії** | `docs/lab3/autonomy-log.md` (9 повних сесій від кроку 00 до 08) | [`autonomy-log.md`](./autonomy-log.md) |
| **брама · жодного обходу перевірок дозволів** | Конфігурація `dontAsk` із суворим білим списком `--allowedTools` | [`factory.md`](./factory.md#L4-L6) · [`redteam.md`](./redteam.md#L2-L4) |
| **брама · немає секретів в історії** | Перевірено `git log --all --oneline -- .env .env.local` (вивід порожній) | [`errors.md`](./errors.md#L4-L6) |
| **крок 00 · фабрика задач** | `docs/lab3/factory.md`, черга `tasks.jsonl`, виконавець `run-task.ts`, ізоляція `git worktree` | [`factory.md`](./factory.md) · [`eb50c16`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/eb50c16) |
| **крок 01 · ланцюг брам** | `docs/lab3/gates.md`, `gates.yml` (`types` → `lint` → `tests` → `build` → `evals` → `record`) | [`gates.md`](./gates.md) · [`90d9f4d`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/90d9f4d) |
| **крок 02 · верифікатор зупинив зміну** | `docs/lab3/verifier.md`, верифікатор на іншій моделі, суворе блокування `isBlocked()` | [`verifier.md`](./verifier.md) · [`95aec22`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/95aec22) |
| **крок 03 · прогін зупинився сам** | `docs/lab3/stop.md`, скінченний автомат Circuit Breaker, зупинка за лімітом `budget_or_turns` | [`stop.md`](./stop.md) · [`82efdee`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/82efdee) |
| **крок 04 · регресійна брама в CI** | `docs/lab3/evals.md`, 21 задача, $pass@3=100\%$, $pass^3=100\%$, `evals-baseline.json` | [`evals.md`](./evals.md) · [`7cc95db`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/7cc95db) |
| **крок 05 · число згоди судді** | `docs/lab3/judge.md`, 20 випадків (14 робочих + 6 holdout), $\kappa = 0.916$, згода $95.0\%$ | [`judge.md`](./judge.md) · [`5aa94e3`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/5aa94e3) |
| **крок 06 · класифікація помилок** | `docs/lab3/errors.md`, 10 відмов у 5 класах, OTel OTLP/HTTP, `trace_id` у `run.json` | [`errors.md`](./errors.md) · [`b6cc9ed`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/b6cc9ed) |
| **крок 07 · ін'єкція промпту** | `docs/lab3/redteam.md`, 6 сценаріїв (AgentDojo/InjecAgent), 6 інваріантів, 6 зупинено | [`redteam.md`](./redteam.md) · [`58a1fd5`](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/58a1fd5) |
| **крок 08 · цей звіт** | `docs/lab3/README.md` (пакет доказів, посилання на коміти, зведені числа) | [`README.md`](./README.md) |

---

## 2. Прогони CI

- **Зелений на поданому SHA:** Прогін пайплайну `.github/workflows/gates.yml` на SHA `58a1fd5` пройшов усі стадії: `types` (зелений, 4с) → `lint` (зелений, 6с) → `tests` (162 тести проходять офлайн, 1.2с) → `build` (Next.js збірка валідна) → `evals` (21 задача, регресійний кошик без відхилень) → `record` (вердикти збережено у `gate-record.json`).
- **Червоний, збережений як доказ:** Збережено прогін на гілці навмисного падіння `harness/red-2026-11-10` — брама `types` виявила синтаксичну помилку компіляції (`const x: number = "bad"`) і негайно зупинила весь пайплайн за 4 секунди; верифікатор і подальші ресурсомісткі кроки навіть не викликалися, що зберегло квоту.
- **Виправлення після червоного:** Коміт виправлення типів повернув статус брами `types` у `pass`, розблокувавши ланцюг виконання.

---

## 3. Інструменти й моделі

| Роль | Інструмент | Модель із версією | Платний чи безкоштовний шлях |
|---|---|---|---|
| **Виконавець задач черги** | OpenCode CLI 1.18.32 / Gemini CLI | `gemini-2.5-flash` | Безкоштовний рівень (Free Tier / Daily Quota) |
| **Детерміновані брами** | GitHub Actions / npm scripts | TypeScript 6.0.3, ESLint 9.39, Vitest 5.0 | $0 (локальні раннери й стандартний GitHub CI) |
| **Модель-суддя (верифікатор)** | Ollama 0.5.x (локальний інференс) | `qwen2.5-coder:7b` / `qwen3:4b` | $0 (повна локальна автономність без витрат) |
| **Телеметрія та траси** | OpenTelemetry OTLP/HTTP | AI SDK 7.0 + Langfuse Hobby | Безкоштовний рівень Langfuse Cloud |

---

## 4. Як повторити автономний прогін

1. **Клонування та встановлення залежностей:**
   ```bash
   git clone https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter.git
   cd 2026-2027-agentic-course-starter
   npm ci
   ```

2. **Режим дозволів і перелік дозволених інструментів:**
   Агент запускається в суворому режимі `dontAsk` із фіксованим списком дозволених інструментів:
   ```bash
   opencode run --allowedTools "Read,Edit,Bash(npm test *),Bash(npm run typecheck *),Bash(git diff *)"
   ```
   Будь-які прапорці небезпечного обходу (`--dangerously-skip-permissions` або `bypassPermissions`) суворо заборонені й блокуються інваріантами харнеса.

3. **Спосіб ізоляції:**
   Кожна задача черги виконується в окремому ізольованому дереві `git worktree`:
   ```bash
   git worktree add -b harness/<task_id> .harness-runs/<task_id> main
   ```
   Після завершення артефакти копіюються в `docs/lab3/runs/<task_id>-<timestamp>/`, а тимчасове дерево видаляється, захищаючи робочу гілку `main` від неперевірених змін.

4. **Запуск оцінювання та валідації:**
   ```bash
   # Прогін еталонного банку (k=3)
   $env:EVAL_K = '3'; npx tsx scripts/evals/run-evals.ts docs/lab3/tasks.jsonl
   # Перевірка регресійної брами
   npx tsx scripts/evals/gate.ts
   # Перевірка безпекових інваріантів Red-team
   npx tsx scripts/redteam/run-redteam.ts
   ```

---

## 5. Висновок і числа

- **Еталонне оцінювання (evals):** Регресійний набір тримається на **$100.0\%$ за $k=3$ спроб** ($pass@3 = 1.0$, $pass^3 = 1.0$), медіана тривалості задачі становить **$4.15$ с**, а середня вартість викликів оцінюється в **$0.0014$ USD** на весь банк із 21 задачі.
- **Узгодженість моделі-судді (judge calibration):** Сира згода між ручною розміткою та верифікатором досягла **$95.0\%$**, а скоригований коефіцієнт каппа Коена становить **$\kappa = 0.916$** (на відкладеному holdout-наборі — $100\%$ згоди), при цьому найнебезпечніший клас дефектів («пропускає погане», $fail \to pass$) повністю зведено до **0**.
- **Стійкість до атак (red-team):** Усі 6 спроб ін'єкцій промпту через три різні точки входу (`task_input`, `tool_result`, `fetched_doc`) зупинено завдяки інваріантам операційної системи та обмеженню білого списку інструментів, а не наївним інструкціям у системному промпті.
- **Цілісність коду:** 162 модульні тести проходять офлайн, `npm run typecheck` та `npm run lint` дають нуль попереджень і помилок, в історії відсутні витоки ключів або секретів.
