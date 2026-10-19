import qrcode from "../../vendor/qrcode-generator/qrcode.mjs";

// Keep QR generation local, including for URLs containing Korean text.
qrcode.stringToBytes = (value: string) => Array.from(new TextEncoder().encode(value));

/** Create a printable, scalable SVG with a four-module white quiet zone. */
export function getQrSvg(text: string): string {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  return code.createSvgTag({ cellSize: 8, margin: 32, scalable: true });
}

/** A self-contained image source suitable for <img> and SVG downloads. */
export function getQrDataUrl(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getQrSvg(text))}`;
}
