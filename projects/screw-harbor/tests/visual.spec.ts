import { expect, test } from "@playwright/test";
test("active workshop and pause visual baselines", async ({ page }) => {
  await page.goto("/?qa=1");
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_TEST_HOOKS__));
  await page.waitForFunction(() => (window as any).__SCREW_HARBOR__.getDiagnostics().materials.ready);
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__!.setReducedMotion(true);
    window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true);
  });
  await expect(page).toHaveScreenshot("workshop.png", {
    maxDiffPixelRatio: 0.003,
    animations: "disabled",
  });
  await page.locator("#pause").click();
  await expect(page.locator("#modal")).toBeVisible();
  await expect(page).toHaveScreenshot("pause.png", {
    maxDiffPixelRatio: 0.002,
    animations: "disabled",
  });
});
test("structure card names stay above thumbnails", async ({page}) => {
  test.setTimeout(90000);
  await page.goto("/?qa=1");
  await page.waitForFunction(()=>Boolean(window.__THREE_GAME_TEST_HOOKS__));
  await page.waitForFunction(() => (window as any).__SCREW_HARBOR__.getDiagnostics().materials.ready);
  await page.locator('#stages').click();
  await expect(page.locator('.stage-card')).toHaveCount(20);
  await page.evaluate(async()=>{
    await Promise.all([...document.querySelectorAll<HTMLImageElement>('.stage-card img')].filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>i.decode()));
  });
  await expect(page.locator('#modal')).toHaveScreenshot('structures.png',{animations:'disabled',maxDiffPixelRatio:.002});
});
test('Liberty has a closed underside without the display platter',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/?qa=1');
  await page.waitForFunction(()=>(window as any).__SCREW_HARBOR__?.getDiagnostics().materials.ready);
  await page.evaluate(()=>{
    const qa=(window as any).__SCREW_HARBOR__;
    qa.loadStage(13);
    window.__THREE_GAME_TEST_HOOKS__!.setPausedForScreenshot(true);
    qa.setCameraPose([0,30,50],[0,3,0]);
    qa.setCameraPose([0,-30,50],[0,3,0]);
    qa.setCameraPose([13,-13,17],[0,3,0]);
  });
  await expect(page).toHaveScreenshot('liberty-bottom.png',{animations:'disabled',maxDiffPixelRatio:.003});
});
