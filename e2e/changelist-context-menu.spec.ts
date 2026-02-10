import { expect, test } from "@playwright/test";

const DEFAULT_LIST_ID = "default";
const FEATURE_LIST_ID = "feature";
const STAGED_LIST_ID = "staged";
const UNVERSIONED_LIST_ID = "unversioned-files";
const SCROLL_FILE_PATH = "src/scroll-target.ts";
const MIXED_FILE_PATH = "src/mixed-target.ts";
const UNVERSIONED_FILE_PATH = "src/unversioned-target.ts";

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
  await expect(page.getByRole("menuitem", { name: "Stage all" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Move to changelist" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Stage all" }).click();
  const stageAllDialog = page.getByRole("dialog", { name: "Stage all files" });
  await expect(stageAllDialog).toBeVisible();
  await stageAllDialog.getByRole("button", { name: "Cancel" }).click();

  await defaultRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to changelist" }).hover();
  await page.getByRole("menuitem", { name: "Feature" }).click();
  const moveListDialog = page.getByRole("dialog", { name: "Move to changelist" });
  await expect(moveListDialog).toBeVisible();
  await moveListDialog.getByRole("button", { name: "Cancel" }).click();

  const defaultFileRow = page.getByTestId(`file-row-unstaged:${DEFAULT_LIST_ID}:${SCROLL_FILE_PATH}`);
  await defaultFileRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Stage" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Move to changelist" }).hover();
  await page.getByRole("menuitem", { name: "Feature" }).click();
  const moveFileDialog = page.getByRole("dialog", { name: "Move to changelist" });
  await expect(moveFileDialog).toBeVisible();
  await moveFileDialog.getByRole("button", { name: "Cancel" }).click();

  const stagedRow = page.getByTestId(`changelist-row:${STAGED_LIST_ID}`);
  await stagedRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Unstage all" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Unstage all" }).click();
  const unstageAllDialog = page.getByRole("dialog", { name: "Unstage to changelist" });
  await expect(unstageAllDialog).toBeVisible();
  await unstageAllDialog.getByRole("button", { name: "Cancel" }).click();

  await stagedRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Unstage to changelist" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Unstage to changelist" }).hover();
  await page.getByRole("menuitem", { name: "Default" }).click();
  const unstageDialog = page.getByRole("dialog", { name: "Unstage to changelist" });
  await expect(unstageDialog).toBeVisible();
  await unstageDialog.getByRole("button", { name: "Cancel" }).click();

  const stagedFileRow = page.getByTestId(`file-row-staged:${MIXED_FILE_PATH}`);
  await stagedFileRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Unstage" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Unstage" }).click();
  const unstageFileDialog = page.getByRole("dialog", { name: "Unstage to changelist" });
  await expect(unstageFileDialog).toBeVisible();
  await unstageFileDialog.getByRole("button", { name: "Cancel" }).click();

  await unversionedRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Add all" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete file" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Add all" }).click();
  const addAllDialog = page.getByRole("dialog", { name: "Add all unversioned files" });
  await expect(addAllDialog).toBeVisible();
  await addAllDialog.getByRole("button", { name: "Cancel" }).click();

  const unversionedFileRow = page.getByTestId(
    `file-row-unstaged:${UNVERSIONED_LIST_ID}:${UNVERSIONED_FILE_PATH}`
  );
  await unversionedFileRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Add file" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete file" }).click();
  const deleteFileDialog = page.getByRole("dialog", { name: "Delete unversioned file" });
  await expect(deleteFileDialog).toBeVisible();
  await deleteFileDialog.getByRole("button", { name: "Cancel" }).click();

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
