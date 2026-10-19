import assert from "node:assert/strict";
import { test } from "node:test";
import { graphCorsHeaders, graphPreflight, isAllowedGraphOrigin, withGraphCors } from "../lib/graph-cors.mjs";
import { checkSameOrigin } from "../lib/graph-validation.ts";

const backend = "https://lab.example/api/graphs";
const frontend = "https://danielan1120.github.io";
function request(origin, headers = {}) {
  return new Request(backend, { headers: { ...(origin === undefined ? {} : { Origin: origin }), ...headers } });
}

test("the self origin and the exact GitHub Pages origin may call the existing API", () => {
  for (const origin of ["https://lab.example", frontend, undefined]) {
    const req = request(origin);
    assert.equal(isAllowedGraphOrigin(req), true);
    assert.doesNotThrow(() => checkSameOrigin(req));
    const headers = graphCorsHeaders(req);
    assert.equal(headers.get("Access-Control-Allow-Origin"), origin ?? null);
    assert.match(headers.get("Vary"), /Origin/);
    assert.equal(headers.get("Access-Control-Allow-Credentials"), null);
  }
});

test("lookalike domains, other schemes, paths, ports and opaque origins are rejected", () => {
  for (const origin of [
    "https://attacker.example", "https://danielan1120.github.io.attacker.example",
    "https://other.danielan1120.github.io", "http://danielan1120.github.io",
    "https://danielan1120.github.io:444", "https://danielan1120.github.io/",
    "https://danielan1120.github.io/project", "null", "",
  ]) {
    const req = request(origin);
    assert.equal(isAllowedGraphOrigin(req), false, origin);
    assert.throws(() => checkSameOrigin(req), { status: 403 });
    assert.equal(graphCorsHeaders(req).get("Access-Control-Allow-Origin"), null);
  }
});

test("valid POST and token-bearing DELETE preflights return 204 with only explicit permissions", async () => {
  for (const [method, requested] of [["GET", ""], ["POST", "Content-Type"], ["DELETE", "X-Delete-Token, content-type"]]) {
    const response = graphPreflight(request(frontend, {
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requested,
    }));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), frontend);
    assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, POST, DELETE");
    assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type, X-Delete-Token");
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Vary"), /Origin/);
    assert.match(response.headers.get("Vary"), /Access-Control-Request-Method/);
  }
});

test("preflight rejects unauthorized origins, methods and extra headers", async () => {
  const forbiddenOrigin = graphPreflight(request("https://attacker.example", { "Access-Control-Request-Method": "POST" }));
  assert.equal(forbiddenOrigin.status, 403);
  assert.equal(forbiddenOrigin.headers.get("Access-Control-Allow-Origin"), null);
  for (const headers of [
    { "Access-Control-Request-Method": "PUT" },
    { "Access-Control-Request-Method": "DELETE", "Access-Control-Request-Headers": "Authorization" },
    { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type, X-Other" },
    { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "*" },
  ]) {
    const response = graphPreflight(request(frontend, headers));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), frontend, "The allowed app must be able to read its validation error");
    assert.ok((await response.json()).error);
    assert.equal(response.headers.get("Access-Control-Allow-Methods"), null);
  }
  assert.equal(graphPreflight(request(frontend)).status, 400);
});

test("success and error responses keep their body/status and expose CORS to the allowed app", async () => {
  for (const status of [200, 201, 400, 403, 413, 415, 503]) {
    const body = status < 400 ? { graphs: [] } : { error: "예상된 검증 오류" };
    const original = Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const response = withGraphCors(original, request(frontend));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), frontend);
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Vary"), /Origin/);
  }
});

test("Origin Vary preserves existing cache dimensions without duplicate Origin or credential permissions", () => {
  const response = graphCorsHeaders(request(frontend), {
    Vary: "Accept-Encoding, origin", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true",
  });
  assert.equal(response.get("Vary"), "Accept-Encoding, origin");
  assert.equal(response.get("Access-Control-Allow-Origin"), frontend);
  assert.equal(response.get("Access-Control-Allow-Credentials"), null);
  const rejected = graphCorsHeaders(request("https://attacker.example"), response);
  assert.equal(rejected.get("Access-Control-Allow-Origin"), null);
  assert.equal(rejected.get("Vary"), "Accept-Encoding, origin");
});
