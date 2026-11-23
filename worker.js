/**
 * ═══════════════════════════════════════════════════════════
 *  💅 DARWN.NAILL — Telegram-бот + Mini App для nail-мастера
 *  Мастер: Дарина · стаж 3 года
 *  Один файл: бот + админка + Mini App + API + БД (Cloudflare D1)
 * ═══════════════════════════════════════════════════════════
 *
 *  Биндинги (wrangler.toml):
 *   • BOT_TOKEN        — secret (wrangler secret put BOT_TOKEN)
 *   • DB               — D1 database
 *   • ADMIN_ID         — твой telegram id (можно несколько через запятую)
 *   • WEBHOOK_SECRET   — любая случайная строка для вебхука
 *   • TZ_OFFSET_HOURS  — смещение часового пояса (по умолчанию 7, Новосибирск)
 */

// ────────────────────────── ТЕКСТЫ ПО УМОЛЧАНИЮ ──────────────────────────
const DEFAULT_TEXTS = {
  start_text:
    "✨ <b>DARWN.NAILL</b> ✨\n\n" +
    "Привет, <b>{name}</b>! 🤍\n" +
    "Я — бот Дарины, мастера маникюра.\n\n" +
    "Здесь ты можешь посмотреть услуги и записаться на ногти мечты за минуту ⚡️",
  about_text:
    "🤍 <b>Дарина · nail-мастер</b>\n\n" +
    "✦ Стаж работы — 3 года\n" +
    "✦ Стерильность: крафт-пакеты + автоклав\n" +
    "✦ Только качественные материалы\n" +
    "✦ Уютная атмосфера и вкусный кофе ☕️\n\n" +
    "<i>Делаю ногти, с которыми хочется жить 💅</i>",
  contacts_text:
    "📍 <b>Контакты</b>\n\n" +
    "🏠 г. Бердск, ул. Вокзальная, 2\n" +
    "Как пройти — подскажу после записи 💌\n\n" +
    "По любым вопросам — жми кнопку ниже, я на связи:",
  promo_text: "",
  portfolio_url: "",
  master_link: "https://t.me/",
};

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const TIME_PRESETS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DAYS_AHEAD = 14;
const MAPS_URL = "https://yandex.ru/maps/?text=" + encodeURIComponent("г. Бердск, ул. Вокзальная, 2");
const LEAD_MIN = 60; // за сколько минут до начала окошко закрывается

// ────────────────────────── УТИЛИТЫ ──────────────────────────
const html = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kb = (rows) => ({ inline_keyboard: rows });
const btn = (text, data) => ({ text, callback_data: data });
const urlBtn = (text, url) => ({ text, url });
const webBtn = (text, url) => ({ text, web_app: { url } });
const pad2 = (n) => String(n).padStart(2, "0");

function nowLocal(env) {
  const off = parseInt(env.TZ_OFFSET_HOURS || "7", 10);
  return new Date(Date.now() + off * 3600_000); // «локальное» время в UTC-полях
}
function todayStr(env) {
  const d = nowLocal(env);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function nowMinutes(env) {
  const d = nowLocal(env);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function dateLabel(dateStr) { // "Сб · 23 ноября"
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS_SHORT[dt.getUTCDay()]} · ${d} ${MONTHS_GEN[m - 1]}`;
}
function shortDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${d}.${m}`;
}
function mention(username, name) {
  return username ? `@${username}` : (name || "без юзернейма");
}
function gcalLink(env, b) {
  const off = parseInt(env.TZ_OFFSET_HOURS || "7", 10);
  const [y, m, d] = b.date.split("-").map(Number);
  const [hh, mm] = b.time.split(":").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, hh - off, mm));
  const end = new Date(start.getTime() + (b.duration_min || 120) * 60000);
  const f = (x) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("💅 Маникюр · Дарина") +
    "&dates=" + f(start) + "/" + f(end) +
    "&details=" + encodeURIComponent(`${b.service_name} · ${b.price}₽`);
}

// ────────────────────────── TELEGRAM API ──────────────────────────
async function tg(env, method, payload) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) console.log("TG error", method, JSON.stringify(j).slice(0, 300));
    return j;
  } catch (e) {
    console.log("TG fetch fail", method, String(e));
    return { ok: false };
  }
}
const send = (env, chat, text, extra = {}) =>
  tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
const answer = (env, id, text, alert = false) =>
  tg(env, "answerCallbackQuery", { callback_query_id: id, text, show_alert: alert });

async function show(env, c, screen) {
  const extra = screen.keyboard ? { reply_markup: kb(screen.keyboard) } : {};
  if (c.messageId) {
    const r = await tg(env, "editMessageText", {
      chat_id: c.chatId, message_id: c.messageId, text: screen.text,
      parse_mode: "HTML", disable_web_page_preview: true, ...extra,
    });
    if (r.ok) return;
    if (r.description && r.description.includes("not modified")) return;
  }
  await send(env, c.chatId, screen.text, extra);
}

// ────────────────────────── БД: ХЕЛПЕРЫ ──────────────────────────
async function upsertUser(env, from) {
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, username, first_name) VALUES (?,?,?)
     ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name`
  ).bind(from.id, from.username || null, from.first_name || "").run();
}
async function dbAll(env, sql, ...binds) {
  try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; } catch { return []; }
}
async function getUser(env, id) {
  return env.DB.prepare("SELECT * FROM users WHERE telegram_id=?").bind(id).first();
}
async function setState(env, id, state, payload = {}) {
  await env.DB.prepare("UPDATE users SET state=?, payload=? WHERE telegram_id=?")
    .bind(state, JSON.stringify(payload), id).run();
}
async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return row ? row.value : (DEFAULT_TEXTS[key] ?? "");
}
async function getTexts(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const map = { ...DEFAULT_TEXTS };
  for (const r of results || []) map[r.key] = r.value;
  return map;
}
function isAdmin(env, id) {
  return (env.ADMIN_ID || "").split(",").map((s) => s.trim()).filter(Boolean).includes(String(id));
}
async function freeSlots(env) {
  const today = todayStr(env);
  const { results } = await env.DB.prepare(
    "SELECT id, date, time FROM slots WHERE status='free' AND date>=? ORDER BY date, time"
  ).bind(today).all();
  const nowMin = nowMinutes(env);
  return (results || []).filter((s) => {
    if (s.date !== today) return true;
    const [hh, mm] = s.time.split(":").map(Number);
    return hh * 60 + mm > nowMin + LEAD_MIN;
  });
}
async function createBooking(env, { userId, slotId, serviceId, name, phone, source, promoCode, discount }) {
  const svc = await env.DB.prepare("SELECT * FROM services WHERE id=? AND active=1").bind(serviceId).first();
  if (!svc) return { ok: false, error: "service" };
  const upd = await env.DB.prepare("UPDATE slots SET status='booked' WHERE id=? AND status='free'").bind(slotId).run();
  if (!upd.meta || !upd.meta.changes) return { ok: false, error: "slot_taken" };
  const slot = await env.DB.prepare("SELECT * FROM slots WHERE id=?").bind(slotId).first();
  const u = await getUser(env, userId);
  if (phone) await env.DB.prepare("UPDATE users SET phone=? WHERE telegram_id=?").bind(phone, userId).run();
  const disc = Math.max(0, Math.min(svc.price, +discount || 0));
  const finalPrice = svc.price - disc;
  let r;
  try {
    r = await env.DB.prepare(
      `INSERT INTO bookings (user_id, slot_id, service_id, service_name, price, date, time, client_name, client_phone, client_username, source, promo_code, discount)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(userId, slotId, svc.id, svc.name, finalPrice, slot.date, slot.time, name, phone || "",
      (u && u.username) || "", source, promoCode || "", disc).run();
  } catch {
    r = await env.DB.prepare(
      `INSERT INTO bookings (user_id, slot_id, service_id, service_name, price, date, time, client_name, client_phone, client_username, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(userId, slotId, svc.id, svc.name, finalPrice, slot.date, slot.time, name, phone || "",
      (u && u.username) || "", source).run();
  }
  const id = r.meta.last_row_id;
  await env.DB.prepare("UPDATE slots SET booking_id=? WHERE id=?").bind(id, slotId).run();
  return { ok: true, booking: { id, service_name: svc.name, price: finalPrice, old_price: svc.price, duration_min: svc.duration_min, date: slot.date, time: slot.time, client_name: name, client_phone: phone, client_username: (u && u.username) || "", user_id: userId, promo_code: promoCode || "", discount: disc } };
}
async function cancelBooking(env, bookingId, byAdmin) {
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(bookingId).first();
  if (!b || b.status === "cancelled") return null;
  await env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").bind(bookingId).run();
  if (b.slot_id) await env.DB.prepare("UPDATE slots SET status='free', booking_id=NULL WHERE id=?").bind(b.slot_id).run();
  return b;
}

// ────────────────────────── ЭКРАНЫ: КЛИЕНТ ──────────────────────────
async function screenMain(env, name, appUrl) {
  const t = await getTexts(env);
  const rows = [
    [webBtn("✨ Записаться онлайн", appUrl + "/app")],
    [btn("💅 Услуги и цены", "sv"), btn("📅 Мои записи", "my")],
  ];
  if (t.promo_text) rows.push([btn("🔥 Акция", "promo")]);
  rows.push([btn("🤍 О мастере", "ab"), btn("📍 Контакты", "ct")]);
  return { text: t.start_text.replace("{name}", html(name)), keyboard: rows };
}
async function screenServices(env) {
  const { results } = await env.DB.prepare("SELECT * FROM services WHERE active=1 ORDER BY sort, id").all();
  if (!results || !results.length) return { text: "💅 <b>Услуги</b>\n\nПока пусто, загляни позже 🤍", keyboard: [[btn("⬅️ В меню", "m")]] };
  let text = "💅 <b>Услуги и цены</b>\n\n";
  const rows = [];
  for (const s of results) {
    text += `✦ <b>${html(s.name)}</b> — ${s.price}₽\n`;
    rows.push([btn(`${s.name} · ${s.price}₽`, `sv:${s.id}`)]);
  }
  text += "\n<i>Нажми на услугу, чтобы узнать подробности 👇</i>";
  rows.push([btn("⬅️ В меню", "m")]);
  return { text, keyboard: rows };
}
async function screenService(env, id, appUrl) {
  const s = await env.DB.prepare("SELECT * FROM services WHERE id=?").bind(id).first();
  if (!s) return screenServices(env);
  const h = Math.floor(s.duration_min / 60), m = s.duration_min % 60;
  const dur = (h ? `${h} ч` : "") + (m ? ` ${m} мин` : "");
  return {
    text: `💅 <b>${html(s.name)}</b>\n\n` +
      (s.description ? `<blockquote>${html(s.description)}</blockquote>\n` : "") +
      `💰 Цена: <b>${s.price}₽</b>\n⏱ Длительность: ~${dur.trim()}\n\n` +
      `<i>Запись — через Mini App, это займёт минуту ⚡️</i>`,
    keyboard: [
      [webBtn("✨ Записаться на эту услугу", appUrl + "/app")],
      [btn("⬅️ К услугам", "sv"), btn("🏠 В меню", "m")],
    ],
  };
}
async function screenAbout(env, appUrl) {
  const t = await getTexts(env);
  const rows = [];
  if (t.portfolio_url) rows.push([urlBtn("🖼 Портфолио", t.portfolio_url)]);
  rows.push([webBtn("✨ Записаться", appUrl + "/app")]);
  rows.push([btn("⬅️ В меню", "m")]);
  return { text: t.about_text, keyboard: rows };
}
async function screenContacts(env) {
  const t = await getTexts(env);
  const rows = [];
  if (t.master_link) rows.push([urlBtn("💬 Написать Дарине", t.master_link)]);
  rows.push([urlBtn("🧭 Как добраться", MAPS_URL)]);
  if (t.portfolio_url) rows.push([urlBtn("🖼 Портфолио", t.portfolio_url)]);
  rows.push([btn("⬅️ В меню", "m")]);
  return { text: t.contacts_text, keyboard: rows };
}
async function screenPromo(env, appUrl) {
  const t = await getTexts(env);
  return {
    text: "🔥 <b>Акция</b>\n\n" + t.promo_text,
    keyboard: [[webBtn("✨ Записаться по акции", appUrl + "/app")], [btn("⬅️ В меню", "m")]],
  };
}
async function screenMy(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM bookings WHERE user_id=? AND status IN ('pending','confirmed') AND date>=? ORDER BY date, time`
  ).bind(userId, todayStr(env)).all();
  if (!results || !results.length)
    return { text: "📅 <b>Мои записи</b>\n\nУ тебя пока нет активных записей 🤍", keyboard: [[btn("⬅️ В меню", "m")]] };
  let text = "📅 <b>Мои записи</b>\n\n";
  const rows = [];
  for (const b of results) {
    const st = b.status === "confirmed" ? "✅" : "⏳";
    text += `${st} <b>${dateLabel(b.date)}</b> в ${b.time}\n   💅 ${html(b.service_name)} · ${b.price}₽\n\n`;
    rows.push([btn(`❌ Отменить ${shortDate(b.date)} · ${b.time}`, `my:x:${b.id}`)]);
  }
  text += "<i>⏳ — ждёт подтверждения, ✅ — подтверждена</i>";
  rows.push([btn("⬅️ В меню", "m")]);
  return { text, keyboard: rows };
}

// ────────────────────────── ЭКРАНЫ: АДМИНКА ──────────────────────────
async function screenAdmin(env) {
  const today = todayStr(env);
  const cnt = async (q, ...b) => (await env.DB.prepare(q).bind(...b).first()).n;
  const todayN = await cnt("SELECT COUNT(*) n FROM bookings WHERE date=? AND status!='cancelled'", today);
  const pendN = await cnt("SELECT COUNT(*) n FROM bookings WHERE status='pending' AND date>=?", today);
  const freeN = await cnt("SELECT COUNT(*) n FROM slots WHERE status='free' AND date>=?", today);
  return {
    text:
      "👑 <b>Админ-панель</b>\n\n" +
      `📅 Записей сегодня: <b>${todayN}</b>\n` +
      `⏳ Ждут подтверждения: <b>${pendN}</b>\n` +
      `🟢 Свободных окошек: <b>${freeN}</b>`,
    keyboard: [
      [btn("📋 Записи", "a:bk"), btn("🗓 Окошки", "a:sl")],
      [btn("💅 Услуги", "a:sv"), btn("✏️ Тексты", "a:tx")],
      [btn("📣 Рассылка", "a:bc"), btn("📊 Статистика", "a:st")],
      [btn("🏠 В меню бота", "m")],
    ],
  };
}

// — записи —
async function screenAdminBookings(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM bookings WHERE status IN ('pending','confirmed') AND date>=? ORDER BY date, time LIMIT 30`
  ).bind(todayStr(env)).all();
  let text = "📋 <b>Записи</b>\n\n";
  const rows = [];
  if (!results || !results.length) text += "Пока пусто 🤍";
  for (const b of results) {
    const st = b.status === "confirmed" ? "✅" : "⏳";
    rows.push([btn(`${st} ${shortDate(b.date)} ${b.time} · ${b.client_name} (${mention(b.client_username)})`, `a:bk:${b.id}`)]);
  }
  rows.push([btn("⬅️ Админка", "a")]);
  return { text: text + "\n<i>Нажми на запись, чтобы открыть карточку</i>", keyboard: rows };
}
async function screenAdminBookingCard(env, id) {
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
  if (!b) return screenAdminBookings(env);
  const st = { pending: "⏳ Ждёт подтверждения", confirmed: "✅ Подтверждена", cancelled: "❌ Отменена" }[b.status];
  const rows = [];
  if (b.status === "pending") rows.push([btn("✅ Подтвердить", `a:ok:${b.id}`), btn("❌ Отклонить", `a:no:${b.id}`)]);
  if (b.status === "confirmed") rows.push([btn("❌ Отменить запись", `a:no:${b.id}`)]);
  if (b.client_username) rows.push([urlBtn("💬 Написать клиенту", `https://t.me/${b.client_username}`)]);
  rows.push([btn("⬅️ К записям", "a:bk")]);
  return {
    text:
      `📋 <b>Запись #${b.id}</b> · ${st}\n\n` +
      `👤 Клиент: <b>${html(b.client_name)}</b> (${mention(b.client_username)})\n` +
      (b.client_phone ? `📱 Телефон: <code>${html(b.client_phone)}</code>\n` : "📱 Без номера телефона\n") +
      `💅 Услуга: ${html(b.service_name)} · ${b.price}₽\n` +
      `🗓 Когда: <b>${dateLabel(b.date)}</b> в <b>${b.time}</b>\n` +
      `📲 Источник: ${b.source === "app" ? "Mini App" : "бот"}`,
    keyboard: rows,
  };
}

// — окошки —
async function screenAdminSlots(env) {
  const today = todayStr(env);
  const { results } = await env.DB.prepare(
    `SELECT s.*, b.client_name, b.client_username FROM slots s
     LEFT JOIN bookings b ON b.id = s.booking_id
     WHERE s.date>=? AND s.date<=? ORDER BY s.date, s.time`
  ).bind(today, addDays(today, DAYS_AHEAD - 1)).all();
  const rows = [
    [btn("➕ Добавить окошко", "a:sl:add")],
    [btn("🧨 Удалить ВСЕ окошки", "a:sl:clear")],
  ];
  let cur = null, text = "🗓 <b>Окошки</b>\n\n🟢 — свободно, 🔴 — занято\n\n";
  if (!results || !results.length) text += "Окошек нет. Добавь первое! 👆";
  for (const s of results || []) {
    if (s.date !== cur) {
      cur = s.date;
      rows.push([btn(`— ${dateLabel(cur)} —`, "noop")]);
    }
    const label = s.status === "free" ? `🟢 ${s.time}` : `🔴 ${s.time}`;
    rows.push([btn(label, `a:sl:v:${s.id}`)]);
  }
  rows.push([btn("⬅️ Админка", "a")]);
  return { text, keyboard: rows };
}
function screenAdminSlotDatePick(env) {
  const today = todayStr(env);
  const rows = [];
  for (let i = 0; i < DAYS_AHEAD; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, DAYS_AHEAD); j++) {
      const d = addDays(today, j);
      row.push(btn(dateLabel(d), `a:sl:d:${d}`));
    }
    rows.push(row);
  }
  rows.push([btn("⬅️ К окошкам", "a:sl")]);
  return { text: "🗓 <b>Добавление окошка</b>\n\nВыбери дату:", keyboard: rows };
}
function screenAdminSlotTimePick(env, date) {
  const rows = [];
  for (let i = 0; i < TIME_PRESETS.length; i += 3) {
    rows.push(TIME_PRESETS.slice(i, i + 3).map((t) => btn(`🕐 ${t}`, `a:sl:t:${date}:${t}`)));
  }
  rows.push([btn("✍️ Своё время", `a:sl:tm:${date}`)]);
  rows.push([btn("⬅️ К датам", "a:sl:add"), btn("🗓 К окошкам", "a:sl")]);
  return {
    text: `🗓 <b>Добавление окошка</b>\n\nДата: <b>${dateLabel(date)}</b>\n\nВыбери время (можно добавить несколько подряд):`,
    keyboard: rows,
  };
}
async function screenAdminSlotCard(env, id) {
  const s = await env.DB.prepare(
    `SELECT s.*, b.client_name, b.client_username, b.client_phone, b.service_name, b.id AS bid, b.status AS bstatus
     FROM slots s LEFT JOIN bookings b ON b.id = s.booking_id WHERE s.id=?`
  ).bind(id).first();
  if (!s) return screenAdminSlots(env);
  const rows = [];
  let text;
  if (s.status === "free") {
    text = `🟢 <b>Свободное окошко</b>\n\n🗓 ${dateLabel(s.date)} в ${s.time}`;
    rows.push([btn("🗑 Удалить это окошко", `a:sl:x:${s.id}`)]);
  } else {
    text =
      `🔴 <b>Окошко занято</b>\n\n🗓 ${dateLabel(s.date)} в ${s.time}\n\n` +
      `👤 ${html(s.client_name || "")} (${mention(s.client_username)})\n` +
      (s.client_phone ? `📱 <code>${html(s.client_phone)}</code>\n` : "📱 Без номера телефона\n") +
      `💅 ${html(s.service_name || "")}`;
    if (s.bid) rows.push([btn("📋 Открыть запись", `a:bk:${s.bid}`)]);
  }
  rows.push([btn("⬅️ К окошкам", "a:sl")]);
  return { text, keyboard: rows };
}

