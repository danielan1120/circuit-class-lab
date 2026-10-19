import assert from "node:assert/strict";
import { test } from "node:test";
import { CLASS_NUMBERS, getClassBoardPath, getClassLabel, getClassRoom, parseClassNumber } from "../lib/classrooms.ts";
import { validateRoom, validateUpload } from "../lib/graph-validation.ts";

test("class URL parsing accepts exactly 1 to 8 and defaults invalid inputs to class 1", () => {
  for (const number of CLASS_NUMBERS) assert.equal(parseClassNumber(String(number)), number);
  for (const value of [null, "", "0", "9", "01", "2.0", " 2", "2 ", "2반", "1&class=8"]) {
    assert.equal(parseClassNumber(value), 1);
  }
});

test("class 1 preserves existing graph rooms; classes 2 to 8 have distinct rooms", () => {
  for (const base of ["classroom", "class-12345678", "A_b-9", "x".repeat(48)]) {
    const rooms = CLASS_NUMBERS.map((number) => getClassRoom(base, number));
    assert.equal(rooms[0], base);
    assert.equal(new Set(rooms).size, 8);
    for (const room of rooms) assert.equal(validateRoom(room), room);
    for (const number of CLASS_NUMBERS.slice(1)) assert.equal(rooms[number - 1], `${base}--g2c${number}`);
  }
  assert.notEqual(getClassRoom("lesson-A", 2), getClassRoom("lesson-B", 2));
});

test("long existing 48-character room links round-trip with their selected class", async () => {
  const base = "a".repeat(48);
  const room = getClassRoom(base, 8);
  assert.equal(room.length, 54);
  const url = new URL(getClassBoardPath(base, 8), "https://lab.example/");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("room"), base);
  const selected = parseClassNumber(url.searchParams.get("class"));
  assert.equal(selected, 8);
  assert.equal(getClassRoom(url.searchParams.get("room"), selected), room);
  const form = new FormData();
  form.set("room", room);
  form.set("group", "6");
  form.set("experiment", "resistance");
  form.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "graph.jpg", { type: "image/jpeg" }));
  assert.equal((await validateUpload(form)).room, room);
});

test("board paths retain the base session code and canonical class parameter", () => {
  assert.equal(getClassBoardPath("classroom", 1), "?room=classroom&class=1");
  for (const number of CLASS_NUMBERS) {
    assert.equal(getClassLabel(number), `2학년 ${number}반`);
    const url = new URL(getClassBoardPath("class-123_A", number), "https://lab.example/");
    assert.equal(url.searchParams.get("room"), "class-123_A");
    assert.equal(url.searchParams.get("class"), String(number));
    assert.equal(url.searchParams.size, 2);
  }
});

test("helpers reject invalid class numbers and base-room lengths without silently aliasing data", () => {
  for (const number of [0, 9, 1.5, NaN, Infinity]) {
    assert.throws(() => getClassLabel(number), RangeError);
    assert.throws(() => getClassRoom("classroom", number), RangeError);
    assert.throws(() => getClassBoardPath("classroom", number), RangeError);
  }
  for (const room of ["", "../classroom", "한글", "x".repeat(49)]) {
    assert.throws(() => getClassRoom(room, 1), RangeError);
    assert.throws(() => getClassBoardPath(room, 8), RangeError);
  }
});
