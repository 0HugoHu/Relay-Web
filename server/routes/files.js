const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { requireDevice } = require('../auth');
const { getUploadDir } = require('../preview');

const router = express.Router();
router.use(requireDevice);

function getFileAndCheckAccess(db, fileId, deviceId, res) {
  const file = db.prepare('SELECT f.*, m.channel_id, m.sender_id FROM files f JOIN messages m ON m.file_id = f.id WHERE f.id = ?').get(fileId);
  if (!file) { res.status(404).json({ error: 'not_found' }); return null; }

  const isMember = db.prepare(
    'SELECT 1 FROM channel_members WHERE channel_id = ? AND device_id = ?'
  ).get(file.channel_id, deviceId);
  if (!isMember) { res.status(403).json({ error: 'forbidden' }); return null; }

  return file;
}

// GET /api/files/:id/original
router.get('/:id/original', (req, res) => {
  const db = getDb();
  const file = getFileAndCheckAccess(db, req.params.id, req.device.id, res);
  if (!file) return;

  const originalPath = path.join(getUploadDir(req.params.id), 'original');
  if (!fs.existsSync(originalPath)) return res.status(404).json({ error: 'file_not_found' });

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
  res.setHeader('Content-Type', file.mimetype);
  res.sendFile(originalPath);
});

// GET /api/files/:id/preview
router.get('/:id/preview', (req, res) => {
  const db = getDb();
  const file = getFileAndCheckAccess(db, req.params.id, req.device.id, res);
  if (!file) return;

  const dir = getUploadDir(req.params.id);

  // SVG: serve original directly
  if (file.mimetype === 'image/svg+xml') {
    const orig = path.join(dir, 'original');
    return fs.existsSync(orig) ? res.sendFile(orig) : res.status(404).end();
  }

  const previewPath = path.join(dir, 'preview.jpg');
  if (fs.existsSync(previewPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    return res.sendFile(previewPath);
  }

  // Fallback: serve original for images that don't need conversion
  if (file.mimetype.startsWith('image/') && !['image/heic','image/heif'].includes(file.mimetype)) {
    const orig = path.join(dir, 'original');
    if (fs.existsSync(orig)) {
      res.setHeader('Content-Type', file.mimetype);
      return res.sendFile(orig);
    }
  }

  res.status(404).json({ error: 'preview_not_ready' });
});

// GET /api/files/:id/thumb
router.get('/:id/thumb', (req, res) => {
  const db = getDb();
  const file = getFileAndCheckAccess(db, req.params.id, req.device.id, res);
  if (!file) return;

  const dir = getUploadDir(req.params.id);
  const thumbPath = path.join(dir, 'thumb.jpg');
  if (fs.existsSync(thumbPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    return res.sendFile(thumbPath);
  }

  // Fallback to preview
  const previewPath = path.join(dir, 'preview.jpg');
  if (fs.existsSync(previewPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    return res.sendFile(previewPath);
  }

  res.status(404).json({ error: 'thumb_not_ready' });
});

module.exports = router;
