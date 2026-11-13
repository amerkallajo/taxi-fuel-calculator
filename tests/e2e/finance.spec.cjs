const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });

test('cash and actual expenses are timestamped, saved offline, and survive reload', async ({
  page,
}) => {
  await page.goto('./#trip');
  await page.locator('[data-view="finance"]').click();
  await page.locator('#cash-note-50000').fill('٢');
  await page.locator('#cash-note-2500').fill('٣');
  await expect(page.locator('#cash-total')).toContainText('107,500');
  await page.locator('#cash-save').click();
  await expect(page.locator('#cash-history .finance-entry')).toHaveCount(1);

  await page.locator('#expense-type').selectOption('diesel');
  await page.locator('#expense-amount').fill('١٥٠٬٠٠٠');
  await page.locator('#expense-note').fill('تعبئة مازوت');
  await page.locator('#expense-form button[type=submit]').click();
  await expect(page.locator('#expense-month-total')).toContainText('150,000');
  await expect(page.locator('#expense-history')).toContainText('تعبئة مازوت');

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('road-cost-v4')));
  expect(persisted.cashHistory[0].total).toBe(107500);
  expect(persisted.cashHistory[0].date).toBeGreaterThan(0);
  expect(persisted.expenses[0].amount).toBe(150000);
  expect(persisted.expenses[0].date).toBeGreaterThan(0);

  await page.reload();
  await page.locator('[data-view="finance"]').click();
  await expect(page.locator('#cash-history .finance-entry')).toHaveCount(1);
  await expect(page.locator('#expense-history .finance-entry')).toHaveCount(1);
  await page.locator('#cash-clear').click();
  await expect(page.locator('#cash-total')).toContainText('0');
  await expect(page.locator('#cash-history .finance-entry')).toHaveCount(1);
});
test('payment categories, currency totals, and untrusted notes are safe', async ({ page }) => {
  await page.goto('./#finance');
  await page.locator('#expense-currency').selectOption('$');
  await page.locator('#expense-type').selectOption('maintenance');
  await page.locator('#expense-amount').fill('42.5');
  await page.locator('#expense-note').fill('<img src=x onerror=alert(1)>');
  await page.locator('#expense-form button[type=submit]').click();
  await page.locator('#expense-filter-currency').selectOption('$');
  await expect(page.locator('#expense-month-total')).toContainText('42.5');
  await expect(page.locator('#expense-history')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#expense-history img')).toHaveCount(0);
});
