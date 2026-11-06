import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { logIn, openPage } from "./helpers";
import { category, csvFile, openImporter } from "./menu-helpers";

const HEADER = "category,name,description,price,tax_type,sold_out,allergens";
const TABLE_7 = "d0000b01-0000-4000-8000-000000000007";
const NOT_DECLARED = "Allergens not declared";

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
});

async function preview(page: Page, text: string) {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(text));
  return importer;
}

async function importRows(page: Page, text: string, count: number) {
  const importer = await preview(page, text);
  await importer.getByRole("button", { name: `Import ${count} ${count === 1 ? "item" : "items"}`, exact: true }).click();
  await importer.getByRole("button", { name: "Done" }).click();
}

const tags = (page: Page, name: string) =>
  page.getByRole("list", { name: `Allergens in ${name}`, exact: true }).getByRole("listitem");

test("@saas CSV allergen synonyms map to the checklist", async ({ page }) => {
  const rows = [
    ["Dairy", "dairy", ["Milk"]],
    ["Lactose", "Lactose", ["Milk"]],
    ["Gluten", "gluten", ["Wheat/gluten"]],
    ["Nuts", "NUTS", ["Tree nuts"]],
    ["Shellfish", "shellfish", ["Crustacean shellfish", "Molluscs"]],
    ["Soya", "soya", ["Soy"]],
  ] as const;
  await importRows(page, [HEADER, ...rows.map(([n, v]) => `Words,${n},,1.00,food,no,${v}`)].join("\n"), rows.length);
  for (const [name, , expected] of rows) await expect(tags(page, name)).toHaveText([...expected]);
});

test("@saas CSV unknown allergen words stay as a note, and guests see them", async ({ page, context }) => {
  const importer = await preview(page, `${HEADER}\nWords,Kiwi tart,,1.00,food,no,"milk, kiwi, pine pollen"\n`);
  await expect(importer.getByTestId("csv-invalid")).toHaveCount(0);
  await expect(importer.getByTestId("csv-warning")).toContainText("Kept as a note: kiwi, pine pollen");
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(tags(page, "Kiwi tart")).toHaveText(["Milk", "Other: kiwi, pine pollen"]);

  const guest = await context.newPage();
  await guest.goto(`/v/demo-brewery/p/${TABLE_7}?token=demo`);
  await expect(guest.getByRole("button", { name: /^Kiwi tart/ })).toContainText("Contains: Milk, kiwi, pine pollen");
});

