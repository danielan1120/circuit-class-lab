interface QRCode {
  addData(data: string, mode?: "Byte" | "Numeric" | "Alphanumeric" | "Kanji"): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, column: number): boolean;
  createSvgTag(options: { cellSize?: number; margin?: number; scalable?: boolean }): string;
}

interface QRCodeFactory {
  (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QRCode;
  stringToBytes: (text: string) => number[];
}

declare const qrcode: QRCodeFactory;
export { qrcode };
export default qrcode;
export const stringToBytes: (text: string) => number[];
