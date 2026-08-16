const assert = require('node:assert/strict');
const {
  hasAnotherPresenceSocket,
  expireStalePresenceSockets,
  isPresenceHeartbeatFresh,
  renewPresenceLease,
} = require('../src/services/presence');

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

const joinedSocket = { data: { presenceJoined: true, lastPresenceHeartbeatAt: 1000 } };
assert.equal(renewPresenceLease(joinedSocket, 50_000), true);
assert.equal(joinedSocket.data.lastPresenceHeartbeatAt, 50_000);
const unjoinedSocket = { data: { presenceJoined: false } };
assert.equal(renewPresenceLease(unjoinedSocket, 50_000), false);
assert.equal(unjoinedSocket.data.lastPresenceHeartbeatAt, undefined);

// Repeated heartbeats renew only an already joined socket and never make an
// unjoined socket implicitly present.
assert.equal(renewPresenceLease(joinedSocket, 60_000), true);
assert.equal(renewPresenceLease(joinedSocket, 70_000), true);
assert.equal(joinedSocket.data.lastPresenceHeartbeatAt, 70_000);
assert.equal(unjoinedSocket.data.presenceJoined, false);

const staleSocket = { id: 'stale', data: { presenceJoined: true, lastPresenceHeartbeatAt: 1_000, user: { id: 'user-1' } } };
const freshSibling = { id: 'fresh', data: { presenceJoined: true, lastPresenceHeartbeatAt: 50_000, user: { id: 'user-1' } } };
const expired = expireStalePresenceSockets([staleSocket, freshSibling], 56_001, 55_000);
assert.deepEqual(expired.map((entry) => entry.id), ['stale']);
assert.equal(staleSocket.data.presenceJoined, false);
assert.equal(freshSibling.data.presenceJoined, true);
assert.equal(hasAnotherPresenceSocket([staleSocket, freshSibling], staleSocket.id, 'user-1'), true,
  'expiring one socket must keep the user online while a fresh sibling remains');

console.log('presence tests passed');
