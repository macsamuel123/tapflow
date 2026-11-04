import type { Touchpoint, Venue } from "@/services/types";
import { qrMatrix } from "./matrix";
import { touchpointUrl } from "./url";

// US Letter in points. 3 x 5 fits a typical venue on one sheet at a size that scans well.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const COLS = 3;
const ROWS = 5;
const CELL_W = (PAGE_W - MARGIN * 2) / COLS;
const CELL_H = (PAGE_H - MARGIN * 2) / ROWS;
const QR_PT = 92;

export const QR_PER_PAGE = COLS * ROWS;

export function qrPdfFilename(venue: Pick<Venue, "slug">): string {
  return `tapflow-qr-codes-${venue.slug}.pdf`;
}

/** Builds the sheet in the browser and starts the download. jsPDF loads only when needed. */
export async function downloadQrPdf(venue: Venue, touchpoints: Touchpoint[], origin: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const fit = (text: string, width: number): string => {
    if (doc.getTextWidth(text) <= width) return text;
    let cut = text;
    while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}...`;
  };

  touchpoints.forEach((tp, i) => {
    if (i > 0 && i % QR_PER_PAGE === 0) doc.addPage();
    const slot = i % QR_PER_PAGE;
    const col = slot % COLS;
    const row = (slot - col) / COLS;
    const x = MARGIN + col * CELL_W;
    const y = MARGIN + row * CELL_H;
    const center = x + CELL_W / 2;
    const textWidth = CELL_W - 16;

    doc.setDrawColor(200);
    doc.setLineDashPattern([3, 3], 0);
    doc.rect(x, y, CELL_W, CELL_H);

    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(fit(venue.name, textWidth), center, y + 14, { align: "center" });

    const matrix = qrMatrix(touchpointUrl(origin, venue, tp));
    const cell = QR_PT / matrix.size;
    const left = center - QR_PT / 2;
    const top = y + 20;
    doc.setFillColor(0, 0, 0);
    for (let my = 0; my < matrix.size; my += 1) {
      for (let mx = 0; mx < matrix.size; mx += 1) {
        if (!matrix.isDark(mx, my)) continue;
        let run = 1;
        while (mx + run < matrix.size && matrix.isDark(mx + run, my)) run += 1;
        // A hair of overlap stops white seams appearing between modules in print.
        doc.rect(left + mx * cell, top + my * cell, run * cell + 0.1, cell + 0.1, "F");
        mx += run - 1;
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(fit(tp.label, textWidth), center, y + CELL_H - 18, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Scan to order", center, y + CELL_H - 7, { align: "center" });
  });

  doc.save(qrPdfFilename(venue));
}
