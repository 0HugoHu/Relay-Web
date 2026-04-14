const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');

const DATA_DIR = process.env.DATA_DIR || '/data';
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function runCleanup() {
  const db = getDb();
  const now = new Date().toISOString();

  // Find expired messages
  const expired = db.prepare(
    "SELECT m.id, m.file_id FROM messages m WHERE m.expires_at IS NOT NULL AND m.expires_at < ?"
  ).all(now);

  if (expired.length === 0) return;

  const deleteMsg = db.prepare('DELETE FROM messages WHERE id = ?');
  const deleteFile = db.prepare('DELETE FROM files WHERE id = ?');

  const tx = db.transaction((items) => {
    for (const { id, file_id } of items) {
      deleteMsg.run(id);
      if (file_id) {
        deleteFile.run(file_id);
        // Remove upload directory
        const uploadDir = path.join(DATA_DIR, 'uploads', file_id);
        fs.rmSync(uploadDir, { recursive: true, force: true });
      }
    }
  });

  tx(expired);
  console.log(`[cleanup] Removed ${expired.length} expired message(s)`);
}

// Also clean up expired password sessions
function cleanSessions() {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}

function scheduleCleanup() {
  // Run once on startup
  try { runCleanup(); cleanSessions(); } catch (e) { console.error('[cleanup] startup error:', e.message); }

  setInterval(() => {
    try { runCleanup(); cleanSessions(); } catch (e) { console.error('[cleanup] error:', e.message); }
  }, INTERVAL_MS);
}

module.exports = { scheduleCleanup, runCleanup };
