# Пакет доказів — Лабораторна 1

**Автор:** Маркіян Владика  
**Репозиторій:** [VladykaMarkiyan/2026-2027-agentic-course-starter](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter)

---

## 1. Інструменти
Робота виконана з використанням рекомендованої пари агентів кодування за $0:
- **OpenCode:** версія `1.18.32` (моделі OpenCode Zen / Qwen та локальна Ollama).
- **GitHub Copilot CLI:** версія `1.0.88` (Copilot auto-model).

---

## 2. Як запустити у двох інструментах

### 2.1. OpenCode
1. Запустити OpenCode у корені репозиторію:
   ```bash
   opencode
   ```
2. Підтвердити підключення налаштувань проєкту (`opencode.json`) та плагінів (`.opencode/plugins/`).
3. Виконати запит на читання або модифікацію коду. Перемикання режимів Plan / Build здійснюється клавішею `Tab`.
4. Дії агента автоматично фіксуються плагіном у `.agent-log/opencode.jsonl`.

### 2.2. GitHub Copilot CLI
1. Запустити у терміналі з кореня проєкту:
   ```bash
   copilot
   ```
2. Підтвердити довіру до теки репозиторію та hooks у `.github/hooks/`.
3. Для дослідження коду без змін використовувати команду `/plan`.
4. Виклики інструментів логуються через hook у `.agent-log/copilot.jsonl`.

---

## 3. Зміст пакета доказів і посилання на артефакти

| Критерій / Доказ | Посилання на артефакт у репозиторії |
|---|---|
| **AGENTS.md власноруч** | [AGENTS.md](../../AGENTS.md) (перевірено на стислість) |
| **Імпорт у Claude Code** | [CLAUDE.md](../../CLAUDE.md) (`@AGENTS.md`) |
| **Тест «видали 40%»** | [docs/lab1/agents-md-40.md](./agents-md-40.md) |
| **Гілки прогону 40%** | [lab1/agents-md-40-full](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/tree/lab1/agents-md-40-full) · [lab1/agents-md-40-cut](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/tree/lab1/agents-md-40-cut) |
| **Журнал дій агента (OpenCode)** | [.agent-log/opencode.jsonl](../../.agent-log/opencode.jsonl) (формат JSONL, 6 полів) |
| **Журнал дій агента (Copilot)** | [.agent-log/copilot.jsonl](../../.agent-log/copilot.jsonl) |
| **Контракт та тести /api/health** | [src/health.ts](../../src/health.ts) · [tests/health.test.ts](../../tests/health.test.ts) · [app/api/health/route.ts](../../app/api/health/route.ts) |
| **Гілки реалізації /api/health** | [lab1/health-opencode](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/tree/lab1/health-opencode) · [lab1/health-copilot](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/tree/lab1/health-copilot) |
| **Впевнені помилки агентів** | [docs/lab1/confident-errors.md](./confident-errors.md) |
| **Навичка add-api-route** | [.claude/skills/add-api-route/SKILL.md](../../.claude/skills/add-api-route/SKILL.md) · [.agents/skills/add-api-route/](../../.agents/skills/add-api-route/) |
| **Протокол виклику навички** | [docs/lab1/skill-trigger.md](./skill-trigger.md) (3 позитивні + 3 негативні) |
| **Заборона доступу до .env** | [scripts/guard-env.mjs](../../scripts/guard-env.mjs) · [.github/hooks/guard-env.json](../../.github/hooks/guard-env.json) · [.opencode/plugins/guard-env.js](../../.opencode/plugins/guard-env.js) |
| **Рядки denied у журналах** | [copilot.jsonl](../../.agent-log/copilot.jsonl) · [opencode.jsonl](../../.agent-log/opencode.jsonl) |
| **Ціна MCP Context7** | [docs/lab1/context-cost.md](./context-cost.md) |
| **Скріншот браузерного тесту** | [docs/lab1/e2e-home.png](./e2e-home.png) · тест [tests/health-link.spec.ts](../../tests/health-link.spec.ts) |
| **Облік вартості (cost.ts)** | [src/cost.ts](../../src/cost.ts) · тести [tests/cost.test.ts](../../tests/cost.test.ts) |
| **Таблиця вартості (3 прогони)** | [docs/lab1/cost.md](./cost.md) (хмара, шлюз, локально, множник ua/en) |
| **Власний цикл (agent-loop)** | [src/agent/agent-loop.ts](../../src/agent/agent-loop.ts) · [adapters.ts](../../src/agent/adapters.ts) · [tools.ts](../../src/agent/tools.ts) |
| **Тести зупинок власного циклу** | [tests/agent-loop.test.ts](../../tests/agent-loop.test.ts) (ліміт кроків і бюджет токенів) |
| **Порівняння Agent vs Loop** | [docs/lab1/comparison.md](./comparison.md) |
| **Цикл на AI SDK 7** | [src/agent/agent-aisdk.ts](../../src/agent/agent-aisdk.ts) · тести [tests/agent-aisdk.test.ts](../../tests/agent-aisdk.test.ts) |
| **Деплой маршруту з трасами** | [app/api/agent/route.ts](../../app/api/agent/route.ts) · [instrumentation.ts](../../instrumentation.ts) · [src/otel/langfuse.ts](../../src/otel/langfuse.ts) |
| **Траси Langfuse (скріншоти)** | [docs/lab1/traces/](./traces/) (`trace-1.png`, `trace-2.png`, `trace-3.png`) |
| **Рішення про заміну моделі** | [docs/lab1/model-decision.md](./model-decision.md) |
| **Таблиця переносності** | [docs/lab1/portability.md](./portability.md) |
| **Журнал автономності** | [docs/lab1/autonomy-log.md](./autonomy-log.md) (6 зафіксованих сесій) |
| **Чернетка «Вступу»** | [docs/lab1/intro-draft.md](./intro-draft.md) |

---

## 4. Прогони CI та перевірка «поганого патча»
- **Зелений прогін останнього коміту в `main`:** [GitHub Actions Workflow Run](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/actions) (всі обов'язкові перевірки `typecheck`, `lint`, `test`, `build` успішні).
- **Червоний прогін «поганого патча»:** фіксується під час пул-реквесту викладача (job `verify` зупиняє зміни з кодом помилки).
