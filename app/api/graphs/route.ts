import {
  GraphRequestError, MAX_REQUEST_SIZE, checkSameOrigin, hashToken, hashesMatch,
  newDeleteToken, validateGraphId, validateRoom, validateUpload,
} from "@/lib/graph-validation";
import {
  graphBucket, graphDatabase, graphError, graphJson, publicGraph, type StoredGraph,
} from "@/lib/graph-storage";
import { graphPreflight } from "@/lib/graph-cors.mjs";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return graphPreflight(request);
}

export async function GET(request: Request) {
  try {
    checkSameOrigin(request);
    const room = validateRoom(new URL(request.url).searchParams.get("room"));
    const result = await graphDatabase().prepare(
      "SELECT * FROM graphs WHERE room = ? ORDER BY group_number, experiment",
    ).bind(room).all<StoredGraph>();
    if (!result.success) throw new Error("Graph list query failed");
    return graphJson({ graphs: result.results.map(publicGraph), syncedAt: new Date().toISOString() }, 200, request);
  } catch (error) {
    return graphError(error, "list", request);
  }
}

export async function POST(request: Request) {
  let uploadedKey: string | undefined;
  let committed = false;
  try {
    checkSameOrigin(request);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new GraphRequestError("그래프 이미지를 선택해서 올려 주세요.", 415);
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_REQUEST_SIZE) throw new GraphRequestError("이미지는 8MB 이하로 올려 주세요.", 413);
    let form: FormData;
    try { form = await request.formData(); }
    catch { throw new GraphRequestError("업로드 정보를 읽지 못했어요. 다시 시도해 주세요."); }
    const upload = await validateUpload(form);
    const db = graphDatabase();
    const bucket = graphBucket();
    const id = crypto.randomUUID();
    const key = `graphs/${upload.room}/${id}`;
    const deleteToken = newDeleteToken();
    const tokenHash = await hashToken(deleteToken);
    const createdAt = new Date().toISOString();
    const stored = await bucket.put(key, upload.bytes, {
      httpMetadata: { contentType: upload.mime, cacheControl: "private, no-store" },
      customMetadata: { graphId: id },
    });
    if (!stored) throw new Error("Image object was not stored");
    uploadedKey = key;

    // D1 executes this batch atomically, so the first result identifies the
    // exact previous image replaced by this write, even with simultaneous uploads.
    const batch = await db.batch<{ image_key: string }>([
      db.prepare("SELECT image_key FROM graphs WHERE room = ? AND group_number = ? AND experiment = ?")
        .bind(upload.room, upload.group, upload.experiment),
      db.prepare(`INSERT INTO graphs
        (id, room, group_number, experiment, image_key, mime_type, note, delete_token_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room, group_number, experiment) DO UPDATE SET
        id = excluded.id, image_key = excluded.image_key, mime_type = excluded.mime_type,
        note = excluded.note, delete_token_hash = excluded.delete_token_hash, created_at = excluded.created_at`)
        .bind(id, upload.room, upload.group, upload.experiment, key, upload.mime, upload.note, tokenHash, createdAt),
    ]);
    if (batch.some((result) => !result.success)) throw new Error("Graph write transaction failed");
    committed = true;
    const previousKey = batch[0].results[0]?.image_key;
    if (previousKey && previousKey !== key) {
      try { await bucket.delete(previousKey); }
      catch (error) { console.error("Previous graph object cleanup failed", error); }
    }
    return graphJson({
      graph: publicGraph({ id, room: upload.room, group_number: upload.group, experiment: upload.experiment,
        image_key: key, mime_type: upload.mime, note: upload.note, delete_token_hash: tokenHash, created_at: createdAt }),
      deleteToken,
    }, 201, request);
  } catch (error) {
    if (uploadedKey && !committed) {
      // A transport failure can occur after D1 commits. Never remove an image
      // that a committed row may already reference; an uncertain orphan is safer.
      try {
        const referenced = await graphDatabase().prepare("SELECT id FROM graphs WHERE image_key = ? LIMIT 1")
          .bind(uploadedKey).first<{ id: string }>();
        if (!referenced) await graphBucket().delete(uploadedKey);
      } catch (cleanupError) { console.error("Uncommitted graph object cleanup deferred", cleanupError); }
    }
    return graphError(error, "upload", request);
  }
}

export async function DELETE(request: Request) {
  try {
    checkSameOrigin(request);
    const params = new URL(request.url).searchParams;
    const id = validateGraphId(params.get("id"));
    const room = validateRoom(params.get("room"));
    const token = request.headers.get("X-Delete-Token");
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      throw new GraphRequestError("이 기기에서 직접 올린 그래프만 삭제할 수 있어요.", 403);
    }
    const db = graphDatabase();
    const bucket = graphBucket();
    const row = await db.prepare("SELECT * FROM graphs WHERE id = ? AND room = ?").bind(id, room).first<StoredGraph>();
    if (!row) throw new GraphRequestError("그래프가 이미 삭제되었거나 다른 그래프로 바뀌었어요.", 404);
    const tokenHash = await hashToken(token);
    if (!hashesMatch(tokenHash, row.delete_token_hash)) {
      throw new GraphRequestError("이 기기에서 직접 올린 그래프만 삭제할 수 있어요.", 403);
    }
    const deleted = await db.prepare("DELETE FROM graphs WHERE id = ? AND room = ? AND delete_token_hash = ? RETURNING image_key")
      .bind(id, room, tokenHash).first<{ image_key: string }>();
    if (!deleted) throw new GraphRequestError("그래프가 이미 삭제되었거나 다른 그래프로 바뀌었어요.", 404);
    try { await bucket.delete(deleted.image_key); }
    catch (error) { console.error("Deleted graph object cleanup failed", error); }
    return graphJson({ deleted: true, id }, 200, request);
  } catch (error) {
    return graphError(error, "delete", request);
  }
}
