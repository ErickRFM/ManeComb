const assert = require('node:assert/strict');
const { hasAnotherPresenceSocket, isPresenceHeartbeatFresh } = require('../src/services/presence');

assert.equal(isPresenceHeartbeatFresh(1000, 55999, 55000), true);
assert.equal(isPresenceHeartbeatFresh(1000, 56001, 55000), false);
assert.equal(isPresenceHeartbeatFresh(null, 1000, 55000), false);

const sockets = [
  { id: 'socket-a', data: { presenceJoined: true, user: { id: 'user-1' } } },
  { id: 'socket-b', data: { presenceJoined: true, user: { id: 'user-1' } } },
  { id: 'socket-c', data: { presenceJoined: true, user: { id: 'user-2' } } },
];
assert.equal(hasAnotherPresenceSocket(sockets, 'socket-a', 'user-1'), true);
sockets[1].data.presenceJoined = false;
assert.equal(hasAnotherPresenceSocket(sockets, 'socket-a', 'user-1'), false);

console.log('presence tests passed');
