import { type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";

export function pngFile(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(200);
  return PNG.sync.write(png);
}

export function csvFile(text: string, name = "menu.csv") {
  return { name, mimeType: "text/csv", buffer: Buffer.from(text) };
}

export function category(page: Page, name: string): Locator {
  return page.getByRole("region", { name });
}

export async function categoryOrder(page: Page): Promise<(string | null)[]> {
  return page.getByTestId("menu-category").evaluateAll((sections) =>
    sections.map((s) => s.getAttribute("aria-label")),
  );
}

export async function openImporter(page: Page) {
  await page.getByRole("button", { name: "Upload CSV" }).click();
  return page.getByRole("dialog"); // named "Upload CSV", then "Import finished"
}
