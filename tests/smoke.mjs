// 💅 DARWN.NAILL — смоук-тесты воркера без реальной D1/Telegram
// Запуск: node tests/smoke.mjs
import { readFileSync } from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "worker.js"), "utf8");

const tables = {
  users: [{ telegram_id: 111, first_name: "Аня", username: "anya", phone: "", birthday: "" }],
  services: [{ id: 1, name: "Маникюр", description: "К", price: 1500, duration_min: 120, active: 1, sort: 1 }],
  slots: [
    { id: 9, date: "2099-01-05", time: "12:00", status: "free", booking_id: null },
    { id: 10, date: "2099-01-06", time: "13:00", status: "free", booking_id: null },
    { id: 11, date: "2099-01-07", time: "14:00", status: "free", booking_id: null },
    { id: 12, date: "2099-01-08", time: "15:00", status: "free", booking_id: null },
  ],
  bookings: [{ id: 5, user_id: 111, client_name: "Аня", client_username: "anya", client_phone: "+79990001122", service_name: "Маникюр", price: 1500, date: "2026-11-10", time: "12:00", status: "confirmed", reminded: 1 }],
  reviews: [],
  service_photos: [],
  promos: [],
  settings: [{ key: "app_url", value: "https://x.workers.dev" }],
};
let auto = 100;
const seenDup = {};

