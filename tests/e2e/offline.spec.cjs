const { test, expect } = require('@playwright/test');
test('real Chromium worker caches the shell and supports offline reload and journal', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Service Worker lifecycle is tested in Chromium; WebKit mocked journeys are separate.'
  );
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.locator('#price').fill('12000');
  await page.locator('#efficiency').fill('10');
  await page.locator('#trip-name').fill('رحلة دون نت');
  await page.locator('#save-trip').click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#cost-number')).toHaveText('24,000');
  await expect(page.locator('#connection-label')).toContainText('بلا نت');
  await page.locator('#distance').fill('50');
  await expect(page.locator('#cost-number')).toHaveText('60,000');
  await page.locator('[data-view="journal"]').click();
  await expect(page.locator('#history-list')).toContainText('رحلة دون نت');
  await page.locator('[data-view="trip"]').click();
  await page.locator('#open-map').click();
  await expect(page.locator('#map-status')).toContainText('إنترنت');
  const urls = await page.evaluate(async () => {
    const c = await caches.open('road-cost-offline-v10');
    return (await c.keys()).map((x) => x.url);
  });
  expect(urls.length).toBeLessThan(25);
  expect(
    urls.every(
      (x) => !x.includes('nominatim') && !x.includes('osrm') && !x.includes('tile.openstreetmap')
    )
  ).toBe(true);
});
