import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { logIn, openPage, reachSetupStep } from "./helpers";
import { category, csvFile, openImporter } from "./menu-helpers";

const HEADER = "category,name,description,price,tax_type,sold_out,allergens";

const FIVE_PLUS_TWO = [
  HEADER,
  'Mains,Fish tacos,"Lime slaw, chipotle crema",15.50,food,no,fish|wheat',
  "Mains,Veggie bowl,,14,food,,none",
  "Drinks,Red wine,By the glass,12.5,alcohol,yes,sulphites",
  "Drinks,Lemonade,,0,food,no,NONE",
  "Sides,Fries,,6.00,FOOD,NO,none",
  ",No category or name,,5.00,food,no,none",
  "Mains,Bad row,,12.345,wine,maybe,none",
].join("\n");

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
});

test("@saas CSV: 5 valid + 2 invalid preview correctly and import 5", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(FIVE_PLUS_TWO));

  await expect(importer.getByRole("status")).toHaveText("5 ready to import, 2 with problems");
  await expect(importer.getByTestId("csv-valid")).toHaveCount(5);
  const invalid = importer.getByTestId("csv-invalid");
  await expect(invalid).toHaveCount(2);
  await expect(invalid.nth(0)).toContainText("Row 7");
  await expect(invalid.nth(0)).toContainText("Missing category");
  await expect(invalid.nth(1)).toContainText("Bad price; Unknown tax_type; Unknown sold_out value");

  await importer.getByRole("button", { name: "Import 5 items" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 5 items, 2 skipped");

  const downloadPromise = page.waitForEvent("download");
  await importer.getByRole("button", { name: "Download skipped rows" }).click();
  const skipped = (await readFile(await (await downloadPromise).path())).toString("utf8");
  expect(skipped).toContain("Bad price");
  expect(skipped).toContain("No category or name");
  expect(skipped.trim().split(/\r?\n/)).toHaveLength(3);

  await importer.getByRole("button", { name: "Done" }).click();
  // New categories were created, the quoted comma survived and prices are exact.
  const mains = category(page, "Mains");
  await expect(mains.getByText("Lime slaw, chipotle crema")).toBeVisible();
  await expect(mains.getByText("$15.50")).toBeVisible();
  await expect(mains.getByText("$14.00")).toBeVisible();
  await expect(category(page, "Drinks").getByText("$12.50")).toBeVisible();
  await expect(category(page, "Drinks").getByText("$0.00")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Red wine sold out" })).toHaveAttribute("aria-checked", "true");
});

test("@saas CSV allergens: pipe-separated values become tags", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile(`${HEADER}\nMains,Pad thai,,16.00,food,no,peanuts|Tree Nuts|EGGS|crustacean shellfish|molluscs|soy\n`),
  );
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("list", { name: "Allergens in Pad thai" }).getByRole("listitem")).toHaveText([
    "Peanuts", "Tree nuts", "Eggs", "Crustacean shellfish", "Molluscs", "Soy",
  ]);
});

test("@saas CSV allergens: an unknown value makes the row invalid with the reason", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile(`${HEADER}\nMains,Good,,1.00,food,no,milk\nMains,Bad,,1.00,food,no,milk|kiwi|nuts\n`),
  );
  await expect(importer.getByTestId("csv-invalid")).toContainText("Unknown allergen: kiwi, nuts");
  await expect(importer.getByRole("button", { name: "Import 1 item" })).toBeVisible();
});

test("@saas CSV allergens: blank is invalid, none is accepted, and none can't mix", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile(`${HEADER}\nMains,Blank,,1.00,food,no,\nMains,Mixed,,1.00,food,no,milk|none\nMains,Plain,,1.00,food,no,none\n`),
  );
  const invalid = importer.getByTestId("csv-invalid");
  await expect(invalid.nth(0)).toContainText("allergens required — use none if none");
  await expect(invalid.nth(1)).toContainText("none can't be combined with allergens");
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 1 item, 2 skipped");
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("list", { name: "Allergens in Plain" }).getByRole("listitem")).toHaveText(["No listed allergens"]);
});

test("@saas CSV sold_out: the column is optional, and items default to available", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile("category,name,price,tax_type,allergens\nMains,No column,1.00,food,none\n"),
  );
  await importer.getByRole("button", { name: "Import 1 item" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("switch", { name: "No column sold out" })).toHaveAttribute("aria-checked", "false");
});

test("@saas CSV sold_out: blank means available, and yes/no/true/false are accepted", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile(
      [
        HEADER,
        "Mains,Blank,,1.00,food,,none",
        "Mains,Said yes,,1.00,food,yes,none",
        "Mains,Said no,,1.00,food,no,none",
        "Mains,Said true,,1.00,food,TRUE,none",
        "Mains,Said false,,1.00,food,false,none",
        "Mains,Said maybe,,1.00,food,maybe,none",
      ].join("\n"),
    ),
  );
  await expect(importer.getByTestId("csv-invalid")).toHaveCount(1);
  await expect(importer.getByTestId("csv-invalid")).toContainText('Unknown sold_out value "maybe": use yes/no, y/n, true/false, 1/0 or sold out/available');
  await importer.getByRole("button", { name: "Import 5 items" }).click();
  await importer.getByRole("button", { name: "Done" }).click();
  const expected = { Blank: "false", "Said yes": "true", "Said no": "false", "Said true": "true", "Said false": "false" };
  for (const [name, soldOut] of Object.entries(expected)) {
    await expect(page.getByRole("switch", { name: `${name} sold out` }), name).toHaveAttribute("aria-checked", soldOut);
  }
});

