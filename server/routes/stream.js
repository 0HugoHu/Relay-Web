const express = require('express');
const { getDb } = require('../db');
const { requireDevice } = require('../auth');
const { bus } = require('../stream');

const router = express.Router();
router.use(requireDevice);

// GET /api/stream — unified SSE for all channels this device is in
router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const deviceId = req.device.id;
  const db = getDb();

  function getMyChannels() {
    return db.prepare(
      'SELECT channel_id FROM channel_members WHERE device_id = ?'
    ).all(deviceId).map(r => r.channel_id);
  }

  let channelIds = getMyChannels();
  const handlers = new Map();

  function subscribe() {
    // Unsubscribe from old handlers
    for (const [chId, handler] of handlers) {
      bus.off(`channel:${chId}`, handler);
    }
    handlers.clear();

    // Subscribe to current channels
    channelIds = getMyChannels();
    for (const chId of channelIds) {
      const handler = (data) => {
        send({ channel_id: chId, ...data });
      };
      bus.on(`channel:${chId}`, handler);
      handlers.set(chId, handler);
    }
  }

  function send(data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  }

  subscribe();

  // Re-subscribe and notify client when membership changes (new channel added)
  const membershipHandler = (data) => {
    if (data.device_id === deviceId) {
      subscribe();
      send({ type: 'channels_updated' });
    }
  };
  bus.on('membership_changed', membershipHandler);

  // Heartbeat every 25s to keep connection alive through proxies/NAT
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 25000);

  // Send initial connection event
  send({ type: 'connected', device_id: deviceId, channels: channelIds });

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('membership_changed', membershipHandler);
    for (const [chId, handler] of handlers) {
      bus.off(`channel:${chId}`, handler);
    }
  });
});

module.exports = router;
