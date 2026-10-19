import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { CLASS_NUMBERS, getClassBoardPath, getClassRoom } from "../lib/classrooms.ts";

// Usage: node --experimental-strip-types scripts/check-classrooms-api.mjs [https://published-site.example]
// Only a newly generated test room is written. All created graphs are deleted in finally.
const target = new URL(process.argv[2] || "http://localhost:3000");
assert.ok(["http:", "https:"].includes(target.protocol), "An HTTP(S) site URL is required");
// Exercise the existing 48-character base-room boundary in the real API too.
const baseRoom = `verify-g2-${Date.now().toString(36)}-${randomUUID().replaceAll("-", "")}`.slice(0, 48);
assert.equal(baseRoom.length, 48);
const experiments = ["voltage", "resistance"];
const cleanup = new Map();
const records = new Map();
let cleanupFailed = false;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(bytes));
  return Buffer.concat([length, bytes, crc]);
}

function testImage() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4);
  header[8] = 8; header[9] = 6;
  const pixels = Buffer.from([
    0, 16, 185, 129, 255, 59, 130, 246, 255,
    0, 59, 130, 246, 255, 16, 185, 129, 255,
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = testImage();
const apiUrl = (path) => new URL(path, target.origin);
const slotKey = (classNumber, experiment) => `${classNumber}:${experiment}`;

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { Origin: target.origin, ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`${response.status} ${path}: JSON API response expected; check target site/access`); }
  assert.ok(response.ok, `${response.status} ${path}: ${body.error || "request failed"}`);
  assert.match(response.headers.get("cache-control") || "", /no-store/, "Graph API must not be cached");
  return body;
}

async function list(classNumber) {
  const room = getClassRoom(baseRoom, classNumber);
  const result = await request(`/api/graphs?room=${encodeURIComponent(room)}`);
  assert.ok(Array.isArray(result.graphs), "API must return a graphs array");
  for (const graph of result.graphs) assert.equal(graph.room, room, "Cross-class graph leaked into a room");
  return result.graphs;
}

async function upload(classNumber, experiment, suffix = "initial") {
  const room = getClassRoom(baseRoom, classNumber);
  const note = `API smoke: ${baseRoom} / class ${classNumber} / ${experiment} / ${suffix}`;
  const form = new FormData();
  form.set("room", room); form.set("group", "1"); form.set("experiment", experiment); form.set("note", note);
  form.set("file", new File([png], "test-graph.png", { type: "image/png" }));
  const result = await request("/api/graphs", { method: "POST", body: form });
  assert.ok(result.graph?.id && result.deleteToken, "Upload must return graph and deletion token");
  cleanup.set(result.graph.id, { id: result.graph.id, room, token: result.deleteToken });
  assert.equal(result.graph.room, room);
  assert.equal(result.graph.group, 1);
  assert.equal(result.graph.experiment, experiment);
  assert.equal(result.graph.note, note);
  assert.equal(result.graph.imageUrl, `/api/images/${result.graph.id}`);
  records.set(slotKey(classNumber, experiment), result.graph);
  return result.graph;
}

async function verifyAllRooms() {
  for (const classNumber of CLASS_NUMBERS) {
    const rows = await list(classNumber);
    assert.equal(rows.length, 2, `Class ${classNumber} should contain exactly two independent experiment graphs`);
    for (const experiment of experiments) {
      const expected = records.get(slotKey(classNumber, experiment));
      const row = rows.find((graph) => graph.experiment === experiment && graph.group === 1);
      assert.ok(row, `Missing class ${classNumber} ${experiment} graph`);
      assert.equal(row.id, expected.id, `Class ${classNumber} ${experiment} unexpectedly changed`);
      assert.equal(row.note, expected.note);
    }
  }
}

console.log(`Checking ${target.origin} with isolated test room ${baseRoom}`);
try {
  for (const classNumber of CLASS_NUMBERS) {
    assert.deepEqual(await list(classNumber), [], "A fresh test room must start empty");
    for (const experiment of experiments) await upload(classNumber, experiment);
    const link = new URL(getClassBoardPath(baseRoom, classNumber), `${target.origin}/`);
    assert.equal(link.searchParams.get("class"), String(classNumber));
    assert.equal(link.searchParams.get("room"), baseRoom);
  }
  assert.equal(new Set([...records.values()].map((graph) => graph.id)).size, 16);
  await verifyAllRooms();
  console.log("PASS: all eight classes independently store both experiment graphs (16 distinct IDs)");

  const previous = records.get(slotKey(4, "voltage"));
  const replacement = await upload(4, "voltage", "replacement");
  assert.notEqual(replacement.id, previous.id);
  await verifyAllRooms();
  const oldImage = await fetch(apiUrl(previous.imageUrl), { signal: AbortSignal.timeout(20000) });
  await oldImage.arrayBuffer();
  assert.equal(oldImage.status, 404, "The overwritten graph image must no longer be public");
  const image = await fetch(apiUrl(replacement.imageUrl), { signal: AbortSignal.timeout(20000) });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png, "R2 image bytes must round-trip unchanged");
  console.log("PASS: replacing class 4 voltage preserves all other 15 graphs; R2 image bytes round-trip");
} catch (error) {
  process.exitCode = 1;
  console.error("FAIL:", error instanceof Error ? error.message : error);
} finally {
  for (const record of cleanup.values()) {
    try {
      const response = await fetch(apiUrl(`/api/graphs?id=${encodeURIComponent(record.id)}&room=${encodeURIComponent(record.room)}`), {
        method: "DELETE", headers: { Origin: target.origin, "X-Delete-Token": record.token },
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      // A successfully replaced graph has already been removed by its overwrite.
      assert.ok(response.ok || response.status === 404, `Cleanup ${response.status}: ${body.error || "failed"}`);
    } catch (error) {
      cleanupFailed = true;
      console.error(`Cleanup failed for test graph ${record.id}:`, error instanceof Error ? error.message : error);
    }
  }
  try {
    for (const classNumber of CLASS_NUMBERS) assert.deepEqual(await list(classNumber), [], `Class ${classNumber} cleanup incomplete`);
    console.log("PASS: all test graph records cleaned up; all eight test-class boards empty");
  } catch (error) {
    cleanupFailed = true;
    console.error("Cleanup verification failed:", error instanceof Error ? error.message : error);
  }
  if (cleanupFailed) process.exitCode = 1;
}
