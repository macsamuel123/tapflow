import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  expectNoSideScroll,
  logIn,
  openPage,
  reachSetupStep,
  skipFirstItems,
} from "./helpers";
import { category, categoryOrder, pngFile } from "./menu-helpers";

test("@saas sign-up step 5: two items appear on the Menu page, and only those", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();

  await page.getByLabel("Item 1 name").fill("Harbour Lager");
  await page.getByLabel("Item 1 price").fill("8.00");
  await page.getByLabel("Item 1 tax type").selectOption("Alcohol");
  await page.getByLabel("Item 1 category").fill("On tap");
  await page.getByRole("group", { name: "Item 1 allergens" }).getByLabel("Wheat/gluten").check();
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByLabel("Item 2 name").fill("Soft pretzel");
  await page.getByLabel("Item 2 price").fill("9.50");
  await page.getByLabel("Item 2 category").fill("Bites");
  await page.getByRole("group", { name: "Item 2 allergens" }).getByLabel("No listed allergens").check();
  await page.getByRole("button", { name: "Create my QR codes" }).click();

  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await openPage(page, "Menu", "Menu");
  await expect(await categoryOrder(page)).toEqual(["On tap", "Bites"]);
  await expect(page.getByRole("button", { name: "Edit Harbour Lager" })).toBeVisible();
  await expect(category(page, "Bites").getByText("$9.50")).toBeVisible();
  await expect(category(page, "On tap").getByText("Alcohol (GST + PST)")).toBeVisible();
  await expect(page.getByRole("list", { name: "Allergens in Harbour Lager" }).getByRole("listitem")).toHaveText(["Wheat/gluten"]);
  await expect(page.getByRole("list", { name: "Allergens in Soft pretzel" }).getByRole("listitem")).toHaveText(["No listed allergens"]);
  await expect(page.getByRole("button", { name: "Clear sample menu" })).toHaveCount(0);
  await expect(page.getByText("Sample data, not a real allergen claim")).toHaveCount(0);
});

test("@saas sign-up step 5 requires an allergen choice", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Item 1 name").fill("Lager");
  await page.getByLabel("Item 1 price").fill("8.00");
  await page.getByLabel("Item 1 category").fill("On tap");
  await page.getByRole("button", { name: "Create my QR codes" }).click();
  const group = page.getByRole("group", { name: "Item 1 allergens" });
  await expect(group.getByRole("alert")).toHaveText("Tick the allergens, or tick No listed allergens.");
  await expect(page.getByRole("heading", { name: "Add your first items" })).toBeVisible();

  await group.getByLabel("Molluscs").check();
  await page.getByRole("button", { name: "Create my QR codes" }).click();
  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
});

test("@saas sign-up step 5 blocks a half-filled row, and Skip ignores it", async ({ page }) => {
  await reachSetupStep(page, "breweries", "Harbour Taproom");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Item 1 name").fill("Half done");
  await page.getByRole("button", { name: "Create my QR codes" }).click();
  await expect(page.getByText("Enter a price from 0 to 10,000.00, like 12.50.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add your first items" })).toBeVisible();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "Your QR codes are ready" })).toBeVisible();
});

