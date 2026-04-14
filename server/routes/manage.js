const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAdmin, generateToken, addDeviceToAllChannel } = require('../auth');
const { bus } = require('../stream');

const router = express.Router();
// All routes require admin
router.use(requireAdmin);

// ─── Devices ─────────────────────────────────────────────────────────────────

// GET /api/manage/devices
router.get('/devices', (req, res) => {
  const db = getDb();
  const devices = db.prepare(
    'SELECT id, name, is_admin, created_at, last_seen FROM devices ORDER BY created_at ASC'
  ).all();
  res.json(devices);
});

// POST /api/manage/devices  { candidate_id, name, is_admin? }
router.post('/devices', (req, res) => {
  const db = getDb();
  const { candidate_id, name, is_admin } = req.body;
  if (!candidate_id || !name) return res.status(400).json({ error: 'candidate_id and name required' });

  const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(candidate_id);
  if (existing) return res.status(409).json({ error: 'device_already_exists' });

  const token = generateToken();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO devices (id, name, token, is_admin, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(candidate_id, name.trim(), token, is_admin ? 1 : 0, now);

  addDeviceToAllChannel(candidate_id);
  bus.emit('membership_changed', { device_id: candidate_id });

  res.json({ ok: true, id: candidate_id, name: name.trim() });
});

// PATCH /api/manage/devices/:id  { name?, is_admin? }
router.patch('/devices/:id', (req, res) => {
  const db = getDb();
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'not_found' });

  const name     = req.body.name     !== undefined ? req.body.name.trim()      : device.name;
  const is_admin = req.body.is_admin !== undefined ? (req.body.is_admin ? 1 : 0) : device.is_admin;

  db.prepare('UPDATE devices SET name = ?, is_admin = ? WHERE id = ?').run(name, is_admin, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/manage/devices/:id
router.delete('/devices/:id', (req, res) => {
  const db = getDb();
  const device = db.prepare('SELECT id FROM devices WHERE id = ?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'not_found' });

  db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Channels ─────────────────────────────────────────────────────────────────

// GET /api/manage/channels
router.get('/channels', (req, res) => {
  const db = getDb();
  const channels = db.prepare(
    'SELECT c.*, COUNT(cm.device_id) as member_count FROM channels c LEFT JOIN channel_members cm ON c.id = cm.channel_id GROUP BY c.id ORDER BY c.created_at ASC'
  ).all();
  res.json(channels);
});

// POST /api/manage/channels  { name, member_ids: [] }
router.post('/channels', (req, res) => {
  const db = getDb();
  const { name, member_ids } = req.body;
  if (!name || !Array.isArray(member_ids) || member_ids.length < 2) {
    return res.status(400).json({ error: 'name and at least 2 member_ids required' });
  }

  const channelId = uuidv4();
  const now = new Date().toISOString();
  const createdBy = req.device?.id || null;

  db.prepare(
    'INSERT INTO channels (id, type, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(channelId, 'group', name.trim(), createdBy, now);

  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, device_id, joined_at) VALUES (?, ?, ?)'
  );
  const addAll = db.transaction((ids) => {
    for (const did of ids) {
      insertMember.run(channelId, did, now);
    }
  });
  addAll(member_ids);

  // Notify all new members so their sidebar updates instantly
  member_ids.forEach(did => bus.emit('membership_changed', { device_id: did }));

  res.json({ ok: true, id: channelId });
});

// PATCH /api/manage/channels/:id  { name }
router.patch('/channels/:id', (req, res) => {
  const db = getDb();
  const ch = db.prepare("SELECT id, type FROM channels WHERE id = ?").get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'not_found' });
  if (ch.type === 'all') return res.status(400).json({ error: 'cannot_rename_all_channel' });

  db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(req.body.name?.trim(), req.params.id);
  res.json({ ok: true });
});

// DELETE /api/manage/channels/:id
router.delete('/channels/:id', (req, res) => {
  const db = getDb();
  const ch = db.prepare("SELECT id, type FROM channels WHERE id = ?").get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'not_found' });
  if (ch.type === 'all') return res.status(400).json({ error: 'cannot_delete_all_channel' });

  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/manage/channels/:id/members   { device_id }
router.post('/channels/:id/members', (req, res) => {
  const db = getDb();
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id required' });

  const ch = db.prepare('SELECT id, type FROM channels WHERE id = ?').get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'channel_not_found' });

  db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, device_id, joined_at) VALUES (?, ?, ?)'
  ).run(req.params.id, device_id, new Date().toISOString());

  bus.emit('membership_changed', { device_id });

  res.json({ ok: true });
});

// DELETE /api/manage/channels/:id/members/:deviceId
router.delete('/channels/:id/members/:deviceId', (req, res) => {
  const db = getDb();
  const ch = db.prepare("SELECT type FROM channels WHERE id = ?").get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'channel_not_found' });
  if (ch.type === 'all') return res.status(400).json({ error: 'cannot_remove_from_all_channel' });

  db.prepare(
    'DELETE FROM channel_members WHERE channel_id = ? AND device_id = ?'
  ).run(req.params.id, req.params.deviceId);
  res.json({ ok: true });
});

// GET /api/manage/channels/:id/members
router.get('/channels/:id/members', (req, res) => {
  const db = getDb();
  const members = db.prepare(
    `SELECT d.id, d.name, d.is_admin, cm.joined_at
     FROM channel_members cm JOIN devices d ON cm.device_id = d.id
     WHERE cm.channel_id = ?`
  ).all(req.params.id);
  res.json(members);
});

module.exports = router;
