-- ═══════════════════════════════════════════
--  💅 DARWN.NAILL — схема базы данных (D1)
--  Применяется один раз: wrangler d1 execute darwn_naill_db --file=schema.sql
-- ═══════════════════════════════════════════

-- Пользователи бота
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  username    TEXT,
  first_name  TEXT,
  phone       TEXT,
  state       TEXT NOT NULL DEFAULT 'idle',   -- состояние диалога (для админки)
  payload     TEXT NOT NULL DEFAULT '{}',     -- JSON с временными данными
  blocked     INTEGER NOT NULL DEFAULT 0,     -- 1 = заблокировал бота
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Услуги
CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        INTEGER NOT NULL,              -- рубли
  duration_min INTEGER NOT NULL DEFAULT 120,  -- минуты
  active       INTEGER NOT NULL DEFAULT 1,    -- 0 = скрыта от клиентов
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Окошки (свободные слоты времени — управляет мастер из админки)
CREATE TABLE IF NOT EXISTS slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,                   -- YYYY-MM-DD
  time       TEXT NOT NULL,                   -- HH:MM
  status     TEXT NOT NULL DEFAULT 'free',    -- free | booked
  booking_id INTEGER,                         -- запись, которая заняла окошко
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, time)
);

-- Записи клиентов
CREATE TABLE IF NOT EXISTS bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(telegram_id),
  slot_id         INTEGER REFERENCES slots(id),
  service_id      INTEGER,
  service_name    TEXT NOT NULL,              -- снимок на момент записи
  price           INTEGER NOT NULL DEFAULT 0, -- снимок цены
  date            TEXT NOT NULL,
  time            TEXT NOT NULL,
  client_name     TEXT NOT NULL,
  client_phone    TEXT NOT NULL DEFAULT '',
  client_username TEXT NOT NULL DEFAULT '',   -- @username на момент записи
  source          TEXT NOT NULL DEFAULT 'app',-- app | bot
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled
  reminded        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slots_date    ON slots(date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, status);

-- Редактируемые тексты бота (заполняются из админки; дефолты зашиты в worker.js)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- ── Стартовые услуги (можно править/удалять из админки) ──
INSERT INTO services (name, description, price, duration_min, sort)
SELECT * FROM (
  SELECT 'Маникюр + гель-лак',      'Комбинированный маникюр, выравнивание ногтевой пластины, гель-лак', 1800, 150, 1
  UNION ALL SELECT 'Маникюр без покрытия',  'Аккуратный комбинированный маникюр + уход', 1000, 60, 2
  UNION ALL SELECT 'Наращивание',           'Наращивание любой длины и формы + гель-лак', 2500, 180, 3
  UNION ALL SELECT 'Коррекция наращивания', 'Коррекция от 3–4 недель носки', 2000, 150, 4
  UNION ALL SELECT 'Снятие чужой работы',   'Бережное снятие без спила своего ногтя', 300, 30, 5
  UNION ALL SELECT 'Дизайн',                'От 50₽ за ноготь: френч, стемпинг, блёстки, стразы', 50, 15, 6
) WHERE NOT EXISTS (SELECT 1 FROM services);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  booking_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS service_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  file_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE bookings ADD COLUMN review_asked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN reminded2 INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE users ADD COLUMN birthday TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN promo_code TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN rebook_invited INTEGER NOT NULL DEFAULT 0;
