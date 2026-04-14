const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DEV = process.env.NODE_ENV !== 'production';

// ─── Config (password hash lives in /data/config.json, never in DB) ──────────

function configPath() {
  return path.join(DATA_DIR, 'config.json');
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); }
  catch { return {}; }
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function getPasswordHash() {
  // RELAY_PASSWORD env var is the recovery/override mechanism
  if (process.env.RELAY_PASSWORD) {
    return bcrypt.hashSync(process.env.RELAY_PASSWORD, 10);
  }
  return readConfig().password_hash || null;
}

function setPassword(plaintext) {
  const cfg = readConfig();
  cfg.password_hash = bcrypt.hashSync(plaintext, 12);
  writeConfig(cfg);
}

function checkPassword(plaintext) {
  const hash = getPasswordHash();
  if (!hash) return false;
  return bcrypt.compareSync(plaintext, hash);
}

function hasPassword() {
  return !!getPasswordHash();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Device helpers ───────────────────────────────────────────────────────────

function addDeviceToAllChannel(deviceId) {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO channel_members (channel_id, device_id, joined_at) VALUES ('all', ?, ?)"
  ).run(deviceId, new Date().toISOString());
}

function approveDevice(candidateId, name, isAdmin = false) {
  const db = getDb();
  const token = generateToken();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO devices (id, name, token, is_admin, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(candidateId, name, token, isAdmin ? 1 : 0, now);

  addDeviceToAllChannel(candidateId);
  return token;
}

// ─── Setup state ──────────────────────────────────────────────────────────────

function isSetupNeeded() {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) as count FROM devices').get();
  return count === 0;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * requireDevice — validates relay_token cookie against devices table.
 * In dev mode any candidate ID is auto-approved.
 */
function requireDevice(req, res, next) {
  const db = getDb();

  if (DEV) {
    const candidateId = req.cookies.relay_candidate || req.headers['x-candidate-id'] || uuidv4();
    let device = db.prepare('SELECT * FROM devices WHERE id = ?').get(candidateId);
    if (!device) {
      const token = generateToken();
      db.prepare(
        'INSERT OR IGNORE INTO devices (id, name, token, is_admin, created_at) VALUES (?, ?, ?, 1, ?)'
      ).run(candidateId, `Dev ${candidateId.slice(0, 6)}`, token, new Date().toISOString());
      addDeviceToAllChannel(candidateId);
      device = db.prepare('SELECT * FROM devices WHERE id = ?').get(candidateId);
      res.cookie('relay_token', device.token, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000 });
    }
    req.device = device;
    return next();
  }

  const token = req.cookies.relay_token;
  if (!token) return res.status(401).json({ error: 'not_authenticated' });

  const device = db.prepare('SELECT * FROM devices WHERE token = ?').get(token);
  if (!device) return res.status(401).json({ error: 'device_not_whitelisted' });

  db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), device.id);
  req.device = device;
  next();
}

/**
 * requireAdmin — device admin OR active password session.
 * Can be used standalone (without requireDevice first).
 */
function requireAdmin(req, res, next) {
  const db = getDb();

  // Check device token with admin flag
  const token = req.cookies.relay_token;
  if (token) {
    const device = db.prepare('SELECT * FROM devices WHERE token = ?').get(token);
    if (device && device.is_admin) {
      req.device = device;
      return next();
    }
  }

  // Check password session
  const sessionToken = req.cookies.relay_session;
  if (sessionToken) {
    const session = db.prepare(
      'SELECT * FROM sessions WHERE token = ? AND expires_at > ?'
    ).get(sessionToken, new Date().toISOString());
    if (session) {
      req.isPasswordAdmin = true;
      return next();
    }
  }

  return res.status(403).json({ error: 'admin_required' });
}

module.exports = {
  requireDevice,
  requireAdmin,
  checkPassword,
  setPassword,
  hasPassword,
  generateToken,
  approveDevice,
  addDeviceToAllChannel,
  isSetupNeeded,
  readConfig,
  writeConfig,
};