function q(sql, binds = []) {
  const s = sql.trim().replace(/\s+/g, " ");
  const T = tables;
  if (/^SELECT/.test(s)) {
    if (/FROM promos WHERE code=\? AND active=1/.test(s)) return { results: T.promos.filter((p) => p.code === binds[0] && p.active === 1) };
    if (/SELECT \* FROM promos ORDER BY id DESC/.test(s)) return { results: T.promos.slice().reverse() };
    if (/COUNT\(\*\) n, AVG/.test(s)) { const rows = T.reviews.filter((r) => r.visible === 1); return { results: [{ n: rows.length, a: rows.length ? rows.reduce((x, r) => x + r.rating, 0) / rows.length : null }] }; }
    if (/substr\(date,1,7\)/.test(s)) return { results: [] };
    if (/GROUP BY service_name/.test(s)) return { results: [] };
    if (/GROUP BY user_id HAVING/.test(s)) return { results: [{ n: 0 }] };
    if (/COUNT\(\*\) n FROM service_photos/.test(s)) return { results: [{ n: T.service_photos.filter((p) => p.service_id === binds[0]).length }] };
    if (/COUNT/.test(s) && /FROM users/.test(s)) return { results: [{ n: T.users.length }] };
    if (/COUNT/.test(s) && /FROM bookings/.test(s)) return { results: [{ n: T.bookings.length }] };
    if (/COUNT/.test(s) && /FROM slots/.test(s)) return { results: [{ n: T.slots.length }] };
    if (/SUM\(price\)/.test(s)) return { results: [{ n: 0 }] };
    if (/SELECT \* FROM reviews ORDER BY id DESC/.test(s)) return { results: T.reviews.slice().reverse() };
    if (/SELECT name, rating, text/.test(s)) return { results: T.reviews.filter((r) => r.visible === 1).reverse().map((r) => ({ name: r.name, rating: r.rating, text: r.text, created_at: r.created_at })) };
    if (/SELECT id FROM reviews WHERE booking_id=\?/.test(s)) return { results: T.reviews.filter((r) => r.booking_id === binds[0]) };
    if (/SELECT service_id, file_id FROM service_photos/.test(s)) return { results: T.service_photos };
    if (/SELECT file_id FROM service_photos/.test(s)) return { results: T.service_photos.filter((p) => p.service_id === binds[0]) };
    if (/FROM services WHERE active=1/.test(s)) return { results: T.services.filter((x) => x.active === 1) };
    if (/SELECT \* FROM services WHERE id=\?/.test(s)) return { results: T.services.filter((x) => x.id === binds[0]) };
    if (/SELECT \* FROM slots WHERE id=\?/.test(s)) return { results: T.slots.filter((x) => x.id === binds[0]) };
    if (/FROM bookings b WHERE b.user_id/.test(s))
      return { results: T.bookings.filter((b) => b.user_id === binds[0] && b.status === "confirmed" && b.date < binds[1]).map((b) => ({ id: b.id, service_name: b.service_name, price: b.price, date: b.date, time: b.time, has_review: T.reviews.filter((r) => r.booking_id === b.id).length })) };
    if (/FROM bookings WHERE user_id/.test(s)) return { results: T.bookings.filter((b) => b.user_id === binds[0] && b.status !== "cancelled") };
    if (/SELECT \* FROM bookings WHERE status/.test(s)) return { results: T.bookings.filter((b) => b.status !== "cancelled") };
    if (/SELECT \* FROM bookings WHERE id/.test(s)) return { results: T.bookings.filter((b) => b.id === binds[0]) };
    if (/FROM slots s/.test(s)) return { results: [] };
    if (/FROM slots WHERE/.test(s)) return { results: T.slots.filter((x) => x.status === "free") };
    if (/SELECT value FROM settings/.test(s)) return { results: T.settings.filter((x) => x.key === binds[0]) };
    if (/SELECT key, value FROM settings/.test(s)) return { results: T.settings };
    if (/FROM users/.test(s)) return { results: T.users };
    return { results: [] };
  }
  if (/^INSERT INTO reviews/.test(s)) {
    if (seenDup[binds[1]]) { const e = new Error("UNIQUE"); e.code = "D1_ERROR"; throw e; }
    seenDup[binds[1]] = 1;
    T.reviews.push({ id: ++auto, user_id: binds[0], booking_id: binds[1], name: binds[2], username: binds[3], rating: binds[4], text: binds[5], visible: 1, created_at: "2026-11-22" });
    return { meta: { changes: 1 } };
  }
  if (/^INSERT INTO promos/.test(s)) {
    if (T.promos.some((p) => p.code === binds[0])) { const e = new Error("UNIQUE"); e.code = "D1_ERROR"; throw e; }
    T.promos.push({ id: ++auto, code: binds[0], kind: binds[1], value: binds[2], active: 1, uses: 0 });
    return { meta: { changes: 1 } };
  }
  if (/^INSERT INTO bookings/.test(s)) {
    const b = { id: ++auto, user_id: binds[0], slot_id: binds[1], service_id: binds[2], service_name: binds[3], price: binds[4], date: binds[5], time: binds[6], client_name: binds[7], client_phone: binds[8], client_username: binds[9], source: binds[10], promo_code: binds[11] || "", discount: binds[12] || 0, status: "pending" };
    T.bookings.push(b);
    return { meta: { changes: 1, last_row_id: b.id } };
  }
  if (/^INSERT OR IGNORE INTO slots/.test(s)) {
    const dup = T.slots.some((x) => x.date === binds[0] && x.time === binds[1]);
    if (!dup) { T.slots.push({ id: ++auto, date: binds[0], time: binds[1], status: "free" }); return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };
  }
  if (/^INSERT INTO settings/.test(s)) {
    const ex = T.settings.find((x) => x.key === binds[0]);
    if (ex) ex.value = binds[1]; else T.settings.push({ key: binds[0], value: binds[1] });
    return { meta: { changes: 1 } };
  }
  if (/^INSERT/.test(s)) return { meta: { changes: 1 } };
  if (/^UPDATE slots SET status='booked' WHERE id=\? AND status='free'/.test(s)) {
    const sl = T.slots.find((x) => x.id === binds[0] && x.status === "free");
    if (sl) { sl.status = "booked"; return { meta: { changes: 1 } }; }
    return { meta: { changes: 0 } };  }
  if (/^UPDATE slots SET booking_id/.test(s)) { const sl = T.slots.find((x) => x.id === binds[1]); if (sl) sl.booking_id = binds[0]; return { meta: { changes: 1 } }; }
  if (/^UPDATE slots SET status='free', booking_id=NULL/.test(s)) { const sl = T.slots.find((x) => x.id === binds[0]); if (sl) { sl.status = "free"; sl.booking_id = null; } return { meta: { changes: 1 } }; }
  if (/^UPDATE promos SET uses=uses\+1/.test(s)) { const p = T.promos.find((x) => x.id === binds[0]); if (p) p.uses++; return { meta: { changes: 1 } }; }
  if (/^UPDATE promos SET active/.test(s)) { const p = T.promos.find((x) => x.id === binds[1]); if (p) p.active = binds[0]; return { meta: { changes: 1 } }; }
  if (/^DELETE FROM promos/.test(s)) { tables.promos = T.promos.filter((x) => x.id !== binds[0]); return { meta: { changes: 1 } }; }
  if (/^UPDATE users SET birthday/.test(s)) { const u = T.users.find((x) => x.telegram_id === binds[1]); if (u) u.birthday = binds[0]; return { meta: { changes: 1 } }; }
  if (/^UPDATE bookings SET status='cancelled'/.test(s)) { const b = T.bookings.find((x) => x.id === binds[0]); if (b) b.status = "cancelled"; return { meta: { changes: 1 } }; }
  if (/^UPDATE bookings SET status='confirmed'/.test(s)) { const b = T.bookings.find((x) => x.id === binds[0]); if (b) b.status = "confirmed"; return { meta: { changes: 1 } }; }
  if (/^UPDATE reviews SET visible/.test(s)) { const r = T.reviews.find((x) => x.id === binds[1]); if (r) r.visible = binds[0]; return { meta: { changes: 1 } }; }
  if (/^DELETE FROM reviews/.test(s)) { tables.reviews = T.reviews.filter((x) => x.id !== binds[0]); return { meta: { changes: 1 } }; }
  if (/^UPDATE/.test(s)) return { meta: { changes: 1 } };
  if (/^DELETE/.test(s)) return { meta: { changes: 1 } };
  return { meta: { changes: 0 } };
}