// — услуги —
async function screenAdminServices(env) {
  const { results } = await env.DB.prepare("SELECT * FROM services ORDER BY sort, id").all();
  let text = "💅 <b>Услуги (редактирование)</b>\n\n";
  const rows = [[btn("➕ Добавить услугу", "a:sv:add")]];
  for (const s of results || []) {
    const on = s.active ? "" : " 💤";
    rows.push([btn(`${s.name} · ${s.price}₽${on}`, `a:sv:${s.id}`)]);
  }
  if (!results || !results.length) text += "Пусто. Добавь первую услугу 👆";
  else text += "<i>💤 — скрыта от клиентов</i>";
  rows.push([btn("⬅️ Админка", "a")]);
  return { text, keyboard: rows };
}
async function screenAdminServiceCard(env, id) {
  const s = await env.DB.prepare("SELECT * FROM services WHERE id=?").bind(id).first();
  if (!s) return screenAdminServices(env);
  return {
    text:
      `💅 <b>${html(s.name)}</b> ${s.active ? "" : "💤 <i>(скрыта)</i>"}\n\n` +
      (s.description ? `<blockquote>${html(s.description)}</blockquote>\n` : "") +
      `💰 Цена: <b>${s.price}₽</b>\n⏱ Длительность: <b>${s.duration_min} мин</b>`,
    keyboard: [
      [btn("✏️ Название", `a:sv:e:name:${s.id}`), btn("💰 Цена", `a:sv:e:price:${s.id}`)],
      [btn("⏱ Длительность", `a:sv:e:dur:${s.id}`), btn("📝 Описание", `a:sv:e:desc:${s.id}`)],
      [btn(s.active ? "💤 Скрыть" : "✨ Показать", `a:sv:tg:${s.id}`), btn("🗑 Удалить", `a:sv:del:${s.id}`)],
      [btn("📸 Фото работ", `a:sv:ph:${s.id}`)],
      [btn("⬅️ К услугам", "a:sv")],
    ],
  };
}

async function screenAdminServicePhotos(env, id) {
  const s = await env.DB.prepare("SELECT * FROM services WHERE id=?").bind(id).first();
  if (!s) return screenAdminServices(env);
  const photos = await dbAll(env, "SELECT file_id FROM service_photos WHERE service_id=? ORDER BY sort, id", id);
  return {
    text: `📸 <b>Фото работ · ${html(s.name)}</b>\n\nСейчас: <b>${photos.length}</b> шт.\n\n<i>Фото показываются в мини-приложении на странице услуги</i>`,
    keyboard: [
      [btn("➕ Добавить фото", `a:sv:pha:${id}`)],
      ...(photos.length ? [[btn("🗑 Удалить все фото", `a:sv:phd:${id}`)]] : []),
      [btn("⬅️ К услуге", `a:sv:${id}`)],
    ],
  };
}

// — тексты —
function screenAdminTexts() {
  const keys = [
    ["start_text", "💬 Приветствие (/start)"],
    ["about_text", "🤍 О мастере"],
    ["contacts_text", "📍 Контакты"],
    ["promo_text", "🔥 Акция (пусто = скрыта)"],
    ["portfolio_url", "🖼 Ссылка на портфолио"],
    ["master_link", "💬 Ссылка «Написать мастеру»"],
  ];
  const rows = keys.map(([k, label]) => [btn(label, `a:tx:${k}`)]);
  rows.push([btn("⬅️ Админка", "a")]);
  return { text: "✏️ <b>Тексты бота</b>\n\nВыбери, что изменить:", keyboard: rows };
}

// — статистика —
async function screenAdminStats(env) {
  const today = todayStr(env);
  const one = async (q, ...b) => (await env.DB.prepare(q).bind(...b).first()).n;
  const users = await one("SELECT COUNT(*) n FROM users");
  const total = await one("SELECT COUNT(*) n FROM bookings WHERE status!='cancelled'");
  const upcoming = await one("SELECT COUNT(*) n FROM bookings WHERE status IN ('pending','confirmed') AND date>=?", today);
  const revenue = await one("SELECT COALESCE(SUM(price),0) n FROM bookings WHERE status='confirmed' AND date>=?", today);
  return {
    text:
      "📊 <b>Статистика</b>\n\n" +
      `👥 Клиентов в боте: <b>${users}</b>\n` +
      `📋 Всего записей: <b>${total}</b>\n` +
      `🗓 Предстоящих: <b>${upcoming}</b>\n` +
      `💰 Ожидаемая выручка: <b>${revenue}₽</b>`,
    keyboard: [[btn("⬅️ Админка", "a")]],
  };
}

