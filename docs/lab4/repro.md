# Step 08 — Peer Reproducibility Check

## Мета

Задокументувати точну послідовність команд, необхідних для відтворення всіх тестів
з нуля (fresh clone). Будь-який рецензент чи колега повинен отримати **192/192 тестів
PASSED** за цими кроками без будь-якого додаткового налаштування.

---

## Системні Вимоги

| Залежність | Мінімальна версія | Використана версія |
|-----------|-------------------|-------------------|
| Node.js | ≥ 20.x | **v24.13.1** |
| pnpm | ≥ 8.x | **v12.16.1** |
| Git | ≥ 2.x | будь-яка |
| OS | Windows / macOS / Linux | Windows 11 |

> [!NOTE]
> На Windows — `pnpm.cmd` замість `pnpm` для запуску тестів у деяких shell-середовищах.
> Команди нижче наведено у POSIX-форматі; на Windows замініть `pnpm` → `pnpm.cmd` і `npx` → `npx.cmd` при необхідності.

---

## Крок 1: Клонування та Встановлення Залежностей

```bash
# Клонуємо курсовий репозиторій
git clone https://github.com/VladykaMarkiyan/2026-2027-agentic-course-starter.git
cd 2026-2027-agentic-course-starter

# Встановлюємо залежності
pnpm install
```

Очікуваний вивід: `Packages: +NNN ... Done in X.XXs`

---

## Крок 2: Перевірка TypeScript

```bash
pnpm run typecheck
# або: npx tsc --noEmit
```

**Очікуваний вивід:** жодного виводу (exit code 0 = 0 помилок).

---

## Крок 3: Запуск Повного Набору Тестів

```bash
pnpm test
# або: npx vitest run
```

**Очікуваний вивід:**
```
 Test Files  24 passed (24)
      Tests  192 passed (192)
   Duration  ~1.6s
```

> [!IMPORTANT]
> Всі **192 тести** мають пройти з нуля без жодних env-змінних, конфігів чи зовнішніх сервісів.

---

## Крок 4: Запуск Окремих Файлів (для верифікації ЛР4)

```bash
# Step 01 — характеризаційні тести (форк defu):
#   git clone https://github.com/VladykaMarkiyan/defu.git defu-fork
#   cd defu-fork && pnpm install && pnpm vitest run test/characterization.test.ts

# Step 03 — мультиагентний пайплайн
pnpm test tests/multiagent.test.ts

# Step 04 — шар пам'яті
pnpm test tests/memory.test.ts

# Step 05 — мультимодальний вхід
pnpm test tests/multimodal.test.ts

# Step 06 — hardening (OTel + Spend limit + Secret scanner)
pnpm test tests/hardening.test.ts
```

---

## Крок 5: Запуск Cost Audit Скрипту

```bash
npx tsx scripts/run-cost-audit.ts
```

**Очікуваний вивід:**
```
  TOTAL                                 5213 tokens   $0.000521
  Status:    ✅ WITHIN BUDGET
```

---

## Верифікаційна Таблиця

| Команда | Очікуваний результат | Статус |
|---------|----------------------|--------|
| `pnpm install` | Усі пакети встановлені | ✅ Перевірено |
| `pnpm run typecheck` | 0 TS-помилок | ✅ Перевірено |
| `pnpm test` | 24 test files, 192 tests PASSED | ✅ Перевірено |
| `pnpm test tests/multiagent.test.ts` | 5/5 PASSED | ✅ Перевірено |
| `pnpm test tests/memory.test.ts` | 3/3 PASSED | ✅ Перевірено |
| `pnpm test tests/multimodal.test.ts` | 8/8 PASSED | ✅ Перевірено |
| `pnpm test tests/hardening.test.ts` | 14/14 PASSED | ✅ Перевірено |
| `npx tsx scripts/run-cost-audit.ts` | 5213 tokens, $0.000521 | ✅ Перевірено |

---

## Репозиторій Форку (defu)

Для відтворення кроків 01 та 02 (характеризаційні тести + dedup feature):

```bash
git clone https://github.com/VladykaMarkiyan/defu.git defu-fork
cd defu-fork
pnpm install

# Характеризаційні тести (Step 01)
git checkout bfc8219
pnpm vitest run test/characterization.test.ts
# Очікувано: 7 passed

# dedup feature (Step 02)
git checkout 14222f1
pnpm vitest run
# Очікувано: 33 passed, 100% coverage
```

---

## Відомі Особливості (Windows)

| Проблема | Рішення |
|----------|---------|
| `pnpm vitest run` зависає в певних shell | Використовуй `npm.cmd test <file>` як альтернативу |
| `pnpm install` потребує мережу | Запуск поза sandbox (BypassSandbox: true) |
| `npx tsx` потребує tsx у devDependencies | Вже є: `"tsx": "^4.x"` у package.json |
