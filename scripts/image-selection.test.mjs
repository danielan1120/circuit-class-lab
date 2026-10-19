import assert from "node:assert/strict";
import { test } from "node:test";
import { imageSelectionReducer as reduce } from "../lib/image-selection.ts";

function selection(id, name = "graph.jpg") {
  return { id, file: new File(["test bytes"], name, { type: "image/jpeg" }),
    url: `blob:test-${id}`, loaded: false, attempt: 0, phase: "preview" };
}
function event(state, type, extra = {}) {
  return reduce(state, { type, id: state.id, attempt: state.attempt, ...extra });
}

test("late image events from a closed group cannot affect the next group using the same JPG", () => {
  const first = selection(1);
  let state = event(first, "loaded");
  assert.equal(state.loaded, true);
  state = reduce(state, { type: "clear" });
  const second = { ...selection(2), file: first.file };
  state = reduce(state, { type: "select", selection: second });
  for (const type of ["failed", "loaded", "recover", "recovered"]) {
    state = reduce(state, { type, id: 1, attempt: 0, url: "data:image/jpeg;base64,old" });
    assert.equal(state, second);
  }
  assert.equal(event(state, "loaded").loaded, true);
});

test("rapid A to B to A replacement must wait for the latest selection's own load", () => {
  const first = selection(10, "A.jpg");
  const other = selection(11, "B.jpg");
  const latest = { ...selection(12, "A.jpg"), file: first.file };
  let state = event(first, "loaded");
  state = reduce(state, { type: "select", selection: other });
  state = reduce(state, { type: "select", selection: latest });
  for (const old of [first, other]) {
    for (const type of ["failed", "loaded", "recover"]) {
      state = reduce(state, { type, id: old.id, attempt: old.attempt });
      assert.equal(state, latest);
    }
  }
  assert.equal(event(state, "loaded").loaded, true);
});

test("switching from blob to data URL keeps file bytes and rejects old-attempt load/error", async () => {
  const original = selection(20);
  let state = event(original, "recover");
  assert.equal(state.phase, "recovering");
  assert.equal(state.loaded, false);
  assert.equal(state.attempt, 1);
  assert.equal(state.file, original.file);
  assert.equal(state.url, "");
  for (const type of ["loaded", "failed", "recover"]) {
    assert.equal(reduce(state, { type, id: original.id, attempt: 0 }), state);
  }
  state = event(state, "recovered", { url: "data:image/jpeg;base64,dGVzdCBieXRlcw==" });
  assert.equal(state.phase, "preview");
  assert.equal(state.loaded, false);
  assert.equal(await state.file.text(), "test bytes");
  state = event(state, "loaded");
  assert.equal(state.loaded, true);
  assert.equal(reduce(state, { type: "failed", id: state.id, attempt: 0 }), state);
});

test("load cannot enable sharing while data URL recovery is pending", () => {
  const state = event(selection(30), "recover");
  assert.equal(event(state, "loaded"), state);
  assert.equal(event(state, "recover"), state);
});

test("a final decode failure preserves the file for retry without enabling sharing", () => {
  const original = selection(40);
  let state = event(original, "recover");
  state = event(state, "recovered", { url: "data:image/jpeg;base64,broken" });
  state = event(state, "failed");
  assert.equal(state.phase, "failed");
  assert.equal(state.file, original.file);
  assert.equal(state.loaded, false);
  assert.equal(state.url, "");
  assert.equal(event(state, "loaded"), state);
  assert.equal(event(state, "recovered", { url: "data:old" }), state);
  const retry = { ...selection(41), file: state.file };
  state = reduce(state, { type: "select", selection: retry });
  assert.equal(reduce(state, { type: "failed", id: 40, attempt: 1 }), retry);
  assert.equal(event(state, "loaded").loaded, true);
});

test("closing the dialog rejects pending decode and recovery completions", () => {
  const pending = selection(50);
  const closed = reduce(event(pending, "recover"), { type: "clear" });
  for (const type of ["loaded", "failed", "recovered"]) {
    assert.equal(reduce(closed, { type, id: 50, attempt: 1, url: "data:old" }), null);
  }
});
