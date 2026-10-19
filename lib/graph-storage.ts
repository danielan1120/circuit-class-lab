import { env } from "cloudflare:workers";
import { GraphRequestError, type Experiment, type ImageMime } from "./graph-validation";
import { withGraphCors } from "./graph-cors.mjs";

export interface StoredGraph {
  id: string;
  room: string;
  group_number: number;
  experiment: Experiment;
  image_key: string;
  mime_type: ImageMime;
  note: string;
  delete_token_hash: string;
  created_at: string;
}

export function graphDatabase(): D1Database {
  if (!env.DB) throw new GraphRequestError("그래프 저장소를 준비 중이에요. 잠시 후 다시 시도해 주세요.", 503);
  return env.DB;
}

export function graphBucket(): R2Bucket {
  if (!env.BUCKET) throw new GraphRequestError("이미지 저장소를 준비 중이에요. 잠시 후 다시 시도해 주세요.", 503);
  return env.BUCKET;
}

export function publicGraph(row: StoredGraph) {
  return {
    id: row.id, room: row.room, group: row.group_number, experiment: row.experiment,
    imageUrl: `/api/images/${row.id}`, note: row.note, createdAt: row.created_at,
  };
}

export function graphJson(body: unknown, status = 200, request?: Request): Response {
  const response = Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return request ? withGraphCors(response, request) : response;
}

export function graphError(error: unknown, operation: string, request?: Request): Response {
  if (error instanceof GraphRequestError) return graphJson({ error: error.message }, error.status, request);
  console.error(`Graph storage ${operation} failed`, error);
  return graphJson({ error: "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." }, 503, request);
}
