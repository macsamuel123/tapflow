import { expect, test, type Page } from "@playwright/test";
import { logIn, openPage } from "./helpers";
import { csvFile, openImporter } from "./menu-helpers";

const HEADER = "category,name,description,price,tax_type,sold_out,allergens";

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
});

async function previewFile(page: Page, file: ReturnType<typeof csvFile>) {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(file);
  return importer;
}

async function importAll(page: Page, text: string, count: number) {
  const importer = await previewFile(page, csvFile(text));
  await expect(importer.getByTestId("csv-invalid")).toHaveCount(0);
  await importer.getByRole("button", { name: `Import ${count} ${count === 1 ? "item" : "items"}` }).click();
  await expect(importer.getByRole("status")).toContainText(`Imported ${count}`);
  await importer.getByRole("button", { name: "Done" }).click();
}

function expectSoldOut(page: Page, name: string, soldOut: boolean) {
  return expect(page.getByRole("switch", { name: `${name} sold out`, exact: true }), name).toHaveAttribute(
    "aria-checked",
    String(soldOut),
  );
}

function allergenTags(page: Page, name: string) {
  return page.getByRole("list", { name: `Allergens in ${name}`, exact: true }).getByRole("listitem");
}

/** Past 30 items, every category but the first starts collapsed. */
async function openCategory(page: Page, name: string) {
  const header = page.getByRole("button", { name: new RegExp(`^${name} \\(`) });
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
}

const SOLD_OUT_CASES: [string, boolean][] = [
  ["yes", true], ["YES", true], ["Yes", true], ["y", true], ["Y", true],
  ["true", true], ["TRUE", true], ["True", true], ["1", true],
  ["sold out", true], ["Sold Out", true], ["SOLD  OUT", true],
  ["no", false], ["NO", false], ["n", false], ["N", false],
  ["false", false], ["FALSE", false], ["0", false],
  ["available", false], ["Available", false], ["AVAILABLE", false],
  ["", false],
];

test("@saas CSV sold_out: every accepted spelling, in any case", async ({ page }) => {
  const rows = SOLD_OUT_CASES.map(([value], i) => `Tolerance,Case ${i},,1.00,food,${value},none`);
  await importAll(page, [HEADER, ...rows].join("\n"), rows.length);
  await openCategory(page, "Tolerance");
  for (const [i, [, soldOut]] of SOLD_OUT_CASES.entries()) await expectSoldOut(page, `Case ${i}`, soldOut);
});

test("@saas CSV sold_out: whitespace and stray quotes are trimmed", async ({ page }) => {
  const noisy: [string, boolean][] = [
    ["   yes   ", true],
    ["\t TRUE \t", true],
    ['"""yes"""', true],
    ["'no'", false],
    ['" false "', false],
    ["“sold out”", true],
    [" available ", false],
  ];
  const rows = noisy.map(([value], i) => `Tolerance,Noisy ${i},,1.00,food,${value},none`);
  await importAll(page, [HEADER, ...rows].join("\n"), rows.length);
  for (const [i, [, soldOut]] of noisy.entries()) await expectSoldOut(page, `Noisy ${i}`, soldOut);
});

