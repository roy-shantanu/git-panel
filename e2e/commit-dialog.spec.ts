import { expect, test } from "@playwright/test";

const MIXED_FILE_PATH = "src/mixed-target.ts";

test("commits selected staged files from top-right commit button", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open Repository" }).click();

  await page.locator('button[title="Commit staged files"]').click();
  await expect(page.getByRole("dialog", { name: "Commit staged files" })).toBeVisible();

  const fileCheckbox = page.getByTestId(`commit-file:${MIXED_FILE_PATH}`).locator('input[type="checkbox"]');
  await expect(fileCheckbox).toBeChecked();

  await fileCheckbox.uncheck();
  await expect(page.getByRole("button", { name: "Commit" })).toBeDisabled();

  await fileCheckbox.check();
  await page.locator("#commit-message").fill("commit staged file");
  await page.getByRole("button", { name: "Commit" }).click();

  await expect(page.getByText("Commit successful")).toBeVisible();
  await expect(page.getByTestId(`file-row-staged:${MIXED_FILE_PATH}`)).toHaveCount(0);
  await expect(page.getByTestId(`file-row-unstaged:default:${MIXED_FILE_PATH}`)).toBeVisible();
});