test("@saas skipping step 5 gives the sample menu, which can be cleared", async ({ page }) => {
  await reachSetupStep(page, "food-trucks", "Taco Window");
  await skipFirstItems(page);
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await openPage(page, "Menu", "Menu");
  await expect(page.getByRole("button", { name: "Edit Birria tacos" })).toBeVisible();

  await page.getByRole("button", { name: "Clear sample menu" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear menu" }).click();
  await expect(page.getByText("No items yet. Add one, or upload a CSV.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear sample menu" })).toHaveCount(0);
});

test("@saas categories: create, rename, reorder, delete blocked when not empty", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await expectNoSideScroll(page);

  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Category name").fill("Specials");
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(await categoryOrder(page)).toEqual(["On tap", "Bites", "No alcohol", "Specials"]);

  await page.getByRole("button", { name: "Rename Specials" }).click();
  await page.getByLabel("Category name").fill("Tonight");
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("region", { name: "Tonight" })).toBeVisible();

  await page.getByRole("button", { name: "Move Tonight up" }).click();
  await expect.poll(() => categoryOrder(page)).toEqual(["On tap", "Bites", "Tonight", "No alcohol"]);
  await page.getByRole("button", { name: "Move On tap down" }).click();
  await expect.poll(() => categoryOrder(page)).toEqual(["Bites", "On tap", "Tonight", "No alcohol"]);
  await page.reload();
  await expect.poll(() => categoryOrder(page)).toEqual(["Bites", "On tap", "Tonight", "No alcohol"]);

  await page.getByRole("button", { name: "Delete Bites" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Bites still has 3 items. Move or delete them first.",
  );
  await expect(page.getByRole("region", { name: "Bites" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Tonight" }).click();
  await expect(page.getByRole("region", { name: "Tonight" })).toHaveCount(0);
});

test("@saas a duplicate category name is rejected", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Category name").fill("  bites ");
  await page.getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("You already have bites.");
});

test("@saas item: photo, required options, allergens, edit, sold out, delete", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Add item" }).click();
  const editor = page.getByRole("dialog");

  // Full screen at 390px.
  expect(await editor.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });

  await editor.getByLabel("Item name").fill("House soda");
  await editor.getByLabel("Description").fill("Made fresh daily.");
  await editor.getByLabel("Price").fill("4.50");
  await editor.getByLabel("Category").fill("No alcohol");
  await editor.getByLabel("Upload photo").setInputFiles({
    name: "soda.png",
    mimeType: "image/png",
    buffer: pngFile(2000, 1000),
  });
  await expect(editor.getByAltText("Item preview")).toBeVisible();
  await editor.getByLabel("Sesame").check();
  await editor.getByLabel("Wheat/gluten").check();

  await editor.getByRole("button", { name: "Add option group" }).click();
  const group = editor.getByRole("group", { name: "Option group 1" });
  await group.getByLabel("Group name").fill("Size");
  await group.getByRole("group", { name: "Required?" }).getByText("Yes").click();
  await group.getByLabel("Option 1 name").fill("Small");
  await group.getByRole("button", { name: "Add option" }).click();
  await group.getByLabel("Option 2 name").fill("Large");
  await group.getByLabel("Add-on price").nth(1).fill("1.00");
  await editor.getByRole("button", { name: "Save item" }).click();

  const card = category(page, "No alcohol").getByRole("listitem").filter({ hasText: "House soda" }).first();
  await expect(card.getByText("$4.50")).toBeVisible();
  await expect(card.getByText("Options: Size (required)")).toBeVisible();
  await expect(card.getByText("Sesame")).toBeVisible();
  await expect(card.getByText("Wheat/gluten")).toBeVisible();
  await expect(card.getByTestId("item-photo")).toBeVisible();

  // The photo is resized in the browser, and survives a reload from IndexedDB.
  await page.reload();
  const size = await card.getByTestId("item-photo").evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, url: img.src };
  });
  expect(size).toMatchObject({ width: 800, height: 400 });
  expect(size.url.startsWith("blob:")).toBe(true);

  await page.getByRole("button", { name: "Edit House soda" }).click();
  await page.getByRole("dialog").getByLabel("Price", { exact: true }).fill("5.25");
  await expect(page.getByRole("dialog").getByRole("group", { name: "Option group 1" }).getByLabel("Add-on price").nth(1)).toHaveValue("1.00");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(card.getByText("$5.25")).toBeVisible();

  const soldOut = page.getByRole("switch", { name: "House soda sold out" });
  const soldOutPill = page.getByRole("button", { name: "Edit House soda" }).getByText("Sold out");
  await expect(soldOutPill).toHaveCount(0);
  await soldOut.click();
  await expect(soldOut).toHaveAttribute("aria-checked", "true");
  await expect(soldOutPill).toBeVisible();

  await page.getByRole("button", { name: "Edit House soda" }).click();
  await page.getByRole("button", { name: "Delete item" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Edit House soda" })).toBeVisible();
  await page.getByRole("button", { name: "Delete item" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Edit House soda" })).toHaveCount(0);
});

test("@saas photo can be removed and replaced", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Edit Cedar IPA" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Upload photo").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: pngFile(50, 50) });
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByTestId("item-photo")).toHaveCount(1);

  await page.getByRole("button", { name: "Edit Cedar IPA" }).click();
  await editor.getByLabel("Replace photo").setInputFiles({ name: "b.png", mimeType: "image/png", buffer: pngFile(60, 60) });
  await expect(editor.getByAltText("Item preview")).toBeVisible();
  await editor.getByRole("button", { name: "Remove photo" }).click();
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByTestId("item-photo")).toHaveCount(0);
});

