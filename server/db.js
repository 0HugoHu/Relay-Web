const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function initDb(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

  db = new Database(path.join(dataDir, 'relay.db'));
  // Use WAL on Linux (NAS), DELETE on Windows-mounted volumes to avoid NTFS locking
  const isLinux = process.platform === 'linux';
  db.pragma(`journal_mode = ${isLinux ? 'WAL' : 'DELETE'}`);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      token       TEXT UNIQUE NOT NULL,
      is_admin    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      last_seen   TEXT
    );

    CREATE TABLE IF NOT EXISTS channels (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK(type IN ('all', 'group', 'direct')),
      name        TEXT,
      created_by  TEXT REFERENCES devices(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      joined_at   TEXT NOT NULL,
      PRIMARY KEY (channel_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id            TEXT PRIMARY KEY,
      channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      sender_id     TEXT REFERENCES devices(id) ON DELETE SET NULL,
      type          TEXT NOT NULL CHECK(type IN ('text','image','file','video','system')),
      content       TEXT,
      file_id       TEXT REFERENCES files(id) ON DELETE SET NULL,
      burn_on_read  INTEGER NOT NULL DEFAULT 0,
      expires_at    TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id          TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      mimetype    TEXT NOT NULL,
      size_bytes  INTEGER,
      has_preview INTEGER NOT NULL DEFAULT 0,
      has_thumb   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      read_at     TEXT NOT NULL,
      PRIMARY KEY (message_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_members_device   ON channel_members(device_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // Ensure the universal 'all' channel exists
  const allCh = db.prepare("SELECT id FROM channels WHERE type = 'all'").get();
  if (!allCh) {
    db.prepare(
      "INSERT INTO channels (id, type, name, created_at) VALUES ('all', 'all', 'All Devices', ?)"
    ).run(new Date().toISOString());
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

module.exports = { initDb, getDb };