// ────────────────────────── УВЕДОМЛЕНИЯ ──────────────────────────
async function notifyAdminNewBooking(env, b) {
  const ids = (env.ADMIN_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  const text =
    "🔔 <b>Новая запись!</b>\n\n" +
    `👤 Клиент: <b>${html(b.client_name)}</b> (${mention(b.client_username)})\n` +
    (b.client_phone ? `📱 Телефон: <code>${html(b.client_phone)}</code>\n` : "📱 Без номера телефона\n") +
    `💅 Услуга: ${html(b.service_name)} · ${b.price}₽\n` +
    (b.discount ? `🎁 Скидка: −${b.discount}₽${b.promo_code ? ` (${html(b.promo_code)})` : ""}\n` : "") +
    `🗓 Когда: <b>${dateLabel(b.date)}</b> в <b>${b.time}</b>\n` +
    `📲 Источник: ${b.source === "app" ? "Mini App" : "бот"}`;
  for (const id of ids) {
    await send(env, id, text, {
      reply_markup: kb([[btn("✅ Подтвердить", `a:ok:${b.id}`), btn("❌ Отклонить", `a:no:${b.id}`)]]),
    });
  }
}

// ────────────────────────── ОБРАБОТКА СООБЩЕНИЙ ──────────────────────────
async function onMessage(env, msg, appUrl) {
  const chatId = msg.chat.id;
  const from = msg.from;
  if (!from) return;
  await upsertUser(env, from);
  const user = await getUser(env, from.id);
  const text = (msg.text || "").trim();

  if (text.startsWith("/start")) {
    await setState(env, from.id, "idle");
    await send(env, chatId, "💅", {});
    await show(env, { chatId }, await screenMain(env, from.first_name || "красотка", appUrl));
    return;
  }
  if (text.startsWith("/admin")) {
    if (!isAdmin(env, from.id)) return send(env, chatId, "Эта команда только для мастера 🙈");
    await setState(env, from.id, "idle");
    await show(env, { chatId }, await screenAdmin(env));
    return;
  }
  if (text.startsWith("/cancel")) {
    await setState(env, from.id, "idle");
    await show(env, { chatId }, await screenMain(env, from.first_name || "красотка", appUrl));
    return;
  }

  const st = user.state || "idle";
  const p = JSON.parse(user.payload || "{}");

  // ── админские состояния ──
  if (isAdmin(env, from.id)) {
    // добавление услуги
    if (st === "adm_svc_name") {
      await setState(env, from.id, "adm_svc_price", { ...p, name: text });
      return send(env, chatId, "💰 Введи цену в рублях (просто число, например <code>1800</code>):");
    }
    if (st === "adm_svc_price") {
      const price = parseInt(text.replace(/\D/g, ""), 10);
      if (!price) return send(env, chatId, "🙈 Нужно число. Попробуй ещё раз, например <code>1800</code>:");
      await setState(env, from.id, "adm_svc_dur", { ...p, price });
      return send(env, chatId, "⏱ Длительность в минутах (например <code>120</code>):");
    }
    if (st === "adm_svc_dur") {
      const dur = parseInt(text.replace(/\D/g, ""), 10);
      if (!dur) return send(env, chatId, "🙈 Нужно число минут. Попробуй ещё раз:");
      await setState(env, from.id, "adm_svc_desc", { ...p, dur });
      return send(env, chatId, "📝 Короткое описание услуги (или <code>-</code>, чтобы пропустить):");
    }
    if (st === "adm_svc_desc") {
      const desc = text === "-" ? "" : text;
      const r = await env.DB.prepare("INSERT INTO services (name, description, price, duration_min) VALUES (?,?,?,?)")
        .bind(p.name, desc, p.price, p.dur).run();
      await setState(env, from.id, "idle");
      await send(env, chatId, "✅ Услуга добавлена!");
      await show(env, { chatId }, await screenAdminServiceCard(env, r.meta.last_row_id));
      return;
    }
    // загрузка фото работ
    if (st === "adm_svc_photo") {
      const photo = msg.photo && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : null;
      if (!photo) return send(env, chatId, "🙈 Это не фото. Пришли фото или /cancel");
      await env.DB.prepare("INSERT INTO service_photos (service_id, file_id) VALUES (?,?)").bind(p.id, photo).run();
      const cnt = await env.DB.prepare("SELECT COUNT(*) n FROM service_photos WHERE service_id=?").bind(p.id).first();
      return send(env, chatId, `✅ Фото добавлено! Всего у услуги: <b>${cnt.n}</b>\nПришли ещё или /cancel — готово`);
    }
    // редактирование услуги
    if (st === "adm_svc_edit") {
      const fields = { name: "name", price: "price", dur: "duration_min", desc: "description" };
      const col = fields[p.field];
      let val = text;
      if (p.field === "price" || p.field === "dur") {
        val = parseInt(text.replace(/\D/g, ""), 10);
        if (!val) return send(env, chatId, "🙈 Нужно число. Попробуй ещё раз:");
      }
      if (p.field === "desc" && text === "-") val = "";
      await env.DB.prepare(`UPDATE services SET ${col}=? WHERE id=?`).bind(val, p.id).run();
      await setState(env, from.id, "idle");
      await send(env, chatId, "✅ Обновлено!");
      await show(env, { chatId }, await screenAdminServiceCard(env, p.id));
      return;
    }
    // своё время окошка
    if (st === "adm_slot_time") {
      const m = text.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
      if (!m) return send(env, chatId, "🙈 Формат времени: <code>ЧЧ:ММ</code>, например <code>14:30</code>");
      const time = `${pad2(m[1])}:${m[2]}`;
      await env.DB.prepare("INSERT OR IGNORE INTO slots (date, time) VALUES (?,?)").bind(p.date, time).run();
      await setState(env, from.id, "idle");
      await send(env, chatId, `✅ Окошко ${dateLabel(p.date)} в ${time} добавлено!`);
      await show(env, { chatId }, screenAdminSlotTimePick(env, p.date));
      return;
    }
    // редактирование текстов
    if (st === "adm_text") {
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(p.key, text === "-" ? "" : text).run();
      await setState(env, from.id, "idle");
      await send(env, chatId, "✅ Текст обновлён!");
      await show(env, { chatId }, screenAdminTexts());
      return;
    }
    // рассылка
    if (st === "adm_bc") {
      const photo = msg.photo && msg.photo.length ? msg.photo[msg.photo.length - 1].file_id : null;
      const body = photo ? (msg.caption || "") : text;
      if (!body && !photo) return send(env, chatId, "🙈 Пришли текст или фото с подписью для рассылки");
      await setState(env, from.id, "adm_bc_confirm", { text: body, photo });
      return send(env, chatId,
        "📣 <b>Предпросмотр рассылки</b>\n\n" + (photo ? "<i>(фото с подписью)</i>\n" : "") + html(body).slice(0, 500) +
        "\n\nОтправить всем клиентам?", {
          reply_markup: kb([[btn("🚀 Отправить", "a:bc:y")], [btn("❌ Отмена", "a:bc:n")]]),
        });
    }
  }

  // дефолт — главное меню
  await show(env, { chatId }, await screenMain(env, from.first_name || "красотка", appUrl));
}

// ────────────────────────── ОБРАБОТКА КНОПОК ──────────────────────────
async function onCallback(env, cb, appUrl) {
  const from = cb.from;
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const c = { chatId, messageId };
  const data = cb.data || "";
  await upsertUser(env, from);
  const parts = data.split(":");
  const cmd = parts[0];

  const adm = isAdmin(env, from.id);
  // защита админских колбэков
  if (cmd === "a" && !adm) {
    await answer(env, cb.id, "Только для мастера 🙈", true);
    return;
  }

  // ── клиентские ──
  if (cmd === "noop") return answer(env, cb.id);
  if (cmd === "m") {
    await answer(env, cb.id);
    await setState(env, from.id, "idle");
    return show(env, c, await screenMain(env, from.first_name || "красотка", appUrl));
  }
  if (cmd === "sv" && parts.length === 1) { await answer(env, cb.id); return show(env, c, await screenServices(env)); }
  if (cmd === "sv") { await answer(env, cb.id); return show(env, c, await screenService(env, +parts[1], appUrl)); }
  if (cmd === "ab") { await answer(env, cb.id); return show(env, c, await screenAbout(env, appUrl)); }
  if (cmd === "ct") { await answer(env, cb.id); return show(env, c, await screenContacts(env)); }
  if (cmd === "promo") { await answer(env, cb.id); return show(env, c, await screenPromo(env, appUrl)); }
  if (cmd === "my" && parts.length === 1) { await answer(env, cb.id); return show(env, c, await screenMy(env, from.id)); }
  if (cmd === "my" && parts[1] === "x") {
    const b = await cancelBooking(env, +parts[2], false);
    if (b) {
      await answer(env, cb.id, "Запись отменена");
      const ids = (env.ADMIN_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
      for (const id of ids)
        await send(env, id, `⚠️ <b>Клиент отменил запись</b>\n\n👤 ${html(b.client_name)} (${mention(b.client_username)})\n🗓 ${dateLabel(b.date)} в ${b.time}\n💅 ${html(b.service_name)}`);
    } else await answer(env, cb.id, "Уже отменена", true);
    return show(env, c, await screenMy(env, from.id));
  }

  // ── админка ──
  if (data === "a") { await answer(env, cb.id); return show(env, c, await screenAdmin(env)); }
  if (data === "a:bk") { await answer(env, cb.id); return show(env, c, await screenAdminBookings(env)); }
  if (cmd === "a" && parts[1] === "bk") { await answer(env, cb.id); return show(env, c, await screenAdminBookingCard(env, +parts[2])); }
  if (cmd === "a" && (parts[1] === "ok" || parts[1] === "no")) {
    const id = +parts[2];
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
    if (!b) { await answer(env, cb.id, "Запись не найдена", true); return show(env, c, await screenAdminBookings(env)); }
    if (parts[1] === "ok") {
      await env.DB.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").bind(id).run();
      await answer(env, cb.id, "✅ Подтверждено");
      await send(env, b.user_id,
        `✅ <b>Запись подтверждена!</b>\n\n🗓 <b>${dateLabel(b.date)}</b> в <b>${b.time}</b>\n💅 ${html(b.service_name)} · ${b.price}₽\n\nЖду тебя, красотка 🤍\n📍 <i>г. Бердск, ул. Вокзальная, 2 💌</i>`,
        { reply_markup: kb([[urlBtn("📆 Добавить в календарь", gcalLink(env, b))], [urlBtn("🧭 Как добраться", MAPS_URL)]]) });
    } else {
      await cancelBooking(env, id, true);
      await answer(env, cb.id, "❌ Запись отменена, окошко освобождено");
      await send(env, b.user_id,
        `😔 <b>Запись отменена</b>\n\n🗓 ${dateLabel(b.date)} в ${b.time}\n💅 ${html(b.service_name)}\n\nЕсли это ошибка — напиши мне или запишись заново 🤍`);
    }
    return show(env, c, await screenAdminBookingCard(env, id));
  }
  // окошки
  if (data === "a:sl") { await answer(env, cb.id); return show(env, c, await screenAdminSlots(env)); }
  if (data === "a:sl:add") { await answer(env, cb.id); return show(env, c, screenAdminSlotDatePick(env)); }
  if (parts[1] === "sl" && parts[2] === "d") { await answer(env, cb.id); return show(env, c, screenAdminSlotTimePick(env, parts[3])); }
  if (parts[1] === "sl" && parts[2] === "t") {
    const date = parts[3];
    const time = parts.slice(4).join(":"); // время содержит «:», склеиваем обратно
    await env.DB.prepare("INSERT OR IGNORE INTO slots (date, time) VALUES (?,?)").bind(date, time).run();
    await answer(env, cb.id, `✅ Добавлено: ${time}`);
    return show(env, c, screenAdminSlotTimePick(env, date));
  }
  if (parts[1] === "sl" && parts[2] === "tm") {
    await setState(env, from.id, "adm_slot_time", { date: parts[3] });
    await answer(env, cb.id);
    await show(env, c, { text: `✍️ Введи время для <b>${dateLabel(parts[3])}</b> в формате <code>ЧЧ:ММ</code>\n\nНапример: <code>14:30</code>`, keyboard: [[btn("⬅️ Отмена", "a:sl")]] });
    return;
  }
  if (parts[1] === "sl" && parts[2] === "v") { await answer(env, cb.id); return show(env, c, await screenAdminSlotCard(env, +parts[3])); }
  if (parts[1] === "sl" && parts[2] === "x") {
    const s = await env.DB.prepare("SELECT * FROM slots WHERE id=?").bind(+parts[3]).first();
    if (s && s.status === "free") {
      await env.DB.prepare("DELETE FROM slots WHERE id=?").bind(+parts[3]).run();
      await answer(env, cb.id, `🗑 Окошко ${shortDate(s.date)} ${s.time} удалено`);
    } else await answer(env, cb.id, "Нельзя удалить занятое окошко", true);
    return show(env, c, await screenAdminSlots(env));
  }
  if (data === "a:sl:clear") {
    await answer(env, cb.id);
    return show(env, c, {
      text: "🧨 <b>Удалить ВСЕ свободные окошки?</b>\n\n<i>Занятые окошки (с записями) не пострадают.</i>",
      keyboard: [[btn("🧨 Да, удалить все", "a:sl:clear:y")], [btn("⬅️ Отмена", "a:sl")]],
    });
  }
  if (data === "a:sl:clear:y") {
    const r = await env.DB.prepare("DELETE FROM slots WHERE status='free' AND date>=?").bind(todayStr(env)).run();
    await answer(env, cb.id, `🧨 Удалено окошек: ${r.meta.changes}`, true);
    return show(env, c, await screenAdminSlots(env));
  }
  // услуги
  if (data === "a:sv") { await answer(env, cb.id); return show(env, c, await screenAdminServices(env)); }
  if (data === "a:sv:add") {
    await setState(env, from.id, "adm_svc_name", {});
    await answer(env, cb.id);
    return send(env, chatId, "💅 <b>Новая услуга</b>\n\nВведи название (например <code>Маникюр + гель-лак</code>):");
  }
  if (parts[1] === "sv" && parts[2] === "ph") {
    const id = +parts[3];
    await answer(env, cb.id);
    const photos = await dbAll(env, "SELECT file_id FROM service_photos WHERE service_id=? ORDER BY sort, id", id);
    await show(env, c, await screenAdminServicePhotos(env, id));
    if (photos.length)
      await tg(env, "sendMediaGroup", { chat_id: chatId, media: photos.slice(0, 10).map((p) => ({ type: "photo", media: p.file_id })) });
    return;
  }
  if (parts[1] === "sv" && parts[2] === "pha") {
    await setState(env, from.id, "adm_svc_photo", { id: +parts[3] });
    await answer(env, cb.id);
    return send(env, chatId, "📸 Присылай фото работ — по одному или несколько.\nОни появятся на странице услуги в мини-приложении ✨\n\n<i>/cancel — закончить</i>");
  }
  if (parts[1] === "sv" && parts[2] === "phd") {
    await env.DB.prepare("DELETE FROM service_photos WHERE service_id=?").bind(+parts[3]).run();
    await answer(env, cb.id, "🗑 Фото удалены");
    return show(env, c, await screenAdminServiceCard(env, +parts[3]));
  }
  if (parts[1] === "sv" && parts[2] === "e") {
    const [, , , field, id] = parts;
    const prompts = {
      name: "✏️ Введи новое название услуги:",
      price: "💰 Введи новую цену (число):",
      dur: "⏱ Введи новую длительность в минутах:",
      desc: "📝 Введи новое описание (или <code>-</code> чтобы убрать):",
    };
    await setState(env, from.id, "adm_svc_edit", { field, id: +id });
    await answer(env, cb.id);
    return send(env, chatId, prompts[field] + "\n\n<i>/cancel — отмена</i>");
  }
  if (parts[1] === "sv" && parts[2] === "tg") {
    await env.DB.prepare("UPDATE services SET active = 1 - active WHERE id=?").bind(+parts[3]).run();
    await answer(env, cb.id, "Готово ✨");
    return show(env, c, await screenAdminServiceCard(env, +parts[3]));
  }
  if (parts[1] === "sv" && parts[2] === "del" && parts.length === 4) {
    await answer(env, cb.id);
    return show(env, c, {
      text: "🗑 <b>Удалить услугу?</b>\n\n<i>Старые записи останутся в истории.</i>",
      keyboard: [[btn("🗑 Да, удалить", `a:sv:del:y:${parts[3]}`)], [btn("⬅️ Назад", `a:sv:${parts[3]}`)]],
    });
  }
  if (parts[1] === "sv" && parts[2] === "del" && parts[3] === "y") {
    await env.DB.prepare("DELETE FROM services WHERE id=?").bind(+parts[4]).run();
    await answer(env, cb.id, "🗑 Услуга удалена");
    return show(env, c, await screenAdminServices(env));
  }
  if (parts[1] === "sv") { await answer(env, cb.id); return show(env, c, await screenAdminServiceCard(env, +parts[2])); }
  // тексты
  if (data === "a:tx") { await answer(env, cb.id); return show(env, c, screenAdminTexts()); }
  if (parts[1] === "tx") {
    const key = parts[2];
    const cur = await getSetting(env, key);
    await setState(env, from.id, "adm_text", { key });
    await answer(env, cb.id);
    return send(env, chatId,
      `✏️ <b>Редактирование</b>\n\nТекущее значение:\n<blockquote>${html(cur) || "<i>пусто</i>"}</blockquote>\nОтправь новый текст (поддерживается HTML: &lt;b&gt;, &lt;i&gt;).\n<code>-</code> — очистить.\n<i>/cancel — отмена</i>`);
  }
  // рассылка
  if (data === "a:bc") {
    await setState(env, from.id, "adm_bc", {});
    await answer(env, cb.id);
    return send(env, chatId,
      "📣 <b>Рассылка</b>\n\nОтправь сообщение для всех клиентов: текст (можно с HTML-разметкой) или фото с подписью 📸\n\n<i>/cancel — отмена</i>");
  }
  if (data === "a:bc:n") {
    await setState(env, from.id, "idle");
    await answer(env, cb.id, "Рассылка отменена");
    return show(env, c, await screenAdmin(env));
  }
  if (data === "a:bc:y") {
    const user = await getUser(env, from.id);
    const p = JSON.parse(user.payload || "{}");
    await setState(env, from.id, "idle");
    await answer(env, cb.id, "🚀 Рассылаю...");
    const { results } = await env.DB.prepare("SELECT telegram_id FROM users WHERE blocked=0").all();
    let ok = 0, fail = 0;
    for (const u of results || []) {
      const r = p.photo
        ? await tg(env, "sendPhoto", { chat_id: u.telegram_id, photo: p.photo, caption: p.text, parse_mode: "HTML" })
        : await tg(env, "sendMessage", { chat_id: u.telegram_id, text: p.text, parse_mode: "HTML" });
      if (r.ok) ok++;
      else {
        fail++;
        if (r.error_code === 403) await env.DB.prepare("UPDATE users SET blocked=1 WHERE telegram_id=?").bind(u.telegram_id).run();
      }
    }
    await send(env, chatId, `📣 <b>Рассылка завершена</b>\n\n✅ Доставлено: ${ok}\n❌ Не доставлено: ${fail}`);
    return show(env, c, await screenAdmin(env));
  }
  // статистика
  if (data === "a:st") { await answer(env, cb.id); return show(env, c, await screenAdminStats(env)); }

  await answer(env, cb.id);
}

// ────────────────────────── MINI APP: API ──────────────────────────
async function validateInitData(initData, token) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
    const enc = new TextEncoder();
    const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
    const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", k2, enc.encode(dataCheck));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== hash) return null;
    const user = JSON.parse(params.get("user") || "null");
    const authDate = parseInt(params.get("auth_date") || "0", 10);
    if (Date.now() / 1000 - authDate > 86400 * 7) return null; // старше 7 дней — нельзя
    return user;
  } catch {
    return null;
  }
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function apiData(env, user) {
  await upsertUser(env, user);
  const u = await getUser(env, user.id);
  const services = (await env.DB.prepare("SELECT id, name, description, price, duration_min FROM services WHERE active=1 ORDER BY sort, id").all()).results || [];
  const photos = await dbAll(env, "SELECT service_id, file_id FROM service_photos ORDER BY sort, id");
  for (const s of services) s.photos = photos.filter((p) => p.service_id === s.id).map((p) => p.file_id);
  const slots = {};
  for (const s of await freeSlots(env)) {
    (slots[s.date] = slots[s.date] || []).push({ id: s.id, time: s.time });
  }
  const today = todayStr(env);
  const bookings = await dbAll(env,
    "SELECT id, service_name, price, date, time, status FROM bookings WHERE user_id=? AND status IN ('pending','confirmed') AND date>=? ORDER BY date, time",
    user.id, today);
  const past = await dbAll(env,
    `SELECT b.id, b.service_name, b.price, b.date, b.time,
            (SELECT COUNT(*) FROM reviews r WHERE r.booking_id = b.id) AS has_review
     FROM bookings b WHERE b.user_id=? AND b.status='confirmed' AND b.date<? ORDER BY b.date DESC LIMIT 10`,
    user.id, today);
  const reviews = await dbAll(env, "SELECT name, rating, text, created_at FROM reviews WHERE visible=1 ORDER BY id DESC LIMIT 20");
  let revAgg = { n: 0, a: 0 };
  try { revAgg = await env.DB.prepare("SELECT COUNT(*) n, AVG(rating) a FROM reviews WHERE visible=1").first(); } catch {}
  const texts = await getTexts(env);
  return json({
    ok: true,
    user: { id: user.id, first_name: user.first_name, username: user.username, phone: (u && u.phone) || "", birthday: (u && u.birthday) || "" },
    services, slots, bookings, past, reviews,
    rating: { count: revAgg.n || 0, avg: revAgg.a ? Math.round(revAgg.a * 10) / 10 : 0 },
    texts: { about: texts.about_text, contacts: texts.contacts_text, promo: texts.promo_text, portfolio_url: texts.portfolio_url, master_link: texts.master_link },
    is_admin: isAdmin(env, user.id),
  });
}

async function apiReview(env, user, body) {
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(+(body || {}).booking_id).first();
  if (!b || b.user_id !== user.id) return json({ ok: false, error: "Запись не найдена 🙈" }, 404);
  if (b.status !== "confirmed") return json({ ok: false, error: "Отзыв можно оставить после подтверждённого визита 🙈" }, 400);
  const rating = parseInt(body.rating, 10) || 0;
  if (rating < 1 || rating > 5) return json({ ok: false, error: "Выбери оценку ⭐" }, 400);
  const exists = await dbAll(env, "SELECT id FROM reviews WHERE booking_id=?", b.id);
  if (exists.length) return json({ ok: false, error: "Отзыв уже оставлен 🤍" }, 409);
  const text = String(body.text || "").trim().slice(0, 500);
  const u = await getUser(env, user.id);
  const name = (u && u.first_name) || "Гость";
  await env.DB.prepare("INSERT INTO reviews (user_id, booking_id, name, username, rating, text) VALUES (?,?,?,?,?,?)")
    .bind(user.id, b.id, name, (u && u.username) || "", rating, text).run();
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const ids = (env.ADMIN_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids)
    await send(env, id,
      `⭐ <b>Новый отзыв!</b>\n\n${stars}\n👤 ${html(name)}${b.client_username ? ` @${b.client_username}` : ""}\n💅 ${html(b.service_name)}` +
      (text ? `\n\n<i>${html(text.slice(0, 300))}</i>` : ""));
  return json({ ok: true });
}

async function apiBook(env, user, body) {
  const { slot_id, service_id, name, phone } = body || {};
  if (!slot_id || !service_id || !name || String(name).trim().length < 1)
    return json({ ok: false, error: "Заполни имя и выбери время 🙈" }, 400);
  if (phone && !/^[+]?[\d\s\-()]{10,18}$/.test(String(phone).trim()))
    return json({ ok: false, error: "Похоже, в телефоне опечатка 🙈" }, 400);

  // День рождения: сохраняем, если клиент указал (формат ДД.ММ)
  const bday = String(body.birthday || "").trim();
  if (bday) {
    if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/.test(bday))
      return json({ ok: false, error: "День рождения в формате ДД.ММ 🙈" }, 400);
    try { await env.DB.prepare("UPDATE users SET birthday=? WHERE telegram_id=?").bind(bday, user.id).run(); } catch {}
  }

  // Скидка: промокод ИЛИ день рождения (промокод в приоритете)
  const svc = await env.DB.prepare("SELECT * FROM services WHERE id=? AND active=1").bind(+service_id).first();
  if (!svc) return json({ ok: false, error: "Услуга не найдена 🙈" }, 404);
  let promoCode = "", discount = 0;
  const codeIn = String(body.promo_code || "").trim().toUpperCase();
  if (codeIn) {
    const p = await dbAll(env, "SELECT * FROM promos WHERE code=? AND active=1", codeIn);
    if (!p.length) return json({ ok: false, error: "Промокод не найден или истёк 😔" }, 400);
    const pr = p[0];
    discount = pr.kind === "percent" ? Math.round((svc.price * pr.value) / 100) : pr.value;
    promoCode = pr.code;
    try { await env.DB.prepare("UPDATE promos SET uses=uses+1 WHERE id=?").bind(pr.id).run(); } catch {}
  } else {
    const bd = await getSetting(env, "bday_discount");
    const discPct = bd === "" ? 10 : parseInt(bd, 10);
    const u = await getUser(env, user.id);
    const ub = bday || (u && u.birthday) || "";
    const todayDm = todayStr(env).slice(8, 10) + "." + todayStr(env).slice(5, 7);
    if (discPct > 0 && ub && ub === todayDm) {
      discount = Math.round((svc.price * discPct) / 100);
      promoCode = "🎂 ДР";
    }
  }

  const res = await createBooking(env, {
    userId: user.id, slotId: +slot_id, serviceId: +service_id,
    name: String(name).trim().slice(0, 40), phone: phone ? String(phone).trim() : "", source: "app",
    promoCode, discount,
  });
  if (!res.ok) return json({ ok: false, error: res.error === "slot_taken" ? "Упс, это окошко уже заняли 😔 Выбери другое!" : "Что-то пошло не так" }, 409);
  const b = res.booking;
  await notifyAdminNewBooking(env, b);
  const priceLine = b.discount ? `💅 ${html(b.service_name)} · <s>${b.old_price}₽</s> <b>${b.price}₽</b> (скидка −${b.discount}₽)` : `💅 ${html(b.service_name)} · ${b.price}₽`;
  await send(env, user.id,
    `🎉 <b>Ты записана!</b>\n\n🗓 <b>${dateLabel(b.date)}</b> в <b>${b.time}</b>\n${priceLine}\n\n⏳ Подтвержу запись в ближайшее время 💌\n📍 Адрес: г. Бердск, ул. Вокзальная, 2`,
    { reply_markup: kb([[urlBtn("📆 Добавить в календарь", gcalLink(env, b))], [urlBtn("🧭 Как добраться", MAPS_URL)]]) });
  return json({ ok: true, booking: { id: b.id, date: b.date, time: b.time, service_name: b.service_name, price: b.price, old_price: b.old_price, discount: b.discount, date_label: dateLabel(b.date) } });
}

async function apiCancel(env, user, body) {
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(+(body || {}).id).first();
  if (!b || b.user_id !== user.id) return json({ ok: false, error: "Запись не найдена" }, 404);
  await cancelBooking(env, b.id, false);
  const ids = (env.ADMIN_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids)
    await send(env, id, `⚠️ <b>Клиент отменил запись</b>\n\n👤 ${html(b.client_name)} (${mention(b.client_username)})\n🗓 ${dateLabel(b.date)} в ${b.time}\n💅 ${html(b.service_name)}`);
  return json({ ok: true });
}


