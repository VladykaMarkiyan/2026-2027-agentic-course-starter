# Ланцюг детермінованих брам — Лабораторна 3

- **Workflow:** `.github/workflows/gates.yml`
- **Порядок виконання:** `types` → `lint` → `tests` → `build` → `record`
- **Чому такий порядок:** Найдешевша й найбільш детермінована перевірка (`types` ~4 с) виконується першою. Якщо зламані типи, немає сенсу витрачати обчислювальний час на лінтування (~8 с), повний набір тестів (~10 с) та збірку Next.js (`build` ~25 с). Решта брам блокуються за допомогою ланцюжка залежностей `needs`.
- **Паралелізм (concurrency):** `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true` (новий коміт негайно скасовує застарілий прогін).
- **Артефакти:** `actions/upload-artifact@v7` для збереження звітів та `actions/download-artifact@v8` у задачі `record`.

---

## 1. Таблиця брам

| Брама | Що доводить | Орієнтовний час (хв) | Що пише / артефакт |
|---|---|---|---|
| **types** | Строга типізація TypeScript без помилок (`npm run typecheck`) | ~0.1 хв | verdict (`pass` / `fail`) у `$GITHUB_OUTPUT` + лог |
| **lint** | Дотримання правил ESLint (`npm run lint`) | ~0.2 хв | verdict (`pass` / `fail`) у `$GITHUB_OUTPUT` + лог |
| **tests** | Успішне проходження 139 модульних тестів Vitest (`npm test`) | ~0.3 хв | verdict + артефакт `gate-tests` |
| **build** | Коректна компіляція та збірка застосунку (`npm run build`) | ~0.5 хв | verdict + артефакт `gate-build` |
| **record** | Свідок ланцюга: виконується завжди (`!cancelled()`), агрегує вердикти | ~0.1 хв | `gate-record.json` + оновлює поле `gates` у `run.json` |

---

## 2. Обовʼязкові перевірки (Branch Protection / Ruleset)

- **Набір правил на `main`:** «Require status checks to pass before merging»
- **Обов'язкові перевірки:** `types`, `lint`, `tests`, `build`.
- **Вимога «Require branches to be up to date before merging»:** Увімкнено, щоб гарантувати, що PR протестовано з останнім кодом основної гілки перед злиттям.
- **Скріншот / доказ налаштування:** `docs/lab3/screenshots/ruleset-checks.png` (налаштування в GitHub Settings → Rules → Branch Rulesets).

---

## 3. Навмисне падіння

- **Гілка:** `harness/red-2026-11-10`
- **Що саме зламано:** У файлі `src/health.ts` змінено сигнатуру або введено навмисну помилку типу `const testFail: number = "type_error";`.
- **Очікувано червона брама:** `types` (повертає exit code 2).
- **Поведінка наступних брам:** `lint`, `tests`, `build` отримують статус `skipped` через `needs: types`. Вони не витрачають квоту хвилин CI.
- **Поведінка задачі `record`:** Виконується завдяки блоку `if: ${{ !cancelled() }}`, збирає вердикт та фіксує пропуск наступних кроків.
- **Зразок `gate-record.json` при червоному прогоні:**
```json
{
  "task_id": "t-01",
  "artifact_dir": "runs/t-01-red",
  "gates": {
    "types": "fail",
    "lint": "skipped",
    "tests": "skipped",
    "build": "skipped"
  },
  "ci_run_url": "https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter/actions/runs/red-demo"
}
```

---

## 4. Звʼязок із фабрикою

Коли прогін виконується в CI, задача `record` викликає скрипт `scripts/harness/record-gates.mjs`. Він знаходить останній згенерований `run.json` у `docs/lab3/runs/` і додає об'єкт `gates`:

```json
"gates": {
  "types": "pass",
  "lint": "pass",
  "tests": "pass",
  "build": "pass"
}
```

Це пов'язує детермінований ланцюг перевірок із конкретним артефактом задачі черги, забезпечуючи наскрізну простежуваність.
