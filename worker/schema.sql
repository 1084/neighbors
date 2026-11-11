-- Neighbors contribution queue. Everything here is structured; nothing a person types is shown to another user.
-- The only identifier is a three-digit ZIP prefix and a salted, truncated hash of the client IP that lives
-- for one day (the rate-limit counter the charter allows). No names, emails, tokens or full ZIPs.

CREATE TABLE IF NOT EXISTS contributions (
  id          TEXT PRIMARY KEY,                 -- ulid-ish: time + random
  kind        TEXT NOT NULL,                    -- source | item | idea | confirm | flag
  status      TEXT NOT NULL DEFAULT 'new',      -- new | approved | declined | done (ideas)
  zip3        TEXT,                             -- first three digits of the submitter's ZIP
  item_id     TEXT,                             -- confirm/flag: the feed item id
  link        TEXT,                             -- source/item: the official URL
  domain      TEXT,                             -- host of link, for the allow-list check
  category    TEXT,                             -- one of the charter's categories
  title       TEXT,                             -- source: publisher; item: title as the page gives it
  zip         TEXT,                             -- source/item: where it is (five digits, the place not the person)
  starts      TEXT,                             -- item: when, if given
  text        TEXT,                             -- idea: the idea; flag: the reason
  link_ok     INTEGER,                          -- 1 when the link resolved (HEAD/GET 200) at receipt
  note        TEXT,                             -- reviewer's note; shown on What's new when public is 1
  public      INTEGER NOT NULL DEFAULT 0,       -- 1 = listed on What's new (approved sources/items, done ideas)
  received_at TEXT NOT NULL,
  decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS contributions_status ON contributions (status, received_at);
CREATE INDEX IF NOT EXISTS contributions_item ON contributions (item_id);

-- Confirms and flags roll up here so the app can ask "how many neighbors confirmed this" without reading rows.
CREATE TABLE IF NOT EXISTS item_signals (
  item_id   TEXT PRIMARY KEY,
  confirms  INTEGER NOT NULL DEFAULT 0,
  flags     INTEGER NOT NULL DEFAULT 0,
  last_at   TEXT
);

-- Rate limit: per hashed client per UTC day. Rows are deleted by the daily sweep.
CREATE TABLE IF NOT EXISTS rate (
  key    TEXT PRIMARY KEY,   -- sha256(ip + daily salt) truncated, plus the day
  n      INTEGER NOT NULL DEFAULT 0,
  day    TEXT NOT NULL
);