// ────────────────────────── MINI APP: АДМИН-API ──────────────────────────
async function apiAdmin(env, path, body) {
  const today = todayStr(env);
  try {
  if (path === "/api/admin/data") {
    const bookings = (await env.DB.prepare(
      "SELECT * FROM bookings WHERE status IN ('pending','confirmed') AND date>=? ORDER BY date, time LIMIT 100"
    ).bind(today).all()).results || [];
    const slots = (await env.DB.prepare(
      `SELECT s.*, b.client_name, b.client_username, b.client_phone FROM slots s
       LEFT JOIN bookings b ON b.id = s.booking_id WHERE s.date>=? ORDER BY s.date, s.time LIMIT 400`
    ).bind(today).all()).results || [];
    const services = (await env.DB.prepare("SELECT * FROM services ORDER BY sort, id").all()).results || [];
    const reviews = await dbAll(env, "SELECT * FROM reviews ORDER BY id DESC LIMIT 50");
    const promos = await dbAll(env, "SELECT * FROM promos ORDER BY id DESC LIMIT 50");
    const texts = await getTexts(env);
    const one = async (q, ...b) => (await env.DB.prepare(q).bind(...b).first()).n;
    const settings = { rebook_days: (await getSetting(env, "rebook_days")) || "21", bday_discount: (await getSetting(env, "bday_discount")) || "10" };
    let months = [], topServices = [], returning = 0;
    try { months = await dbAll(env, "SELECT substr(date,1,7) ym, COALESCE(SUM(price),0) total, COUNT(*) cnt FROM bookings WHERE status='confirmed' GROUP BY ym ORDER BY ym DESC LIMIT 6"); } catch {}
    try { topServices = await dbAll(env, "SELECT service_name, COUNT(*) cnt FROM bookings WHERE status='confirmed' GROUP BY service_name ORDER BY cnt DESC LIMIT 5"); } catch {}
    try { returning = await one("SELECT COUNT(*) n FROM (SELECT user_id FROM bookings WHERE status='confirmed' GROUP BY user_id HAVING COUNT(*)>1)"); } catch {}
    return json({ ok: true, today, bookings, slots, services, reviews, promos, texts, settings, stats: {
      users: await one("SELECT COUNT(*) n FROM users"),
      upcoming: await one("SELECT COUNT(*) n FROM bookings WHERE status IN ('pending','confirmed') AND date>=?", today),
      pending: await one("SELECT COUNT(*) n FROM bookings WHERE status='pending' AND date>=?", today),
      free_slots: await one("SELECT COUNT(*) n FROM slots WHERE status='free' AND date>=?", today),
      revenue: await one("SELECT COALESCE(SUM(price),0) n FROM bookings WHERE status='confirmed' AND date>=?", today),
      new_reviews: reviews.filter((r) => r.visible).length,
      months, topServices, returning,
    }});
  }
  if (path === "/api/admin/promo") {
    if (body.action === "add") {
      const code = String(body.code || "").trim().toUpperCase();
      if (!/^[A-ZА-Я0-9]{3,20}$/.test(code)) return json({ ok: false, error: "Код: 3–20 букв/цифр 🙈" }, 400);
      const kind = body.kind === "fixed" ? "fixed" : "percent";
      const value = Math.max(1, Math.min(kind === "percent" ? 90 : 10000, parseInt(body.value, 10) || 0));
      if (!value) return json({ ok: false, error: "Укажи размер скидки 🙈" }, 400);
      try {
        await env.DB.prepare("INSERT INTO promos (code, kind, value) VALUES (?,?,?)").bind(code, kind, value).run();
      } catch { return json({ ok: false, error: "Такой код уже есть 🙈" }, 409); }
      return json({ ok: true });
    }
    const id = +body.id;
    if (body.action === "del") await env.DB.prepare("DELETE FROM promos WHERE id=?").bind(id).run();
    else await env.DB.prepare("UPDATE promos SET active=? WHERE id=?").bind(body.action === "on" ? 1 : 0, id).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/settings") {
    const allowed = { rebook_days: [7, 60], bday_discount: [0, 50] };
    const key = String(body.key || "");
    if (!(key in allowed)) return json({ ok: false, error: "unknown_key" }, 400);
    const v = Math.max(allowed[key][0], Math.min(allowed[key][1], parseInt(body.value, 10) || 0));
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, String(v)).run();
    return json({ ok: true, value: v });
  }
  if (path === "/api/admin/booking") {
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(+body.id).first();
    if (!b) return json({ ok: false, error: "not_found" }, 404);
    if (body.action === "confirm" && b.status === "pending") {
      await env.DB.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").bind(b.id).run();
      await send(env, b.user_id,
        `✅ <b>Запись подтверждена!</b>\n\n🗓 <b>${dateLabel(b.date)}</b> в <b>${b.time}</b>\n💅 ${html(b.service_name)} · ${b.price}₽\n\nЖду тебя, красотка 🤍\n📍 <i>г. Бердск, ул. Вокзальная, 2 💌</i>`,
        { reply_markup: kb([[urlBtn("📆 Добавить в календарь", gcalLink(env, b))], [urlBtn("🧭 Как добраться", MAPS_URL)]]) });
    } else {
      await cancelBooking(env, b.id, true);
      await send(env, b.user_id,
        `😔 <b>Запись отменена</b>\n\n🗓 ${dateLabel(b.date)} в ${b.time}\n💅 ${html(b.service_name)}\n\nЕсли это ошибка — напиши мне или запишись заново 🤍`);
    }
    return json({ ok: true });
  }
  if (path === "/api/admin/slot/add") {
    const date = String(body.date || "");
    const m = String(body.time || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !m) return json({ ok: false, error: "Проверь дату и время 🙈" }, 400);
    await env.DB.prepare("INSERT OR IGNORE INTO slots (date, time) VALUES (?,?)").bind(date, `${pad2(m[1])}:${m[2]}`).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/slot/del") {
    const s = await env.DB.prepare("SELECT * FROM slots WHERE id=?").bind(+body.id).first();
    if (!s) return json({ ok: false, error: "not_found" }, 404);
    if (s.status !== "free") return json({ ok: false, error: "slot_busy" }, 409);
    await env.DB.prepare("DELETE FROM slots WHERE id=?").bind(s.id).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/slots/clear") {
    const r = await env.DB.prepare("DELETE FROM slots WHERE status='free' AND date>=?").bind(today).run();
    return json({ ok: true, deleted: r.meta.changes || 0 });
  }
  if (path === "/api/admin/service/save") {
    const name = String(body.name || "").trim().slice(0, 60);
    const price = parseInt(String(body.price).replace(/\D/g, ""), 10) || 0;
    const dur = parseInt(String(body.duration_min).replace(/\D/g, ""), 10) || 60;
    const desc = String(body.description || "").trim().slice(0, 300);
    const active = body.active ? 1 : 0;
    if (!name || !price) return json({ ok: false, error: "Заполни название и цену 🙈" }, 400);
    if (body.id) {
      await env.DB.prepare("UPDATE services SET name=?, description=?, price=?, duration_min=?, active=? WHERE id=?")
        .bind(name, desc, price, dur, active, +body.id).run();
      return json({ ok: true });
    }
    await env.DB.prepare("INSERT INTO services (name, description, price, duration_min, active) VALUES (?,?,?,?,?)")
      .bind(name, desc, price, dur, active).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/service/del") {
    await env.DB.prepare("DELETE FROM services WHERE id=?").bind(+body.id).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/text") {
    const keys = ["start_text", "about_text", "contacts_text", "promo_text", "portfolio_url", "master_link"];
    if (!keys.includes(body.key)) return json({ ok: false, error: "bad_key" }, 400);
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind(body.key, String(body.value || "")).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/review") {
    const id = +body.id;
    if (body.action === "del") await env.DB.prepare("DELETE FROM reviews WHERE id=?").bind(id).run();
    else await env.DB.prepare("UPDATE reviews SET visible=? WHERE id=?").bind(body.action === "show" ? 1 : 0, id).run();
    return json({ ok: true });
  }
  if (path === "/api/admin/slots/gen") {
    const days = (Array.isArray(body.days) ? body.days : []).map(Number).filter((d) => d >= 0 && d <= 6);
    const times = (Array.isArray(body.times) ? body.times : []).filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t)));
    if (!days.length || !times.length) return json({ ok: false, error: "Выбери дни и время 🙈" }, 400);
    let added = 0;
    for (let i = 0; i < 28; i++) {
      const d = addDays(today, i);
      const [y, m, dd] = d.split("-").map(Number);
      const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
      if (!days.includes(wd)) continue;
      for (const t of times) {
        const [h1, m1] = String(t).split(":");
        const r = await env.DB.prepare("INSERT OR IGNORE INTO slots (date, time) VALUES (?,?)").bind(d, `${pad2(+h1)}:${m1}`).run();
        added += (r.meta && r.meta.changes) || 0;
      }
    }
    return json({ ok: true, added });
  }
  if (path === "/api/admin/broadcast") {
    const text = String(body.text || "").trim();
    if (!text) return json({ ok: false, error: "Пустое сообщение 🙈" }, 400);
    const { results } = await env.DB.prepare("SELECT telegram_id FROM users WHERE blocked=0").all();
    let ok = 0, fail = 0;
    for (const u of results || []) {
      const r = await tg(env, "sendMessage", { chat_id: u.telegram_id, text, parse_mode: "HTML", disable_web_page_preview: true });
      if (r.ok) ok++;
      else { fail++; if (r.error_code === 403) await env.DB.prepare("UPDATE users SET blocked=1 WHERE telegram_id=?").bind(u.telegram_id).run(); }
    }
    return json({ ok: true, delivered: ok, failed: fail });
  }
  return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    return json({ ok: false, error: "srv: " + String((e && e.message) || e).slice(0, 140) }, 200);
  }
}