test("@saas CSV sold_out: updating with no value keeps the toggle, a value changes it", async ({ page }) => {
  await page.getByRole("switch", { name: "Cedar IPA sold out" }).click();
  const update = async (row: string) => {
    const importer = await openImporter(page);
    await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(`${HEADER}\n${row}\n`));
    await importer.getByLabel("Update them").check();
    await importer.getByRole("button", { name: "Import 1 item" }).click();
    await importer.getByRole("button", { name: "Done" }).click();
  };
  const toggle = page.getByRole("switch", { name: "Cedar IPA sold out" });

  await update("On tap,Cedar IPA,,9.50,alcohol,,wheat");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await update("On tap,Cedar IPA,,9.50,alcohol,no,wheat");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("@saas CSV allergens: a file without the column is rejected", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile("category,name,price,tax_type\nMains,Plain,1.00,food\n"),
  );
  await expect(importer.getByText("This file is missing a column: allergens.")).toBeVisible();
});

test("@saas CSV duplicates: skip keeps the item, update changes it and keeps options", async ({ page }) => {
  const dupes = `${HEADER}\non tap,  HARBOUR   lager ,New words,9.99,alcohol,,milk\nBites,New bite,,3.00,food,no,none\n`;

  let importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(dupes));
  await expect(importer.getByText("1 item is already on your menu")).toBeVisible();
  const importButton = importer.getByRole("button", { name: "Import 2 items" });
  await expect(importButton, "must choose skip or update first").toBeDisabled();
  await importer.getByLabel("Skip them").check();
  await importButton.click();
  await expect(importer.getByRole("status")).toHaveText("Imported 1 item, 1 skipped");
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(category(page, "On tap").getByText("$8.00")).toBeVisible();

  importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(dupes));
  await expect(importer.getByText("2 items are already on your menu")).toBeVisible();
  await importer.getByLabel("Update them").check();
  await importer.getByRole("button", { name: "Import 2 items" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 0 items, updated 2, 0 skipped");
  await importer.getByRole("button", { name: "Done" }).click();

  const onTap = category(page, "On tap");
  await expect(onTap.getByText("$9.99")).toBeVisible();
  await expect(onTap.getByText("New words")).toBeVisible();
  await expect(onTap.getByText("Options: Size (required)")).toBeVisible();
  await expect(page.getByRole("list", { name: "Allergens in Harbour Lager" }).getByRole("listitem")).toHaveText(["Milk"]);
});

test("@saas CSV: the same item twice in one file is flagged", async ({ page }) => {
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(
    csvFile(`${HEADER}\nMains,Burger,,10.00,food,,none\nmains,burger,,12.00,food,,none\n`),
  );
  await expect(importer.getByTestId("csv-invalid")).toContainText("Same category and name as an earlier row");
});

test("@saas CSV: non-CSV and oversized files are rejected", async ({ page }) => {
  const importer = await openImporter(page);
  const input = importer.getByLabel("Choose CSV file");

  await input.setInputFiles({ name: "menu.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await expect(importer.getByText("That doesn't look like a CSV file. Choose a .csv file.")).toBeVisible();

  await input.setInputFiles({ name: "photo.csv", mimeType: "text/csv", buffer: Buffer.from([0x89, 0x50, 0x00, 0x00, 0x47]) });
  await expect(importer.getByText("That doesn't look like a CSV file. Choose a .csv file.")).toBeVisible();

  await input.setInputFiles(csvFile("x".repeat(1_000_001)));
  await expect(importer.getByText("That file is over the 1 MB limit.")).toBeVisible();

  const rows = Array.from({ length: 1001 }, (_, i) => `Mains,Item ${i},,1.00,food,,none`).join("\n");
  await input.setInputFiles(csvFile(`${HEADER}\n${rows}\n`));
  await expect(importer.getByText("This file has 1001 rows. The limit is 1000.")).toBeVisible();

  await input.setInputFiles(csvFile("category,name,tax_type,allergens\nMains,Item,food,none\n"));
  await expect(importer.getByText("This file is missing a column: price.")).toBeVisible();
});

test("@saas CSV: 1,000 rows import, and the page stays usable", async ({ page }) => {
  const rows = Array.from({ length: 1000 }, (_, i) => `Cat ${i % 10},Item ${i},,1.00,food,,none`).join("\n");
  const importer = await openImporter(page);
  await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(`${HEADER}\n${rows}\n`));
  await expect(importer.getByText("Showing the first 100 of 1000 rows.")).toBeVisible();
  await importer.getByRole("button", { name: "Import 1000 items" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 1000 items, 0 skipped");
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("region", { name: "Cat 9" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Item 9" })).toHaveCount(0); // collapsed
});

test.describe("sign-up", () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
  });

  test("@saas CSV in step 5 uses the same importer", async ({ page }) => {
    await reachSetupStep(page, "breweries", "Harbour Taproom");
    await page.getByRole("button", { name: "Continue" }).click();
    const importer = await openImporter(page);
    await importer.getByLabel("Choose CSV file").setInputFiles(csvFile(FIVE_PLUS_TWO));
    await importer.getByRole("button", { name: "Import 5 items" }).click();
    await expect(importer.getByRole("status")).toHaveText("Imported 5 items, 2 skipped");
    await importer.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("5 items from your CSV will be added.")).toBeVisible();

    await page.getByRole("button", { name: "Create my QR codes" }).click();
    await page.getByRole("link", { name: "Continue to dashboard" }).click();
    await openPage(page, "Menu", "Menu");
    await expect(page.getByRole("button", { name: "Edit Fish tacos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Harbour Lager" })).toHaveCount(0);
  });
});
