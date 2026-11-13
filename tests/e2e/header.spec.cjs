const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('mobile header stays visible and interactive after scrolling in both main and finance views', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#trip');

  for (const view of ['trip', 'finance']) {
    await page.locator('[data-view="' + view + '"]').click();
    // Hashchange triggers an asynchronous scroll-to-top in the app, so wait
    // for navigation to settle before simulating the user's downward swipe.
    await expect(page).toHaveURL(new RegExp('#' + view + '$'));
    await expect(page.locator('#view-' + view)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          window.scrollTo({ top: 320, behavior: 'instant' });
          return window.scrollY;
        })
      )
      .toBeGreaterThan(150);

    const placement = await page.locator('.topbar').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
      };
    });
    expect(placement.top).toBeGreaterThanOrEqual(-1);
    expect(placement.top).toBeLessThanOrEqual(2);
    expect(placement.bottom).toBeLessThan(placement.screenHeight);

    for (const id of ['theme', 'language', 'mobile-settings']) {
      const hittable = await page.locator('#' + id).evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(centerX, centerY);
        return (
          centerX >= 0 &&
          centerX <= innerWidth &&
          centerY >= 0 &&
          centerY <= innerHeight &&
          !!hit &&
          (hit === el || el.contains(hit))
        );
      });
      expect(hittable, id + ' should be tappable above scrolling content').toBe(true);
    }

    const beforeTheme = await page.locator('html').getAttribute('data-theme');
    const beforeScroll = await page.evaluate(() => scrollY);
    await page.locator('#theme').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      beforeTheme === 'dark' ? 'light' : 'dark'
    );
    expect(Math.abs((await page.evaluate(() => scrollY)) - beforeScroll)).toBeLessThan(5);

    await page.locator('#language').click();
    expect(Math.abs((await page.evaluate(() => scrollY)) - beforeScroll)).toBeLessThan(5);

    await page.locator('#mobile-settings').click();
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await page.locator('#settings-dialog [data-close]').click();
    await expect(page.locator('#settings-dialog')).toBeHidden();
  }
});
