import { expect, test } from "@playwright/test";

test("diff pane supports vertical scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open Repository" }).click();

  const fileButton = page.locator(`button[title="src/scroll-target.ts"]`).first();
  await expect(fileButton).toBeVisible();
  await fileButton.click();

  const diffViewport = page.locator(".refactor-diff-view");
  await expect(diffViewport).toBeVisible();

  const overflowY = await diffViewport.evaluate((element) => {
    return getComputedStyle(element).overflowY;
  });
  expect(["auto", "scroll"]).toContain(overflowY);

  await expect
    .poll(async () => {
      return diffViewport.evaluate((element) => element.scrollHeight - element.clientHeight);
    })
    .toBeGreaterThan(0);

  const initialScrollTop = await diffViewport.evaluate((element) => element.scrollTop);
  await diffViewport.hover();
  await page.mouse.wheel(0, 1200);

  await expect
    .poll(async () => {
      return diffViewport.evaluate((element) => element.scrollTop);
    })
    .toBeGreaterThan(initialScrollTop);
});
