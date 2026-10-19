import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_BASE_PATH, API_ORIGIN, getApiUrl, getAppPath, getAppUrl, normalizeGraphImage } from "../lib/client-url.ts";
import { getClassBoardPath, getClassRoom, parseClassNumber } from "../lib/classrooms.ts";

const pagesOrigin = "https://danielan1120.github.io";
const pagesBase = "/circuit-class-lab/";
const apiOrigin = "https://circuit-class-lab-k8m4.tangyperch6.chatgpt.site";

test("the Sites build keeps same-origin APIs and root paths by default", () => {
  assert.equal(API_ORIGIN, "");
  assert.equal(APP_BASE_PATH, "/");
  assert.equal(getApiUrl("/api/graphs?room=classroom"), "/api/graphs?room=classroom");
  const query = `${getClassBoardPath("classroom", 1)}&exp=voltage`;
  assert.equal(getAppPath(query), "/?room=classroom&class=1&exp=voltage");
  assert.equal(getAppUrl("https://class.example", query), "https://class.example/?room=classroom&class=1&exp=voltage");
  assert.equal(normalizeGraphImage({ imageUrl: "/api/images/id" }).imageUrl, "/api/images/id");
});

test("Pages board and all 96 class/experiment/group links preserve their base and room mapping", () => {
  const baseRoom = "class-7f3a45b2";
  for (let classNumber = 1; classNumber <= 8; classNumber++) {
    for (const experiment of ["voltage", "resistance"]) {
      const query = `${getClassBoardPath(baseRoom, classNumber)}&exp=${experiment}`;
      const board = getAppUrl(pagesOrigin, query, pagesBase);
      assert.equal(new URL(board).pathname, pagesBase);
      assert.equal(getAppPath(query, pagesBase), new URL(board).pathname + new URL(board).search);
      for (let group = 1; group <= 6; group++) {
        const url = new URL(`${board}&group=${group}&upload=1`);
        assert.equal(url.origin, pagesOrigin);
        assert.equal(url.pathname, pagesBase);
        assert.equal(url.searchParams.get("room"), baseRoom);
        assert.equal(parseClassNumber(url.searchParams.get("class")), classNumber);
        assert.equal(url.searchParams.get("exp"), experiment);
        assert.equal(url.searchParams.get("group"), String(group));
        assert.equal(url.searchParams.get("upload"), "1");
        assert.equal(getClassRoom(url.searchParams.get("room"), classNumber), getClassRoom(baseRoom, classNumber));
      }
    }
  }
});

test("API routes and GET/POST graph images resolve to the backend rather than the Pages project", () => {
  const route = "/api/graphs?id=123&room=classroom--g2c8";
  assert.equal(getApiUrl(route, apiOrigin), `${apiOrigin}${route}`);
  assert.equal(getApiUrl("/api/graphs", apiOrigin), `${apiOrigin}/api/graphs`);
  const graph = { id: "example", imageUrl: "/api/images/example", group: 6 };
  const normalized = normalizeGraphImage(graph, apiOrigin);
  assert.deepEqual(normalized, { ...graph, imageUrl: `${apiOrigin}/api/images/example` });
  assert.equal(graph.imageUrl, "/api/images/example", "Normalization must not mutate shared response objects");
  assert.equal(normalizeGraphImage(normalized, apiOrigin).imageUrl, normalized.imageUrl);
  assert.equal(new URL(`${normalized.imageUrl}?download=1`).searchParams.get("download"), "1");
});

test("base paths accept a missing trailing slash and initial relative links stay inside the project", () => {
  assert.equal(getAppPath("room=classroom", "/circuit-class-lab"), "/circuit-class-lab/?room=classroom");
  assert.equal(getAppUrl("", "?class=8", pagesBase), "/circuit-class-lab/?class=8");
  assert.equal(getAppPath("", "/"), "/");
});
