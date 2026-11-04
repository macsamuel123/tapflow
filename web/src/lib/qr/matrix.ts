import QRCode from "qrcode";

export type QrMatrix = { size: number; isDark: (x: number, y: number) => boolean };

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return {
    size: modules.size,
    isDark: (x, y) => modules.data[y * modules.size + x] === 1,
  };
}
