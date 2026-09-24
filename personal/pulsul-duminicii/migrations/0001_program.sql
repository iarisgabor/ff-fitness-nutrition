-- Program duminică + conturi de predicatori. Contul general (BisericaLogos) NU
-- stă aici — vine din ADMIN_USERNAME/ADMIN_PASSWORD (wrangler.toml + secret),
-- ca să nu te poți bloca singur pe dinafară dintr-o greșeală în baza de date.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  -- numele exact din „Calendar predicare" — legătura cu statisticile se face
  -- prin preacherSlug(preacher_name), la fel ca /predicatori/:slug
  preacher_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  -- crescut la fiecare resetare de parolă -> invalidează sesiunile vechi
  session_gen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sundays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,              -- 'YYYY-MM-DD', același slug ca /zile/:slug
  preacher_name TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '10:00',
  attendance INTEGER,                     -- trecut manual după întâlnire; NULL = necompletat
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT,
  updated_by TEXT
);

-- Un rând din program, exact ca în Planning Center: 'header' = titlu de secțiune
-- (INTRO, WORSHIP...), 'song' = cântare (are tonalitate), 'item' = orice altceva.
-- Secțiunea unui element = cel mai apropiat 'header' de deasupra lui (după position).
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sunday_id INTEGER NOT NULL REFERENCES sundays(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('header', 'item', 'song')),
  length_sec INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  person TEXT NOT NULL DEFAULT '',
  song_key TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX items_by_sunday ON items (sunday_id, position);

CREATE TABLE resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sunday_id INTEGER NOT NULL REFERENCES sundays(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL, -- NULL = resursă a duminicii întregi
  kind TEXT NOT NULL CHECK (kind IN ('file', 'link')),
  name TEXT NOT NULL,
  r2_key TEXT,
  url TEXT,
  size INTEGER,
  content_type TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX resources_by_sunday ON resources (sunday_id);
