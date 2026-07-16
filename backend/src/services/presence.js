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

module.exports = { hasAnotherPresenceSocket, isPresenceHeartbeatFresh };