const env = {
  BOT_TOKEN: "t", ADMIN_ID: "111", WEBHOOK_SECRET: "s", APP_URL: "", TZ_OFFSET_HOURS: "7",
  DB: { prepare: (sql) => ({ bind: (...b) => ({ all: async () => q(sql, b), first: async () => (q(sql, b).results[0] || null), run: async () => q(sql, b) }), all: async () => q(sql, []), first: async () => q(sql, []).results[0] || null, run: async () => q(sql, []) }) },
};
const sentMsgs = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes("sendMessage")) sentMsgs.push(JSON.parse(opts.body));
  return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }), headers: new Map(), body: null };
};

const mod = { exports: {} };
const cjs = src.replace(/export\s+default\s+/, "module.exports = ");
new Function("module", "exports", "fetch", "console", cjs)(mod, mod.exports, globalThis.fetch, console);
const worker = mod.exports;

const results = [];
const t = async (n, c) => { results.push([n, !!c]); };

// ── 0) синтаксис клиентского JS внутри MINI_APP_HTML ──
{
  const m = src.match(/const MINI_APP_HTML = String\.raw`([\s\S]*?)`;\n/);
  const scripts = [...m[1].matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  const appJs = scripts[scripts.length - 1];
  try { new Function(appJs); t("client JS syntax", true); } catch (e) { t("client JS syntax: " + e.message, false); }
}

function initDataFor(userId) {
  const data = { user: JSON.stringify({ id: userId, first_name: "Аня", username: "anya" }), auth_date: String(Math.floor(Date.now() / 1000)) };
  const secret = crypto.createHmac("sha256", "WebAppData").update("t").digest();
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join("\n");
  const hash = crypto.createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...data, hash }).toString();
}
const HDR = (uid) => ({ "content-type": "application/json", "X-Tg-Init-Data": initDataFor(uid) });
const post = (path, body, uid = 111) => worker.fetch(new Request("https://x" + path, { method: "POST", headers: HDR(uid), body: JSON.stringify(body) }), env, { waitUntil() {} });

// ── запись: телефон опционален ──
{
  const r = await post("/api/book", { slot_id: 9, service_id: 1, name: "Аня", phone: "" });
  const d = await r.json();
  t("book без телефона ok", r.status === 200 && d.ok);
  const notif0 = sentMsgs.find((m) => String(m.text).includes("Новая запись"));
  t("уведомление «Без номера телефона»", notif0 && notif0.text.includes("Без номера телефона"));
  const r4 = await post("/api/book", { slot_id: 11, service_id: 1, name: "", phone: "" });
  t("book пустое имя 400", r4.status === 400);
  const r5 = await post("/api/book", { slot_id: 11, service_id: 1, name: "Аня", phone: "123" });
  t("book кривой телефон 400", r5.status === 400);
}

// ── промокоды ──
{
  t("promo add", (await (await post("/api/admin/promo", { action: "add", code: "podruga10", kind: "percent", value: 10 })).json()).ok);
  const rd = await post("/api/admin/promo", { action: "add", code: "PODRUGA10", kind: "percent", value: 10 });
  t("promo dup 409", rd.status === 409);
  await post("/api/admin/promo", { action: "add", code: "MINUS300", kind: "fixed", value: 300 });
  const chk = await (await post("/api/promo/check", { code: "podruga10" })).json();
  t("promo check", chk.ok && chk.value === 10);
  const r404 = await post("/api/promo/check", { code: "NOPE" });
  t("promo check 404", r404.status === 404);

  const r = await post("/api/book", { slot_id: 10, service_id: 1, name: "Аня", promo_code: "PODRUGA10" });
  const d = await r.json();
  t("book promo −10%", d.ok && d.booking.price === 1350 && d.booking.discount === 150);
  t("promo uses++", tables.promos.find((p) => p.code === "PODRUGA10").uses === 1);
  const notif = sentMsgs.filter((m) => String(m.text).includes("Новая запись")).pop();
  t("уведомление со скидкой", notif && notif.text.includes("🎁") && notif.text.includes("PODRUGA10"));
  const rf = await post("/api/book", { slot_id: 11, service_id: 1, name: "Аня", promo_code: "FAKE" });
  t("book fake promo 400", rf.status === 400);
  const rn = await post("/api/admin/promo", { action: "add", code: "HACK2", kind: "percent", value: 5 }, 222);
  t("promo non-admin 403", rn.status === 403);
}

