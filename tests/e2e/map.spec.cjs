const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });
async function setup(page, { denied = false, routeCode = 'Ok', delay = 0 } = {}) {
  await page.addInitScript(
    ({ denied }) => {
      localStorage.setItem(
        'taxi-fuel-offline-v1',
        JSON.stringify({ efficiency: '10', price: '12000', currency: 'ل.س' })
      );
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(ok, fail) {
            denied ? fail({ code: 1 }) : ok({ coords: { latitude: 33.5, longitude: 36.3 } });
          },
        },
      });
    },
    { denied }
  );
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: [{ display_name: 'حمص، سوريا', lat: '34.7', lon: '36.7' }] })
  );
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({ json: { features: [] } })
  );
  await page.route('https://router.project-osrm.org/**', async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route
      .fulfill({
        json: {
          code: routeCode,
          routes:
            routeCode === 'Ok'
              ? [
                  {
                    distance: 150000,
                    duration: 7200,
                    geometry: {
                      type: 'LineString',
                      coordinates: [
                        [36.3, 33.5],
                        [36.7, 34.7],
                      ],
                    },
                  },
                ]
              : [],
        },
      })
      .catch(() => {});
  });
  await page.goto('./');
  await page.locator('#open-map').click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
}
test('real local Leaflet + mocked GPS, Arabic selection and road routing; manual override clears provenance', async ({
  page,
}) => {
  await setup(page);
  await page.locator('#map-gps').click();
  await page.locator('#map-end-input').fill('حمص');
  await page.locator('#map-end-search').click();
  await expect(page.locator('#map-end-results button')).toHaveCount(1);
  await page.locator('#map-route-button').click();
  await expect(page.locator('#distance')).toHaveValue('20');
  await page.locator('#map-end-results button').click();
  await page.locator('#map-route-button').click();
  await expect(page.locator('#distance')).toHaveValue('150.00');
  await expect(page.locator('#cost-number')).toHaveText('180,000');
  await expect(page.locator('#distance-source')).toContainText('OSRM');
  await expect(page.locator('#map-result')).toBeVisible();
  await page.locator('#roundtrip').check();
  await expect(page.locator('#cost-number')).toHaveText('360,000');
  const saved = await page.evaluate(() => localStorage.getItem('road-cost-v4'));
  expect(saved).not.toMatch(/latitude|longitude|36\.3/);
  await page.locator('#distance').fill('25');
  await expect(page.locator('#distance-source')).toHaveText('إدخال يدوي');
  await expect(page.locator('#map-result')).toBeHidden();
});
test('GPS denial, NoRoute, provider outages and map picking retain manual calculation', async ({
  page,
}) => {
  await setup(page, { denied: true, routeCode: 'NoRoute' });
  await page.locator('#map-gps').click();
  await expect(page.locator('#map-status')).toContainText('رفض');
  await page.route('https://nominatim.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' })
  );
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' })
  );
  await page.locator('#map-end-input').fill('حمص');
  await page.locator('#map-end-search').click();
  await expect(page.locator('#map-status')).toContainText('503');
  await page.locator('[data-map-pick=start]').click();
  await page.locator('#road-map').click({ position: { x: 80, y: 90 } });
  await page.locator('[data-map-pick=end]').click();
  await page.locator('#road-map').click({ position: { x: 180, y: 160 } });
  await page.locator('#map-route-button').click();
  await expect(page.locator('#map-status')).toContainText('لا يوجد مسار');
  await expect(page.locator('#distance')).toHaveValue('20');
});
test('a pending route cannot overwrite a new manual distance', async ({ page }) => {
  await setup(page, { delay: 800 });
  await page.locator('#map-gps').click();
  await page.locator('#map-end-input').fill('حمص');
  await page.locator('#map-end-search').click();
  await page.locator('#map-end-results button').click();
  await page.locator('#map-route-button').click();
  await page.locator('#distance').fill('42');
  await expect(page.locator('#distance-source')).toHaveText('إدخال يدوي');
  await page.waitForTimeout(1100);
  await expect(page.locator('#distance')).toHaveValue('42');
  await expect(page.locator('#map-result')).toBeHidden();
  await expect(page.locator('#cost-number')).toHaveText('50,400');
});
