const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const {
  requireDevice, requireAdmin,
  checkPassword, setPassword, hasPassword,
  generateToken, approveDevice, isSetupNeeded,
} = require('../auth');

const router = express.Router();

// ─── Public: identify this device/browser ─────────────────────────────────────
// GET /api/device/whoami
// Always public. Client sends X-Candidate-Id header (or relay_candidate cookie).
router.get('/whoami', (req, res) => {
  const db = getDb();
  const candidateId = req.headers['x-candidate-id'] || req.cookies.relay_candidate || null;

  if (!candidateId) {
    return res.json({ candidate_id: null, is_whitelisted: false, setup_needed: isSetupNeeded() });
  }

  const device = db.prepare('SELECT id, name, is_admin, last_seen FROM devices WHERE id = ?').get(candidateId);
  res.json({
    candidate_id: candidateId,
    is_whitelisted: !!device,
    device_name: device?.name || null,
    is_admin: device?.is_admin === 1,
    setup_needed: isSetupNeeded(),
    has_password: hasPassword(),
  });
});

// ─── Auth status ──────────────────────────────────────────────────────────────
// GET /api/auth/status
router.get('/status', (req, res) => {
  const db = getDb();
  const setup = isSetupNeeded();

  // Check device token
  const token = req.cookies.relay_token;
  if (token) {
    const device = db.prepare('SELECT id, name, is_admin FROM devices WHERE token = ?').get(token);
    if (device) {
      return res.json({ authenticated: true, mode: 'device', device_id: device.id, device_name: device.name, is_admin: device.is_admin === 1, setup_needed: false });
    }
  }

  // Check password session
  const sessionToken = req.cookies.relay_session;
  if (sessionToken) {
    const session = db.prepare(
      'SELECT token FROM sessions WHERE token = ? AND expires_at > ?'
    ).get(sessionToken, new Date().toISOString());
    if (session) {
      return res.json({ authenticated: true, mode: 'admin_session', is_admin: true, setup_needed: false });
    }
  }

  res.json({ authenticated: false, setup_needed: setup, has_password: hasPassword() });
});

// ─── Setup (first boot) ───────────────────────────────────────────────────────
// POST /api/auth/setup   { password, device_name, candidate_id }
router.post('/setup', (req, res) => {
  if (!isSetupNeeded()) {
    return res.status(400).json({ error: 'already_setup' });
  }

  const { password, device_name, candidate_id } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'password_too_short' });
  if (!candidate_id) return res.status(400).json({ error: 'candidate_id_required' });

  setPassword(password);

  const name = device_name || 'Admin Device';
  const token = approveDevice(candidate_id, name, true); // first device is admin

  res.cookie('relay_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000 });
  res.json({ ok: true, device_name: name });
});

// ─── Password login (always available as master key) ─────────────────────────
// POST /api/auth/login   { password }
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'invalid_password' });
  }

  // Issue a short-lived admin session (1 hour)
  const db = getDb();
  const sessionToken = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)'
  ).run(sessionToken, now.toISOString(), expires);

  res.cookie('relay_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 3600 * 1000 });
  res.json({ ok: true });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const db = getDb();
  const sessionToken = req.cookies.relay_session;
  if (sessionToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(sessionToken);
  }
  res.clearCookie('relay_session');
  // Note: we do NOT clear relay_token — the device stays whitelisted
  res.json({ ok: true });
});

// ─── Issue token to whitelisted device (called after admin approves) ──────────
// POST /api/auth/token   { candidate_id }  — called by the client to get their token
router.post('/token', (req, res) => {
  const db = getDb();
  const candidateId = req.headers['x-candidate-id'] || req.body.candidate_id;
  if (!candidateId) return res.status(400).json({ error: 'candidate_id_required' });

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(candidateId);
  if (!device) return res.status(403).json({ error: 'not_whitelisted' });

  // Refresh token for this session
  res.cookie('relay_token', device.token, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 24 * 3600 * 1000 });
  res.json({ ok: true, device_name: device.name, is_admin: device.is_admin === 1 });
});

module.exports = router;