test("@saas CSV sold_out: anything else imports as available, with a warning", async ({ page }) => {
  const bad = ["maybe", "2", "yep", "out", "sold", "n/a"];
  const rows = bad.map((value, i) => `Tolerance,Bad ${i},,1.00,food,${value},none`);
  const importer = await previewFile(page, csvFile([HEADER, ...rows].join("\n")));
  const warnings = importer.getByTestId("csv-warning");
  await expect(warnings).toHaveCount(bad.length);
  for (const [i, value] of bad.entries()) {
    await expect(warnings.nth(i)).toContainText(`Unknown sold_out value "${value}": set to available`);
  }
  await importer.getByRole("button", { name: "Import 6 items" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  await expectSoldOut(page, "Bad 0", false);
});

test("@saas CSV: a 20-row Google Sheets export with TRUE/FALSE imports", async ({ page }) => {
  // Sheets: CRLF, no BOM, TRUE/FALSE from a checkbox column, quotes only where needed.
  const rows = Array.from({ length: 20 }, (_, i) =>
    `Mains,Sheets ${i},"Crispy, salted",12.50,food,${i % 2 ? "TRUE" : "FALSE"},"milk, wheat"`,
  );
  await importAll(page, `${[HEADER, ...rows].join("\r\n")}\r\n`, 20);
  await expectSoldOut(page, "Sheets 0", false);
  await expectSoldOut(page, "Sheets 1", true);
  await expect(allergenTags(page, "Sheets 1")).toHaveText(["Milk", "Wheat/gluten"]);
});

test("@saas CSV: a 20-row Excel export with a BOM and TRUE/FALSE imports", async ({ page }) => {
  // Excel "CSV UTF-8": a byte order mark, CRLF, TRUE/FALSE, and title-case headers.
  const header = "Category,Name,Description,Price,Tax Type,Sold Out,Allergens";
  const rows = Array.from({ length: 20 }, (_, i) =>
    `Mains,Excel ${i},,12.5,Food,${i % 2 ? "TRUE" : "FALSE"},Milk | Wheat`,
  );
  await importAll(page, `﻿${[header, ...rows].join("\r\n")}\r\n`, 20);
  await expectSoldOut(page, "Excel 0", false);
  await expectSoldOut(page, "Excel 1", true);
  await expect(allergenTags(page, "Excel 0")).toHaveText(["Milk", "Wheat/gluten"]);
});

test("@saas CSV: Excel's semicolon-separated files and trailing empty columns import", async ({ page }) => {
  await importAll(page, "category;name;price;tax_type;sold_out;allergens\r\nMains;Semi;1.00;food;TRUE;milk|wheat\r\n", 1);
  await expectSoldOut(page, "Semi", true);
  await importAll(page, `${HEADER},,\nMains,Trailing,,1.00,food,no,none,,\n`, 1);
  await expectSoldOut(page, "Trailing", false);
});

test("@saas CSV allergens: separators, case, whitespace and stray quotes", async ({ page }) => {
  const cases: [string, string[]][] = [
    ["milk|wheat", ["Milk", "Wheat/gluten"]],
    [" MILK | Wheat ", ["Milk", "Wheat/gluten"]],
    ['"milk, wheat"', ["Milk", "Wheat/gluten"]],
    ['"Milk,WHEAT , Eggs"', ["Milk", "Wheat/gluten", "Eggs"]],
    ['"milk|wheat, soy"', ["Milk", "Wheat/gluten", "Soy"]],
    ['"\'milk\', \'wheat\'"', ["Milk", "Wheat/gluten"]],
    ["'molluscs'", ["Molluscs"]],
    ['"Tree Nuts, crustacean shellfish"', ["Tree nuts", "Crustacean shellfish"]],
    [" None ", ["No listed allergens"]],
    ["NONE", ["No listed allergens"]],
    ['"\'none\'"', ["No listed allergens"]],
  ];
  const rows = cases.map(([value], i) => `Tolerance,Allergen ${i},,1.00,food,no,${value}`);
  await importAll(page, [HEADER, ...rows].join("\n"), rows.length);
  await openCategory(page, "Tolerance");
  for (const [i, [, tags]] of cases.entries()) {
    await expect(allergenTags(page, `Allergen ${i}`)).toHaveText(tags);
  }
});

test("@saas CSV allergens: an unquoted comma in a last column still works", async ({ page }) => {
  await importAll(page, `${HEADER}\nMains,Unquoted,,1.00,food,no,Milk, Wheat, soy\n`, 1);
  await expect(allergenTags(page, "Unquoted")).toHaveText(["Milk", "Wheat/gluten", "Soy"]);
});

test("@saas CSV allergens: a stated allergen beats none", async ({ page }) => {
  await importAll(page, `${HEADER}\nTolerance,Mixed,,1.00,food,no,"milk, none"\n`, 1);
  await expect(allergenTags(page, "Mixed")).toHaveText(["Milk"]);
});

test("@saas CSV: a stray comma that shifts the price is rejected, not guessed at", async ({ page }) => {
  const importer = await previewFile(
    page,
    csvFile("category,name,allergens,price,tax_type\nMains,Shifted,milk,wheat,1.00,food\n"),
  );
  await expect(importer.getByTestId("csv-invalid")).toContainText("Bad price");
});
