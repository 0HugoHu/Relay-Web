// Shared in-memory event bus for SSE
const EventEmitter = require('events');
const bus = new EventEmitter();
bus.setMaxListeners(200);
module.exports = { bus };
