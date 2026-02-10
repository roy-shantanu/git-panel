import { expect, test } from "@playwright/test";

const MIXED_FILE_PATH = "src/mixed-target.ts";

test("unstage routes mixed file to active changelist and keeps selection scoped by kind", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open Repository" }).click();

  const stagedRow = page.getByTestId(`file-row-staged:${MIXED_FILE_PATH}`);
  const defaultUnstagedRow = page.getByTestId(`file-row-unstaged:default:${MIXED_FILE_PATH}`);

  await expect(stagedRow).toBeVisible();
  await expect(defaultUnstagedRow).toBeVisible();

  await stagedRow.click();
  await expect(stagedRow).toHaveAttribute("data-active", "true");
  await expect(defaultUnstagedRow).toHaveAttribute("data-active", "false");
  await expect(page.getByText("2 additions")).toBeVisible();

  await defaultUnstagedRow.click();
  await expect(stagedRow).toHaveAttribute("data-active", "false");
  await expect(defaultUnstagedRow).toHaveAttribute("data-active", "true");
  await expect(page.getByText("7 additions")).toBeVisible();

  await stagedRow.click();
  await page.getByTestId(`file-action-unstage:${MIXED_FILE_PATH}`).click();

  const featureUnstagedRow = page.getByTestId(`file-row-unstaged:feature:${MIXED_FILE_PATH}`);
  await expect(featureUnstagedRow).toBeVisible();
  await expect(page.getByTestId(`file-row-unstaged:default:${MIXED_FILE_PATH}`)).toHaveCount(0);
  await expect(page.getByTestId(`file-row-staged:${MIXED_FILE_PATH}`)).toHaveCount(0);

  await expect(featureUnstagedRow).toHaveAttribute("data-active", "true");
  await expect(page.getByText("7 additions")).toBeVisible();
});
