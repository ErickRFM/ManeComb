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
  if (!context || context.settled || context.settling) return;
  context.settling = true;

  let finalOutcome = outcome;
  let finalError = error;

  try {
    if (outcome === "committed") {
      await context.session.commitTransaction();
    } else if (context.session.inTransaction()) {
      await context.session.abortTransaction();
    }
  } catch (settleError) {
    finalError = settleError;
    finalOutcome = outcome === "committed" ? "commit_unknown" : "abort_failed";
    throw settleError;
  } finally {
    context.settled = true;
    context.settling = false;
    if (pendingByMessageId.get(context.messageId) === context) {
      pendingByMessageId.delete(context.messageId);
    }
    await context.session.endSession().catch(() => undefined);
    context.resolveDone({ outcome: finalOutcome, error: finalError });
  }
}

async function beginChatWriteTransaction(model, messageId) {
  const safeMessageId = normalizeMessageId(messageId);
  if (!safeMessageId || !topologySupportsTransactions(model)) return null;

  const existing = pendingByMessageId.get(safeMessageId);
  if (existing) {
    // Never abort the transaction that owns this deterministic message id from
    // a timer. A background timeout could otherwise remove the session and let
    // the aggregate update run outside the transaction, recreating the exact
    // partial-write state this boundary exists to prevent. The owner settles
    // explicitly on commit/abort; concurrent replays wait for that authority.
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
    settling: false
  };

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
