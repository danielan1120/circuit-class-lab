function readFile(
  source: File,
  method: "buffer" | "data-url",
  signal?: AbortSignal,
): Promise<string | ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;

    function cleanup() {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      signal?.removeEventListener("abort", cancel);
    }
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
    function cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      try { reader.abort(); } catch { /* Cancellation still rejects if the reader already stopped. */ }
      reject(new DOMException("이미지 파일 읽기를 취소했어요.", "AbortError"));
    }
    reader.onload = () => {
      if (settled) return;
      settled = true;
      const result = reader.result;
      cleanup();
      resolve(result);
    };
    reader.onerror = () => fail(reader.error ?? new Error("이미지 파일을 읽지 못했어요. 다시 선택해 주세요."));
    reader.onabort = () => fail(new DOMException("이미지 파일 읽기를 취소했어요.", "AbortError"));
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (method === "buffer") reader.readAsArrayBuffer(source);
      else reader.readAsDataURL(source);
    } catch (error) { fail(error); }
  });
}

export async function readImageFile(source: File, signal?: AbortSignal): Promise<File> {
  const result = await readFile(source, "buffer", signal);
  if (!(result instanceof ArrayBuffer) || result.byteLength !== source.size) {
    throw new Error("이미지 파일을 끝까지 읽지 못했어요. 다시 선택해 주세요.");
  }
  const snapshot = new File([result], source.name, { type: source.type, lastModified: source.lastModified });
  if (snapshot.size !== source.size || snapshot.size !== result.byteLength) {
    throw new Error("이미지 파일을 준비하지 못했어요. 다시 선택해 주세요.");
  }
  return snapshot;
}

export async function readImageDataUrl(file: File, signal?: AbortSignal): Promise<string> {
  const result = await readFile(file, "data-url", signal);
  if (typeof result !== "string" || !result.startsWith("data:")) {
    throw new Error("이미지 미리보기를 준비하지 못했어요. 다시 선택해 주세요.");
  }
  return result;
}
