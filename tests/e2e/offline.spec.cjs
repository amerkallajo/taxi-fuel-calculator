const { test, expect } = require('@playwright/test');
test('real Chromium worker caches the shell and supports offline reload and saved vehicles', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Service Worker lifecycle is tested in Chromium; WebKit mocked journeys are separate.'
  );
  await page.goto('./#trip');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.locator('#price').fill('12000');
  await page.locator('#efficiency').fill('10');
  await page.locator('[data-view="garage"]').click();
  await page.locator('#add-vehicle').click();
  await page.locator('#vehicle-name').fill('سيارة دون نت');
  await page.locator('#vehicle-tank').fill('200');
  await page.locator('#vehicle-form button[type=submit]').click();
  await expect(page.locator('.vehicle-card')).toHaveCount(1);
  await page.locator('[data-view="trip"]').click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#cost-number')).toHaveText('24,000');
  await expect(page.locator('#connection-label')).toContainText('بلا نت');
  await page.locator('#distance').fill('50');
  await expect(page.locator('#cost-number')).toHaveText('60,000');
  await page.locator('[data-view="garage"]').click();
  await expect(page.locator('#vehicles-list')).toContainText('سيارة دون نت');
  await page.locator('[data-view="trip"]').click();
  await page.locator('#open-map').click();
  await expect(page.locator('#map-status')).toContainText('إنترنت');
  await page.goto('./');
  await expect(page.locator('#view-home')).toBeVisible();
  for (const selector of ['.creator-card img', '.hero-visual img'])
    expect(
      await page.locator(selector).evaluate((img) => img.complete && img.naturalWidth > 0)
    ).toBe(true);
  await page.locator('#start-calculation').click();
  await expect(page.locator('#view-trip')).toBeVisible();
  const urls = await page.evaluate(async () => {
    const name = (await caches.keys()).find((x) => x.startsWith('road-cost-offline-v'));
    const c = await caches.open(name);
    return (await c.keys()).map((x) => x.url);
  });
  expect(urls.length).toBeLessThan(28);
  expect(
    urls.every(
      (x) => !x.includes('nominatim') && !x.includes('osrm') && !x.includes('tile.openstreetmap')
    )
  ).toBe(true);
});