test("@saas CSV blank allergens: imported, guests ask staff, banner, filter and quick edit", async ({ page, context }) => {
  await importRows(page, `${HEADER}\nWords,Mystery stew,,9.00,food,no,\nWords,Other stew,,9.00,food,no,\nWords,Known stew,,9.00,food,no,milk\n`, 3);
  await expect(tags(page, "Mystery stew")).toHaveText([NOT_DECLARED]);
  await expect(page.getByText("2 items need allergen info")).toBeVisible();

  const guest = await context.newPage();
  await guest.goto(`/v/demo-brewery/p/${TABLE_7}?token=demo`);
  const stew = guest.getByRole("button", { name: /^Mystery stew/ });
  await expect(stew).toContainText("Ask staff about allergens");
  await expect(stew).not.toContainText("No listed allergens");
  await stew.click();
  await expect(guest.getByRole("dialog").getByText("Ask staff about allergens", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Show these items" }).click();
  const list = page.getByRole("list", { name: "Items that need allergen info" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "On tap" })).toHaveCount(0);

  await list.getByRole("button", { name: "Set allergens for Mystery stew" }).click();
  await page.getByRole("button", { name: "Save allergens" }).click();
  await expect(page.getByRole("dialog").getByText("Tick the allergens, or tick No listed allergens.")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Fish", { exact: true }).check();
  await page.getByRole("button", { name: "Save allergens" }).click();
  await expect(page.getByText("1 item needs allergen info")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(1);

  await list.getByRole("button", { name: "Set allergens for Other stew" }).click();
  await page.getByRole("dialog").getByLabel("Other allergens").fill("kiwi");
  await page.getByRole("button", { name: "Save allergens" }).click();
  await expect(page.getByText(/need(s)? allergen info/)).toHaveCount(0);
  await expect(tags(page, "Mystery stew")).toHaveText(["Fish"]);
  await expect(tags(page, "Other stew")).toHaveText(["Other: kiwi"]);

  await guest.reload();
  await expect(guest.getByRole("button", { name: /^Mystery stew/ })).toContainText("Contains: Fish");
  await expect(guest.getByText("Ask staff about allergens")).toHaveCount(0);
});

test("@saas CSV without an allergens column imports everything as not declared", async ({ page }) => {
  await importRows(page, "name,price\nBare one,3.00\nBare two,4.00\n", 2);
  await expect(page.getByText("2 items need allergen info")).toBeVisible();
  await expect(category(page, "Uncategorised").getByText("$3.00")).toBeVisible();
});

test("@saas the item form still forces a choice on a not-declared item", async ({ page }) => {
  await importRows(page, `${HEADER}\nWords,Form stew,,9.00,food,no,\n`, 1);
  await page.getByRole("button", { name: "Edit Form stew" }).click();
  await expect(page.getByRole("dialog").getByLabel("No listed allergens")).not.toBeChecked();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByRole("dialog").getByText("Tick the allergens, or tick No listed allergens.")).toBeVisible();
  await page.getByRole("dialog").getByLabel("No listed allergens").check();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(tags(page, "Form stew")).toHaveText(["No listed allergens"]);
});

test("@saas a blank CSV update never erases declared allergens or tax", async ({ page }) => {
  const importer = await preview(page, `${HEADER}\nOn tap,Harbour Lager,,8.50,,,\n`);
  await importer.getByLabel("Update them").check();
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(tags(page, "Harbour Lager")).toHaveText(["Wheat/gluten"]);
  await expect(category(page, "On tap").getByRole("listitem").filter({ hasText: "Harbour Lager" }).first().getByText("Alcohol (GST + PST)")).toBeVisible();
});

test("@saas CSV tax_type: blank or unknown becomes Food with a note, cleared on save", async ({ page }) => {
  const importer = await preview(page, `${HEADER}\nWords,No tax,,1.00,,no,none\nWords,Odd tax,,1.00,beverage,no,none\nWords,Ok tax,,1.00,ALCOHOL,no,none\n`);
  const warnings = importer.getByTestId("csv-warning");
  await expect(warnings.nth(0)).toContainText("Tax type blank: set to Food");
  await expect(warnings.nth(1)).toContainText('Unknown tax_type "beverage": set to Food');
  await expect(importer.getByTestId("csv-valid")).toHaveCount(1);
  await importer.getByRole("button", { name: "Import 3 items" }).click();
  await importer.getByRole("button", { name: "Done" }).click();

  const words = category(page, "Words");
  const card = (name: string) => words.getByRole("listitem").filter({ hasText: name }).first();
  await expect(card("No tax").getByText("Food (GST)")).toBeVisible();
  await expect(card("No tax").getByText("Tax type assumed: Food")).toBeVisible();
  await expect(card("Odd tax").getByText("Tax type assumed: Food")).toBeVisible();
  await expect(card("Ok tax").getByText("Alcohol (GST + PST)")).toBeVisible();
  await expect(card("Ok tax").getByText("Tax type assumed: Food")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit No tax" }).click();
  await expect(page.getByRole("dialog").getByText("Tax type assumed: Food", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(card("No tax").getByText("Tax type assumed: Food")).toHaveCount(0);
});

test("@saas CSV category blank goes to Uncategorised, and description is optional", async ({ page }) => {
  const importer = await preview(page, "category,name,price,tax_type,allergens\n,No home,1.00,food,none\n");
  await expect(importer.getByTestId("csv-warning")).toContainText("Category blank: put in Uncategorised");
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(category(page, "Uncategorised").getByRole("button", { name: "Edit No home" })).toBeVisible();
});

test("@saas CSV prices accept $, commas and spaces", async ({ page }) => {
  const prices: [string, string][] = [
    ["$12.50", "$12.50"], ["$ 8", "$8.00"], ['"1,200.50"', "$1,200.50"], ['"$1,200"', "$1,200.00"],
    [" 7.5 ", "$7.50"], ["1 200", "$1,200.00"], ['"12,50"', "$12.50"], ["0", "$0.00"],
  ];
  const rows = prices.map(([price], i) => `Words,Price ${i},,${price},food,no,none`);
  await importRows(page, [HEADER, ...rows].join("\n"), rows.length);
  for (const [i, [, shown]] of prices.entries()) {
    await expect(category(page, "Words").getByRole("listitem").filter({ hasText: `Price ${i}` }).first().getByText(shown, { exact: false })).toBeVisible();
  }
});

test("@saas CSV rejects only a missing name or a negative or unreadable price", async ({ page }) => {
  const bad = ["-5", "-$5.00", "($5.00)", "abc", "", "12.345", "free", "5.00.1"];
  const rows = bad.map((price, i) => `Words,Rejected ${i},,${price},food,no,none`);
  const importer = await preview(page, [HEADER, ...rows, "Words,,,5.00,food,no,none", "Words,Fine,,5.00,food,no,none"].join("\n"));
  const rejected = importer.getByTestId("csv-invalid");
  await expect(rejected).toHaveCount(bad.length + 1);
  for (const i of bad.keys()) await expect(rejected.nth(i)).toContainText("Bad price");
  await expect(rejected.nth(bad.length)).toContainText("Missing name");
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await expect(importer.getByRole("status")).toHaveText(`Imported 1 item, ${bad.length + 1} skipped`);
});

test("@saas CSV never imports an unquoted thousands price as a smaller price", async ({ page }) => {
  const importer = await preview(page, `${HEADER}\nWords,Split,,1,200.50,food,no,none\n`);
  await expect(importer.getByTestId("csv-invalid")).toContainText("Bad price: put quotes around prices with commas");
  await expect(importer.getByRole("button", { name: /^Import/ })).toBeDisabled();
});

test("@saas CSV long text and extra columns warn instead of blocking", async ({ page }) => {
  const importer = await preview(page, `${HEADER}\nWords,${"x".repeat(90)},${"y".repeat(310)},1.00,food,no,none\n`);
  const warning = importer.getByTestId("csv-warning");
  await expect(warning).toContainText("Name shortened to 80 characters");
  await expect(warning).toContainText("Description shortened to 300 characters");
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 1 item, 0 skipped");
});

test("@saas CSV preview: yellow warnings import, red rejections don't", async ({ page }) => {
  const importer = await preview(page, `${HEADER}\nWords,Clean,,1.00,food,no,none\nWords,Yellow,,1.00,,no,dairy\nWords,Red,,abc,food,no,none\n`);
  await expect(importer.getByRole("status")).toHaveText("2 ready to import, 1 with warnings, 1 rejected");
  const yellow = importer.getByTestId("csv-warning");
  await expect(yellow).toContainText("dairy read as Milk");
  await expect(yellow).toHaveClass(/bg-amber-50/);
  await expect(importer.getByTestId("csv-invalid")).toHaveClass(/bg-red-50/);
  await expect(importer.getByTestId("csv-valid")).toHaveCount(1);
  await importer.getByRole("button", { name: "Import 2 items" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 2 items, 1 skipped");

  const downloadPromise = page.waitForEvent("download");
  await importer.getByRole("button", { name: "Download skipped rows" }).click();
  const skipped = (await readFile(await (await downloadPromise).path())).toString("utf8");
  expect(skipped).toContain("Red");
  expect(skipped).not.toContain("Yellow");
});

test("@saas a messy 20-row file with dairy, blanks and missing tax imports fully", async ({ page }) => {
  const header = "Category,Name,Price,Tax Type,Allergens";
  const rows = Array.from({ length: 20 }, (_, i) => {
    const allergens = i % 3 === 0 ? "dairy" : i % 3 === 1 ? "" : "gluten, nuts";
    return `${i % 4 === 0 ? "" : "Mains"},Messy ${i},$${10 + i}.50,${i % 2 ? "" : "food"},"${allergens}"`;
  });
  const importer = await preview(page, [header, ...rows].join("\r\n"));
  await expect(importer.getByTestId("csv-invalid")).toHaveCount(0);
  await importer.getByRole("button", { name: "Import 20 items" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 20 items, 0 skipped");
  await expect(importer.getByText("7 items need allergen info.", { exact: false })).toBeVisible();
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("7 items need allergen info")).toBeVisible();
});
