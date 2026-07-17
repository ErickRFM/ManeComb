let ioInstance = null;

function setSocketIO(io) {
  ioInstance = io;
}

function emit(eventName, data) {
  if (!ioInstance) return;

  try {
    ioInstance.emit(eventName, {
      ...data,
      _timestamp: new Date().toISOString()
    });
  } catch {
  }
}

function emitToOrganization(organizationId, eventName, data) {
  if (!ioInstance || !organizationId) return;

  try {
    ioInstance.to(`org:${organizationId}`).emit(eventName, {
      ...data,
      _timestamp: new Date().toISOString()
    });
  } catch {
  }
}

function emitToUser(userId, eventName, data) {
  if (!ioInstance || !userId) return;

  try {
    ioInstance.to(`user:${userId}`).emit(eventName, {
      ...data,
      _timestamp: new Date().toISOString()
    });
  } catch {
  }
}

function getIO() {
  return ioInstance;
}

module.exports = {
  setSocketIO,
  emit,
  emitToOrganization,
  emitToUser,
  getIO
};
