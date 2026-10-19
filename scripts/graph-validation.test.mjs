import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GraphRequestError, MAX_IMAGE_SIZE, checkSameOrigin, hashToken, hashesMatch,
  identifyImage, newDeleteToken, validateRoom, validateUpload,
} from "../lib/graph-validation.ts";

function uploadForm(bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mime = "image/jpeg") {
  const form = new FormData();
  form.set("room", "science-2");
  form.set("group", "6");
  form.set("experiment", "voltage");
  form.set("note", "전압을 높이면 전류가 증가한다.");
  form.set("file", new File([bytes], "graph.jpg", { type: mime }));
  return form;
}

test("room codes preserve classroom separation and reject path injection", () => {
  assert.equal(validateRoom(null), "classroom");
  assert.equal(validateRoom("class-2_A"), "class-2_A");
  assert.equal(validateRoom("a".repeat(64)), "a".repeat(64));
  for (const value of ["", "../other", "한글", "a".repeat(65)]) {
    assert.throws(() => validateRoom(value), GraphRequestError);
  }
});

test("same-origin writes reject cross-origin requests", () => {
  checkSameOrigin(new Request("https://lab.example/api/graphs", { headers: { origin: "https://lab.example" } }));
  assert.throws(() => checkSameOrigin(new Request("https://lab.example/api/graphs", { headers: { origin: "https://other.example" } })), { status: 403 });
});

test("upload validation accepts a supported image and its group", async () => {
  const result = await validateUpload(uploadForm());
  assert.equal(result.group, 6);
  assert.equal(result.room, "science-2");
  assert.equal(result.mime, "image/jpeg");
});

test("image signatures recognize PNG and WebP and reject unsupported formats", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  assert.equal(identifyImage(png), "image/png");
  assert.equal(identifyImage(new TextEncoder().encode("RIFF1234WEBPVP8L")), "image/webp");
  assert.equal(identifyImage(new TextEncoder().encode("GIF89a")), null);
});

test("upload validation rejects fake images, duplicate slots, invalid fields and oversize files", async () => {
  await assert.rejects(validateUpload(uploadForm(new TextEncoder().encode("<svg></svg>"))), { status: 415 });
  await assert.rejects(validateUpload(uploadForm(undefined, "image/png")), { status: 415 });
  const duplicate = uploadForm(); duplicate.append("group", "1");
  await assert.rejects(validateUpload(duplicate), { status: 400 });
  const group = uploadForm(); group.set("group", "7");
  await assert.rejects(validateUpload(group), { status: 400 });
  const note = uploadForm(); note.set("note", "x".repeat(501));
  await assert.rejects(validateUpload(note), { status: 400 });
  await assert.rejects(validateUpload(uploadForm(new Uint8Array(MAX_IMAGE_SIZE + 1))), { status: 413 });
  assert.equal(identifyImage(new Uint8Array()), null);
});

test("delete tokens have independent SHA256 hashes", async () => {
  const token = newDeleteToken();
  assert.match(token, /^[0-9a-f]{64}$/);
  const hash = await hashToken(token);
  assert.notEqual(hash, token);
  assert.equal(hashesMatch(hash, await hashToken(token)), true);
  assert.equal(hashesMatch(hash, await hashToken(newDeleteToken())), false);
});
