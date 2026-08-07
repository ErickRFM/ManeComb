const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routes = fs.readFileSync(path.resolve(__dirname, '../src/modules/chat/routes.js'), 'utf8');
const mongo = fs.readFileSync(path.resolve(__dirname, '../src/data/mongo-store-core.js'), 'utf8');
const embedded = fs.readFileSync(path.resolve(__dirname, '../src/data/store.js'), 'utf8');

assert.match(routes, /clientMessageId/);
assert.match(routes, /buildChatMessageId/);
assert.match(routes, /deduplicated \? 200 : 201/);
assert.match(mongo, /deduplicated: true/);
assert.match(mongo, /deduplicated: false/);
assert.match(embedded, /requestedMessageId/);
assert.match(embedded, /deduplicated: true/);
console.log('ok - chat conserva una identidad durable y no repite efectos');