// ────────────────────────── MINI APP: HTML ──────────────────────────
// Внимание: внутри НЕ использовать символы ` и ${ — файл вставлен как String.raw
const MINI_APP_HTML = String.raw`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>DARWN.NAILL · Запись</title>
<script>__TG_SCRIPT__</script>
<style>
  :root {
    --bg: #14090f;
    --card: rgba(255,255,255,.055);
    --card-border: rgba(255,255,255,.09);
    --text: #f5e9e2;
    --muted: #b89fae;
    --accent1: #f2b8c6;
    --accent2: #d99a6c;
    --grad: linear-gradient(135deg, #f2b8c6, #d99a6c);
    --red: #ff8fa3;
  }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { height:100%; }
  body {
    background: var(--bg); color: var(--text);
    font-family: -apple-system, 'Segoe UI', Roboto, 'Inter', sans-serif;
    overflow-x: hidden; min-height:100vh;
  }
  .blob { position:fixed; border-radius:50%; filter:blur(70px); opacity:.5; pointer-events:none; z-index:0; }
  .b1 { width:280px; height:280px; background:#7a3b52; top:-90px; right:-80px; animation:fl 9s ease-in-out infinite alternate; }
  .b2 { width:240px; height:240px; background:#5c3a1e; bottom:-70px; left:-70px; animation:fl 11s ease-in-out infinite alternate-reverse; }
  @keyframes fl { to { transform: translateY(30px) scale(1.12); } }
  .wrap { position:relative; z-index:1; max-width:480px; margin:0 auto; padding:22px 16px 90px; }
  .fade { animation:fade .35s ease; }
  @keyframes fade { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:none;} }

  .logo { text-align:center; padding:18px 0 6px; }
  .logo .ring {
    width:86px; height:86px; margin:0 auto 12px; border-radius:50%;
    background:var(--grad); display:flex; align-items:center; justify-content:center;
    font-size:40px; box-shadow:0 8px 32px rgba(217,154,108,.4);
  }
  .logo h1 { font-size:26px; letter-spacing:5px; font-weight:800; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .logo p { color:var(--muted); font-size:13px; margin-top:6px; letter-spacing:.4px; }

  .card {
    background:var(--card); border:1px solid var(--card-border); border-radius:20px;
    padding:16px; margin-top:14px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  }
  .promo { border:1px solid rgba(242,184,198,.35); background:linear-gradient(135deg, rgba(242,184,198,.12), rgba(217,154,108,.08)); }
  .promo .tag { font-size:11px; font-weight:700; letter-spacing:2px; color:var(--accent1); }
  .promo .txt { margin-top:6px; font-size:14px; line-height:1.5; }

  .tabs { display:flex; gap:8px; margin-top:20px; }
  .tab {
    flex:1; text-align:center; padding:11px 0; border-radius:14px; font-size:14px; font-weight:600;
    background:var(--card); border:1px solid var(--card-border); color:var(--muted); cursor:pointer; transition:.2s;
  }
  .tab.active { background:var(--grad); color:#2a1410; border-color:transparent; box-shadow:0 6px 20px rgba(217,154,108,.35); }

  .svc { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:15px 16px; margin-top:12px; cursor:pointer; transition:transform .15s; }
  .svc:active { transform:scale(.98); }
  .svc .nm { font-weight:700; font-size:15px; }
  .svc .ds { color:var(--muted); font-size:12.5px; margin-top:4px; line-height:1.45; }
  .svc .dur { color:var(--muted); font-size:11.5px; margin-top:5px; }
  .svc .pr { text-align:right; flex-shrink:0; }
  .svc .pr b { font-size:17px; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .svc .go { display:inline-block; margin-top:6px; font-size:11px; color:var(--accent1); border:1px solid rgba(242,184,198,.4); padding:4px 10px; border-radius:20px; }

  .sect { font-size:12px; font-weight:700; letter-spacing:1.6px; color:var(--muted); text-transform:uppercase; margin:22px 2px 4px; }
  .dates { display:flex; gap:8px; overflow-x:auto; padding:8px 2px 12px; scrollbar-width:none; }
  .dates::-webkit-scrollbar { display:none; }
  .dchip {
    flex:0 0 auto; width:62px; padding:10px 0; text-align:center; border-radius:16px; cursor:pointer;
    background:var(--card); border:1px solid var(--card-border); transition:.2s;
  }
  .dchip .wd { font-size:11px; color:var(--muted); }
  .dchip .dd { font-size:17px; font-weight:800; margin-top:2px; }
  .dchip.active { background:var(--grad); color:#2a1410; border-color:transparent; box-shadow:0 6px 18px rgba(217,154,108,.4); }
  .dchip.active .wd { color:#5c3a2e; }
  .times { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; padding:8px 2px; }
  .tchip { padding:11px 0; text-align:center; border-radius:13px; font-size:14px; font-weight:600; cursor:pointer; background:var(--card); border:1px solid var(--card-border); transition:.15s; }
  .tchip.active { background:var(--grad); color:#2a1410; border-color:transparent; box-shadow:0 5px 16px rgba(217,154,108,.4); }
  .empty { text-align:center; color:var(--muted); font-size:14px; padding:26px 10px; }

  .inp {
    width:100%; padding:14px 16px; border-radius:14px; border:1px solid var(--card-border);
    background:rgba(255,255,255,.05); color:var(--text); font-size:15px; margin-top:10px; outline:none;
  }
  .inp:focus { border-color:var(--accent1); }
  .inp::placeholder { color:#7d6572; }

  .cta {
    position:fixed; left:0; right:0; bottom:0; padding:14px 16px calc(14px + env(safe-area-inset-bottom));
    background:linear-gradient(to top, #14090f 60%, transparent); z-index:5;
  }
  .cta button {
    width:100%; max-width:448px; margin:0 auto; display:block; padding:16px; border:none; border-radius:17px;
    background:var(--grad); color:#2a1410; font-size:16px; font-weight:800; letter-spacing:.3px; cursor:pointer;
    box-shadow:0 10px 30px rgba(217,154,108,.45); transition:transform .15s;
  }
  .cta button:active { transform:scale(.97); }
  .cta button:disabled { opacity:.45; box-shadow:none; }

  .bk { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .bk .st { font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; }
  .st.p { background:rgba(242,184,198,.15); color:var(--accent1); border:1px solid rgba(242,184,198,.35); }
  .st.c { background:rgba(151,224,173,.12); color:#97e0ad; border:1px solid rgba(151,224,173,.3); }
  .cancel { display:block; width:100%; font-size:13px; font-weight:600; color:var(--red); background:rgba(255,143,163,.07); border:1px solid rgba(255,143,163,.35); border-radius:13px; padding:11px 12px; cursor:pointer; margin-top:12px; transition:.15s; }
  .cancel:active { transform:scale(.98); background:rgba(255,143,163,.14); }

  .gal{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 10px;-webkit-overflow-scrolling:touch}
.gal img{width:110px;height:110px;object-fit:cover;border-radius:14px;border:1px solid var(--line);flex:none;cursor:pointer}
.phwrap{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:60;align-items:center;justify-content:center}
.phwrap.on{display:flex}
.phwrap img{max-width:92vw;max-height:80vh;border-radius:16px}
.phwrap .phx{position:absolute;top:18px;right:20px;font-size:26px;color:#fff;opacity:.8;cursor:pointer}
.pgnav{display:flex;align-items:center;gap:10px}
.pgnav span{font-size:18px;color:#fff;opacity:.75;padding:8px 14px;cursor:pointer;user-select:none}
.stars{display:flex;justify-content:center;gap:6px;margin:14px 0}
.stars span{font-size:34px;cursor:pointer;transition:transform .12s}
.stars span.on{transform:scale(1.12)}
.rev{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-top:10px}
.rev .rh{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rev .rn{font-weight:700;font-size:14px}
.rev .rs{color:var(--accent);letter-spacing:2px;font-size:13px;white-space:nowrap}
.rev .rt{color:var(--muted);font-size:13px;line-height:1.55;margin-top:6px}
.ratepill{display:inline-block;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:999px;padding:5px 14px;font-size:13px;color:var(--muted)}
.ratepill b{color:var(--accent)}
.wdgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px}
.wdchip{text-align:center;padding:10px 0 8px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:12px;color:var(--muted);cursor:pointer}
.wdchip.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.linkbtn { display:block; text-align:center; padding:14px; border-radius:15px; background:var(--card); border:1px solid var(--card-border); color:var(--text); text-decoration:none; font-weight:600; font-size:14.5px; margin-top:10px; }
  .back { color:var(--muted); font-size:14px; cursor:pointer; padding:6px 0; display:inline-block; }
  .ok-screen { text-align:center; padding-top:60px; }
  .ok-screen .chk { width:92px; height:92px; margin:0 auto 18px; border-radius:50%; background:var(--grad); display:flex; align-items:center; justify-content:center; font-size:44px; box-shadow:0 12px 40px rgba(217,154,108,.5); animation:pop .5s cubic-bezier(.2,1.6,.4,1); }
  @keyframes pop { from { transform:scale(0);} }
  .skel { height:74px; border-radius:20px; margin-top:12px; background:linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.09), rgba(255,255,255,.04)); background-size:200% 100%; animation:sk 1.2s infinite; }
  @keyframes sk { to { background-position:-200% 0; } }
  .err { text-align:center; padding:60px 20px; color:var(--muted); }
  .statgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
  .stat { background:var(--card); border:1px solid var(--card-border); border-radius:16px; padding:14px 8px; text-align:center; }
  .stat b { font-size:20px; display:block; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .stat span { font-size:11px; color:var(--muted); }
  .menurow { display:flex; justify-content:space-between; align-items:center; font-weight:600; font-size:15px; cursor:pointer; }
  .menurow:active { transform:scale(.98); }
  .badge { background:var(--grad); color:#2a1410; font-size:12px; font-weight:800; border-radius:20px; padding:3px 10px; }
  .abtn { padding:11px 14px; border-radius:13px; border:1px solid var(--card-border); background:var(--card); color:var(--text); font-size:13.5px; font-weight:700; cursor:pointer; }
  .abtn.ok { background:var(--grad); color:#2a1410; border-color:transparent; }
  .abtn.no { color:var(--red); border-color:rgba(255,143,163,.4); background:rgba(255,143,163,.06); }
  .abtn:disabled { opacity:.5; }
  .tchip.busy { opacity:.45; }
  .chkrow { display:flex; gap:8px; align-items:center; margin-top:12px; color:var(--muted); font-size:14px; }
  .chkrow input { accent-color:var(--accent2); width:17px; height:17px; }
  textarea.inp { resize:vertical; font-family:inherit; }
  .toast {
    position:fixed; top:14px; left:50%; transform:translateX(-50%); background:#2a1a22; border:1px solid var(--card-border);
    color:var(--text); padding:11px 18px; border-radius:14px; font-size:13.5px; z-index:50; box-shadow:0 10px 30px rgba(0,0,0,.5); animation:fade .25s;
  }
</style>
</head>
<body>
<div class="blob b1"></div><div class="blob b2"></div>
<div class="wrap" id="app">
  <div class="skel"></div><div class="skel"></div><div class="skel"></div>
</div>
<div id="cta" class="cta"></div>

<script>
var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#14090f'); tg.setBackgroundColor('#14090f'); } catch(e){} }
var D = null;          // данные с сервера
var view = 'home';     // home | book | done | my | contacts
var sel = { svc:null, date:null, slotId:null, time:null };
var form = { name:'', phone:'', bday:'' };
var promo = null;      // применённый промокод {code,kind,value}
var pmKind = 'percent'; // тип нового промокода в админке
var sending = false;
var AD = null;          // данные админки
var admSlotDate = null; // выбранная дата в добавлении окошка
var editSvc = null;     // редактируемая услуга
var editTextKey = null; // редактируемый текст
var revView = { id:null, name:'', rating:0 };
var genDays = [];
var genTimes = {};
var API_URL = '__API__';

function apiPost(path, body){
  return fetch(API_URL+path, { method:'POST', headers:{ 'content-type':'application/json', 'X-Tg-Init-Data': tg.initData }, body: JSON.stringify(body||{}) })
    .then(function(r){ return r.text().then(function(txt){
      var j = null;
      try { j = JSON.parse(txt); } catch(e) { return { ok:false, error:'HTTP '+r.status+': не-JSON ответ' }; }
      if (!r.ok && j && !j.error) j.error = 'HTTP '+r.status;
      return j;
    }); })
    .catch(function(){ return { ok:false, error:'Нет связи 😔' }; });
}
function loadAdmin(cb){
  fetch(API_URL+'/api/admin/data', { headers:{ 'X-Tg-Init-Data': tg.initData } })
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d.ok){ AD=d; if(cb)cb(); } else toast(d.error==='forbidden'?'Это только для мастера 🙈':'Ошибка загрузки 😔'); })
    .catch(function(){ toast('Нет связи 😔'); });
}
function refreshAdmin(){ loadAdmin(function(){ render(); }); }
function goAdmin(){ haptic(); if (!AD){ loadAdmin(function(){ view='adm'; render(); }); } else { view='adm'; render(); } }
function tabsHtml(active){
  var s = '<div class="tabs">';
  s += '<div class="tab'+(active==='home'?' active':'')+'" onclick="go(\'home\')">💅 Услуги</div>';
  s += '<div class="tab'+(active==='my'?' active':'')+'" onclick="go(\'my\')">📅 Записи</div>';
  s += '<div class="tab'+(active==='contacts'?' active':'')+'" onclick="go(\'contacts\')">📍 Инфо</div>';
  s += '<div class="tab'+(active==='revs'?' active':'')+'" onclick="go(\'revs\')">⭐</div>';
  if (D.is_admin) s += '<div class="tab'+(active==='adm'?' active':'')+'" onclick="goAdmin()">👑</div>';
  return s + '</div>';
}

function h(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function $(id){ return document.getElementById(id); }
function el(id){ return $(id); }
function toast(t){ var d=document.createElement('div'); d.className='toast'; d.textContent=t; document.body.appendChild(d); setTimeout(function(){ d.remove(); }, 2600); }
function haptic(style){ try { if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(style||'light'); } catch(e){} }
function nl2br(s){ return h(s).replace(/\n/g,'<br>').replace(/<\/?(b|i|u|s|code|blockquote)>/g, function(m){ return m; }); }
function stripTags(s){ return String(s||'').replace(/<[^>]*>/g,''); }
function fmtDateLabel(ds){
  var wd=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  var mo=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var p=ds.split('-'); var dt=new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
  return { wd: wd[dt.getUTCDay()], dd: String(+p[2]), mo: mo[+p[1]-1] };
}
function durLabel(min){ var hh=Math.floor(min/60), mm=min%60; return (hh? hh+' ч':'') + (mm? ' '+mm+' мин':''); }

function init(){
  if (!tg || !tg.initData) {
    $('app').innerHTML = '<div class="err">Не удалось подключиться к Telegram 😔<br><br>Обнови Telegram до последней версии и открой меня заново через кнопку «✨ Записаться» в чате с ботом</div>';
    return;
  }
  var headers = { 'X-Tg-Init-Data': tg.initData };
  fetch('__API__/api/data', { headers: headers })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) { $('app').innerHTML = '<div class="err">Ошибка авторизации 😔<br><br>Закрой мини-приложение и открой его заново через кнопку «✨ Записаться» в чате с ботом</div>'; return; }
      D = d;
      if (d.user && d.user.first_name && !form.name) form.name = d.user.first_name;
      if (d.user && d.user.phone) form.phone = d.user.phone;
      render();
    })
    .catch(function(){ $('app').innerHTML = '<div class="err">Не удалось загрузить данные 😔<br>Проверь интернет и открой заново</div>'; });
}

function render(){
  var html = '';
  if (view==='home') html = viewHome();
  else if (view==='book') html = viewBook();
  else if (view==='done') html = viewDone();
  else if (view==='my') html = viewMy();
  else if (view==='revs') html = viewRevs();
  else if (view==='contacts') html = viewContacts();
  else if (view==='adm') html = viewAdmin();
  else if (view==='adm_bk') html = viewAdminBk();
  else if (view==='adm_sl') html = viewAdminSl();
  else if (view==='adm_sl_add') html = viewAdminSlAdd();
  else if (view==='adm_sv') html = viewAdminSv();
  else if (view==='adm_sv_edit') html = viewAdminSvEdit();
  else if (view==='adm_tx') html = viewAdminTx();
  else if (view==='adm_tx_edit') html = viewAdminTxEdit();
  else if (view==='adm_sl_gen') html = viewAdminSlGen();
  else if (view==='adm_rv') html = viewAdminRv();
  else if (view==='adm_pm') html = viewAdminPm();
  else if (view==='adm_st') html = viewAdminSt();
  else if (view==='review') html = viewReview();
  else if (view==='adm_bc') html = viewAdminBc();
  $('app').innerHTML = '<div class="fade">'+html+'</div>';
  renderCta();
}

function viewHome(){
  var t = D.texts;
  var s = '';
  s += '<div class="logo"><div class="ring">💅</div><h1>DARWN.NAILL</h1><p>Дарина · мастер маникюра · стаж 3 года</p></div>';
  if (t.promo) s += '<div class="card promo"><div class="tag">🔥 АКЦИЯ</div><div class="txt">'+nl2br(stripTags(t.promo))+'</div></div>';
  s += tabsHtml('home');
  if (D.rating && D.rating.count > 0) s += '<div style="text-align:center;margin:2px 0 4px"><span class="ratepill" onclick="go(\'revs\')"><b>★ '+D.rating.avg+'</b> · '+D.rating.count+' отзывов 🤍</span></div>';
  s += '<div class="sect">Выбери услугу</div>';
  if (!D.services.length) s += '<div class="empty">Скоро здесь появятся услуги 🤍</div>';
  for (var i=0;i<D.services.length;i++){
    var sv = D.services[i];
    s += '<div class="card svc" onclick="openSvc('+sv.id+')">';
    s += '<div><div class="nm">'+h(sv.name)+'</div>';
    if (sv.description) s += '<div class="ds">'+h(sv.description)+'</div>';
    s += '<div class="dur">⏱ ~'+durLabel(sv.duration_min)+'</div></div>';
    s += '<div class="pr"><b>'+sv.price+'₽</b><br><span class="go">Записаться</span></div>';
    s += '</div>';
  }
  return s;
}

function viewMy(){
  var s = '';
  s += '<div class="logo"><div class="ring">📅</div><h1>МОИ ЗАПИСИ</h1></div>';
  s += tabsHtml('my');
  if (!D.bookings.length) s += '<div class="empty">У тебя пока нет активных записей 🤍<br>Выбери услугу и запишись!</div>';
  for (var i=0;i<D.bookings.length;i++){
    var b = D.bookings[i]; var f = fmtDateLabel(b.date);
    var st = b.status==='confirmed' ? '<span class="st c">✅ подтверждена</span>' : '<span class="st p">⏳ ждёт подтверждения</span>';
    s += '<div class="card"><div class="bk"><div><b>'+f.dd+' '+f.mo+' · '+b.time+'</b><div class="ds" style="color:var(--muted);font-size:13px;margin-top:4px">'+h(b.service_name)+' · '+b.price+'₽</div></div>'+st+'</div>';
    s += '<button class="cancel" onclick="cancelBk('+b.id+')">Отменить запись</button></div>';
  }
  if (D.past && D.past.length){
    var pend = D.past.filter(function(p){ return !p.has_review; });
    if (pend.length) s += '<div class="sect">Как прошёл визит? 💌</div>';
    for (var k=0;k<pend.length;k++){
      var pb = pend[k]; var pf = fmtDateLabel(pb.date);
      s += '<div class="card"><div class="bk"><div><b>'+pf.dd+' '+pf.mo+' · '+pb.time+'</b><div class="ds" style="color:var(--muted);font-size:13px;margin-top:4px">'+h(pb.service_name)+'</div></div></div>';
      s += '<button class="cancel" style="border-color:var(--accent);color:var(--accent)" onclick="openReview('+pb.id+')">⭐ Оставить отзыв</button></div>';
    }
  }
  return s;
}

function starsStr(n){ var s=''; for (var i=1;i<=5;i++) s += i<=n ? '★' : '☆'; return s; }
function viewRevs(){
  var s = '';
  s += '<div class="logo"><div class="ring">⭐</div><h1>ОТЗЫВЫ</h1></div>';
  s += tabsHtml('revs');
  if (D.rating && D.rating.count > 0) s += '<div style="text-align:center;margin:6px 0 2px"><span class="ratepill"><b>★ '+D.rating.avg+'</b> на основе '+D.rating.count+' отзывов</span></div>';
  if (!D.reviews || !D.reviews.length) s += '<div class="empty">Пока пусто — стань первой, кто оставит отзыв 🤍</div>';
  for (var i=0;i<(D.reviews||[]).length;i++){
    var r = D.reviews[i];
    s += '<div class="rev"><div class="rh"><span class="rn">'+h(r.name)+'</span><span class="rs">'+starsStr(r.rating)+'</span></div>';
    if (r.text) s += '<div class="rt">'+h(r.text)+'</div>';
    s += '</div>';
  }
  return s;
}
function viewReview(){
  var s = '';
  s += '<span class="back" onclick="go(\'my\')">← Назад</span>';
  s += '<div class="logo"><div class="ring">💅</div><h1>КАК ТЕБЕ?</h1><p>'+h(revView.name)+'</p></div>';
  s += '<div class="stars">';
  for (var i=1;i<=5;i++) s += '<span id="st'+i+'" class="'+(revView.rating>=i?'on':'')+'" onclick="setRating('+i+')">'+(revView.rating>=i?'★':'☆')+'</span>';
  s += '</div>';
  s += '<textarea class="inp" id="revText" rows="4" placeholder="Пара слов о визите (необязательно) 🤍" style="resize:none"></textarea>';
  s += '<button class="abtn ok" style="width:100%;margin-top:12px" onclick="submitReview()">Отправить 🤍</button>';
  return s;
}
function setRating(n){ revView.rating = n; haptic(); for (var i=1;i<=5;i++){ var el=$('st'+i); el.textContent = i<=n?'★':'☆'; el.className = i<=n?'on':''; } }
function openReview(bkId){
  var b = null;
  for (var i=0;i<(D.past||[]).length;i++) if (D.past[i].id===bkId) b = D.past[i];
  if (!b) return;
  revView = { id:b.id, name:b.service_name, rating:0 };
  go('review');
}
function submitReview(){
  if (!revView.rating) { toast('Выбери оценку ⭐'); return; }
  haptic('medium');
  var text = ($('revText') ? $('revText').value : '').trim();
  apiPost('/api/review', { booking_id: revView.id, rating: revView.rating, text: text }).then(function(d){
    if (d.ok) {
      var pb = null;
      for (var i=0;i<(D.past||[]).length;i++) if (D.past[i].id===revView.id) pb = D.past[i];
      if (pb) pb.has_review = 1;
      toast('Спасибо за отзыв! 🤍'); refreshData(false); go('my');
    } else toast(d.error || 'Ошибка 😔');
  });
}
function photoView(src){
  var w = document.createElement('div'); w.className = 'phwrap on';
  w.innerHTML = '<span class="phx">✕</span><img src="'+src+'">';
  w.onclick = function(){ w.remove(); };
  document.body.appendChild(w);
}

function viewContacts(){
  var t = D.texts;
  var s = '';
  s += '<div class="logo"><div class="ring">🤍</div><h1>ИНФО</h1></div>';
  s += tabsHtml('contacts');
  s += '<div class="card"><div style="font-size:14px;line-height:1.65">'+nl2br(stripTags(t.about))+'</div></div>';
  s += '<div class="card"><div style="font-size:14px;line-height:1.65">'+nl2br(stripTags(t.contacts))+'</div></div>';
  s += '<a class="linkbtn" href="https://yandex.ru/maps/?text=%D0%B3.%20%D0%91%D0%B5%D1%80%D0%B4%D1%81%D0%BA%2C%20%D1%83%D0%BB.%20%D0%92%D0%BE%D0%BA%D0%B7%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F%2C%202" target="_blank" rel="noopener">🧭 Как добраться</a>';
  if (t.master_link) s += '<a class="linkbtn" href="'+h(t.master_link)+'">💬 Написать Дарине</a>';
  if (t.portfolio_url) s += '<a class="linkbtn" href="'+h(t.portfolio_url)+'">🖼 Портфолио</a>';
  return s;
}

function viewBook(){
  var sv = sel.svc;
  var s = '';
  s += '<span class="back" onclick="go(\'home\')">← Назад к услугам</span>';
  s += '<div class="card"><div class="nm" style="font-weight:800;font-size:17px">'+h(sv.name)+'</div>';
  if (sv.description) s += '<div class="ds" style="color:var(--muted);font-size:13px;margin-top:5px">'+h(sv.description)+'</div>';
  s += '<div style="margin-top:8px;color:var(--muted);font-size:13px">💰 '+sv.price+'₽ · ⏱ ~'+durLabel(sv.duration_min)+'</div></div>';
  if (sv.photos && sv.photos.length) { s += '<div class="sect">Примеры работ</div><div class="gal">'+sv.photos.map(function(p){ return '<img loading="lazy" src="/photo/'+encodeURIComponent(p)+'" onclick="photoView(this.src)">'; }).join('')+'</div>'; }
  s += '<div class="sect">Дата</div>';
  var dates = Object.keys(D.slots).sort();
  if (!dates.length) { s += '<div class="empty">Свободных окошек пока нет 😔<br>Загляни позже или напиши мастеру</div>'; }
  else {
    s += '<div class="dates">';
    for (var i=0;i<dates.length;i++){
      var f = fmtDateLabel(dates[i]);
      s += '<div class="dchip'+(sel.date===dates[i]?' active':'')+'" onclick="pickDate(\''+dates[i]+'\')"><div class="wd">'+f.wd+'</div><div class="dd">'+f.dd+'</div><div class="wd">'+f.mo+'</div></div>';
    }
    s += '</div>';
  }
  if (sel.date && D.slots[sel.date]) {
    s += '<div class="sect">Время</div><div class="times">';
    var arr = D.slots[sel.date];
    for (var j=0;j<arr.length;j++){
      s += '<div class="tchip'+(sel.slotId===arr[j].id?' active':'')+'" onclick="pickSlot('+arr[j].id+',\''+arr[j].time+'\')">'+arr[j].time+'</div>';
    }
    s += '</div>';
  }
  if (sel.slotId) {
    s += '<div class="sect">Как к тебе обращаться?</div>';
    s += '<input class="inp" id="inName" placeholder="Имя" value="'+h(form.name)+'" oninput="form.name=this.value;updCta()">';
    s += '<input class="inp" id="inPhone" placeholder="Телефон (по желанию)" value="'+h(form.phone)+'" oninput="form.phone=this.value;updCta()">';
    if (promo) {
      s += '<div class="card" style="display:flex;justify-content:space-between;align-items:center"><span>🎁 <b>'+h(promo.code)+'</b> · скидка '+(promo.kind==='percent'?promo.value+'%':promo.value+'₽')+'</span><span style="cursor:pointer;opacity:.6;padding:4px 8px" onclick="promo=null;render()">✕</span></div>';
    } else {
      s += '<div style="display:flex;gap:8px;align-items:stretch"><input class="inp" id="inPromo" placeholder="Промокод (если есть)" value="'+h(form.promo)+'" style="flex:1" oninput="form.promo=this.value"><button class="abtn" style="padding:0 18px" onclick="applyPromo()">ОК</button></div>';
    }
    if (!D.user.birthday) {
      s += '<input class="inp" id="inBday" placeholder="🎂 День рождения ДД.ММ — в ДР будет скидка!" value="'+h(form.bday)+'" oninput="form.bday=this.value">';
    }
  }
  s += '<div style="height:76px"></div>';
  return s;
}

function viewDone(){
  var b = window._done;
  var f = fmtDateLabel(b.date);
  return '<div class="ok-screen"><div class="chk">🎉</div>' +
    '<h2 style="font-size:22px">Ты записана!</h2>' +
    '<p style="color:var(--muted);margin-top:10px;font-size:15px">'+f.dd+' '+f.mo+' в '+b.time+'<br>'+h(b.service_name)+' · '+(b.discount?'<s>'+b.old_price+'₽</s> ':'')+b.price+'₽'+(b.discount?' (скидка −'+b.discount+'₽)':'')+'</p>' +
    '<p style="color:var(--muted);margin-top:14px;font-size:13px">Дарина подтвердит запись 💌<br>📍 г. Бердск, ул. Вокзальная, 2</p>' +
    '<a class="linkbtn" style="margin-top:22px" href="https://yandex.ru/maps/?text=%D0%B3.%20%D0%91%D0%B5%D1%80%D0%B4%D1%81%D0%BA%2C%20%D1%83%D0%BB.%20%D0%92%D0%BE%D0%BA%D0%B7%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F%2C%202" target="_blank" rel="noopener">🧭 Как добраться</a>' +
    '<a class="linkbtn" href="#" onclick="go(\'my\');return false;">📅 Мои записи</a>' +
    '<a class="linkbtn" href="#" onclick="go(\'home\');return false;">💅 К услугам</a></div>';
}

function renderCta(){
  var c = $('cta');
  if (view==='book' && sel.slotId) {
    c.innerHTML = '<button id="ctaBtn" onclick="submitBook()">✨ Записаться · '+(promo?'<s style="opacity:.6">'+sel.svc.price+'₽</s> ':'')+curPrice()+'₽</button>';
    updCta();
  } else c.innerHTML = '';
}
function curPrice(){
  if (!sel.svc) return 0;
  if (promo) {
    var d = promo.kind==='percent' ? Math.round(sel.svc.price*promo.value/100) : promo.value;
    return Math.max(0, sel.svc.price - d);
  }
  return sel.svc.price;
}
function applyPromo(){
  var code = form.promo.trim();
  if (!code) { toast('Введи промокод 🙈'); return; }
  apiPost('/api/promo/check', { code: code }).then(function(d){
    if (d.ok) { promo = { code: code.toUpperCase(), kind: d.kind, value: d.value }; haptic('medium'); toast('🎁 Промокод применён!'); render(); }
    else toast(d.error || 'Не подошёл 😔');
  });
}
function validPhone(p){ return /^[+]?[\d\s\-()]{10,18}$/.test(String(p||'').trim()); }
function updCta(){
  var b = $('ctaBtn');
  if (b) b.disabled = sending || form.name.trim().length < 1;
}
function go(v){ haptic(); view=v; render(); }
function openSvc(id){
  haptic();
  for (var i=0;i<D.services.length;i++) if (D.services[i].id===id) sel.svc = D.services[i];
  sel.date=null; sel.slotId=null; sel.time=null;
  view='book'; render();
}
function pickDate(d){ haptic(); sel.date=d; sel.slotId=null; sel.time=null; render(); }
function pickSlot(id, t){ haptic('medium'); sel.slotId=id; sel.time=t; render(); setTimeout(function(){ window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'}); }, 80); }

function submitBook(){
  if (sending) return;
  if (form.name.trim().length < 1) { toast('Напиши имя 🙈'); return; }
  if (form.phone.trim() && !validPhone(form.phone)) { toast('Похоже, в телефоне опечатка 🙈'); return; }
  if (form.bday.trim() && !/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/.test(form.bday.trim())) { toast('День рождения: ДД.ММ, напр. 15.03 🙈'); return; }
  sending = true; updCta();
  haptic('heavy');
  var headers = { 'content-type':'application/json' };
  if (tg && tg.initData) headers['X-Tg-Init-Data'] = tg.initData;
  fetch('__API__/api/book', {
    method:'POST', headers: headers,
    body: JSON.stringify({ slot_id: sel.slotId, service_id: sel.svc.id, name: form.name.trim(), phone: form.phone.trim(), promo_code: promo ? promo.code : '', birthday: form.bday.trim() })
  }).then(function(r){ return r.json().then(function(j){ return { status:r.status, j:j }; }); })
    .then(function(res){
      sending = false;
      if (res.j.ok) {
        try { if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); } catch(e){}
        promo = null;
        window._done = res.j.booking;
        view='done';
        refreshData(false);
        render();
      } else {
        try { if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error'); } catch(e){}
        toast(res.j.error || 'Что-то пошло не так 😔');
        refreshData(true);
      }
    })
    .catch(function(){ sending=false; updCta(); toast('Нет связи, попробуй ещё раз 😔'); });
}

function cancelBk(id){
  if (!confirm('Отменить запись?')) return;
  haptic('medium');
  var headers = { 'content-type':'application/json' };
  if (tg && tg.initData) headers['X-Tg-Init-Data'] = tg.initData;
  fetch('__API__/api/cancel', { method:'POST', headers:headers, body: JSON.stringify({ id:id }) })
    .then(function(r){ return r.json(); })
    .then(function(j){
      if (j.ok) { toast('Запись отменена'); refreshData(true); }
      else toast(j.error || 'Не получилось 😔');
    });
}

function refreshData(rerender){
  var headers = {};
  if (tg && tg.initData) headers['X-Tg-Init-Data'] = tg.initData;
  fetch('__API__/api/data', { headers:headers }).then(function(r){ return r.json(); }).then(function(d){
    if (d.ok) { D = d; if (rerender) render(); }
  });
}

// ─────────── АДМИНКА (только для мастера) ───────────
function admHead(title){
  return '<span class="back" onclick="goAdmin()">← Админка</span><div class="sect" style="margin-top:6px">'+title+'</div>';
}
function viewAdmin(){
  var st = AD.stats;
  var s = '<span class="back" onclick="go(\'home\')">← В приложение</span>';
  s += '<div class="logo"><div class="ring">👑</div><h1>АДМИНКА</h1><p>привет, босс 🤍</p></div>';
  s += '<div class="statgrid">';
  s += '<div class="stat"><b>'+st.upcoming+'</b><span>предстоящих</span></div>';
  s += '<div class="stat"><b>'+st.pending+'</b><span>ждут ответа</span></div>';
  s += '<div class="stat"><b>'+st.free_slots+'</b><span>окошек</span></div>';
  s += '<div class="stat"><b>'+st.revenue+'₽</b><span>выручка</span></div>';
  s += '</div>';
  s += '<div class="card menurow" onclick="go(\'adm_bk\')">📋 Записи'+(st.pending?'<span class="badge">'+st.pending+'</span>':'<span style="color:var(--muted)">→</span>')+'</div>';
  s += '<div class="card menurow" onclick="go(\'adm_sl\')">🗓 Окошки<span style="color:var(--muted)">→</span></div>';
  s += '<div class="card menurow" onclick="go(\'adm_sv\')">💅 Услуги<span style="color:var(--muted)">→</span></div>';
  s += '<div class="card menurow" onclick="go(\'adm_tx\')">✏️ Тексты<span style="color:var(--muted)">→</span></div>';
  s += '<div class="card menurow" onclick="go(\'adm_bc\')">📣 Рассылка<span style="color:var(--muted)">→</span></div>';
  s += '<div class="card menurow" onclick="go(\'adm_rv\')">⭐ Отзывы'+(st.new_reviews?'<span class="badge">'+st.new_reviews+'</span>':'<span style="color:var(--muted)">→</span>')+'</div>';
  s += '<div class="card menurow" onclick="go(\'adm_pm\')">🎁 Промокоды<span style="color:var(--muted)">→</span></div>';
  s += '<div class="card menurow" onclick="go(\'adm_st\')">⚙️ Настройки<span style="color:var(--muted)">→</span></div>';
  if (st.months && st.months.length) {
    var mx = 1;
    for (var mi=0;mi<st.months.length;mi++) mx = Math.max(mx, st.months[mi].total);
    s += '<div class="sect">Выручка по месяцам</div><div class="card">';
    for (var mi2=0;mi2<st.months.length;mi2++){
      var mo = st.months[mi2];
      var pct = Math.max(4, Math.round(mo.total/mx*100));
      s += '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">'+monthLabel(mo.ym)+' · '+mo.cnt+' зап.</span><b>'+mo.total+'₽</b></div><div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;margin-top:5px"><div style="height:6px;width:'+pct+'%;background:var(--accent);border-radius:3px"></div></div></div>';
    }
    s += '</div>';
  }
  if (st.topServices && st.topServices.length) {
    s += '<div class="sect">Топ услуг</div><div class="card">';
    for (var ti=0;ti<st.topServices.length;ti++){
      var ts = st.topServices[ti];
      s += '<div style="display:flex;justify-content:space-between;font-size:14px;margin:7px 0"><span>'+(ti+1)+'. '+h(ts.service_name)+'</span><b>'+ts.cnt+'</b></div>';
    }
    s += '</div>';
  }
  if (st.returning) s += '<div style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px">🔁 постоянных клиентов: <b style="color:var(--accent)">'+st.returning+'</b> (2+ визита)</div>';
  return s;
}
function monthLabel(ym){
  var M = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  var p = String(ym).split('-');
  return (M[+p[1]-1] || ym) + ' ' + p[0];
}

function viewAdminBk(){
  var s = admHead('Записи · '+AD.bookings.length);
  if (!AD.bookings.length) s += '<div class="empty">Записей нет 🤍</div>';
  for (var i=0;i<AD.bookings.length;i++){
    var b = AD.bookings[i]; var f = fmtDateLabel(b.date);
    var st = b.status==='confirmed' ? '<span class="st c">✅ подтверждена</span>' : '<span class="st p">⏳ ждёт</span>';
    s += '<div class="card"><div class="bk"><div><b>'+f.dd+' '+f.mo+' · '+b.time+'</b></div>'+st+'</div>';
    s += '<div style="color:var(--muted);font-size:13px;margin-top:6px">💅 '+h(b.service_name)+' · '+b.price+'₽</div>';
    s += '<div style="color:var(--muted);font-size:13px;margin-top:3px">👤 '+h(b.client_name)+(b.client_username?' · @'+h(b.client_username):'')+(b.client_phone?' · '+h(b.client_phone):' · без телефона')+'</div>';
    s += '<div style="display:flex;gap:8px;margin-top:10px">';
    if (b.status==='pending') s += '<button class="abtn ok" style="flex:1" onclick="admBk('+b.id+',\'confirm\')">✅ Подтвердить</button>';
    s += '<button class="abtn no" style="flex:1" onclick="admBk('+b.id+',\'cancel\')">'+(b.status==='pending'?'❌ Отклонить':'❌ Отменить')+'</button>';
    if (b.client_username) s += '<button class="abtn" onclick="window.open(\'https://t.me/'+h(b.client_username)+'\')">💬</button>';
    s += '</div></div>';
  }
  return s;
}
function admBk(id, action){
  haptic('medium');
  apiPost('/api/admin/booking', { id:id, action:action }).then(function(d){
    if (d.ok) { toast(action==='confirm'?'✅ Подтверждено':'❌ Отменено, окошко свободно'); refreshAdmin(); refreshData(false); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminSl(){
  var s = admHead('Окошки');
  s += '<div style="display:flex;gap:8px;margin-top:8px">';
  s += '<button class="abtn ok" style="flex:1" onclick="go(\'adm_sl_add\')">➕ Добавить</button>';
  s += '<button class="abtn no" style="flex:1" onclick="admSlotsClear()">🧨 Удалить все</button>';
  s += '</div>';
  s += '<button class="abtn" style="width:100%;margin-top:8px" onclick="go(\'adm_sl_gen\')">⚡ Генератор окошек</button>';
  if (!AD.slots.length) s += '<div class="empty">Окошек нет — добавь первое 👆</div>';
  var byDate = {};
  for (var i=0;i<AD.slots.length;i++){ var sl = AD.slots[i]; (byDate[sl.date]=byDate[sl.date]||[]).push(sl); }
  var dates = Object.keys(byDate).sort();
  for (var di=0;di<dates.length;di++){
    var f = fmtDateLabel(dates[di]);
    s += '<div class="sect">'+f.wd+', '+f.dd+' '+f.mo+'</div><div class="times">';
    var arr = byDate[dates[di]];
    for (var j=0;j<arr.length;j++){
      var sl2 = arr[j];
      if (sl2.status==='free') {
        s += '<div class="tchip" onclick="admSlotDel('+sl2.id+',\''+sl2.time+'\')">🟢 '+sl2.time+'</div>';
      } else {
        var info = sl2.time+' · '+(sl2.client_name||'занято')+(sl2.client_username?' @'+sl2.client_username:'')+(sl2.client_phone?' · '+sl2.client_phone:'');
        s += '<div class="tchip busy" data-info="'+h(info)+'" onclick="toast(this.getAttribute(\'data-info\'))">🔴 '+sl2.time+'</div>';
      }
    }
    s += '</div>';
  }
  s += '<div style="color:var(--muted);font-size:12px;margin-top:10px;text-align:center">🟢 тап = удалить · 🔴 занято (тап = кто записан)</div>';
  return s;
}
function admSlotDel(id, time){
  if (!confirm('Удалить окошко '+time+'?')) return;
  haptic('medium');
  apiPost('/api/admin/slot/del', { id:id }).then(function(d){
    if (d.ok) { toast('🗑 Окошко удалено'); refreshAdmin(); refreshData(false); }
    else toast(d.error==='slot_busy'?'Нельзя удалить занятое окошко 🙈':(d.error||'Ошибка 😔'));
  });
}
function admSlotsClear(){
  if (!confirm('Удалить ВСЕ свободные окошки? Занятые не пострадают.')) return;
  haptic('heavy');
  apiPost('/api/admin/slots/clear', {}).then(function(d){
    if (d.ok) { toast('🧨 Удалено окошек: '+d.deleted); refreshAdmin(); refreshData(false); }
    else toast(d.error || 'Ошибка 😔');
  });
}
function addDaysStr(ds, n){
  var p = ds.split('-'); var dt = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]+n));
  var mm = dt.getUTCMonth()+1, dd = dt.getUTCDate();
  return dt.getUTCFullYear()+'-'+(mm<10?'0':'')+mm+'-'+(dd<10?'0':'')+dd;
}
function viewAdminSlAdd(){
  var s = admHead('Добавить окошко');
  s += '<div class="sect">Дата</div><div class="dates">';
  for (var i=0;i<14;i++){
    var d = addDaysStr(AD.today, i); var f = fmtDateLabel(d);
    s += '<div class="dchip'+(admSlotDate===d?' active':'')+'" onclick="admSlotDate=\''+d+'\';render();"><div class="wd">'+f.wd+'</div><div class="dd">'+f.dd+'</div><div class="wd">'+f.mo+'</div></div>';
  }
  s += '</div>';
  if (admSlotDate) {
    s += '<div class="sect">Время (можно несколько подряд)</div><div class="times">';
    var presets = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
    for (var j=0;j<presets.length;j++) s += '<div class="tchip" onclick="admSlotAdd(\''+presets[j]+'\')">'+presets[j]+'</div>';
    s += '</div>';
    s += '<input class="inp" id="admTime" placeholder="Своё время, напр. 14:30">';
    s += '<button class="abtn ok" style="width:100%;margin-top:10px" onclick="admSlotAdd($(\'admTime\').value)">➕ Добавить своё время</button>';
  }
  return s;
}
function admSlotAdd(time){
  time = String(time||'').trim();
  if (!/^\d{1,2}:\d{2}$/.test(time)) { toast('Формат времени ЧЧ:ММ 🙈'); return; }
  haptic('medium');
  apiPost('/api/admin/slot/add', { date:admSlotDate, time:time }).then(function(d){
    if (d.ok) { toast('✅ Окошко '+time+' добавлено'); refreshAdmin(); refreshData(false); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminSlGen(){
  var s = admHead('Генератор окошек');
  s += '<div style="color:var(--muted);font-size:13px;line-height:1.5;margin:2px 0 4px">Выбери дни недели и время — окошки создадутся на 4 недели вперёд. Уже существующие не дублируются ✨</div>';
  s += '<div class="sect">Дни недели</div><div class="wdgrid">';
  var wd = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  var wdNum = [1,2,3,4,5,6,0];
  for (var i=0;i<7;i++){
    var on = genDays.indexOf(wdNum[i]) >= 0;
    s += '<div class="wdchip'+(on?' active':'')+'" onclick="genToggleDay('+wdNum[i]+')">'+wd[i]+'</div>';
  }
  s += '</div>';
  s += '<div class="sect">Время</div><div class="times">';
  var presets = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  for (var j=0;j<presets.length;j++){
    var t = presets[j]; var on2 = !!genTimes[t];
    s += '<div class="tchip'+(on2?' active':'')+'" onclick="genToggleTime(\''+t+'\')">'+t+'</div>';
  }
  s += '</div>';
  var cnt = genDays.length * Object.keys(genTimes).length * 4;
  s += '<button class="abtn ok" style="width:100%;margin-top:14px" onclick="admSlotsGen()">⚡ Создать'+(cnt?(' (до '+cnt+' окошек)'):'')+'</button>';
  return s;
}
function genToggleDay(d){ haptic(); var i = genDays.indexOf(d); if (i>=0) genDays.splice(i,1); else genDays.push(d); render(); }
function genToggleTime(t){ haptic(); if (genTimes[t]) delete genTimes[t]; else genTimes[t]=1; render(); }
function admSlotsGen(){
  if (!genDays.length) { toast('Выбери дни недели 🙈'); return; }
  var times = Object.keys(genTimes);
  if (!times.length) { toast('Выбери время 🙈'); return; }
  haptic('medium');
  apiPost('/api/admin/slots/gen', { days: genDays, times: times }).then(function(d){
    if (d.ok) { toast('⚡ Создано окошек: '+d.added); genTimes = {}; refreshAdmin(); refreshData(false); go('adm_sl'); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminRv(){
  var s = admHead('Отзывы');
  if (!AD.reviews || !AD.reviews.length) s += '<div class="empty">Отзывов пока нет 🤍</div>';
  for (var i=0;i<(AD.reviews||[]).length;i++){
    var r = AD.reviews[i];
    s += '<div class="rev"'+(r.visible?'':' style="opacity:.45"')+'>';
    s += '<div class="rh"><span class="rn">'+h(r.name)+(r.username?' <a style="color:var(--accent)" href="https://t.me/'+h(r.username)+'" target="_blank" rel="noopener">@'+h(r.username)+'</a>':'')+'</span><span class="rs">'+starsStr(r.rating)+'</span></div>';
    if (r.text) s += '<div class="rt">'+h(r.text)+'</div>';
    s += '<div style="display:flex;gap:8px;margin-top:10px">';
    s += '<button class="abtn" style="flex:1;padding:9px 0;font-size:13px" onclick="admReview('+r.id+',\''+(r.visible?'hide':'show')+'\')">'+(r.visible?'🙈 Скрыть':'👁 Показать')+'</button>';
    s += '<button class="abtn no" style="flex:1;padding:9px 0;font-size:13px" onclick="admReview('+r.id+',\'del\')">🗑</button>';
    s += '</div></div>';
  }
  return s;
}
function admReview(id, action){
  if (action==='del' && !confirm('Удалить отзыв навсегда?')) return;
  haptic();
  apiPost('/api/admin/review', { id:id, action:action }).then(function(d){
    if (d.ok) { toast(action==='del'?'🗑 Удалён':'Готово ✨'); refreshAdmin(); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminPm(){
  var s = admHead('Промокоды');
  s += '<div class="card">';
  s += '<input class="inp" id="pmCode" placeholder="Код, напр. PODRUGA10" style="margin-top:0">';
  s += '<div class="times" style="margin-top:10px">';
  s += '<div class="tchip'+(pmKind==='percent'?' active':'')+'" onclick="pmKind=\'percent\';render()">% проценты</div>';
  s += '<div class="tchip'+(pmKind==='fixed'?' active':'')+'" onclick="pmKind=\'fixed\';render()">₽ рубли</div>';
  s += '</div>';
  s += '<input class="inp" id="pmVal" inputmode="numeric" placeholder="'+(pmKind==='percent'?'Скидка % (1–90)':'Скидка в ₽')+'">';
  s += '<button class="abtn ok" style="width:100%" onclick="admPromoAdd()">➕ Создать промокод</button>';
  s += '</div>';
  if (!AD.promos || !AD.promos.length) s += '<div class="empty">Промокодов нет 🤍</div>';
  for (var i=0;i<(AD.promos||[]).length;i++){
    var p = AD.promos[i];
    s += '<div class="card"'+(p.active?'':' style="opacity:.45"')+'><div class="bk"><div><b>'+h(p.code)+'</b><div class="ds" style="color:var(--muted);font-size:13px;margin-top:4px">скидка −'+(p.kind==='percent'?p.value+'%':p.value+'₽')+' · использован '+p.uses+'×</div></div></div>';
    s += '<div style="display:flex;gap:8px;margin-top:10px">';
    s += '<button class="abtn" style="flex:1;padding:9px 0;font-size:13px" onclick="admPromo('+p.id+',\''+(p.active?'off':'on')+'\')">'+(p.active?'💤 Выкл':'✨ Вкл')+'</button>';
    s += '<button class="abtn no" style="flex:1;padding:9px 0;font-size:13px" onclick="admPromo('+p.id+',\'del\')">🗑</button>';
    s += '</div></div>';
  }
  return s;
}
function admPromoAdd(){
  var code = ($('pmCode')?$('pmCode').value:'').trim();
  var value = parseInt(($('pmVal')?$('pmVal').value:''), 10) || 0;
  if (code.length < 3) { toast('Код от 3 символов 🙈'); return; }
  if (!value) { toast('Укажи скидку 🙈'); return; }
  haptic('medium');
  apiPost('/api/admin/promo', { action:'add', code:code, kind:pmKind, value:value }).then(function(d){
    if (d.ok) { toast('🎁 Промокод создан'); refreshAdmin(); }
    else toast(d.error || 'Ошибка 😔');
  });
}
function admPromo(id, action){
  if (action==='del' && !confirm('Удалить промокод?')) return;
  haptic();
  apiPost('/api/admin/promo', { id:id, action:action }).then(function(d){
    if (d.ok) { toast(action==='del'?'🗑 Удалён':'Готово ✨'); refreshAdmin(); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminSt(){
  var st = AD.settings || { rebook_days:'21', bday_discount:'10' };
  var s = admHead('Настройки');
  s += '<div class="card"><b style="font-size:14px">🔁 Приглашение на повторный визит</b>';
  s += '<div style="color:var(--muted);font-size:13px;margin:6px 0 10px;line-height:1.5">Через сколько дней после визита бот предложит клиенту записаться снова (7–60)</div>';
  s += '<div style="display:flex;gap:8px"><input class="inp" id="stRebook" inputmode="numeric" style="flex:1;margin-top:0" value="'+h(st.rebook_days)+'"><button class="abtn ok" style="padding:0 18px" onclick="admSettingSave(\'rebook_days\', $(\'stRebook\').value)">💾</button></div></div>';
  s += '<div class="card"><b style="font-size:14px">🎂 Скидка в день рождения</b>';
  s += '<div style="color:var(--muted);font-size:13px;margin:6px 0 10px;line-height:1.5">Процент скидки при записи в ДР (0 — выкл, макс 50). Утром в ДР клиенту приходит поздравление</div>';
  s += '<div style="display:flex;gap:8px"><input class="inp" id="stBday" inputmode="numeric" style="flex:1;margin-top:0" value="'+h(st.bday_discount)+'"><button class="abtn ok" style="padding:0 18px" onclick="admSettingSave(\'bday_discount\', $(\'stBday\').value)">💾</button></div></div>';
  return s;
}
function admSettingSave(key, value){
  haptic();
  apiPost('/api/admin/settings', { key:key, value:value }).then(function(d){
    if (d.ok) { toast('💾 Сохранено'); refreshAdmin(); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminSv(){
  var s = admHead('Услуги');
  s += '<button class="abtn ok" style="width:100%;margin:10px 0 2px" onclick="editSvc=null;go(\'adm_sv_edit\')">➕ Добавить услугу</button>';
  if (!AD.services.length) s += '<div class="empty">Пусто 🤍</div>';
  for (var i=0;i<AD.services.length;i++){
    var sv = AD.services[i];
    s += '<div class="card svc" onclick="admSvEdit('+sv.id+')"><div><div class="nm">'+h(sv.name)+(sv.active?'':' 💤')+'</div><div class="dur">⏱ '+sv.duration_min+' мин</div></div><div class="pr"><b>'+sv.price+'₽</b><br><span class="go">Править</span></div></div>';
  }
  return s;
}
function admSvEdit(id){
  for (var i=0;i<AD.services.length;i++) if (AD.services[i].id===id) editSvc = AD.services[i];
  go('adm_sv_edit');
}
function gv(id){ var e = $(id); return e ? e.value.trim() : ''; }
function viewAdminSvEdit(){
  var e = editSvc || { name:'', price:'', duration_min:120, description:'', active:1 };
  var s = admHead(editSvc ? 'Редактировать услугу' : 'Новая услуга');
  s += '<input class="inp" id="svName" placeholder="Название" value="'+h(e.name)+'">';
  s += '<input class="inp" id="svPrice" placeholder="Цена, ₽" inputmode="numeric" value="'+h(String(e.price))+'">';
  s += '<input class="inp" id="svDur" placeholder="Длительность, мин" inputmode="numeric" value="'+h(String(e.duration_min))+'">';
  s += '<textarea class="inp" id="svDesc" rows="3" placeholder="Описание">'+h(e.description)+'</textarea>';
  s += '<label class="chkrow"><input type="checkbox" id="svActive"'+(e.active?' checked':'')+'> Показывать клиентам</label>';
  s += '<button class="abtn ok" style="width:100%;margin-top:14px" onclick="admSvSave()">💾 Сохранить</button>';
  if (editSvc) s += '<button class="abtn no" style="width:100%;margin-top:8px" onclick="admSvDel()">🗑 Удалить услугу</button>';
  return s;
}
function admSvSave(){
  var body = { name:gv('svName'), price:gv('svPrice'), duration_min:gv('svDur'), description:gv('svDesc'), active: $('svActive').checked ? 1 : 0 };
  if (editSvc) body.id = editSvc.id;
  haptic('medium');
  apiPost('/api/admin/service/save', body).then(function(d){
    if (d.ok) { toast('💾 Сохранено'); editSvc=null; refreshAdmin(); refreshData(false); go('adm_sv'); }
    else toast(d.error || 'Ошибка 😔');
  });
}
function admSvDel(){
  if (!editSvc || !confirm('Удалить услугу «'+editSvc.name+'»?')) return;
  haptic('heavy');
  apiPost('/api/admin/service/del', { id:editSvc.id }).then(function(d){
    if (d.ok) { toast('🗑 Удалено'); editSvc=null; refreshAdmin(); refreshData(false); go('adm_sv'); }
    else toast(d.error || 'Ошибка 😔');
  });
}

var TEXT_KEYS = [
  ['start_text','💬 Приветствие (/start)'],
  ['about_text','🤍 О мастере'],
  ['contacts_text','📍 Контакты'],
  ['promo_text','🔥 Акция (пусто = скрыта)'],
  ['portfolio_url','🖼 Ссылка на портфолио'],
  ['master_link','💬 Ссылка «Написать мастеру»']
];
function viewAdminTx(){
  var s = admHead('Тексты');
  for (var i=0;i<TEXT_KEYS.length;i++)
    s += '<div class="card menurow" onclick="editTextKey=\''+TEXT_KEYS[i][0]+'\';go(\'adm_tx_edit\')">'+TEXT_KEYS[i][1]+'<span style="color:var(--muted)">✏️</span></div>';
  return s;
}
function viewAdminTxEdit(){
  var label = editTextKey;
  for (var i=0;i<TEXT_KEYS.length;i++) if (TEXT_KEYS[i][0]===editTextKey) label = TEXT_KEYS[i][1];
  var s = admHead(label);
  s += '<textarea class="inp" id="txVal" rows="7">'+h(AD.texts[editTextKey]||'')+'</textarea>';
  s += '<div style="color:var(--muted);font-size:12px;margin-top:6px">Можно HTML-теги: &lt;b&gt; &lt;i&gt; &lt;code&gt;. Акция: пусто = скрыта.</div>';
  s += '<button class="abtn ok" style="width:100%;margin-top:12px" onclick="admTxSave()">💾 Сохранить</button>';
  return s;
}
function admTxSave(){
  apiPost('/api/admin/text', { key:editTextKey, value: $('txVal').value }).then(function(d){
    if (d.ok) { toast('💾 Сохранено'); refreshAdmin(); refreshData(false); go('adm_tx'); }
    else toast(d.error || 'Ошибка 😔');
  });
}

function viewAdminBc(){
  var s = admHead('Рассылка · клиентов: '+AD.stats.users);
  s += '<textarea class="inp" id="bcText" rows="6" placeholder="Текст сообщения всем клиентам... (можно HTML: <b>, <i>)"></textarea>';
  s += '<button class="abtn ok" style="width:100%;margin-top:12px" onclick="admBcSend(this)">🚀 Отправить всем</button>';
  s += '<div id="bcRes" style="margin-top:12px;color:var(--muted);font-size:13.5px;text-align:center"></div>';
  return s;
}
function admBcSend(btnEl){
  var t = gv('bcText');
  if (!t) { toast('Напиши текст 🙈'); return; }
  if (!confirm('Отправить ВСЕМ клиентам?')) return;
  btnEl.disabled = true; btnEl.textContent = '⏳ Рассылаю...';
  haptic('heavy');
  apiPost('/api/admin/broadcast', { text:t }).then(function(d){
    btnEl.disabled = false; btnEl.textContent = '🚀 Отправить всем';
    if (d.ok) { $('bcRes').textContent = '✅ Доставлено: '+d.delivered+(d.failed?' · ❌ не доставлено: '+d.failed:''); toast('📣 Готово!'); }
    else toast(d.error || 'Ошибка 😔');
  });
}

init();
</script>
</body>
</html>`;

