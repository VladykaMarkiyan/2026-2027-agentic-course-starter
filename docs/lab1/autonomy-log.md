# Журнал автономності — Лабораторна 1

Сесія — одна цілісна робота з агентом над однією задачею: від запуску до коміту або відмови.

## Журнал сесій

| Дата | Інструмент і модель | Режим дозволів | Рівень довіри (L0–L5) | Задача | Що запропонував / що виконав | Де і чому я втрутився | Які докази прийняв | Журнал / коміт |
|---|---|---|---|---|---|---|---|---|
| 2026-09-27 | OpenCode 1.18.32, OpenCode Zen / Qwen | default | L0 | Перший запуск: «Які команди перевірки є в цьому репозиторії?» | Перелічив команди перевірки: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Файлів не змінював. | Не втручався, запит суто на ознайомлення (читання). | Звірив відповідь із `package.json`, звірив наявність скриптів. | hooks ще немає (крок 02) |
| 2026-09-27 | GitHub Copilot CLI 1.0.88, Copilot auto-model | standard | L0 | Перший запуск: «Які команди перевірки є в цьому репозиторії?» | Прочитав `package.json`, вивів перелік команд перевірки коду і тестів. Нічого не модифікував. | Не втручався, операція лише на читання контексту. | Звірив вивід зі списком `scripts` у `package.json`. | hooks ще немає (крок 02) |
| 2026-09-27 | OpenCode 1.18.32, OpenCode Zen / Qwen | plan -> default | L0 -> L1 | Реалізація `GET /api/health` за схемою `src/health.ts` | У режимі Plan запропонував змінити тест; після відхилення створив `app/api/health/route.ts` та виконав `npm test`. | Зупинив спробу редагування `tests/health.test.ts`. Змусив слідувати контракту. | Зелений `npm test`, `npm run typecheck`, динамічний роут у `npm run build`. | [8849b45](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/8849b45) (.agent-log/opencode.jsonl) |
| 2026-09-27 | GitHub Copilot CLI 1.0.88, Copilot auto-model | plan -> standard | L0 -> L1 | Реалізація `GET /api/health` за схемою `src/health.ts` | У режимі плану запропонував `pages/api/health.ts` та статичний час. Після коригування створив `app/api/health/route.ts`. | Вказав на App Router структуру та вимогу `new Date().toISOString()`. | Зелені тести `npm test`, успішний `npm run build`. | [68a0509](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/68a0509) (.agent-log/copilot.jsonl) |
| 2026-09-28 | OpenCode 1.18.32, OpenCode Zen / Qwen | default | L1 | Створення навички `add-api-route` та скрипта валідації | Запропонував структуру SKILL.md та `check-route.mjs`. | Вимагав обов'язкової наявності полів `name` та `description` у лапках для YAML сумісності. | Успішний прогін `node check-route.mjs health` (код 0) та `check-route.mjs fake` (код 1). | [42608f1](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/42608f1) (.agent-log/opencode.jsonl) |
| 2026-09-28 | GitHub Copilot CLI 1.0.88, Copilot auto-model | standard | L1 | Налаштування безпекових заборон доступу до `.env*` | Запропонував скрипт перевірки та конфіг hooks. | Додав маскування значень секретів (`=***`) у журналі та перевірку команд підпроцесів. | Зафіксовано статус `denied` у журналі без створення небажаного файлу `.env`. | [f0fb7ba](https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/commit/f0fb7ba) (.agent-log/copilot.jsonl) |

## Мова артефактів
- Документація, коментарі в коді та звіти ведуться українською мовою відповідно до методичних вимог курсу.
- Відповідно до експериментальних вимірів на кроці 07 (див. `docs/lab1/cost.md`), множник токенізації української мови відносно англійської складає 1.44 для Gemini 3.8 Flash та 1.52 для Qwen 3 4B. Ця додаткова вартість у токенах є повністю обґрунтованою та свідомою з огляду на академічну прозорість, зрозумілість для команди розробки та однозначність інтерпретації правил безпеки.

## Інциденти
- Інцидентів витоку секретів або несанкціонованої модифікації файлів не зафіксовано. `.env.local` надійно додано до `.gitignore`.