// ── ДР-скидка ──
{
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const dm = String(now.getUTCDate()).padStart(2, "0") + "." + String(now.getUTCMonth() + 1).padStart(2, "0");
  const rb = await post("/api/book", { slot_id: 12, service_id: 1, name: "Аня", birthday: "32.13" });
  t("book bad bday 400", rb.status === 400);
  const r = await post("/api/book", { slot_id: 12, service_id: 1, name: "Аня", birthday: dm });
  const d = await r.json();
  t("book bday auto −10%", d.ok && d.booking.discount === 150);
  t("bday сохранён", tables.users[0].birthday === dm);
}

// ── admin booking: confirm/cancel ──
{
  tables.bookings.push({ id: 50, user_id: 111, slot_id: 12, client_name: "Аня", client_username: "anya", client_phone: "", service_name: "Маникюр", price: 1500, date: "2099-01-08", time: "15:00", status: "pending" });
  const r = await post("/api/admin/booking", { id: 50, action: "confirm" });
  const d = await r.json().catch(() => null);
  t("admin confirm ok", r.status === 200 && d && d.ok);
  const r2 = await post("/api/admin/booking", { id: 50, action: "cancel" });
  const d2 = await r2.json().catch(() => null);
  t("admin cancel ok", r2.status === 200 && d2 && d2.ok);
  t("запись отменена в БД", tables.bookings.find((b) => b.id === 50).status === "cancelled");
  const r3 = await post("/api/admin/booking", { id: 50, action: "cancel" }, 222);
  t("admin booking non-admin 403", r3.status === 403);
}

// ── отзывы ──
{
  const r = await post("/api/review", { booking_id: 5, rating: 5, text: "Супер!" });
  t("review ok", (await r.json()).ok);
  const r2 = await post("/api/review", { booking_id: 5, rating: 1 });
  t("review dup 409", r2.status === 409);
  const rid = tables.reviews[0].id;
  await post("/api/admin/review", { id: rid, action: "hide" });
  t("review hide", tables.reviews[0].visible === 0);
}

// ── генератор слотов ──
{
  const r = await post("/api/admin/slots/gen", { days: [1, 3], times: ["10:00", "18:30"] });
  const d = await r.json();
  t("slots/gen ok", d.ok && d.added > 0);
  const r2 = await post("/api/admin/slots/gen", { days: [1, 3], times: ["10:00", "18:30"] });
  const d2 = await r2.json();
  t("slots/gen идемпотентен", d2.ok && d2.added === 0);
}

// ── настройки ──
{
  const r = await post("/api/admin/settings", { key: "rebook_days", value: 999 });
  const d = await r.json();
  t("settings clamp 60", d.ok && d.value === 60);
  const r2 = await post("/api/admin/settings", { key: "evil", value: 1 });
  t("settings bad key 400", r2.status === 400);
}

// ── apiData / admin data ──
{
  tables.service_photos.push({ id: 1, service_id: 1, file_id: "FILE1", sort: 0 });
  const r = await worker.fetch(new Request("https://x/api/data", { headers: HDR(111) }), env, { waitUntil() {} });
  const d = await r.json();
  t("apiData ok + photos + birthday", d.ok && d.services[0].photos.length === 1 && typeof d.user.birthday === "string");
  const r2 = await worker.fetch(new Request("https://x/api/admin/data", { headers: HDR(111) }), env, { waitUntil() {} });
  const d2 = await r2.json();
  t("admin data promos+settings+stats", Array.isArray(d2.promos) && d2.settings && Array.isArray(d2.stats.months));
}

// ── cron не падает ──
{
  try {
    let p; const ctx = { waitUntil(x) { p = x; } };
    await worker.scheduled({}, env, ctx); await p;
    t("scheduled runs clean", true);
  } catch (e) { t("scheduled: " + e.message, false); }
}

// ── миграции ──
{
  const r = await worker.fetch(new Request("https://x/setup/s", {}), env, { waitUntil() {} });
  const d = await r.json();
  t("setup migrations x9", Array.isArray(d.migrations) && d.migrations.length === 9);
}

let fail = 0;
for (const [n, ok] of results) { if (!ok) { fail++; console.log("❌", n); } else console.log("✅", n); }
console.log(fail ? `\n${fail} FAILED` : `\nALL ${results.length} PASS`);
process.exit(fail ? 1 : 0);
