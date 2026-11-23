# Характеризаційні тести для критичного шляху (Characterization Tests)

## 1. Опис критичного шляху
Критичним шляхом бібліотеки `defu` є ланцюжок глибокого злиття об'єктів конфігурації:
```
createDefu(merger) -> arguments_.reduce -> _defu(baseObject, defaults, namespace, merger) -> isPlainObject
```
Цей шлях обрано тому, що:
1. Він є ядром роботи бібліотеки: будь-яке звернення до `defu(...)`, `defuFn(...)` або `defuArrayFn(...)` проходить саме крізь нього.
2. Саме тут реалізовано критичні інваріанти безпеки (захист від Prototype Pollution через `__proto__` та `constructor`).
3. Тут визначено правила пріоритету (precedence): порядок злиття аргументів зліва направо, обробка `null` vs `undefined`, злиття та конкатенація масивів, перехоплення логіки через кастомний `merger`.

Задіяні модулі:
- `src/defu.ts`: ядро рекурсивного алгоритму `_defu` та фабрики.
- `src/_utils.ts`: утиліта `isPlainObject`, що визначає межу рекурсії для звичайних JS-об'єктів проти спеціальних класів.
- `src/types.ts`: статична система виведення типів результату злиття.

---

## 2. Таблиця характеристиційних тестів

