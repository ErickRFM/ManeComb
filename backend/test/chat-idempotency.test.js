const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEmbeddedStore } = require("../src/data/store");
const {
  deleteChatMediaAsset,
  getChatMediaAsset,
  uploadChatMediaAsset
} = require("../src/services/chat-media");
const {
  buildChatMessageId,
  normalizeClientMessageId
} = require("../src/services/chat-message-idempotency");

async function main() {
  assert.equal(normalizeClientMessageId(" durable-message-01 "), "durable-message-01");
  assert.equal(normalizeClientMessageId("bad id"), "");

  // Este archivo sí forma parte de `backend npm test`. Además de probar el
  // store, fija el contrato HTTP para que un fast-path de replay no vuelva a
  // disparar Socket/FCM aunque el registro legacy no traiga `deduplicated:true`.
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/chat/routes.js"), "utf8");
  const mongo = fs.readFileSync(path.resolve(__dirname, "../src/data/mongo-store.js"), "utf8");
  const embedded = fs.readFileSync(path.resolve(__dirname, "../src/data/store.js"), "utf8");
  assert.match(
    routes,
    /const deduplicated = Boolean\(message\) && message\.deduplicated !== false;/,
    "La ruta debe clasificar como replay cualquier resultado que no sea una creación explícita"
  );
  assert.match(routes, /if \(!deduplicated\) emitConversationUpdate/);
  assert.match(routes, /if \(!deduplicated && recipientIds\.length\)/);
  assert.match(routes, /function buildMultipartMessageId\(req, conversation\)/);
  assert.match(routes, /deleteChatMediaAsset\(uploadedAsset\)/);
  assert.match(routes, /res\.status\(deduplicated \? 200 : 201\)/);
  assert.match(mongo, /const existingMessage = await ChatMessageModel\.findById\(message\.id\)\.lean\(\);/);
  assert.match(mongo, /deduplicated: false/);
  assert.match(embedded, /requestedMessageId/);
  assert.match(embedded, /deduplicated: false/);

  const store = createEmbeddedStore();
  const users = await store.listUsers();
  let source = null;
  let target = null;
  let conversation = null;
  for (const candidate of users) {
    for (const peer of users) {
      if (candidate.id === peer.id) continue;
      try {
        const opened = await store.ensureDirectConversation(candidate.id, peer.id, {
          channelMode: "chat"
        });
        source = candidate;
        target = peer;
        conversation = opened;
        break;
      } catch {
        // Try another pair from the same seeded tenant.
      }
    }
    if (conversation) break;
  }
  assert.ok(source && target && conversation, "Debe existir un par de usuarios del mismo tenant");

  const before = await store.getMessages(conversation.id, source.id);
  const clientMessageId = "durable-message-01";
  const messageId = buildChatMessageId({
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    senderId: source.id,
    clientMessageId
  });
  const first = await store.addMessage(conversation.id, source.id, {
    kind: "text",
    text: "Mensaje durable",
    messageId
  });
  const second = await store.addMessage(conversation.id, source.id, {
    kind: "text",
    text: "Mensaje durable",
    messageId
  });
  const after = await store.getMessages(conversation.id, source.id);

  assert.equal(first.id, messageId);
  assert.equal(first.deduplicated, false);
  assert.equal(second.id, messageId);
  assert.equal(second.deduplicated, true);
  assert.equal(after.length, before.length + 1, "El mismo intento solo debe persistirse una vez");
  assert.equal(after.filter((entry) => entry.id === messageId).length, 1);

  // El contrato determinista no es exclusivo de texto. Un retry multimedia con
  // el mismo clientMessageId debe devolver el primer mensaje/asset y nunca
  // reemplazarlo por el upload redundante del replay.
  const mediaMessageId = buildChatMessageId({
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    senderId: source.id,
    clientMessageId: "durable-media-01"
  });
  const mediaFirst = await store.addMessage(conversation.id, source.id, {
    kind: "image",
    text: "Evidencia",
    imageUrl: "/api/chat/media/local__first.png",
    mimeType: "image/png",
    messageId: mediaMessageId
  });
  const mediaReplay = await store.addMessage(conversation.id, source.id, {
    kind: "image",
    text: "Evidencia",
    imageUrl: "/api/chat/media/local__redundant.png",
    mimeType: "image/png",
    messageId: mediaMessageId
  });
  const afterMedia = await store.getMessages(conversation.id, source.id);

  assert.equal(mediaFirst.deduplicated, false);
  assert.equal(mediaReplay.deduplicated, true);
  assert.equal(mediaReplay.id, mediaMessageId);
  assert.equal(mediaReplay.imageUrl, "/api/chat/media/local__first.png");
  assert.equal(afterMedia.filter((entry) => entry.id === mediaMessageId).length, 1);

  // En CI no hay Mongo conectado ni credenciales Cloudinary, por lo que este
  // ejercicio usa el driver local real y fija que un asset redundante se puede
  // retirar mediante la misma frontera de storage que lo creó. No abrimos un
  // ReadStream antes de borrar: esa sería una carrera del propio test, no parte
  // del contrato de cleanup.
  const uploadedAsset = await uploadChatMediaAsset({
    buffer: Buffer.from("manecomb-media-idempotency"),
    mimetype: "image/png",
    originalname: "media-idempotency.png"
  });
  assert.equal(uploadedAsset.storageType, "local");
  assert.equal(await deleteChatMediaAsset(uploadedAsset), true);
  assert.equal(await getChatMediaAsset(uploadedAsset.storageKey), null);

  console.log("ok - chat texto/media persiste una vez, suprime replays y limpia assets redundantes");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
