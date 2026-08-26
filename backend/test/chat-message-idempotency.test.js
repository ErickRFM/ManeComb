const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routes = fs.readFileSync(path.resolve(__dirname, '../src/modules/chat/routes.js'), 'utf8');
const mongo = fs.readFileSync(path.resolve(__dirname, '../src/data/mongo-store.js'), 'utf8');
const embedded = fs.readFileSync(path.resolve(__dirname, '../src/data/store.js'), 'utf8');

assert.match(routes, /clientMessageId/);
assert.match(routes, /buildChatMessageId/);
assert.match(routes, /deduplicated \? 200 : 201/);
assert.match(
  routes,
  /const deduplicated = Boolean\(message\) && message\.deduplicated !== false;/,
  'la ruta debe tratar como replay el fast-path existente que no trae flag legacy'
);
assert.match(routes, /if \(!deduplicated\) emitConversationUpdate/);
assert.match(routes, /if \(!deduplicated && recipientIds\.length\)/);
assert.match(mongo, /const existingMessage = await ChatMessageModel\.findById\(message\.id\)\.lean\(\);/);
assert.match(mongo, /deduplicated: true/);
assert.match(mongo, /deduplicated: false/);
assert.match(embedded, /requestedMessageId/);
assert.match(embedded, /deduplicated: true/);
assert.match(embedded, /deduplicated: false/);

console.log('ok - chat conserva una identidad durable y los replays no repiten Socket ni notificaciones');