test("@saas bad photos are rejected", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Add item" }).click();
  const editor = page.getByRole("dialog");
  const upload = editor.getByLabel("Upload photo");

  await upload.setInputFiles({ name: "a.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(editor.getByText("Use a JPG, PNG or WebP photo.")).toBeVisible();

  await upload.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(editor.getByText("That photo is over the 5 MB limit.")).toBeVisible();

  await upload.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(editor.getByText("That file couldn't be read as a photo.")).toBeVisible();
});

test("@saas option groups: invalid settings are rejected", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Add item" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Item name").fill("Test item");
  await editor.getByLabel("Price").fill("1.00");
  await editor.getByLabel("No listed allergens").check();
  await editor.getByRole("button", { name: "Add option group" }).click();
  const group = editor.getByRole("group", { name: "Option group 1" });
  await group.getByLabel("Group name").fill("Size");
  await group.getByLabel("Option 1 name").fill("Small");
  await group.getByRole("group", { name: "Required?" }).getByText("Yes").click();
  const save = editor.getByRole("button", { name: "Save item" });
  const alert = group.getByRole("alert");

  await group.getByLabel("Min picks").fill("3");
  await group.getByLabel("Max picks").fill("2");
  await save.click();
  await expect(alert).toHaveText("Min picks can't be more than max picks.");

  await group.getByLabel("Min picks").fill("1");
  await expect(alert).toHaveText("Max picks can't be more than the number of options.");

  await group.getByRole("button", { name: "Remove option 1" }).click();
  await expect(alert).toHaveText("Add at least one option.");

  await group.getByRole("button", { name: "Add option" }).click();
  await group.getByLabel("Option 1 name").fill("Small");
  await group.getByLabel("Max picks").fill("1");
  await group.getByLabel("Min picks").fill("0");
  await expect(alert).toHaveText("A required group needs at least 1 pick.");

  await group.getByRole("group", { name: "Required?" }).getByText("No").click();
  await expect(group.getByLabel("Min picks")).toBeDisabled();
  await expect(group.getByLabel("Min picks")).toHaveValue("0");
  await expect(alert).toHaveCount(0);
  await save.click();
  await expect(page.getByRole("button", { name: "Edit Test item" })).toBeVisible();
});

test("@saas item rules: price range, name and description length", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Add item" }).click();
  const editor = page.getByRole("dialog");
  const priceMessage = editor.getByText("Enter a price from 0 to 10,000.00, like 12.50.");

  await editor.getByLabel("Item name").fill("x".repeat(81));
  await editor.getByLabel("Description").fill("y".repeat(301));
  await editor.getByLabel("Price").fill("10000.01");
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(editor.getByText("Use 80 characters or fewer.")).toBeVisible();
  await expect(editor.getByText("Use 300 characters or fewer.")).toBeVisible();
  await expect(priceMessage).toBeVisible();

  for (const bad of ["-1", "$5", "1,200", "1.234", "abc", ""]) {
    await editor.getByLabel("Price").fill(bad);
    await expect(priceMessage, `price "${bad}"`).toBeVisible();
  }
  await editor.getByLabel("Price").fill("10000.00");
  await expect(priceMessage).toHaveCount(0);
});

test("@saas sold-out edits are per persona and survive a reload", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("switch", { name: "Cedar IPA sold out" }).click();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Cedar IPA sold out" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Switch demo venue").selectOption("demo-food-truck");
  await expect(page.getByRole("button", { name: "Edit Birria tacos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Cedar IPA" })).toHaveCount(0);
});

test("@saas item form: can't save without an allergen choice, and the choices exclude each other", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Add item" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Item name").fill("Declared item");
  await editor.getByLabel("Price").fill("3.00");
  await editor.getByLabel("Category").fill("Bites");
  const none = editor.getByLabel("No listed allergens");
  const molluscs = editor.getByLabel("Molluscs");

  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(editor.getByText("Tick the allergens, or tick No listed allergens.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();

  await molluscs.check();
  await none.check();
  await expect(molluscs).not.toBeChecked();
  await molluscs.check();
  await expect(none).not.toBeChecked();
  await molluscs.uncheck();
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(editor.getByText("Tick the allergens, or tick No listed allergens.")).toBeVisible();

  await none.check();
  await editor.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByRole("list", { name: "Allergens in Declared item" }).getByRole("listitem")).toHaveText(["No listed allergens"]);

  await page.getByRole("button", { name: "Edit Declared item" }).click();
  await expect(page.getByRole("dialog").getByLabel("No listed allergens")).toBeChecked();
});

