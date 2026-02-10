import { expect, test } from "@playwright/test";

const UNVERSIONED_FILE_PATH = "src/unversioned-target.ts";
const UNVERSIONED_LIST_ID = "unversioned-files";

test("unversioned files appear under dedicated changelist section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open Repository" }).click();

  await expect(page.getByText("Unversioned files (1)")).toBeVisible();

  const unversionedRow = page.getByTestId(
    `file-row-unstaged:${UNVERSIONED_LIST_ID}:${UNVERSIONED_FILE_PATH}`
  );
  await expect(unversionedRow).toBeVisible();

  await expect(page.getByTestId(`file-row-unstaged:default:${UNVERSIONED_FILE_PATH}`)).toHaveCount(
    0
  );

  await unversionedRow.click();
  await expect(unversionedRow).toHaveAttribute("data-active", "true");

  await page
    .getByTestId(`file-action-stage:${UNVERSIONED_LIST_ID}:${UNVERSIONED_FILE_PATH}`)
    .click();

  await expect(
    page.getByTestId(`file-row-unstaged:${UNVERSIONED_LIST_ID}:${UNVERSIONED_FILE_PATH}`)
  ).toHaveCount(0);
  await expect(page.getByTestId(`file-row-staged:${UNVERSIONED_FILE_PATH}`)).toBeVisible();
});
