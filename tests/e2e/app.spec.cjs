const { test, expect } = require('@playwright/test');
const C = require('../../core.js');
const legacy = { efficiency: '10', price: '12000', currency: 'ل.س' };
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('test-seeded')) {
      localStorage.setItem('taxi-fuel-offline-v1', JSON.stringify(value));
      localStorage.setItem('test-seeded', '1');
    }
  }, legacy);
  await page.goto('./');
});
test('migrate Arabic settings, calculate, switch units without rounding, split and forecast', async ({
  page,
}) => {
  await expect(page.locator('#cost-number')).toHaveText('24,000');
  await page.locator('#distance').fill('١٥٠');
  await expect(page.locator('#cost-number')).toHaveText('180,000');
  await page.locator('#roundtrip').check();
  await page.locator('.budget-details summary').click();
  await page.locator('#passengers').fill('٤');
  await page.locator('#extra').fill('٢٠٠٠٠');
  await page.locator('#reserve').fill('١٠');
  await expect(page.locator('#cost-number')).toHaveText('416,000');
  await expect(page.locator('#per-person')).toContainText('104,000');
  await expect(page.locator('#mobile-total')).toContainText('416,000');
  await expect(page.locator('#monthly')).toContainText('9,152,000');
  await expect(page.locator('#yearly')).toContainText('109,824,000');
  await page.locator('#efficiency-unit').selectOption('l100');
  await expect(page.locator('#efficiency')).toHaveValue('10');
  await page.locator('#efficiency').fill('٨٫٣٣٣٣٣٣٣٣٣٣٣٣٣٣٣');
  const cost = await page.locator('#cost-number').textContent();
  await page.locator('#efficiency-unit').selectOption('kml');
  await page.locator('#efficiency-unit').selectOption('l100');
  await expect(page.locator('#cost-number')).toHaveText(cost);
  await page.locator('#distance').fill('-1');
  await expect(page.locator('#cost-number')).toHaveText('—');
  await expect(page.locator('#distance')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#distance').fill('20');
  await page.locator('#price').fill('0');
  await expect(page.locator('#cost-number')).toHaveText('20,000');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('taxi-fuel-offline-v1')));
  expect(saved.price).toBe('0');
});
test('save favorite, separate currencies, export CSV, reuse at current price and delete', async ({
  page,
}) => {
  await page.locator('#trip-name').fill('الدوام اليومي');
  await page.locator('#save-favorite').check();
  await page.locator('#save-trip').click();
  await expect(page.locator('#save-trip')).toBeDisabled();
  await expect(page.locator('#favorites-list')).toContainText('الدوام اليومي');
  await page.locator('#currency').selectOption('$');
  await page.locator('#price').fill('1');
  await page.locator('#save-trip').click();
  await page.locator('[data-view="journal"]').click();
  await expect(page.locator('#journal-trips')).toHaveText('1');
  await expect(page.locator('#journal-total')).toContainText('24,000');
  await page.locator('#journal-currency').selectOption('$');
  await expect(page.locator('#journal-total')).toContainText('2');
  await expect(page.locator('#journal-trips')).toHaveText('1');
  const downloading = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await page.locator('#history-list [data-load-trip]').first().click();
  await expect(page.locator('#cost-number')).toHaveText('2');
  await page.locator('#price').fill('2');
  await page.locator('#favorites-list [data-load-trip]').first().click();
  await expect(page.locator('#cost-number')).toHaveText('4');
  await page.locator('[data-view="journal"]').click();
  await page.locator('[data-delete-trip]').click();
  await expect(page.locator('#journal-trips')).toHaveText('0');
});
test('add, edit, compare and use vehicles', async ({ page }) => {
  await page.locator('[data-view="garage"]').click();
  await page.locator('#add-vehicle').click();
  await page.locator('#vehicle-name').fill('سيارتي');
  await page.locator('#vehicle-efficiency').fill('١٥');
  await page.locator('#vehicle-price').fill('١٢٠٠٠');
  await page.locator('#vehicle-form button[type=submit]').click();
  await expect(page.locator('#vehicles-list')).toContainText('سيارتي');
  await expect(page.locator('#vehicle-comparison')).toContainText('16,000');
  await page.locator('#add-vehicle').click();
  await page.locator('#vehicle-name').fill('سيارة ثانية');
  await page.locator('#vehicle-efficiency').fill('10');
  await page.locator('#vehicle-price').fill('12000');
  await page.locator('#vehicle-form button[type=submit]').click();
  await expect(page.locator('.comparison-row')).toHaveCount(2);
  await expect(page.locator('.comparison-row').first()).toContainText('سيارتي');
  await page.locator('[data-edit-vehicle]').first().click();
  await page.locator('#vehicle-name').fill('السيارة الاقتصادية');
  await page.locator('#vehicle-form button[type=submit]').click();
  await page.locator('[data-use-vehicle]').first().click();
  await expect(page.locator('#cost-number')).toHaveText('16,000');
  await expect(page.locator('#vehicle-select')).not.toHaveValue('');
  await page.locator('[data-view="garage"]').click();
  await page.locator('[data-delete-vehicle]').first().click();
  await expect(page.locator('.vehicle-card')).toHaveCount(1);
});
test('backup validation, explicit restore and safe rendering of untrusted names', async ({
  page,
}) => {
  const settings = page.locator('#mobile-settings');
  if (await settings.isVisible()) await settings.click();
  else await page.locator('#open-settings').click();
  const downloading = page.waitForEvent('download');
  await page.locator('#export-backup').click();
  expect((await downloading).suggestedFilename()).toContain('backup');
  await page
    .locator('#import-backup')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.locator('#import-message')).toContainText('غير صالح');
  await expect(page.locator('#import-preview')).toBeHidden();
  const state = C.defaultState({ efficiency: '20', price: '1', currency: '$' });
  state.trips = [
    {
      id: 't',
      name: '<img src=x onerror=alert(1)>',
      date: Date.now(),
      currency: '$',
      input: { distance: 100, efficiency: 20, price: 1 },
      favorite: true,
    },
  ];
  await page.locator('#import-backup').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.locator('#import-preview')).toBeVisible();
  await expect(page.locator('#cost-number')).toHaveText('24,000');
  await page.locator('#confirm-import').click();
  await expect(page.locator('#cost-number')).toHaveText('1');
  await expect(page.locator('#favorites-list')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#favorites-list img')).toHaveCount(0);
});
test('English LTR, dark mode, navigation and mobile widths have no horizontal overflow', async ({
  page,
}) => {
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#trip-heading')).toHaveText('Where are we heading?');
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['trip', 'garage', 'journal']) {
      await page.locator('[data-view="' + view + '"]').click();
      const bounds = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(
        bounds.content,
        view + ' at ' + width + ': ' + JSON.stringify(bounds)
      ).toBeLessThanOrEqual(bounds.viewport);
    }
  }
  await page.locator('[data-view="trip"]').click();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: ':root { font-family: monospace; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
test('draft survives reload and reset keeps vehicle preferences', async ({ page }) => {
  await page.locator('#distance').fill('٤٢');
  await page.locator('#trip-name').fill('رحلتي');
  await page.reload();
  await expect(page.locator('#distance')).toHaveValue('٤٢');
  await expect(page.locator('#trip-name')).toHaveValue('رحلتي');
  await page.locator('#reset').click();
  await expect(page.locator('#distance')).toHaveValue('20');
  await expect(page.locator('#price')).toHaveValue('12000');
  await expect(page.locator('#efficiency')).toHaveValue('10');
});
test('unavailable storage reports failure without claiming a saved trip', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.reload();
  await expect(page.locator('#storage-warning')).toBeVisible();
  await page.locator('#save-trip').click();
  await expect(page.locator('#save-trip')).toBeEnabled();
  const trips = await page.evaluate(() => JSON.parse(localStorage.getItem('road-cost-v4')).trips);
  expect(trips).toHaveLength(0);
});
