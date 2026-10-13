import { expect, test, type Page } from "@playwright/test";

import { fakeApi, sampleMessages } from "./fixtures";

const titles = (page: Page) => page.locator(".tile b").allTextContents();
const sortBy = (page: Page) => page.locator("label").filter({ hasText: /^Sort by/ }).locator("select");

test("library sorts and stars messages", async ({ page }) => {
  await fakeApi(page, { messages: sampleMessages() });
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("hf-library-sort"));
  await page.getByRole("button", { name: "Library" }).click();
  expect(await titles(page)).toEqual(["Apple pie", "Cherry on top", "Banana bread"]); // date, newest first
  await sortBy(page).selectOption("title");
  expect(await titles(page)).toEqual(["Apple pie", "Banana bread", "Cherry on top"]);
  await sortBy(page).selectOption("drafts");
  expect(await titles(page)).toEqual(["Banana bread", "Apple pie", "Cherry on top"]);
  await sortBy(page).selectOption("published");
  expect(await titles(page)).toEqual(["Apple pie", "Cherry on top", "Banana bread"]);
  await sortBy(page).selectOption("favourites");
  expect(await titles(page)).toEqual(["Cherry on top", "Apple pie", "Banana bread"]);

  await page.getByRole("button", { name: 'Add "Banana bread" to favourites' }).click();
  await expect(page.getByRole("button", { name: 'Remove "Banana bread" from favourites' })).toHaveAttribute("aria-pressed", "true");
  expect(await titles(page)).toEqual(["Cherry on top", "Banana bread", "Apple pie"]);

  await page.reload(); // the sort choice is remembered in this browser
  await page.getByRole("button", { name: "Library" }).click();
  await expect(sortBy(page)).toHaveValue("favourites");
});
