const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const assetPath = path.join(root, 'ventas/public/logo-email.png');
const canonicalComponents = fs.readFileSync(
  path.join(root, 'communication-service/src/templates/components.js'),
  'utf8'
);
const backendAdapter = fs.readFileSync(
  path.join(root, 'backend/modules/communication/index.js'),
  'utf8'
);

assert.ok(fs.existsSync(assetPath), 'Debe existir el wordmark publicado para los correos');
const asset = fs.readFileSync(assetPath);
assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.ok(asset.length > 2000, 'El PNG del logo no debe estar vacio');
assert.match(canonicalComponents, /https:\/\/manecomb1\.pages\.dev\/logo-email\.png/);
assert.match(canonicalComponents, /width="200"/);
assert.match(canonicalComponents, /border-radius: 10px/);
assert.match(
  backendAdapter,
  /require\(["']\.\.\/\.\.\/\.\.\/communication-service\/src["']\)/,
  'Backend debe consumir la plantilla canónica a través de Communication Service, no una copia embebida'
);
console.log('ok - correos usan un solo wordmark y una sola autoridad de templates');