// ─────────── TELEGRAM WEBAPP SCRIPT (встроен, чтобы не зависеть от telegram.org) ───────────
const TG_SCRIPT = String.raw`// WebView
(function () {
  var eventHandlers = {};

  var locationHash = '';
  try {
    locationHash = location.hash.toString();
  } catch (e) {}

  var initParams = urlParseHashParams(locationHash);

  var isIframe = false, iFrameStyle;
  try {
    isIframe = (window.parent != null && window != window.parent);
    if (isIframe) {
      window.addEventListener('message', function (event) {
        if (event.source !== window.parent) return;
        try {
          var dataParsed = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (!dataParsed || !dataParsed.eventType) {
          return;
        }
        if (dataParsed.eventType == 'set_custom_style') {
          iFrameStyle.innerHTML = dataParsed.eventData;
        } else {
          receiveEvent(dataParsed.eventType, dataParsed.eventData);
        }
      });
      iFrameStyle = document.createElement('style');
      document.head.appendChild(iFrameStyle);
      try {
        window.parent.postMessage(JSON.stringify({eventType: 'iframe_ready'}), '*');
      } catch (e) {}
    }
  } catch (e) {}

  function urlSafeDecode(urlencoded) {
    try {
      urlencoded = urlencoded.replace(/\+/g, '%20');
      return decodeURIComponent(urlencoded);
    } catch (e) {
      return urlencoded;
    }
  }

  function urlParseHashParams(locationHash) {
    locationHash = locationHash.replace(/^#/, '');
    var params = {};
    if (!locationHash.length) {
      return params;
    }
    if (locationHash.indexOf('=') < 0 && locationHash.indexOf('?') < 0) {
      params._path = urlSafeDecode(locationHash);
      return params;
    }
    var qIndex = locationHash.indexOf('?');
    if (qIndex >= 0) {
      var pathParam = locationHash.substr(0, qIndex);
      params._path = urlSafeDecode(pathParam);
      locationHash = locationHash.substr(qIndex + 1);
    }
    var query_params = urlParseQueryString(locationHash);
    for (var k in query_params) {
      params[k] = query_params[k];
    }
    return params;
  }

  function urlParseQueryString(queryString) {
    var params = {};
    if (!queryString.length) {
      return params;
    }
    var queryStringParams = queryString.split('&');
    var i, param, paramName, paramValue;
    for (i = 0; i < queryStringParams.length; i++) {
      param = queryStringParams[i].split('=');
      paramName = urlSafeDecode(param[0]);
      paramValue = param[1] == null ? null : urlSafeDecode(param[1]);
      params[paramName] = paramValue;
    }
    return params;
  }

  // Telegram apps will implement this logic to add service params (e.g. tgShareScoreUrl) to game URL
  function urlAppendHashParams(url, addHash) {
    // url looks like 'https://game.com/path?query=1#hash'
    // addHash looks like 'tgShareScoreUrl=' + encodeURIComponent('tgb://share_game_score?hash=very_long_hash123')

    var ind = url.indexOf('#');
    if (ind < 0) {
      // https://game.com/path -> https://game.com/path#tgShareScoreUrl=etc
      return url + '#' + addHash;
    }
    var curHash = url.substr(ind + 1);
    if (curHash.indexOf('=') >= 0 || curHash.indexOf('?') >= 0) {
      // https://game.com/#hash=1 -> https://game.com/#hash=1&tgShareScoreUrl=etc
      // https://game.com/#path?query -> https://game.com/#path?query&tgShareScoreUrl=etc
      return url + '&' + addHash;
    }
    // https://game.com/#hash -> https://game.com/#hash?tgShareScoreUrl=etc
    if (curHash.length > 0) {
      return url + '?' + addHash;
    }
    // https://game.com/# -> https://game.com/#tgShareScoreUrl=etc
    return url + addHash;
  }

  function postEvent(eventType, callback, eventData) {
    if (!callback) {
      callback = function () {};
    }
    if (eventData === undefined) {
      eventData = '';
    }

    if (window.TelegramWebviewProxy !== undefined) {
      TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
      callback();
    }
    else if (window.external && 'notify' in window.external) {
      window.external.notify(JSON.stringify({eventType: eventType, eventData: eventData}));
      callback();
    }
    else if (isIframe) {
      try {
        var trustedTarget = 'https://web.telegram.org';
        // For now we don't restrict target, for testing purposes
        trustedTarget = '*';
        window.parent.postMessage(JSON.stringify({eventType: eventType, eventData: eventData}), trustedTarget);
        if (initParams.tgWebAppDebug) {
          console.log('[Telegram.WebView] postEvent via postMessage', eventType, eventData);
        }
        callback();
      } catch (e) {
        callback(e);
      }
    }
    else {
      if (initParams.tgWebAppDebug) {
        console.log('[Telegram.WebView] postEvent', eventType, eventData);
      }
      callback({notAvailable: true});
    }
  };

  function receiveEvent(eventType, eventData) {
    callEventCallbacks(eventType, function(callback) {
      callback(eventType, eventData);
    });
  }

  function callEventCallbacks(eventType, func) {
    var curEventHandlers = eventHandlers[eventType];
    if (curEventHandlers === undefined ||
        !curEventHandlers.length) {
      return;
    }
    for (var i = 0; i < curEventHandlers.length; i++) {
      try {
        func(curEventHandlers[i]);
      } catch (e) {}
    }
  }

  function onEvent(eventType, callback) {
    if (eventHandlers[eventType] === undefined) {
      eventHandlers[eventType] = [];
    }
    var index = eventHandlers[eventType].indexOf(callback);
    if (index === -1) {
      eventHandlers[eventType].push(callback);
    }
  };

  function offEvent(eventType, callback) {
    if (eventHandlers[eventType] === undefined) {
      return;
    }
    var index = eventHandlers[eventType].indexOf(callback);
    if (index === -1) {
      return;
    }
    eventHandlers[eventType].splice(index, 1);
  };

  function openProtoUrl(url) {
    if (!url.match(/^(web\+)?tgb?:\/\/./)) {
      return false;
    }
    var useIframe = navigator.userAgent.match(/iOS|iPhone OS|iPhone|iPod|iPad/i) ? true : false;
    if (useIframe) {
      var iframeContEl = document.getElementById('tgme_frame_cont') || document.body;
      var iframeEl = document.createElement('iframe');
      iframeContEl.appendChild(iframeEl);
      var pageHidden = false;
      var enableHidden = function () {
        pageHidden = true;
      };
      window.addEventListener('pagehide', enableHidden, false);
      window.addEventListener('blur', enableHidden, false);
      if (iframeEl !== null) {
        iframeEl.src = url;
      }
      setTimeout(function() {
        if (!pageHidden) {
          window.location = url;
        }
        window.removeEventListener('pagehide', enableHidden, false);
        window.removeEventListener('blur', enableHidden, false);
      }, 2000);
    }
    else {
      window.location = url;
    }
    return true;
  }

  if (!window.Telegram) {
    window.Telegram = {};
  }
  window.Telegram.WebView = {
    initParams: initParams,
    onEvent: onEvent,
    offEvent: offEvent,
    postEvent: postEvent,
    receiveEvent: receiveEvent,
    callEventCallbacks: callEventCallbacks
  };

  window.Telegram.Utils = {
    urlSafeDecode: urlSafeDecode,
    urlParseQueryString: urlParseQueryString,
    urlParseHashParams: urlParseHashParams,
    urlAppendHashParams: urlAppendHashParams
  };

  // For Windows Phone app
  window.TelegramGameProxy_receiveEvent = receiveEvent;

  // App backward compatibility
  window.TelegramGameProxy = {
    receiveEvent: receiveEvent
  };
})();

// WebApp
(function () {
  var Utils = window.Telegram.Utils;
  var WebView = window.Telegram.WebView;
  var initParams = WebView.initParams;

  var WebApp = {};
  var webAppInitData = '', webAppInitDataUnsafe = {};
  var themeParams = {}, colorScheme = 'light';

  if (initParams.tgWebAppData && initParams.tgWebAppData.length) {
    webAppInitData = initParams.tgWebAppData;
    webAppInitDataUnsafe = Utils.urlParseQueryString(webAppInitData);
    for (var key in webAppInitDataUnsafe) {
      var val = webAppInitDataUnsafe[key];
      try {
        if (val.substr(0, 1) == '{' && val.substr(-1) == '}' ||
            val.substr(0, 1) == '[' && val.substr(-1) == ']') {
          webAppInitDataUnsafe[key] = JSON.parse(val);
        }
      } catch (e) {}
    }
  }
  if (initParams.tgWebAppThemeParams && initParams.tgWebAppThemeParams.length) {
    var themeParamsRaw = initParams.tgWebAppThemeParams;
    try {
      var theme_params = JSON.parse(themeParamsRaw);
      setThemeParams(theme_params);
    } catch (e) {}
  }

  function onThemeChanged(eventType, eventData) {
    if (eventData.theme_params) {
      setThemeParams(eventData.theme_params);
      window.Telegram.WebApp.MainButton.setParams({
        force_update: true
      });
      receiveWebViewEvent('themeChanged');
    }
  }

  var lastWindowHeight = window.innerHeight;
  function onViewportChanged(eventType, eventData) {
    if (eventData.height) {
      window.removeEventListener('resize', onWindowResize);
      setViewportHeight(eventData);
    }
  }

  function onWindowResize(e) {
    if (lastWindowHeight != window.innerHeight) {
      lastWindowHeight = window.innerHeight;
      receiveWebViewEvent('viewportChanged', {
        isStateStable: true
      });
    }
  }

  function receiveWebViewEvent(eventType) {
    var args = Array.prototype.slice.call(arguments);
    eventType = args.shift();
    WebView.callEventCallbacks('webview:' + eventType, function(callback) {
      callback.apply(WebApp, args);
    });
  }

  function onWebViewEvent(eventType, callback) {
    WebView.onEvent('webview:' + eventType, callback);
  };

  function offWebViewEvent(eventType, callback) {
    WebView.offEvent('webview:' + eventType, callback);
  };

  function setCssProperty(name, value) {
    var root = document.documentElement;
    if (root && root.style && root.style.setProperty) {
      root.style.setProperty('--tg-' + name, value);
    }
  }

  function setThemeParams(theme_params) {
    var color;
    for (var key in theme_params) {
      if (color = parseColorToHex(theme_params[key])) {
        themeParams[key] = color;
        if (key == 'bg_color') {
          colorScheme = isColorDark(color) ? 'dark' : 'light'
          setCssProperty('color-scheme', colorScheme);
        }
        key = 'theme-' + key.split('_').join('-');
        setCssProperty(key, color);
      }
    }
  }

  var viewportHeight = false, viewportStableHeight = false, isExpanded = true;
  function setViewportHeight(data) {
    if (typeof data !== 'undefined') {
      isExpanded = !!data.is_expanded;
      viewportHeight = data.height;
      if (data.is_state_stable) {
        viewportStableHeight = data.height;
      }
      receiveWebViewEvent('viewportChanged', {
        isStateStable: !!data.is_state_stable
      });
    }
    var height, stable_height;
    if (viewportHeight !== false) {
      height = (viewportHeight - mainButtonHeight) + 'px';
    } else {
      height = mainButtonHeight ? 'calc(100vh - ' + mainButtonHeight + 'px)' : '100vh';
    }
    if (viewportStableHeight !== false) {
      stable_height = (viewportStableHeight - mainButtonHeight) + 'px';
    } else {
      stable_height = mainButtonHeight ? 'calc(100vh - ' + mainButtonHeight + 'px)' : '100vh';
    }
    setCssProperty('viewport-height', height);
    setCssProperty('viewport-stable-height', stable_height);
  }


  function parseColorToHex(color) {
    color += '';
    var match;
    if (/^#([0-9a-f]){6}$/i.test(color)) {
      return color.toLowerCase();
    }
    else if (match = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)) {
      return ('#' + match[1] + match[1] + match[2] + match[2] + match[3] + match[3]).toLowerCase();
    }
    return false;
  }

  function isColorDark(rgb) {
    rgb = rgb.replace(/[\s#]/g, '');
    if (rgb.length == 3) {
      rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
    }
    var r = parseInt(rgb.substr(0, 2), 16);
    var g = parseInt(rgb.substr(2, 2), 16);
    var b = parseInt(rgb.substr(4, 2), 16);
    var hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp < 120;
  }

  function byteLength(str) {
    if (window.Blob) {
      try { return new Blob([str]).size; } catch (e) {}
    }
    var s = str.length;
    for (var i=str.length-1; i>=0; i--) {
      var code = str.charCodeAt(i);
      if (code > 0x7f && code <= 0x7ff) s++;
      else if (code > 0x7ff && code <= 0xffff) s+=2;
      if (code >= 0xdc00 && code <= 0xdfff) i--;
    }
    return s;
  }

  var mainButtonHeight = 0;
  var MainButton = (function() {
    var isVisible = false;
    var isActive = true;
    var isProgressVisible = false;
    var buttonText = 'CONTINUE';
    var buttonColor = false;
    var buttonTextColor = false;

    var mainButton = {};
    Object.defineProperty(mainButton, 'text', {
      set: function(val){ mainButton.setParams({text: val}); },
      get: function(){ return buttonText; },
      enumerable: true
    });
    Object.defineProperty(mainButton, 'color', {
      set: function(val){ mainButton.setParams({color: val}); },
      get: function(){ return buttonColor || themeParams.button_color || '#2481cc'; },
      enumerable: true
    });
    Object.defineProperty(mainButton, 'textColor', {
      set: function(val){ mainButton.setParams({text_color: val}); },
      get: function(){ return buttonTextColor || themeParams.button_text_color || '#ffffff'; },
      enumerable: true
    });
    Object.defineProperty(mainButton, 'isVisible', {
      set: function(val){ mainButton.setParams({is_visible: val}); },
      get: function(){ return isVisible; },
      enumerable: true
    });
    Object.defineProperty(mainButton, 'isProgressVisible', {
      get: function(){ return isProgressVisible; },
      enumerable: true
    });
    Object.defineProperty(mainButton, 'isActive', {
      set: function(val){ mainButton.setParams({is_active: val}); },
      get: function(){ return isActive; },
      enumerable: true
    });

    WebView.onEvent('main_button_pressed', onMainButtonPressed);

    var debugBtn = null, debugBtnStyle = {};
    if (initParams.tgWebAppDebug) {
      debugBtn = document.createElement('tg-main-button');
      debugBtnStyle = {
        font: '600 14px/18px sans-serif',
        display: 'none',
        width: '100%',
        height: '48px',
        borderRadius: '0',
        background: 'no-repeat right center',
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        margin: '0',
        padding: '15px 20px',
        textAlign: 'center',
        boxSizing: 'border-box',
        zIndex: '10000'
      };
      for (var k in debugBtnStyle) {
        debugBtn.style[k] = debugBtnStyle[k];
      }
      document.addEventListener('DOMContentLoaded', function onDomLoaded(event) {
        document.removeEventListener('DOMContentLoaded', onDomLoaded);
        document.body.appendChild(debugBtn);
        debugBtn.addEventListener('click', onMainButtonPressed, false);
      });
    }

    function onMainButtonPressed() {
      if (isActive) {
        receiveWebViewEvent('mainButtonClicked');
      }
    }

    function updateButton() {
      var color = mainButton.color;
      var text_color = mainButton.textColor;
      WebView.postEvent('web_app_setup_main_button', false, isVisible ? {
        is_visible: true,
        is_active: isActive,
        is_progress_visible: isProgressVisible,
        text: buttonText,
        color: color,
        text_color: text_color
      } : {is_visible: false});
      if (initParams.tgWebAppDebug) {
        debugBtn.style.display = isVisible ? 'block' : 'none';
        debugBtn.style.opacity = isActive ? '1' : '0.8';
        debugBtn.style.cursor = isActive ? 'pointer' : 'auto';
        debugBtn.disabled = !isActive;
        debugBtn.innerText = buttonText;
        debugBtn.style.backgroundImage = isProgressVisible ? "url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20viewport%3D%220%200%2048%2048%22%20width%3D%2248px%22%20height%3D%2248px%22%3E%3Ccircle%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20stroke%3D%22%23fff%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20fill%3D%22none%22%20stroke-dashoffset%3D%22106%22%20r%3D%229%22%20stroke-dasharray%3D%2256.52%22%20rotate%3D%22-90%22%3E%3Canimate%20attributeName%3D%22stroke-dashoffset%22%20attributeType%3D%22XML%22%20dur%3D%22360s%22%20from%3D%220%22%20to%3D%2212500%22%20repeatCount%3D%22indefinite%22%3E%3C%2Fanimate%3E%3CanimateTransform%20attributeName%3D%22transform%22%20attributeType%3D%22XML%22%20type%3D%22rotate%22%20dur%3D%221s%22%20from%3D%22-90%2024%2024%22%20to%3D%22630%2024%2024%22%20repeatCount%3D%22indefinite%22%3E%3C%2FanimateTransform%3E%3C%2Fcircle%3E%3C%2Fsvg%3E')" : 'none';
        debugBtn.style.backgroundColor = color;
        debugBtn.style.color = text_color;

        mainButtonHeight = (isVisible ? 48 : 0);
        if (document.documentElement) {
          document.documentElement.style.boxSizing = 'border-box';
          document.documentElement.style.paddingBottom = mainButtonHeight + 'px';
        }
        setViewportHeight();
      }
    }

    function setParams(params) {
      var changed = false;
      if (typeof params.text !== 'undefined') {
        var text = params.text.toString().replace(/^\s+|\s+$/g, '');
        if (!text.length) {
          console.error('[Telegram.WebApp] Main button text is required', params.text);
          throw Error('WebAppMainButtonParamInvalid');
        }
        if (text.length > 64) {
          console.error('[Telegram.WebApp] Main button text is too long', text);
          throw Error('WebAppMainButtonParamInvalid');
        }
        if (buttonText !== text) {
          changed = true;
        }
        buttonText = text;
      }
      if (typeof params.color !== 'undefined') {
        if (params.color === false ||
            params.color === null) {
          if (buttonColor !== false) {
            changed = true;
          }
          buttonColor = false;
        } else {
          var color = parseColorToHex(params.color);
          if (!color) {
            console.error('[Telegram.WebApp] Main button color format is invalid', color);
            throw Error('WebAppMainButtonParamInvalid');
          }
          if (buttonColor !== color) {
            changed = true;
          }
          buttonColor = color;
        }
      }
      if (typeof params.text_color !== 'undefined') {
        if (params.text_color === false ||
            params.text_color === null) {
          if (buttonTextColor !== false) {
            changed = true;
          }
          buttonTextColor = false;
        } else {
          var text_color = parseColorToHex(params.text_color);
          if (!text_color) {
            console.error('[Telegram.WebApp] Main button text color format is invalid', text_color);
            throw Error('WebAppMainButtonParamInvalid');
          }
          if (buttonTextColor !== text_color) {
            changed = true;
          }
          buttonTextColor = text_color;
        }
      }
      if (typeof params.is_visible !== 'undefined') {
        if (params.is_visible &&
            !mainButton.text.length) {
          console.error('[Telegram.WebApp] Main button text is required');
          throw Error('WebAppMainButtonParamInvalid');
        }
        if (isVisible !== !!params.is_visible) {
          changed = true;
        }
        isVisible = !!params.is_visible;
      }
      if (typeof params.is_active !== 'undefined') {
        if (isActive !== !!params.is_active) {
          changed = true;
        }
        isActive = !!params.is_active;
      }
      if (changed || params.force_update) {
        updateButton();
      }
      return mainButton;
    }

    mainButton.setText = function(text) {
      return mainButton.setParams({text: text});
    };
    mainButton.onClick = function(callback) {
      onWebViewEvent('mainButtonClicked', callback);
      return mainButton;
    };
    mainButton.offClick = function(callback) {
      offWebViewEvent('mainButtonClicked', callback);
      return mainButton;
    };
    mainButton.show = function() {
      return mainButton.setParams({is_visible: true});
    };
    mainButton.hide = function() {
      return mainButton.setParams({is_visible: false});
    };
    mainButton.enable = function() {
      return mainButton.setParams({is_active: true});
    };
    mainButton.disable = function() {
      return mainButton.setParams({is_active: false});
    };
    mainButton.showProgress = function(leaveActive) {
      isActive = !!leaveActive;
      isProgressVisible = true;
      updateButton();
      return mainButton;
    };
    mainButton.hideProgress = function() {
      if (!mainButton.isActive) {
        isActive = true;
      }
      isProgressVisible = false;
      updateButton();
      return mainButton;
    }
    mainButton.setParams = setParams;
    return mainButton;
  })();

  if (!window.Telegram) {
    window.Telegram = {};
  }

  Object.defineProperty(WebApp, 'initData', {
    get: function(){ return webAppInitData; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'initDataUnsafe', {
    get: function(){ return webAppInitDataUnsafe; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'colorScheme', {
    get: function(){ return colorScheme; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'themeParams', {
    get: function(){ return themeParams; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'isExpanded', {
    get: function(){ return isExpanded; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'viewportHeight', {
    get: function(){ return (viewportHeight === false ? window.innerHeight : viewportHeight) - mainButtonHeight; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'viewportStableHeight', {
    get: function(){ return (viewportStableHeight === false ? window.innerHeight : viewportStableHeight) - mainButtonHeight; },
    enumerable: true
  });
  Object.defineProperty(WebApp, 'MainButton', {
    value: MainButton,
    enumerable: true
  });
  WebApp.onEvent = function(eventType, callback) {
    onWebViewEvent(eventType, callback);
  };
  WebApp.offEvent = function(eventType, callback) {offWebViewEvent(eventType, callback);
  };
  WebApp.sendData = function (data) {
    if (!data || !data.length) {
      console.error('[Telegram.WebApp] Data is required', data);
      throw Error('WebAppDataInvalid');
    }
    if (byteLength(data) > 4096) {
      console.error('[Telegram.WebApp] Data is too long', data);
      throw Error('WebAppDataInvalid');
    }
    WebView.postEvent('web_app_data_send', false, {data: data});
  };
  WebApp.ready = function () {
    WebView.postEvent('web_app_ready');
  };
  WebApp.expand = function () {
    WebView.postEvent('web_app_expand');
  };
  WebApp.close = function () {
    WebView.postEvent('web_app_close');
  };

  window.Telegram.WebApp = WebApp;

  setViewportHeight();

  window.addEventListener('resize', onWindowResize);

  WebView.onEvent('theme_changed', onThemeChanged);
  WebView.onEvent('viewport_changed', onViewportChanged);
  WebView.postEvent('web_app_request_theme');
  WebView.postEvent('web_app_request_viewport');

})();
`;

