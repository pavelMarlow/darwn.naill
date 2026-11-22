# 🖱 Деплой на Cloudflare БЕЗ команд — только браузер

Всё делается на сайте Cloudflare мышкой. ~15 минут.

## 1️⃣ Telegram: создай бота

1. **@BotFather** → `/newbot` → имя `DARWN.NAILL` → юзернейм (напр. `darwn_naill_bot`)
2. Сохрани токен `123456789:AAE...`
3. У **@userinfobot** узнай свой Telegram ID — тоже сохрани

## 2️⃣ Cloudflare: регистрация

1. Зайди на https://dash.cloudflare.com → **Sign up** (бесплатно, карта не нужна)
2. Подтверди почту

## 3️⃣ Создай базу данных (D1)

1. В меню слева: **Хранилище данных (Storage & Databases) → D1 SQL Database**
2. Жми **Create (Создать)** → имя: `darwn_naill_db` → **Create**
3. Открой созданную базу → вкладка **Console (Консоль)**
4. Открой файл [`schema.sql`](schema.sql) из этого репо, скопируй ВЕСЬ текст, вставь в консоль → **Execute**
   - Должно написать что-то вроде «executed successfully» ✅

## 4️⃣ Создай воркер и вставь код

1. Меню слева: **Вычисления (Compute) → Workers & Pages** → **Create** → **Create Worker**
2. Имя: `darwn-naill-bot` → жми **Deploy** (с шаблонным кодом, не страшно)
3. Жми **Edit code (Редактировать код)**
4. Удали весь шаблонный код
5. Открой сырой файл и скопируй всё (Ctrl+A → Ctrl+C):
   `https://raw.githubusercontent.com/pavelMarlow/darwn.naill/arena/5796a800-darwn-naill/worker.js`
   <br><sub>(если ветку уже смержили в main, сработает и `.../main/worker.js`)</sub>
6. Вставь в редактор (Ctrl+V) → жми **Deploy** справа вверху

## 5️⃣ Привяжи базу и переменные

Открой воркер: **Workers & Pages → darwn-naill-bot → Settings (Настройки)**

**Bindings (Привязки):**
1. **Bindings → Add → D1 database**
2. Variable name: `DB` (ровно так, большими)
3. D1 database: выбери `darwn_naill_db` → **Save**

**Variables and Secrets (Переменные):** — жми **Add** для каждой:

| Имя | Тип | Значение |
|---|---|---|
| `BOT_TOKEN` | **Secret** | токен от BotFather |
| `ADMIN_ID` | Text | твой ID от @userinfobot |
| `WEBHOOK_SECRET` | Text | любая случайная строка, напр. `x9k2m4nails77` |
| `TZ_OFFSET_HOURS` | Text | `7` (Новосибирск) |

**Cron (напоминания клиентам накануне записи):**
1. **Settings → Triggers (Триггеры) → Cron Triggers → Add**
2. Введи `0 12 * * *` → **Add** (это 19:00 по Новосибирску)

## 6️⃣ Узнай адрес воркера

1. **Settings → Domains & Routes**
2. Там будет адрес вида `darwn-naill-bot.ТВОЙ-САБДОМЕН.workers.dev`
   - если вдруг выключен — жми **Add → workers.dev** и включи

## 7️⃣ Подключи бота (последний шаг!)

Открой в браузере (подставь свой адрес и секрет из шага 5):

```
https://darwn-naill-bot.ТВОЙ-САБДОМЕН.workers.dev/setup/ТВОЙ_WEBHOOK_SECRET
```

Увидишь `{"webhook":{"ok":true,...},"menu_button":{"ok":true,...}}` — **всё, бот живой!** 🎉

Это действие привязало вебхук и повесило на бота кнопку меню **«✨ Записаться»** (Mini App).

## 8️⃣ Проверка

- Напиши боту `/start` — красивое меню
- Напиши `/admin` — админка (только для тебя)
- Первым делом: **🗓 Окошки → ➕ Добавить** — без окошек клиентам не на что записаться

---

### 🆘 Если что-то не так

| Проблема | Что делать |
|---|---|
| Бот молчит | Проверь, что открыла `/setup/СЕКРЕТ` и там `ok:true`. Проверь `BOT_TOKEN` (Secret, без лишних пробелов) |
| Ошибка 500 в Mini App | Проверь привязку: имя ровно `DB`, выбрана база `darwn_naill_db`, и что в D1-консоли выполнился весь `schema.sql` |
| Ошибки в воркере | Workers & Pages → darwn-naill-bot → вкладка **Logs → Begin log stream** — видно ошибки вживую |
| Обновила код | Edit code → вставить новый `worker.js` → Deploy. Базу трогать не нужно |
