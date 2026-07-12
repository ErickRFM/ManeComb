const assert = require("assert");
const { appendFrame, createWavBuffer } = require("./live-stream");

const transmission = { byteLength: 0, frames: [] };
const frame = Buffer.alloc(640, 7);
assert.equal(appendFrame(transmission, frame.toString("base64")), true);
assert.equal(transmission.byteLength, 640);
assert.equal(transmission.frames.length, 1);
assert.equal(appendFrame(transmission, ""), false);
assert.equal(appendFrame(transmission, Buffer.alloc(638).toString("base64")), false);
assert.equal(appendFrame(transmission, "not-base64"), false);
assert.equal(appendFrame(transmission, `${frame.toString("base64")}extra`), false);
assert.equal(appendFrame(transmission, Buffer.alloc(4096).toString("base64")), false);

const wav = createWavBuffer(frame);
assert.equal(wav.subarray(0, 4).toString(), "RIFF");
assert.equal(wav.subarray(8, 12).toString(), "WAVE");
assert.equal(wav.readUInt32LE(24), 16000);
assert.equal(wav.readUInt16LE(22), 1);
assert.equal(wav.readUInt16LE(34), 16);
assert.equal(wav.readUInt32LE(40), 640);
assert.deepEqual(wav.subarray(44), frame);

console.log("radio live stream tests passed");
