const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const { scheduleCleanup } = require('./cleanup');

const PORT     = process.env.PORT     || 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';

// ─── Init ─────────────────────────────────────────────────────────────────────
initDb(DATA_DIR);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ─── Routes ───────────────────────────────────────────────────────────────────
const deviceRoutes   = require('./routes/device');
const manageRoutes   = require('./routes/manage');
const channelRoutes  = require('./routes/channels');
const fileRoutes     = require('./routes/files');
const streamRoutes   = require('./routes/stream');

app.use('/api/device', deviceRoutes);
app.use('/api/auth',   deviceRoutes);   // /api/auth/* are in device.js
app.use('/api/manage', manageRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/files',    fileRoutes);
app.use('/api/stream',   streamRoutes);

// Delete a message (standalone endpoint)
const { requireDevice } = require('./auth');
const { getDb } = require('./db');
const fs = require('fs');
const { getUploadDir } = require('./preview');
const { bus } = require('./stream');

app.delete('/api/messages/:id', requireDevice, (req, res) => {
  const db = getDb();
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'not_found' });

  const isMember = db.prepare(
    'SELECT 1 FROM channel_members WHERE channel_id = ? AND device_id = ?'
  ).get(msg.channel_id, req.device.id);
  if (!isMember) return res.status(403).json({ error: 'not_a_member' });
  if (msg.sender_id !== req.device.id && !req.device.is_admin) return res.status(403).json({ error: 'forbidden' });

  if (msg.file_id) {
    fs.rmSync(getUploadDir(msg.file_id), { recursive: true, force: true });
    db.prepare('DELETE FROM files WHERE id = ?').run(msg.file_id);
  }
  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  bus.emit(`channel:${msg.channel_id}`, { type: 'message_deleted', message_id: msg.id });
  res.json({ ok: true });
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ─── Frontend SPA ─────────────────────────────────────────────────────────────
const STATIC = path.join(__dirname, '../dist');
app.use(express.static(STATIC));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(STATIC, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
scheduleCleanup();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Relay server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});
