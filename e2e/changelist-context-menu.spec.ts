import { expect, test } from "@playwright/test";

const DEFAULT_LIST_ID = "default";
const FEATURE_LIST_ID = "feature";
const UNVERSIONED_LIST_ID = "unversioned-files";

test("supports changelist context menu actions and keeps unversioned section at bottom", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open Repository" }).click();

  const defaultRow = page.getByTestId(`changelist-row:${DEFAULT_LIST_ID}`);
  const featureRow = page.getByTestId(`changelist-row:${FEATURE_LIST_ID}`);
  const unversionedRow = page.getByTestId(`changelist-row:${UNVERSIONED_LIST_ID}`);

  await expect(defaultRow).toBeVisible();
  await expect(featureRow).toBeVisible();
  await expect(unversionedRow).toBeVisible();

  const defaultBox = await defaultRow.boundingBox();
  const featureBox = await featureRow.boundingBox();
  const unversionedBox = await unversionedRow.boundingBox();
  expect(defaultBox).not.toBeNull();
  expect(featureBox).not.toBeNull();
  expect(unversionedBox).not.toBeNull();
  expect(defaultBox!.y).toBeLessThan(featureBox!.y);
  expect(featureBox!.y).toBeLessThan(unversionedBox!.y);

  await defaultRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Set active" }).click();
  await expect(defaultRow).toContainText("Active");

  await featureRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "New changelist" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Rename changelist" }).click();
  await expect(page.getByRole("dialog", { name: "Rename Changelist" })).toBeVisible();
  const renameInput = page.getByRole("dialog", { name: "Rename Changelist" }).locator("input");
  await renameInput.fill("Feature Renamed");
  await page.getByRole("button", { name: "Rename" }).click();
  const renamedRow = page.getByTestId("changelist-row:feature");
  await expect(renamedRow).toContainText("Feature Renamed");

  await renamedRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete changelist" }).click();
  await expect(page.getByRole("dialog", { name: "Delete Changelist" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add Changelist" }).click();
  await expect(page.getByRole("dialog", { name: "Create Changelist" })).toBeVisible();
  await page.getByPlaceholder("UI polish").fill("Context Created");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("button", { name: "Context Created (0)" })).toBeVisible();
});
