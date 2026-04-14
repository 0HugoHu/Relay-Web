const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireDevice } = require('../auth');
const { generatePreview, getUploadDir } = require('../preview');
const { bus } = require('../stream');

const DATA_DIR = process.env.DATA_DIR || '/data';
const router = express.Router();
router.use(requireDevice);

// Multer: store to temp, we move after generating ID
const upload = multer({
  dest: path.join(DATA_DIR, 'tmp'),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMember(db, channelId, deviceId) {
  return !!db.prepare(
    'SELECT 1 FROM channel_members WHERE channel_id = ? AND device_id = ?'
  ).get(channelId, deviceId);
}

function getChannelOrFail(db, channelId, deviceId, res) {
  if (!isMember(db, channelId, deviceId)) {
    res.status(403).json({ error: 'not_a_member' });
    return null;
  }
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!ch) { res.status(404).json({ error: 'channel_not_found' }); return null; }
  return ch;
}

function formatMessage(msg) {
  return {
    id: msg.id,
    channel_id: msg.channel_id,
    sender_id: msg.sender_id,
    sender_name: msg.sender_name || null,
    type: msg.type,
    content: msg.content,
    file_id: msg.file_id,
    filename: msg.filename || null,
    mimetype: msg.mimetype || null,
    size_bytes: msg.size_bytes || null,
    has_preview: msg.has_preview === 1,
    has_thumb: msg.has_thumb === 1,
    burn_on_read: msg.burn_on_read === 1,
    expires_at: msg.expires_at,
    created_at: msg.created_at,
  };
}

// ─── List all whitelisted devices (any authenticated device can call this) ───
// GET /api/channels/devices
router.get('/devices', (req, res) => {
  const db = getDb();
  const devices = db.prepare(
    'SELECT id, name, is_admin, last_seen FROM devices ORDER BY name ASC'
  ).all();
  res.json(devices);
});

// ─── List channels for this device ───────────────────────────────────────────
// GET /api/channels
router.get('/', (req, res) => {
  const db = getDb();
  const channels = db.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
           (SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) as member_count,
           (SELECT m.content FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_text,
           (SELECT m.type FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_type,
           (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_at
    FROM channels c
    JOIN channel_members cm ON c.id = cm.channel_id
    WHERE cm.device_id = ?
    ORDER BY COALESCE(last_at, c.created_at) DESC
  `).all(req.device.id);

  res.json(channels);
});

// POST /api/channels/direct   { target_device_id }
router.post('/direct', (req, res) => {
  const db = getDb();
  const { target_device_id } = req.body;
  if (!target_device_id) return res.status(400).json({ error: 'target_device_id required' });

  const target = db.prepare('SELECT id, name FROM devices WHERE id = ?').get(target_device_id);
  if (!target) return res.status(404).json({ error: 'target_device_not_found' });

  // Check if direct channel already exists between these two
  const existing = db.prepare(`
    SELECT c.id FROM channels c
    JOIN channel_members a ON c.id = a.channel_id AND a.device_id = ?
    JOIN channel_members b ON c.id = b.channel_id AND b.device_id = ?
    WHERE c.type = 'direct'
  `).get(req.device.id, target_device_id);

  if (existing) return res.json({ id: existing.id });

  const channelId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO channels (id, type, name, created_by, created_at) VALUES (?, ?, NULL, ?, ?)'
  ).run(channelId, 'direct', req.device.id, now);

  db.prepare('INSERT INTO channel_members (channel_id, device_id, joined_at) VALUES (?, ?, ?)').run(channelId, req.device.id, now);
  db.prepare('INSERT INTO channel_members (channel_id, device_id, joined_at) VALUES (?, ?, ?)').run(channelId, target_device_id, now);

  res.json({ id: channelId });
});

// ─── Messages ─────────────────────────────────────────────────────────────────
// GET /api/channels/:id/messages?before=ISO&limit=50
router.get('/:id/messages', (req, res) => {
  const db = getDb();
  const ch = getChannelOrFail(db, req.params.id, req.device.id, res);
  if (!ch) return;

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before || new Date().toISOString();

  const rows = db.prepare(`
    SELECT m.*, d.name as sender_name, f.filename, f.mimetype, f.size_bytes, f.has_preview, f.has_thumb
    FROM messages m
    LEFT JOIN devices d ON m.sender_id = d.id
    LEFT JOIN files f ON m.file_id = f.id
    WHERE m.channel_id = ? AND m.created_at < ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(req.params.id, before, limit);

  // Handle burn-on-read: mark as read, then delete if already read by another device
  const now = new Date().toISOString();
  const burnIds = [];
  for (const row of rows) {
    if (row.burn_on_read && row.sender_id !== req.device.id) {
      // Mark as read
      db.prepare('INSERT OR IGNORE INTO message_reads (message_id, device_id, read_at) VALUES (?, ?, ?)')
        .run(row.id, req.device.id, now);
      burnIds.push(row.id);
    }
  }
  if (burnIds.length > 0) {
    // Delete burn-on-read messages that this device has now read
    const del = db.prepare('DELETE FROM messages WHERE id = ? AND burn_on_read = 1');
    db.transaction((ids) => { for (const id of ids) del.run(id); })(burnIds);
  }

  res.json(rows.reverse().map(formatMessage));
});

// POST /api/channels/:id/messages   { content, burn_on_read?, expires_in? }
router.post('/:id/messages', (req, res) => {
  const db = getDb();
  const ch = getChannelOrFail(db, req.params.id, req.device.id, res);
  if (!ch) return;

  const { content, burn_on_read, expires_in } = req.body;
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'content required' });

  const id = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = parseExpiresIn(expires_in);

  db.prepare(`
    INSERT INTO messages (id, channel_id, sender_id, type, content, burn_on_read, expires_at, created_at)
    VALUES (?, ?, ?, 'text', ?, ?, ?, ?)
  `).run(id, req.params.id, req.device.id, content, burn_on_read ? 1 : 0, expiresAt, now);

  const msg = db.prepare(`
    SELECT m.*, d.name as sender_name FROM messages m LEFT JOIN devices d ON m.sender_id = d.id WHERE m.id = ?
  `).get(id);

  const payload = formatMessage(msg);
  bus.emit(`channel:${req.params.id}`, { type: 'message', data: payload });
  res.json(payload);
});

// POST /api/channels/:id/upload  (multipart file)
router.post('/:id/upload', upload.single('file'), async (req, res) => {
  const db = getDb();
  const ch = getChannelOrFail(db, req.params.id, req.device.id, res);
  if (!ch) { if (req.file) fs.unlinkSync(req.file.path); return; }

  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

  const fileId = uuidv4();
  const msgId  = uuidv4();
  const now    = new Date().toISOString();
  // multer reads filename bytes as latin1; re-encode to UTF-8 for non-ASCII names (e.g. Chinese)
  const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const { mimetype, size } = req.file;
  const uploadDir = getUploadDir(fileId);
  const originalPath = path.join(uploadDir, 'original');

  fs.mkdirSync(uploadDir, { recursive: true });
  fs.renameSync(req.file.path, originalPath);

  // Detect message type
  const type = detectType(mimetype, originalname);
  const expiresAt = parseExpiresIn(req.body.expires_in);
  const burn = req.body.burn_on_read === 'true' ? 1 : 0;

  // Save file record first
  db.prepare(
    'INSERT INTO files (id, filename, mimetype, size_bytes) VALUES (?, ?, ?, ?)'
  ).run(fileId, originalname, mimetype, size);

  // Save message
  db.prepare(`
    INSERT INTO messages (id, channel_id, sender_id, type, file_id, burn_on_read, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(msgId, req.params.id, req.device.id, type, fileId, burn, expiresAt, now);

  // Generate preview async — don't block response
  generatePreview(fileId, mimetype, originalPath).then(({ hasPreview, hasThumb }) => {
    db.prepare('UPDATE files SET has_preview = ?, has_thumb = ? WHERE id = ?').run(
      hasPreview ? 1 : 0, hasThumb ? 1 : 0, fileId
    );
    // Notify SSE subscribers of updated preview flags
    bus.emit(`channel:${req.params.id}`, { type: 'file_ready', file_id: fileId, has_preview: hasPreview, has_thumb: hasThumb });
  }).catch(() => {});

  const msg = db.prepare(`
    SELECT m.*, d.name as sender_name, f.filename, f.mimetype, f.size_bytes, f.has_preview, f.has_thumb
    FROM messages m LEFT JOIN devices d ON m.sender_id = d.id LEFT JOIN files f ON m.file_id = f.id
    WHERE m.id = ?
  `).get(msgId);

  const payload = formatMessage(msg);
  bus.emit(`channel:${req.params.id}`, { type: 'message', data: payload });
  res.json(payload);
});

// DELETE /api/channels/messages/:id  (also wired directly in index.js as /api/messages/:id)
router.delete('/messages/:id', (req, res) => {
  const db = getDb();
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'not_found' });

  // Must be sender or admin
  if (msg.sender_id !== req.device.id && !req.device.is_admin) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Must be a member of the channel
  if (!isMember(db, msg.channel_id, req.device.id)) {
    return res.status(403).json({ error: 'not_a_member' });
  }

  if (msg.file_id) {
    const uploadDir = getUploadDir(msg.file_id);
    fs.rmSync(uploadDir, { recursive: true, force: true });
    db.prepare('DELETE FROM files WHERE id = ?').run(msg.file_id);
  }

  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  bus.emit(`channel:${msg.channel_id}`, { type: 'message_deleted', message_id: msg.id });
  res.json({ ok: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExpiresIn(val) {
  if (!val || val === 'never') return null;
  const map = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };
  const secs = map[val];
  if (!secs) return null;
  return new Date(Date.now() + secs * 1000).toISOString();
}

function detectType(mimetype, filename) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  // RAW extensions
  const ext = path.extname(filename || '').toLowerCase();
  if (['.cr2','.cr3','.nef','.arw','.dng','.raw','.orf','.rw2'].includes(ext)) return 'image';
  return 'file';
}

module.exports = router;
