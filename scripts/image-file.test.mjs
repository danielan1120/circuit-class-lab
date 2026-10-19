import assert from "node:assert/strict";
import { test } from "node:test";
import { readImageDataUrl, readImageFile } from "../lib/image-file.ts";

function installReader(t) {
  const original = globalThis.FileReader;
  const readers = [];
  class MockFileReader {
    result = null;
    error = null;
    onload = null;
    onerror = null;
    onabort = null;
    aborts = 0;
    method = null;
    source = null;
    constructor() { readers.push(this); }
    readAsArrayBuffer(source) { this.method = "buffer"; this.source = source; }
    readAsDataURL(source) { this.method = "data-url"; this.source = source; }
    abort() { this.aborts++; this.onabort?.(); }
    succeed(result) { this.result = result; this.onload?.(); }
    fail(error) { this.error = error; this.onerror?.(); }
  }
  globalThis.FileReader = MockFileReader;
  t.after(() => { if (original === undefined) delete globalThis.FileReader; else globalThis.FileReader = original; });
  return readers;
}

function jpg() {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0x31, 0xff, 0xd9])], "같은 그래프.jpg", {
    type: "image/jpeg", lastModified: 1700000000000,
  });
}

function assertCleaned(reader) {
  assert.equal(reader.onload, null);
  assert.equal(reader.onerror, null);
  assert.equal(reader.onabort, null);
}

test("snapshot reading starts immediately and preserves the JPG bytes and metadata in a new File", async (t) => {
  const readers = installReader(t);
  const source = jpg();
  const controller = new AbortController();
  const pending = readImageFile(source, controller.signal);
  assert.equal(readers.length, 1);
  const reader = readers[0];
  assert.equal(reader.method, "buffer", "The file read must begin before the caller clears the picker");
  assert.equal(reader.source, source);
  reader.succeed(await source.arrayBuffer());
  const snapshot = await pending;
  assert.notEqual(snapshot, source);
  assert.deepEqual(new Uint8Array(await snapshot.arrayBuffer()), new Uint8Array(await source.arrayBuffer()));
  assert.equal(snapshot.name, source.name);
  assert.equal(snapshot.type, source.type);
  assert.equal(snapshot.lastModified, source.lastModified);
  assert.equal(snapshot.size, source.size);
  assertCleaned(reader);
  controller.abort();
  assert.equal(reader.aborts, 0, "A settled read must no longer react to the old cancellation signal");
});

test("read errors retain the original FileReader error and clean event handlers", async (t) => {
  const readers = installReader(t);
  const pending = readImageFile(jpg());
  const error = new DOMException("The source file is no longer readable", "NotReadableError");
  readers[0].fail(error);
  await assert.rejects(pending, (actual) => actual === error);
  assertCleaned(readers[0]);
});

test("cancelling before the call does not start a read and rejects AbortError", async (t) => {
  const readers = installReader(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readImageFile(jpg(), controller.signal), { name: "AbortError" });
  assert.equal(readers[0].method, null);
  assert.equal(readers[0].aborts, 1);
  assertCleaned(readers[0]);
});

test("cancelling an active read aborts its reader and a delayed callback cannot revive it", async (t) => {
  const readers = installReader(t);
  const controller = new AbortController();
  const pending = readImageFile(jpg(), controller.signal);
  const reader = readers[0];
  const staleLoad = reader.onload;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(reader.aborts, 1);
  assertCleaned(reader);
  reader.result = await jpg().arrayBuffer();
  staleLoad();
  await assert.rejects(pending, { name: "AbortError" });
});

test("a partial read rejects instead of producing a truncated upload snapshot", async (t) => {
  const readers = installReader(t);
  const source = jpg();
  const pending = readImageFile(source);
  readers[0].succeed(new ArrayBuffer(source.size - 1));
  await assert.rejects(pending, /끝까지 읽지 못/);
  assertCleaned(readers[0]);
});

test("data URL fallback retains the selected JPEG bytes and MIME and cleans listeners", async (t) => {
  const readers = installReader(t);
  const file = jpg();
  const controller = new AbortController();
  const pending = readImageDataUrl(file, controller.signal);
  const reader = readers[0];
  assert.equal(reader.method, "data-url");
  assert.equal(reader.source, file);
  const bytes = Buffer.from(await file.arrayBuffer());
  reader.succeed(`data:${file.type};base64,${bytes.toString("base64")}`);
  const dataUrl = await pending;
  const [header, encoded] = dataUrl.split(",");
  assert.equal(header, "data:image/jpeg;base64");
  assert.deepEqual(Buffer.from(encoded, "base64"), bytes);
  assertCleaned(reader);
  controller.abort();
  assert.equal(reader.aborts, 0);
});

test("data URL reads also preserve read errors and support active cancellation", async (t) => {
  const readers = installReader(t);
  const failed = readImageDataUrl(jpg());
  const error = new DOMException("Read failed", "NotReadableError");
  readers[0].fail(error);
  await assert.rejects(failed, (actual) => actual === error);
  assertCleaned(readers[0]);
  const controller = new AbortController();
  const cancelled = readImageDataUrl(jpg(), controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal(readers[1].aborts, 1);
  assertCleaned(readers[1]);
});

test("synchronous reader failures reject with the original error and clean handlers", async (t) => {
  const readers = installReader(t);
  const error = new DOMException("Picker access denied", "SecurityError");
  globalThis.FileReader.prototype.readAsArrayBuffer = function () { throw error; };
  await assert.rejects(readImageFile(jpg()), (actual) => actual === error);
  assertCleaned(readers[0]);
});
