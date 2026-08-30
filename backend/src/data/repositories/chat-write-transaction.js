const PENDING_TRANSACTION_TIMEOUT_MS = 15000;

const pendingByMessageId = new Map();

function normalizeMessageId(value) {
  return String(value || "").trim();
}

function topologySupportsTransactions(model) {
  const topologyType = String(
    model?.db?.getClient?.()?.topology?.description?.type || ""
  ).trim();

  return topologyType === "Sharded" || topologyType.startsWith("ReplicaSet");
}

function getPendingChatWrite(messageId) {
  return pendingByMessageId.get(normalizeMessageId(messageId)) || null;
}

async function settleContext(context, outcome, error = null) {
  if (!context || context.settled) return;
  context.settled = true;
  clearTimeout(context.timeout);
  pendingByMessageId.delete(context.messageId);

  try {
    if (outcome === "committed") {
      await context.session.commitTransaction();
    } else if (context.session.inTransaction()) {
      await context.session.abortTransaction();
    }
  } finally {
    await context.session.endSession().catch(() => undefined);
    context.resolveDone({ outcome, error });
  }
}

async function beginChatWriteTransaction(model, messageId) {
  const safeMessageId = normalizeMessageId(messageId);
  if (!safeMessageId || !topologySupportsTransactions(model)) return null;

  const existing = pendingByMessageId.get(safeMessageId);
  if (existing) {
    await existing.done;
    return { retryAfterPending: true };
  }

  const session = await model.db.startSession();
  session.startTransaction();

  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const context = {
    done,
    messageId: safeMessageId,
    resolveDone,
    session,
    settled: false,
    timeout: null
  };

  context.timeout = setTimeout(() => {
    settleContext(context, "aborted", new Error("chat_write_transaction_timeout")).catch(() => undefined);
  }, PENDING_TRANSACTION_TIMEOUT_MS);
  context.timeout.unref?.();
  pendingByMessageId.set(safeMessageId, context);
  return context;
}

async function commitChatWrite(messageId) {
  const context = getPendingChatWrite(messageId);
  if (!context) return false;
  await settleContext(context, "committed");
  return true;
}

async function abortChatWrite(messageId, error = null) {
  const context = getPendingChatWrite(messageId);
  if (!context) return false;
  await settleContext(context, "aborted", error);
  return true;
}

async function clearPendingChatWritesForTests() {
  const contexts = Array.from(pendingByMessageId.values());
  await Promise.all(contexts.map((context) => settleContext(context, "aborted").catch(() => undefined)));
}

module.exports = {
  abortChatWrite,
  beginChatWriteTransaction,
  clearPendingChatWritesForTests,
  commitChatWrite,
  getPendingChatWrite,
  topologySupportsTransactions
};
