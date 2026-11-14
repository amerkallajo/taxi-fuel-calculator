const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

test('mobile calculator keeps a floating total until the full result is on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#trip');
  await page.locator('#price').fill('12000');
  const bar = page.locator('.mobile-total-bar');
  await expect(bar).toBeVisible();
  await expect(page.locator('#mobile-total')).toContainText('20,000');
  const placement = await bar.evaluate((el) => {
    const bar = el.getBoundingClientRect(),
      nav = document.querySelector('.navigation').getBoundingClientRect();
    return { barBottom: bar.bottom, navTop: nav.top, navBottom: nav.bottom, height: innerHeight };
  });
  expect(placement.barBottom).toBeLessThanOrEqual(placement.navTop);
  expect(placement.navBottom).toBeLessThanOrEqual(placement.height);
  await page.locator('#show-summary').click();
  await expect(page.locator('#cost-number')).toBeInViewport();
  await expect(page.locator('#cost-number')).toHaveText('20,000');
  await expect(bar).toHaveClass(/is-hidden/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(bar).not.toHaveClass(/is-hidden/);
});

test('Arabic home introduces Amer, privacy and free access before choosing a service', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#view-home')).toBeVisible();
  await expect(page.locator('#view-trip')).toBeHidden();
  await expect(page.locator('.creator-card')).toContainText('عامر قلاجو');
  await expect(page.locator('.hero-points')).toContainText('مجانية للجميع');
  await expect(page.locator('.welcome-privacy')).toContainText('متصفحك فقط');
  expect(
    await page.locator('.creator-card img').evaluate((img) => img.complete && img.naturalWidth > 0)
  ).toBe(true);
  const box = await page.locator('#start-calculation').boundingBox();
  expect(box.y + box.height).toBeLessThan(page.viewportSize().height);
  await expect(page.locator('.service-card')).toHaveCount(3);
  await page.locator('#start-calculation').click();
  await expect(page.locator('#view-trip')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-home')).toBeVisible();
  await page.locator('.service-card[href="#garage"]').click();
  await expect(page.locator('#view-garage')).toBeVisible();
  // Links saved from the previous layout still land somewhere sensible.
  for (const hash of ['welcome', 'services']) {
    await page.goto('./#' + hash);
    await expect(page.locator('#view-home')).toBeVisible();
  }
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

test('home fits narrow Arabic and English screens in both themes', async ({ page }) => {
  await page.goto('./');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const language of ['ar', 'en']) {
      if ((await page.locator('html').getAttribute('lang')) !== language)
        await page.locator('#language').click();
      await expect(page.locator('#view-home')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
    }
  }
  const before = await page.locator('html').getAttribute('data-theme');
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    before === 'dark' ? 'light' : 'dark'
  );
  await expect(page.locator('#start-calculation')).toBeVisible();
});
