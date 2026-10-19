// The Pages build supplies these constants. The full Sites build keeps its
// original same-origin API and root path without any additional configuration.
declare const __CIRCUIT_API_ORIGIN__: string;
declare const __CIRCUIT_BASE_PATH__: string;

export const API_ORIGIN = typeof __CIRCUIT_API_ORIGIN__ === "string" ? __CIRCUIT_API_ORIGIN__ : "";
export const APP_BASE_PATH = typeof __CIRCUIT_BASE_PATH__ === "string" ? __CIRCUIT_BASE_PATH__ : "/";

export function getApiUrl(path: string, apiOrigin = API_ORIGIN): string {
  return apiOrigin ? new URL(path, apiOrigin).href : path;
}

export function normalizeGraphImage<T extends { imageUrl: string }>(graph: T, apiOrigin = API_ORIGIN): T {
  return { ...graph, imageUrl: getApiUrl(graph.imageUrl, apiOrigin) };
}

export function getAppPath(query = "", basePath = APP_BASE_PATH): string {
  const path = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  const root = path === "/" ? "/" : `${path}/`;
  return `${root}${query ? (query.startsWith("?") ? query : `?${query}`) : ""}`;
}

export function getAppUrl(origin: string, query = "", basePath = APP_BASE_PATH): string {
  const path = getAppPath(query, basePath);
  return origin ? new URL(path, origin).href : path;
}
