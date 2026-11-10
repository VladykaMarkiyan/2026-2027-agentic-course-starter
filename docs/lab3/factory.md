# Фабрика задач — Лабораторна 3

- **Дата:** 2026-11-10 · **Репозиторій:** https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter
- **Шлях агента:** OpenCode CLI (opencode 1.18.32) / Gemini CLI, модель `gemini-2.5-flash`
- **Чому саме цей:** OpenCode 1.18.32 встановлено локально у системі, підтримує автономне виконання та роботу з локальним контекстом без платних підписок; Gemini CLI надає доступ до безкоштовного рівня з добовою квотою.
- **Режим дозволів:** `dontAsk` + явний перелік дозволених інструментів `--allowedTools "Read,Edit,Bash(npm test *),Bash(npm run typecheck *),Bash(git diff *)"`
- **Ізоляція:** `git worktree`, команда дослівно: `git worktree add -b harness/<id> .harness-runs/<id> main`

---

## 1. Форма задачі

| Поле | Тип | Опис призначення |
|---|---|---|
| `id` | `string` | Унікальний ідентифікатор задачі черги (наприклад, `t-01`, `t-02`) |
| `input` | `string` | Чітка інструкція для агента: які файли змінити та що вважається готовим |
| `acceptance` | `string[]` | Детерміновані машинні перевірки успіху (команди `npm run typecheck`, `npm test` тощо) |
| `budget` | `object` | Межі ресурсів: `max_turns`, `max_usd`, `timeout_s` |
| `files` | `string[]` | Перелік цільових файлів, над якими ведеться робота |

Черга сформована у `docs/lab3/tasks.jsonl`, загалом **7 задач**, заснованих на модулях проекту:
1. `t-01`: Перевірка типів та тести розрахунку вартості моделей (`src/cost.ts`).
2. `t-02`: Лінтер та перевірка алгоритму злиття рангів RRF (`src/rag/rrf.ts`, `tests/retrieval.test.ts`).
3. `t-03`: Валідація схеми верифікатора (`src/verify/schema.ts`, `tests/verify.test.ts`).
4. `t-04`: Інструменти MCP-сервера (`src/mcp/tools.ts`, `tests/mcp.test.ts`).
5. `t-05`: Модульні тести метрик пошуку (`src/metrics.ts`, `tests/metrics.test.ts`).
6. `t-06`: Строгий typecheck та smoke-тести (`tests/smoke.test.ts`).
7. `t-07`: Ендпоінт стану працездатності health check (`src/health.ts`, `tests/health.test.ts`).

---

## 2. Виклик агента

Виконавець підтримує неінтерактивний запуск агента з передачею обмежень бюджету й таймауту:

```bash
# Запуск конкретної задачі черги за ідентифікатором
npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl --id t-01

# Запуск із явним вибором раннера агента
npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl --id t-01 --agent fake
```

Для Claude Code команда виклику містить суворі прапорці:
```bash
claude -p "<input>" --output-format json --allowedTools "Read,Edit,Bash(npm test *),Bash(npm run typecheck *),Bash(git diff *)" --permission-mode dontAsk --max-turns 10 --max-budget-usd 0.40
```

---

## 3. Де лежать артефакти

- **Сирі робочі теки прогонів:** `runs/<id>-<мітка часу>/` — містять робочі артефакти прогону (`patch.diff`, `output.txt`, `agent.log`, `run.json`). Ця тека додана до `.gitignore` і не засмічує репозиторій.
- **Відібрані артефакти для репозиторію:** `docs/lab3/runs/<id>-<мітка часу>/` — зберігаються у git як доказ автономних прогонів. Кожен прогін містить усі 4 обов'язкові файли.

У репозиторії вже зафіксовано перші успішні прогони:
- `docs/lab3/runs/t-01-.../`
- `docs/lab3/runs/t-02-.../`

---

## 4. Журнал прогону (`run.json`)

| Поле | Звідки значення |
|---|---|
| `task_id` | З черги `docs/lab3/tasks.jsonl` |
| `artifact_dir` | Шлях цієї ж теки — прямий звʼязок журналу з артефактом |
| `started_at` / `ended_at` / `duration_s` | Виміряні виконавцем `scripts/harness/run-task.ts` |
| `exit_status` | Код виходу агента + розбір stderr (`ok`, `agent_failed`, `timeout`, `budget_or_turns`) |
| `acceptance` | Масив виконання команд перевірки з кодами повернення |
| `acceptance_passed` | `true`, якщо всі команди повертають `exit: 0` |
| `session_id` | Поле `session_id` з JSON виводу агента |
| `input_tokens` / `output_tokens` | Кількість токенів з usage |
| `cost_usd_estimate` | Оцінка вартості прогону |
| `trace_id` | Заповнюється на кроці 06 |
| `gates` | Заповнюється на кроці 01 |

---

## 5. Як перезапустити одну задачу

```bash
# Перезапуск задачі за id
npx tsx scripts/harness/run-queue.ts docs/lab3/tasks.jsonl --id t-01

# Перегляд найсвіжіших журналів прогону задачі
Get-ChildItem docs/lab3/runs -Filter run.json -Recurse |
  Where-Object { $_.FullName -match 't-01' } |
  Sort-Object LastWriteTime -Descending
```

---

## 6. Що перевірено без мережі

У `tests/harness/run-task.test.ts` реалізовано 5 автономних тестів з підставним агентом (`fakeRunner`):
1. **Успішний прогін:** створення артефактів, валідація тривалості, звʼязок `run.json` з `artifact_dir`.
2. **Падіння агента:** статус `agent_failed`, логування помилки в `agent.log`.
3. **Вичерпання бюджету:** фіксація статусу `budget_or_turns` при отриманні `Budget limit reached`.
4. **Непарсибельний вивід:** безпечне повернення `cost_usd_estimate: null` без викидання винятків.
5. **Таймаут:** перевірка спрацьовування таймауту процесу зі статусом `timeout`.

Всі тести проходять детерміновано за <1 секунду без ключів API та без доступу до Інтернету.
