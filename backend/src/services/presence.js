function isPresenceHeartbeatFresh(lastHeartbeatAt, now, timeoutMs) {
  const timestamp = Number(lastHeartbeatAt || 0);
  return timestamp > 0 && Number(now) - timestamp <= Number(timeoutMs);
}

function hasAnotherPresenceSocket(sockets, sourceSocketId, userId) {
  return Array.from(sockets || []).some(
    (candidate) =>
      candidate.id !== sourceSocketId &&
      candidate.data?.presenceJoined === true &&
      candidate.data?.user?.id === userId
  );
}

function renewPresenceLease(socket, now = Date.now()) {
  if (!socket?.data?.presenceJoined) return false;
  socket.data.lastPresenceHeartbeatAt = Number(now);
  return true;
}

function expireStalePresenceSockets(sockets, now, timeoutMs) {
  const expired = [];
  Array.from(sockets || []).forEach((candidate) => {
    if (!candidate.data?.presenceJoined) return;
    if (isPresenceHeartbeatFresh(candidate.data.lastPresenceHeartbeatAt, now, timeoutMs)) return;
    candidate.data.presenceJoined = false;
    expired.push(candidate);
  });
  return expired;
}

module.exports = {
  hasAnotherPresenceSocket,
  expireStalePresenceSockets,
  isPresenceHeartbeatFresh,
  renewPresenceLease
};
