import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";

async function sources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? sources(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat().filter((f) => /\.tsx?$/.test(f) && !f.endsWith("database.types.ts"));
}

test("@saas shared code stays venue-generic", async () => {
  const root = join(process.cwd(), "src");
  const hits: string[] = [];
  for (const file of await sources(root)) {
    const text = await readFile(file, "utf8");
    // The only allowed use is the industry itself: its name and its id.
    const allowed = ["lib/industries.ts", "services/types.ts"].includes(
      relative(root, file).replaceAll("\\", "/"),
    );
    if (/kitchen/i.test(text) || (!allowed && /restaurant/i.test(text))) hits.push(relative(root, file));
  }
  expect(hits).toEqual([]);
});