test("@saas sample allergens are marked as sample data until the owner changes them", async ({ page }) => {
  const NOTE = "Sample data, not a real allergen claim";
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  const notes = page.getByText(NOTE);
  const total = await page.getByRole("switch").count();
  await expect(notes).toHaveCount(total); // every sample item, including ones with no listed allergens

  const burger = category(page, "Bites").getByRole("listitem").filter({ hasText: "Smash burger" }).first();
  await expect(burger.getByText(NOTE)).toBeVisible();

  // Saving another field doesn't turn sample data into a declaration.
  await page.getByRole("button", { name: "Edit Smash burger" }).click();
  await expect(page.getByRole("dialog").getByText(NOTE)).toBeVisible();
  await page.getByRole("dialog").getByLabel("Price", { exact: true }).fill("19.00");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(burger.getByText("$19.00")).toBeVisible();
  await expect(burger.getByText(NOTE)).toBeVisible();

  // Changing the allergens does.
  await page.getByRole("button", { name: "Edit Smash burger" }).click();
  await page.getByRole("dialog").getByLabel("Mustard").check();
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page.getByRole("list", { name: "Allergens in Smash burger" }).getByText("Mustard")).toBeVisible();
  await expect(burger.getByText(NOTE)).toHaveCount(0);

  // So does a CSV update, and items the owner adds never carry the note.
  await page.getByRole("button", { name: "Upload CSV" }).click();
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "m.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("category,name,price,tax_type,allergens\nBites,Soft pretzel,9.00,food,wheat\nBites,My own,5.00,food,none\n"),
  });
  await page.getByLabel("Update them").check();
  await page.getByRole("button", { name: "Import 2 items" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(notes).toHaveCount(total - 2);
  await expect(category(page, "Bites").getByRole("listitem").filter({ hasText: "My own" }).first().getByText(NOTE)).toHaveCount(0);
});

test("@saas sign-up items carry no sample note, and a skipped sign-up's sample menu does", async ({ page }) => {
  await reachSetupStep(page, "food-trucks", "Taco Window");
  await skipFirstItems(page);
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await openPage(page, "Menu", "Menu");
  await expect(page.getByText("Sample data, not a real allergen claim").first()).toBeVisible();
});

test("@saas allergen tags show on sample items", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  const allergens = page.getByRole("list", { name: "Allergens in Smash burger" });
  await expect(allergens.getByRole("listitem")).toHaveText(["Wheat/gluten", "Milk", "Eggs", "Sesame"]);
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("@saas categories reorder by dragging, and the item editor is a dialog", async ({ page }) => {
    await logIn(page);
    await page.getByRole("link", { name: "Menu" }).click();
    await expect.poll(() => categoryOrder(page)).toEqual(["On tap", "Bites", "No alcohol"]);

    // Collapsed, so both handles are on screen at once.
    for (const name of ["On tap", "Bites", "No alcohol"]) {
      await category(page, name).getByRole("button", { name: new RegExp(`^${name} \\(`) }).click();
    }
    await page.getByRole("button", { name: "Drag No alcohol" }).dragTo(page.getByRole("button", { name: "Drag On tap" }), { steps: 5 });
    await expect.poll(() => categoryOrder(page)).toEqual(["No alcohol", "On tap", "Bites"]);

    await page.getByRole("button", { name: "Add item" }).click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box?.width).toBeLessThan(700);
  });
});

test("@saas the template itself imports cleanly", async ({ page }) => {
  await logIn(page);
  await openPage(page, "Menu", "Menu");
  await page.getByRole("button", { name: "Upload CSV" }).click();
  const importer = page.getByRole("dialog");
  await expect(importer.getByText(/^Columns: /)).not.toContainText("sold_out");
  const downloadPromise = page.waitForEvent("download");
  await importer.getByRole("button", { name: "Download template" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("tapflow-menu-template.csv");
  const template = await readFile(await download.path());
  const lines = template.toString("utf8").trim().split(/\r?\n/);
  expect(lines[0]).toBe("category,name,description,price,tax_type,allergens");
  expect(lines).toHaveLength(4);

  await importer.getByLabel("Choose CSV file").setInputFiles({ name: "t.csv", mimeType: "text/csv", buffer: template });
  await importer.getByRole("button", { name: "Import 3 items" }).click();
  await expect(importer.getByRole("status")).toHaveText("Imported 3 items, 0 skipped");
  await importer.getByRole("button", { name: "Done" }).click();
  await expect(category(page, "Drinks").getByRole("switch", { name: "Sparkling lemonade sold out" })).toHaveAttribute("aria-checked", "false");
  await expect(category(page, "Drinks").getByRole("list", { name: "Allergens in Sparkling lemonade" }).getByRole("listitem")).toHaveText(["No listed allergens"]);
});