// ────────────────────────── РОУТЕР ──────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;

    // Mini App
    if (url.pathname === "/app") {
      return new Response(MINI_APP_HTML.replaceAll("__API__", origin).replaceAll("__TG_SCRIPT__", TG_SCRIPT), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // Фото работ (прокси к файлам Telegram)
    if (url.pathname.startsWith("/photo/")) {
      const fid = url.pathname.slice("/photo/".length);
      const f = await tg(env, "getFile", { file_id: fid });
      if (!f.ok) return new Response("not found", { status: 404 });
      const fr = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${f.result.file_path}`);
      return new Response(fr.body, {
        headers: { "content-type": fr.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400" },
      });
    }

    // API мини-аппа
    if (url.pathname.startsWith("/api/")) try {
      const initData = request.headers.get("X-Tg-Init-Data") || "";
      const user = await validateInitData(initData, env.BOT_TOKEN);
      if (!user) return json({ ok: false, error: "auth" }, 401);
      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAdmin(env, user.id)) return json({ ok: false, error: "forbidden" }, 403);
        const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
        return apiAdmin(env, url.pathname, body);
      }
      if (url.pathname === "/api/data") return apiData(env, user);
      if (url.pathname === "/api/book" && request.method === "POST")
        return apiBook(env, user, await request.json().catch(() => ({})));
      if (url.pathname === "/api/cancel" && request.method === "POST")
        return apiCancel(env, user, await request.json().catch(() => ({})));
      if (url.pathname === "/api/review" && request.method === "POST")
        return apiReview(env, user, await request.json().catch(() => ({})));
      if (url.pathname === "/api/promo/check" && request.method === "POST") {
        const { code } = (await request.json().catch(() => ({}))) || {};
        const rows = await dbAll(env, "SELECT kind, value FROM promos WHERE code=? AND active=1", String(code || "").trim().toUpperCase());
        if (!rows.length) return json({ ok: false, error: "Промокод не найден или истёк 😔" }, 404);
        return json({ ok: true, kind: rows[0].kind, value: rows[0].value });
      }
      return json({ ok: false, error: "not_found" }, 404);
    } catch (e) {
      return json({ ok: false, error: "srv: " + String((e && e.message) || e).slice(0, 140) }, 200);
    }

    // Вебхук Telegram
    if (url.pathname === `/webhook/${env.WEBHOOK_SECRET}` && request.method === "POST") {
      const update = await request.json().catch(() => null);
      if (update) {
        ctx.waitUntil((async () => {
          try {
            if (update.message) await onMessage(env, update.message, origin);
            else if (update.callback_query) await onCallback(env, update.callback_query, origin);
          } catch (e) {
            console.log("handle error", e && e.stack ? e.stack : String(e));
          }
        })());
      }
      return new Response("ok");
    }

    // Настройка вебхука и кнопки меню (открыть один раз после деплоя)
    if (url.pathname === `/setup/${env.WEBHOOK_SECRET}`) {
      // Миграции БД — безопасно запускать повторно
      const MIGRATIONS = [
        `CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          booking_id INTEGER,
          name TEXT NOT NULL DEFAULT '',
          username TEXT NOT NULL DEFAULT '',
          rating INTEGER NOT NULL,
          text TEXT NOT NULL DEFAULT '',
          visible INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS service_photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_id INTEGER NOT NULL,
          file_id TEXT NOT NULL,
          sort INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        "ALTER TABLE bookings ADD COLUMN review_asked INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN reminded2 INTEGER NOT NULL DEFAULT 0",
        `CREATE TABLE IF NOT EXISTS promos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL DEFAULT 'percent',
          value INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          uses INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        "ALTER TABLE users ADD COLUMN birthday TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE bookings ADD COLUMN promo_code TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE bookings ADD COLUMN discount INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN rebook_invited INTEGER NOT NULL DEFAULT 0",
      ];
      const mig = [];
      for (const sql of MIGRATIONS) {
        try { await env.DB.prepare(sql).run(); mig.push("ok"); } catch (e) { mig.push(String(e).slice(0, 60)); }
      }
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('app_url', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(origin).run();
      const wh = await tg(env, "setWebhook", {
        url: `${origin}/webhook/${env.WEBHOOK_SECRET}`,
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query"],
      });
      const mb = await tg(env, "setChatMenuButton", {
        menu_button: { type: "web_app", text: "✨ Записаться", web_app: { url: `${origin}/app` } },
      });
      return json({ webhook: wh, menu_button: mb, migrations: mig });
    }

    // Статус-страница
    return new Response(
      `<!DOCTYPE html><meta charset="utf-8"><body style="background:#14090f;color:#f5e9e2;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center">
       <div><div style="font-size:52px">💅</div><h1>DARWN.NAILL</h1><p>Бот работает ✨ Запись — через Telegram</p></div></body>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  },

  // Напоминания и сбор отзывов (cron каждые 15 минут)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const today = todayStr(env);
      const tomorrow = addDays(today, 1);
      const nowL = nowLocal(env);
      const nowU = Date.UTC(nowL.getUTCFullYear(), nowL.getUTCMonth(), nowL.getUTCDate(), nowL.getUTCHours(), nowL.getUTCMinutes());

      // 1) Напоминание накануне — один раз в день (12:00 UTC = 19:00 Нск)
      if (nowL.getUTCHours() === 12 && nowL.getUTCMinutes() < 15) {
        const rows = await dbAll(env, "SELECT * FROM bookings WHERE date=? AND status='confirmed' AND reminded=0", tomorrow);
        for (const b of rows) {
          const r = await send(env, b.user_id,
            `💌 <b>Напоминание о записи</b>\n\nЗавтра, <b>${dateLabel(b.date)}</b> в <b>${b.time}</b>\n💅 ${html(b.service_name)}\n\nЖду тебя, красотка! 🤍`);
          if (r.ok) await env.DB.prepare("UPDATE bookings SET reminded=1 WHERE id=?").bind(b.id).run();
        }
      }

      // 2) Напоминание за 2 часа до визита
      try {
        const soon = await dbAll(env,
          "SELECT * FROM bookings WHERE date IN (?,?) AND status='confirmed' AND reminded2=0", today, tomorrow);
        for (const b of soon) {
          const [y, m, d] = b.date.split("-").map(Number);
          const [hh, mm] = b.time.split(":").map(Number);
          const diff = (Date.UTC(y, m - 1, d, hh, mm) - nowU) / 60000;
          if (diff >= 100 && diff <= 135) {
            const r = await send(env, b.user_id,
              `⏰ <b>Через 2 часа жду тебя!</b>\n\n💅 ${html(b.service_name)} · сегодня в <b>${b.time}</b>\n📍 г. Бердск, ул. Вокзальная, 2\n\nДо встречи 🤍`);
            if (r.ok) await env.DB.prepare("UPDATE bookings SET reminded2=1 WHERE id=?").bind(b.id).run();
          }
        }
      } catch (e) { console.log("remind2", String(e)); }

      // 1.5) Приглашение на повторный визит (по умолчанию через 21 день)
      if (nowL.getUTCHours() === 12 && nowL.getUTCMinutes() < 15) {
        try {
          const rebookDays = parseInt(await getSetting(env, "rebook_days"), 10) || 21;
          const target = addDays(today, -rebookDays);
          const due = await dbAll(env, "SELECT * FROM bookings WHERE date=? AND status='confirmed' AND rebook_invited=0", target);
          const appUrlR = await getSetting(env, "app_url");
          for (const b of due) {
            const extra = appUrlR ? { reply_markup: kb([[webBtn("💅 Выбрать время", appUrlR + "/app")]]) } : {};
            const r = await send(env, b.user_id,
              `💅 <b>Прошло уже ${rebookDays} дн. с твоего визита!</b>\n\nНоготки наверняка просят обновления ✨ Запишись, пока есть свободные окошки 🤍`, extra);
            if (r.ok) await env.DB.prepare("UPDATE bookings SET rebook_invited=1 WHERE id=?").bind(b.id).run();
          }
        } catch (e) { console.log("rebook", String(e)); }
      }

      // 1.6) Поздравления с днём рождения (02:00 UTC = 09:00 Нск)
      if (nowL.getUTCHours() === 2 && nowL.getUTCMinutes() < 15) {
        try {
          const dm = today.slice(8, 10) + "." + today.slice(5, 7);
          const bdRaw = await getSetting(env, "bday_discount");
          const bdisc = bdRaw === "" ? 10 : parseInt(bdRaw, 10);
          const bdays = await dbAll(env, "SELECT telegram_id, first_name FROM users WHERE birthday=?", dm);
          const appUrlB = await getSetting(env, "app_url");
          for (const u of bdays) {
            const extra = appUrlB ? { reply_markup: kb([[webBtn("💅 Записаться", appUrlB + "/app")]]) } : {};
            await send(env, u.telegram_id,
              `🎂 <b>С днём рождения, ${html(u.first_name)}!</b> 🎉\n\nДарина поздравляет от души 🤍` +
              (bdisc > 0 ? `\nПодарок: <b>скидка ${bdisc}%</b> на любую услугу — просто запишись сегодня, она применится сама ✨` : "\n\nОбнимаем! ✨"),
              extra);
          }
        } catch (e) { console.log("bday", String(e)); }
      }

      // 3) Просим отзыв через ~2 часа после визита
      try {
        const appUrl = await getSetting(env, "app_url");
        const yesterday = addDays(today, -1);
        const done = await dbAll(env,
          "SELECT * FROM bookings WHERE date IN (?,?) AND status='confirmed' AND review_asked=0", yesterday, today);
        for (const b of done) {
          const [y, m, d] = b.date.split("-").map(Number);
          const [hh, mm] = b.time.split(":").map(Number);
          const endU = Date.UTC(y, m - 1, d, hh, mm) + 120 * 60000;
          if (endU <= nowU) {
            const extra = appUrl ? { reply_markup: kb([[webBtn("⭐ Оставить отзыв", appUrl + "/app")]]) } : {};
            const r = await send(env, b.user_id,
              `💅 <b>Как тебе ноготки?</b>\n\nПара секунд — оцени визит, мне будет очень приятно 🤍`, extra);
            if (r.ok) await env.DB.prepare("UPDATE bookings SET review_asked=1 WHERE id=?").bind(b.id).run();
          }
        }
      } catch (e) { console.log("review ask", String(e)); }
    })());
  },
};
