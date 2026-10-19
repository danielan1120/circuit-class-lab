const EXTERNAL_FRONTEND_ORIGIN = "https://danielan1120.github.io";
const ALLOWED_METHODS = ["GET", "POST", "DELETE"];
const ALLOWED_HEADERS = ["content-type", "x-delete-token"];

/** @param {Request} request @returns {boolean} */
export function isAllowedGraphOrigin(request) {
  const origin = request.headers.get("Origin");
  // Requests without Origin include ordinary navigation and server-side clients.
  return origin === null || origin === new URL(request.url).origin || origin === EXTERNAL_FRONTEND_ORIGIN;
}

/** @param {Request} request @param {HeadersInit} [initial] @returns {Headers} */
export function graphCorsHeaders(request, initial) {
  const headers = new Headers(initial);
  const vary = (headers.get("Vary") || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!vary.some((value) => value.toLowerCase() === "origin")) vary.push("Origin");
  headers.set("Vary", vary.join(", "));
  const origin = request.headers.get("Origin");
  headers.delete("Access-Control-Allow-Credentials");
  headers.delete("Access-Control-Allow-Origin");
  if (origin && isAllowedGraphOrigin(request)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

/** @param {Response} response @param {Request} request @returns {Response} */
export function withGraphCors(response, request) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: graphCorsHeaders(request, response.headers),
  });
}

/** @param {Request} request @param {string} error @param {number} status */
function preflightError(request, error, status) {
  return withGraphCors(Response.json({ error }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  }), request);
}

/** @param {Request} request @returns {Response} */
export function graphPreflight(request) {
  if (!isAllowedGraphOrigin(request)) {
    return preflightError(request, "허용된 교실 페이지에서 다시 시도해 주세요.", 403);
  }
  const method = request.headers.get("Access-Control-Request-Method");
  if (!method) return preflightError(request, "요청 방식을 확인할 수 없어요.", 400);
  if (!ALLOWED_METHODS.includes(method)) {
    return preflightError(request, "지원하지 않는 요청 방식이에요.", 403);
  }
  const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (requestedHeaders.some((header) => !ALLOWED_HEADERS.includes(header))) {
    return preflightError(request, "허용되지 않은 요청 정보가 포함되어 있어요.", 403);
  }
  const headers = graphCorsHeaders(request, { "Cache-Control": "no-store" });
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Delete-Token");
  headers.set("Vary", `${headers.get("Vary")}, Access-Control-Request-Method, Access-Control-Request-Headers`);
  return new Response(null, { status: 204, headers });
}
