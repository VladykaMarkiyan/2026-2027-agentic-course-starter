# Ізольована зміна під захистом тестів (Protected Change)

## 1. Опис зміни (Що, Чому, Як)

### Що змінено:
Додано нову спеціалізовану функцію-мерджер `defuDedup`, яка забезпечує автоматичне усунення дублікатів при злитті масивів (deduplicated array merge), зберігаючи стабільний порядок зліва направо та стандартне рекурсивне злиття об'єктів.

### Чому це потрібно:
У Кроці 00 (Відкриті запитання) та Кроці 01 (Характеризаційні тести, Quirk №4) було зафіксовано, що стандартний `defu` конкатенує масиви без жодної дедуплікації (`['a', 'b']` + `['b', 'c']` -> `['a', 'b', 'b', 'c']`). Для конфігураційних списків (плагіни, модулі, middleware, списки дозволених хостів) дублювання елементів призводить до зайвих ініціалізацій та потенційних конфліктів. Нова фабрика `defuDedup` вирішує цю проблему без порушення контракту базового `defu`.

### Як реалізовано:
Зміна є строго мінімальною (всього **8 рядків коду** в `src/defu.ts`):
```ts
// Custom version with deduplicated array merge support
export const defuDedup = createDefu((object, key, currentValue) => {
  if (Array.isArray(object[key]) && Array.isArray(currentValue)) {
    object[key] = Array.from(new Set([...currentValue, ...object[key]]));
    return true;
  }
});
```
Завдяки архітектурі `createDefu` зміна ізольована: якщо обидва значення є масивами, `merger` створює унікальну множину `Set` і повертає `true`, перехоплюючи стандартну конкатенацію. Для решти ключів діє звичайне злиття.

---

## 2. Посилання на diff у форку

- **Гілка з фічею:** [`feat/defu-dedup`](https://github.com/VladykaMarkiyan/defu/tree/feat/defu-dedup)
- **Коміт у форку:** [`14222f1c6a1f6772f61053b1587d3953202152e3`](https://github.com/VladykaMarkiyan/defu/commit/14222f1c6a1f6772f61053b1587d3953202152e3)
- **Розмір diff:** 2 файли, +38 рядків (8 рядків логіки ядра в `src/defu.ts` + 29 рядків тестів у `test/defu.test.ts`), що повністю відповідає вимозі "до 50 рядків коду".

---

## 3. Таблиця нових модульних тестів

У файл [`test/defu.test.ts`](https://github.com/VladykaMarkiyan/defu/blob/14222f1c6a1f6772f61053b1587d3953202152e3/test/defu.test.ts#L275-L303) додано окремий блок `describe("defuDedup", ...)` із трьома модульними тестами:

| № | Назва тесту | Що саме перевіряє | Результат |
|---|---|---|---|
| 1 | `should merge arrays and eliminate duplicate items` | Базова дедуплікація масивів примітивів: `['a', 'b', 'c']` + `['b', 'c', 'd']` повертає `['a', 'b', 'c', 'd']` без повторів | ✅ Passed (0.3ms) |
| 2 | `should deduplicate across multiple argument layers preserving precedence` | Злиття понад двох шарів дефолтів зі збереженням первинності елементів джерела зліва направо | ✅ Passed (0.3ms) |
| 3 | `should retain normal nested object merging alongside array deduplication` | Збереження глибокого злиття вкладених об'єктів та примітивів поруч із дедуплікацією списків | ✅ Passed (0.4ms) |

---

## 4. Доказ збереження наявної функціональності (Zero Regressions)

Перед внесенням змін у проєкті було 30 тестів (23 базових + 7 характеристичних). Після внесення зміни та додавання 3 нових тестів запущено повний тестовий набір:

```
 RUN  v4.1.6 C:/Users/marki/.gemini/antigravity/scratch/defu-fork
      Coverage enabled with v8

✔ isPlainObject (1.461ms)
 ✓ test/characterization.test.ts (7 tests) 4ms
 ✓ test/utils.test.ts (2 tests) 4ms
 ✓ test/defu.test.ts (24 tests) 9ms

 Test Files  3 passed (3)
      Tests  33 passed (33)
   Duration  392ms
```

### Підтвердження:
1. **Усі 7 характеристичних тестів з Кроку 01 залишаються зеленими** без жодних змін очікуваних результатів.
2. **Усі 23 початкових тести бібліотеки проходять без помилок**.
3. **Покриття коду (V8 coverage) становить 100%** для statements, branches, functions та lines.
4. **Мутаційне тестування (Stryker):** загальний бал мутаційного покриття склав **87.27%** (89 вбито, 7 таймаутів з 110 мутантів). Нові тести додатково вбили 6 мутантів у новій гілці коду `defuDedup`.
5. **Збірка (`pnpm build`):** пакет успішно компілюється в ESM (`dist/defu.mjs`) та CJS (`dist/defu.cjs`) із валідними TypeScript-деклараціями.
