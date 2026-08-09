const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(__dirname, '../src/features/calls/call-store.ts');
let source = fs.readFileSync(target, 'utf8');

const before = `      if (!ack.ok) {
        onRuntimeFailed(
          activeCallId,
          ack.code === 'ack_timeout' ? 'accept_timeout' : 'accept_failed'
        );
        return;
      }`;
const after = `      if (!ack.ok) {
        if (ack.code === 'call_expired') {
          endWith('no_answer');
          return;
        }
        onRuntimeFailed(
          activeCallId,
          ack.code === 'ack_timeout' ? 'accept_timeout' : 'accept_failed'
        );
        return;
      }`;

const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`expired accept codemod expected one match, found ${count}`);
source = source.replace(before, after);
fs.writeFileSync(target, source);
console.log('rtc expired accept UI codemod: OK');
