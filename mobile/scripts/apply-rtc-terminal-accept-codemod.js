const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(__dirname, '../src/features/calls/call-store.ts');
let source = fs.readFileSync(target, 'utf8');
const before = "        if (ack.code === 'call_expired') {";
const after = "        if (ack.code === 'call_expired' || ack.code === 'unknown_call') {";
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`terminal accept codemod expected one match, found ${count}`);
source = source.replace(before, after);
fs.writeFileSync(target, source);
console.log('rtc terminal accept convergence codemod: OK');
