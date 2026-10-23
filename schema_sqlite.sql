-- SafeReport UG : database schema (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Police users: officers, station commanders, administrators
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('officer','commander','admin')),
  station       TEXT,
  password_hash TEXT NOT NULL,          -- scrypt, format salt:hash
  nin           TEXT UNIQUE,            -- National ID Number (14 chars) used to log in
  face_descriptor TEXT,                 -- JSON[128]: face from live selfie at enrolment
  id_descriptor   TEXT,                 -- JSON[128]: face printed on the National ID card
  id_photo      TEXT,                   -- stored ID-card scan (file name in data/uploads)
  face_photo    TEXT,                   -- stored enrolment selfie
  face_enrolled_at TEXT,                -- NULL = officer must enrol on next login
  unlock_at     TEXT,                   -- failures before this time are ignored (admin unlock)
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Login sessions for police users
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Crime reports submitted by citizens
CREATE TABLE IF NOT EXISTS reports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref            TEXT NOT NULL UNIQUE,   -- e.g. UG-8852
  pin_hash       TEXT NOT NULL,          -- citizen's secret PIN (scrypt); needed to track
  category       TEXT NOT NULL,
  description    TEXT NOT NULL,
  district       TEXT NOT NULL,
  place          TEXT,
  lat            REAL,
  lng            REAL,
  occurred_at    TEXT NOT NULL,
  anonymous      INTEGER NOT NULL DEFAULT 1,
  reporter_name  TEXT,                   -- only if not anonymous
  reporter_phone TEXT,                   -- only if not anonymous
  priority       TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high','urgent')),
  status         TEXT NOT NULL DEFAULT 'Received'
                 CHECK (status IN ('Received','Under review','Assigned to officer','Resolved','Rejected')),
  assigned_to    INTEGER REFERENCES users(id),
  duplicate_of   TEXT,                   -- ref of a possible duplicate
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_district ON reports(district);
CREATE INDEX IF NOT EXISTS idx_reports_created  ON reports(created_at);

-- Photo / video evidence attached to a report
CREATE TABLE IF NOT EXISTS evidence (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Two-way messages between officer and (anonymous) citizen
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('citizen','police')),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Internal officer notes (never shown to citizen)
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Status history shown as the citizen's tracking timeline
CREATE TABLE IF NOT EXISTS status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log of every police action (accountability)
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every login attempt (success or failure): who, when, where, how well the face matched
CREATE TABLE IF NOT EXISTS login_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  nin         TEXT,
  success     INTEGER NOT NULL,
  reason      TEXT,                      -- ok | enrolled | face_mismatch | id_mismatch | no_location | duplicate_face | ...
  kind        TEXT,                      -- enrol | verify
  lat         REAL,
  lng         REAL,
  accuracy_m  REAL,
  outside_ug  INTEGER NOT NULL DEFAULT 0,-- GPS fix outside Uganda's bounding box
  dist_live   REAL,                      -- face distance: live selfie vs enrolled (lower = closer)
  dist_id     REAL,                      -- face distance: ID card photo vs enrolled
  dist_cross  REAL,                      -- face distance: live selfie vs ID card photo
  liveness    INTEGER NOT NULL DEFAULT 0,-- device reported the head-turn check passed
  photo       TEXT,                      -- selfie taken at this login (audit evidence)
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))   -- UTC
);
CREATE INDEX IF NOT EXISTS idx_login_user ON login_events(user_id, created_at);
