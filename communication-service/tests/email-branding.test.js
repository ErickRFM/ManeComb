const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const assetPath = path.join(root, 'ventas/public/logo-email.png');
const standalone = fs.readFileSync(
  path.join(root, 'communication-service/src/templates/components.js'),
  'utf8'
);
const embedded = fs.readFileSync(
  path.join(root, 'backend/modules/communication/templates/components.js'),
  'utf8'
);

assert.ok(fs.existsSync(assetPath), 'Debe existir el wordmark publicado para los correos');
const asset = fs.readFileSync(assetPath);
assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.ok(asset.length > 2000, 'El PNG del logo no debe estar vacio');
for (const template of [standalone, embedded]) {
  assert.match(template, /https:\/\/manecomb1\.pages\.dev\/logo-email\.png/);
  assert.match(template, /width="200"/);
  assert.match(template, /border-radius: 10px/);
}
console.log('ok - correos usan el wordmark real y publicado de ManeComb');
