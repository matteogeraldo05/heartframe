import { expect, test } from "@playwright/test";

import { fakeApi } from "./fixtures";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const border = (id: string, name: string, usedBy: { id: string; title: string }[]) =>
  ({ info: { id, kind: "border", name, mime: "image/png", size: PNG.length, createdAt: 1, inset: 30, usedBy }, data: PNG });

test("settings: order, no LED options, delete an upload with a warning when it's in use", async ({ page }) => {
  await fakeApi(page, { uploads: [border("aaaaaaaaaaaaaaaa", "Stars", [{ id: "m1", title: "Goodnight" }]), border("bbbbbbbbbbbbbbbb", "Spare", [])] });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Frame behaviour", "Replace the frame's token", "Firmware update (optional)", "Custom uploads", "Publishing"]);
  await expect(page.getByText(/Heart colour|Brightness|Pulse/)).toHaveCount(0);

  let dialog = "";
  page.on("dialog", (d) => { dialog = d.message(); void d.accept(); });
  await page.getByRole("button", { name: "Delete Stars" }).click();
  expect(dialog).toContain('Still used by 1 saved message: "Goodnight"');
  expect(dialog).toContain("switch to no border when you edit them");
  await expect(page.getByText('Deleted "Stars".')).toBeVisible();
  await page.getByRole("button", { name: "Delete Spare" }).click();
  expect(dialog).toBe('Delete "Spare"?');
  await expect(page.getByText(/Nothing yet/)).toBeVisible();
});
