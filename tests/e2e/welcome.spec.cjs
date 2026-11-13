const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

test('mobile calculator separates inputs and result with keyboard and a fixed result button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#trip');
  await expect(page.locator('#trip-input-panel')).toBeVisible();
  await expect(page.locator('#trip-result-panel')).toBeHidden();
  await page.locator('#price').fill('12000');
  await page.locator('#calculator-inputs-tab').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#calculator-result-tab')).toBeFocused();
  await expect(page.locator('#calculator-result-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#trip-input-panel')).toBeHidden();
  await expect(page.locator('#cost-number')).toBeVisible();
  await expect(page.locator('#cost-number')).toHaveText('20,000');
  await page.locator('#show-summary').click();
  await expect(page.locator('#trip-input-panel')).toBeVisible();
  await expect(page.locator('#trip-result-panel')).toBeHidden();
  await page.locator('#show-summary').click();
  await expect(page.locator('#trip-result-panel')).toBeVisible();
});

test('Arabic welcome introduces Amer, privacy and free access before choosing a service', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#view-welcome')).toBeVisible();
  await expect(page.locator('#view-trip')).toBeHidden();
  await expect(page.locator('.creator-card')).toContainText('عامر قلاجو');
  await expect(page.locator('.welcome-assurance')).toContainText('مجانية. للجميع.');
  await expect(page.locator('.welcome-privacy')).toContainText('متصفحك فقط');
  expect(
    await page.locator('.creator-card img').evaluate((img) => img.complete && img.naturalWidth > 0)
  ).toBe(true);
  const box = await page.locator('#start-calculation').boundingBox();
  expect(box.y + box.height).toBeLessThan(page.viewportSize().height);
  await page.locator('#start-calculation').click();
  await expect(page.locator('#view-services')).toBeVisible();
  await expect(page.locator('.service-card')).toHaveCount(4);
  await page.locator('.service-card[href="#trip"]').click();
  await expect(page.locator('#view-trip')).toBeVisible();
  await expect(page.locator('.favorites-card')).not.toHaveAttribute('open', '');
  await expect(page.locator('.commute-card')).not.toHaveAttribute('open', '');
  await page.goBack();
  await expect(page.locator('#view-services')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-welcome')).toBeVisible();
});

test('tank inputs, Arabic digits, price, invalid values and reload retain equivalent calculations', async ({
  page,
}) => {
  await page.goto('./#trip');
  await page.locator('#distance').fill('١٢٠');
  await page.locator('#price').fill('١٢٠٠٠');
  await page.locator('#efficiency-unit').selectOption('kmtank');
  await expect(page.locator('#efficiency')).toHaveValue('240');
  await page.locator('#efficiency').fill('٢٤٠');
  await expect(page.locator('#cost-number')).toHaveText('120,000');
  await expect(page.locator('#tank-range')).toContainText('240');
  await expect(page.locator('#tank-cost')).toContainText('240,000');
  await page.locator('#efficiency-unit').selectOption('l100');
  await expect(page.locator('#cost-number')).toHaveText('120,000');
  await page.locator('#efficiency-unit').selectOption('kml');
  await expect(page.locator('#efficiency')).toHaveValue('12');
  await page.locator('#efficiency-unit').selectOption('kmtank');
  await page.locator('#efficiency').fill('٢٠٠');
  await expect(page.locator('#cost-number')).toHaveText('144,000');
  await page.reload();
  await expect(page.locator('#efficiency-unit')).toHaveValue('kmtank');
  await expect(page.locator('#efficiency')).toHaveValue('٢٠٠');
  await expect(page.locator('#cost-number')).toHaveText('144,000');
  await page.locator('#efficiency').fill('0');
  await expect(page.locator('#efficiency')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#cost-number')).toHaveText('—');
  await expect(page.locator('#tank-range')).toHaveText('—');
  await page.locator('#efficiency').fill('200');
  await page.locator('#price').fill('0');
  await expect(page.locator('#tank-cost')).toContainText('0');
  await page.locator('#price').fill('');
  await expect(page.locator('#tank-cost')).toHaveText('—');
});

test('welcome and services fit narrow Arabic and English screens in both themes', async ({
  page,
}) => {
  await page.goto('./');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const language of ['ar', 'en']) {
      if ((await page.locator('html').getAttribute('lang')) !== language)
        await page.locator('#language').click();
      for (const view of ['welcome', 'services']) {
        await page.goto('./#' + view);
        await expect(page.locator('#view-' + view)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width
        );
      }
    }
  }
  await page.goto('./#welcome');
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#start-calculation')).toBeVisible();
});
