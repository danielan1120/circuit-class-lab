import { GraphRequestError, checkSameOrigin, validateGraphId } from "@/lib/graph-validation";
import { graphBucket, graphDatabase, graphError, type StoredGraph } from "@/lib/graph-storage";
import { withGraphCors } from "@/lib/graph-cors.mjs";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkSameOrigin(request);
    const id = validateGraphId((await context.params).id);
    const row = await graphDatabase().prepare("SELECT * FROM graphs WHERE id = ?").bind(id).first<StoredGraph>();
    if (!row) throw new GraphRequestError("이미지를 찾을 수 없어요.", 404);
    const image = await graphBucket().get(row.image_key);
    if (!image) throw new GraphRequestError("이미지를 불러오지 못했어요. 다시 올려 주세요.", 404);
    if (!["image/jpeg", "image/png", "image/webp"].includes(row.mime_type)) {
      throw new GraphRequestError("지원하지 않는 이미지 형식이에요.", 415);
    }
    return withGraphCors(new Response(image.body, {
      headers: {
        "Content-Type": row.mime_type,
        "Content-Length": String(image.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": new URL(request.url).searchParams.get("download") === "1"
          ? `attachment; filename="graph-${row.group_number}.${row.mime_type === "image/jpeg" ? "jpg" : row.mime_type === "image/webp" ? "webp" : "png"}"`
          : "inline",
      },
    }), request);
  } catch (error) {
    return graphError(error, "image", request);
  }
}
