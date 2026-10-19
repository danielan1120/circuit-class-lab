import { isAllowedGraphOrigin } from "./graph-cors.mjs";

export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
export const MAX_REQUEST_SIZE = MAX_IMAGE_SIZE + 64 * 1024;
export const DEFAULT_ROOM = "classroom";
export type Experiment = "voltage" | "resistance";
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export class GraphRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "GraphRequestError";
  }
}

export function validateRoom(value: string | null): string {
  const room = value ?? DEFAULT_ROOM;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room)) {
    throw new GraphRequestError("교실 코드는 영문, 숫자, 밑줄, 붙임표로 1~64자까지 입력해 주세요.");
  }
  return room;
}

export function validateGraphId(value: string | null): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new GraphRequestError("그래프 주소가 올바르지 않아요.");
  }
  return value;
}

export function checkSameOrigin(request: Request): void {
  if (!isAllowedGraphOrigin(request)) {
    throw new GraphRequestError("이 교실 페이지에서 다시 시도해 주세요.", 403);
  }
}

function formText(form: FormData, key: string, optional = false): string {
  const values = form.getAll(key);
  if (optional && values.length === 0) return "";
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new GraphRequestError("업로드 정보가 올바르지 않아요. 다시 선택해 주세요.");
  }
  return values[0];
}

export function identifyImage(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 24 && pngSignature.every((byte, i) => bytes[i] === byte)
    && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52) return "image/png";
  if (bytes.length >= 16
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    && bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38
    && [0x20, 0x4c, 0x58].includes(bytes[15])) return "image/webp";
  return null;
}

export async function validateUpload(form: FormData) {
  const allowedFields = new Set(["room", "group", "experiment", "note", "file"]);
  for (const key of form.keys()) {
    if (!allowedFields.has(key)) throw new GraphRequestError("업로드 정보가 올바르지 않아요.");
  }
  const room = validateRoom(formText(form, "room"));
  const groupText = formText(form, "group");
  if (!/^[1-6]$/.test(groupText)) throw new GraphRequestError("1조부터 6조까지 선택할 수 있어요.");
  const experiment = formText(form, "experiment");
  if (experiment !== "voltage" && experiment !== "resistance") throw new GraphRequestError("실험 종류를 다시 선택해 주세요.");
  const rawNote = formText(form, "note", true);
  if (rawNote.length > 500) throw new GraphRequestError("관찰 내용은 500자까지 입력할 수 있어요.");
  const note = rawNote.trim();
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) throw new GraphRequestError("그래프 이미지 한 장을 선택해 주세요.");
  const file = files[0];
  if (file.name.length > 255) throw new GraphRequestError("파일 이름을 255자 이내로 줄여 주세요.");
  if (file.size === 0) throw new GraphRequestError("빈 파일은 올릴 수 없어요.");
  if (file.size > MAX_IMAGE_SIZE) throw new GraphRequestError("이미지는 8MB 이하로 올려 주세요.", 413);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new GraphRequestError("JPG, PNG, WebP 이미지만 올릴 수 있어요.", 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = identifyImage(bytes);
  if (!mime || mime !== file.type) throw new GraphRequestError("이미지 형식을 확인할 수 없어요. JPG, PNG, WebP로 저장한 뒤 다시 올려 주세요.", 415);
  return { room, group: Number(groupText), experiment: experiment as Experiment, note, bytes, mime };
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newDeleteToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