Тести розміщено у файлі [`test/characterization.test.ts`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts) у гілці [`test/characterization-tests`](https://github.com/VladykaMarkiyan/defu/tree/test/characterization-tests).

| № | Назва тесту | Що фіксує (Golden Master контракт) | Посилання на код у форку | Позначка Quirk / Bug |
|---|---|---|---|---|
| 1 | `should keep default value when source explicitly provides undefined` | Явна передача `undefined` у джерелі (`source`) ігнорується циклом `_defu` і зберігає значення з дефолтів, замість його стирання | [`test/characterization.test.ts#L6-L11`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L6-L11) | ⚠️ **Quirk**: `undefined` не перезаписує дефолтне значення |
| 2 | `should silently drop Symbol keys from source objects during merge` | `Object.keys()` перераховує лише рядкові ключі. Символьні властивості (`Symbol`) з вихідного об'єкта тихо губляться і не зливаються | [`test/characterization.test.ts#L14-L22`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L14-L22) | ⚠️ **Quirk**: `Symbol` ключі джерела не підтримуються |
| 3 | `should allow falsy non-nullish primitives to overwrite defaults` | Не-nullish примітиви (`""`, `0`, `false`) вважаються дійсними значеннями і успішно перезаписують дефолти | [`test/characterization.test.ts#L24-L31`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L24-L31) | Нормальна поведінка |
| 4 | `should concatenate multi-level arrays preserving left-to-right argument precedence without deduplication` | Масиви поєднуються конкатенацією зліва направо, дублікати значень не видаляються (`["a", "b"]` + `["b", "c"]` -> `["a", "b", "b", "c"]`) | [`test/characterization.test.ts#L33-L40`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L33-L40) | ⚠️ **Quirk**: Масиви зливаються без дедуплікації |
| 5 | `should overwrite default object with primitive if source property is non-object` | Якщо в дефолтах був складний об'єкт, а у вихідних даних передано скалярний примітив, об'єкт повністю заміщується цим примітивом | [`test/characterization.test.ts#L42-L47`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L42-L47) | Нормальна поведінка |
| 6 | `should ignore __proto__ and constructor properties in deeply nested sources` | Захист від Prototype Pollution діє на будь-якій глибині вкладеності: `Object.prototype` залишається незайманим | [`test/characterization.test.ts#L49-L60`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L49-L60) | Нормальна поведінка (Безпека) |
| 7 | `should retain standard merge when defuFn receives a non-function value` | `defuFn` викликає трансформатор тільки тоді, коли передане значення є функцією; якщо передано значення іншого типу, злиття виконується як звичайний `defu` | [`test/characterization.test.ts#L62-L67`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts#L62-L67) | Нормальна поведінка |

> **Важливо:** Жоден рядок виробничого коду в папці `src/` **не змінювався**.

---

## 3. Метрики покриття

- **Інструмент вимірювання:** `vitest run --coverage` (V8 coverage engine via `@vitest/coverage-v8`).
- **Кількість тестів:**
  - До додавання: 23 тести (2 файли тестів)
  - Після додавання: 30 тестів (3 файли тестів, +7 нових характеристичних тестів)

### Таблиця покриття коду ядра (`src/`)

| Модуль | Стан | % Lines | % Statements | % Branches | % Functions |
|---|---|---|---|---|---|
| **`src/defu.ts`** | ДО | 100% | 100% | 100% | 100% |
| **`src/defu.ts`** | ПІСЛЯ | **100%** | **100%** | **100%** | **100%** |
| **`src/_utils.ts`** | ДО | 100% | 100% | 100% | 100% |
| **`src/_utils.ts`** | ПІСЛЯ | **100%** | **100%** | **100%** | **100%** |
| **Всього (`src/`)** | **Разом** | **100%** | **100%** | **100%** | **100%** |

*Примітка:* Хоча лінійне покриття базовими тестами вже складало 100%, характеристичні тести перевірили граничні інваріанти поведінки (undefined, Symbol, вкладені Prototype Pollution, не-функціональні аргументи в `defuFn`), що підтверджується результатами мутаційного аналізу.

---

## 4. Результати мутаційного тестування (Stryker)

- **Інструмент:** `@stryker-mutator/core` v10.1.1 з раннером `@stryker-mutator/vitest-runner`.
- **Конфігурація:** `stryker.config.json` (мутація файлів `src/defu.ts` та `src/_utils.ts`).
- **Час виконання:** 12 секунд (30 тестів на 103 мутанти).

### Зведена таблиця Mutation Score

| Файл | % Mutation score (Total) | % Covered score | Вбито (# killed) | Таймаут (# timeout) | Вижило (# survived) | Без покриття (# no cov) |
|---|---|---|---|---|---|---|
| `src/_utils.ts` | **94.44%** | 94.44% | 30 | 4 | 2 | 0 |
| `src/defu.ts` | **83.58%** | 84.85% | 53 | 3 | 10 | 1 |
| **Всі файли (All files)** | **87.38%** | **88.24%** | **83** | **7** | **12** | **1** |

> **Критерій успішності:** Вимога курсу — **mutation score >= 70%**.  
> Отриманий результат: **87.38%**, що значно перевищує прохідний поріг.

### Приклади вбитих мутантів (Killed Mutants)

1. **Мутація в `src/defu.ts:19` (Умовний оператор фільтрації `null` та `undefined`):**
   - *Мутація:* `if (value === null || value === undefined)` замінено на `if (false)`.
   - *Результат:* **Killed**. Зловлено характеристичним тестом `should keep default value when source explicitly provides undefined` та тестом `defu should fill in values that are null`.
2. **Мутація в `src/defu.ts:27` (Перевірка масивів для конкатенації):**
   - *Мутація:* `if (Array.isArray(value) && Array.isArray(object[key]))` замінено на `if (false)`.
   - *Результат:* **Killed**. Зловлено характеристичним тестом `should concatenate multi-level arrays preserving left-to-right argument precedence without deduplication`.
3. **Мутація в `src/defu.ts:56` (Обробка функціональних мерджерів `defuFn`):**
   - *Мутація:* `if (object[key] !== undefined && typeof currentValue === "function")` замінено на умову з `false`.
   - *Результат:* **Killed**. Зловлено тестами `defu defuFn()` та характеристичним тестом `should retain standard merge when defuFn receives a non-function value`.

### Приклади мутантів, що вижили (Survived Mutants), та обґрунтування

1. **Мутант у `src/_utils.ts:11` (`prototype !== Object.prototype && ...`):**
   - *Мутація:* Заміна підвиразу `prototype !== Object.prototype` на константу `true`.
   - *Чому це допустимо:* Для звичайних об'єктів у тій самій області видимості (V8 realm) `Object.getPrototypeOf(value)` гарантовано дорівнює `Object.prototype`, тому видалення цієї перевірки не ламає тести, якщо не тестувати об'єкти з окремих iframes чи `node:vm`.
2. **Мутант у `src/defu.ts:5` (Дефолтне значення параметра `namespace = "."`):**
   - *Мутація:* `namespace = "."` замінено на `namespace = ""`.
   - *Чому це допустимо:* Функція `_defu` є внутрішньою і в усіх викликах фабрики `createDefu` явно викликається із передачею третього аргументу `namespace` (`""` або `namespace + "." + key`). Значення за замовчуванням є захисним кодом для прямих внутрішніх викликів і практично ніколи не активується.
3. **Мутант у `src/defu.ts:13` (`if (key === "__proto__" || key === "constructor") continue`):**
   - *Мутація:* Порожній блок замість `continue;`.
   - *Чому це допустимо:* Перевірка захищає від атаки на `Object.prototype`. Якщо мутант пропускає виконання далі, але сам об'єкт не намагається створити шкідливу властивість на прототипі під час тесту (а створює її на самому клонованому інстансі), `Object.prototype.polluted` залишається `undefined`, тому тест безпеки не падає.

---

## 5. Посилання на гілку та коміт у форку

- **Гілка з тестами у форку:** [`test/characterization-tests`](https://github.com/VladykaMarkiyan/defu/tree/test/characterization-tests)
- **Коміт у форку:** [`bfc8219cf2895142963c24e4f287c19ba23ecd60`](https://github.com/VladykaMarkiyan/defu/commit/bfc8219cf2895142963c24e4f287c19ba23ecd60)
- **Файл характеристичних тестів:** [`test/characterization.test.ts`](https://github.com/VladykaMarkiyan/defu/blob/bfc8219cf2895142963c24e4f287c19ba23ecd60/test/characterization.test.ts)
