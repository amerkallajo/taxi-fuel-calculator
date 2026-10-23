const { test, expect } = require('@playwright/test');
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
test('a waiting worker activates only on acceptance and keeps the current draft and saved data', async ({
  page,
  browserName,
}, info) => {
  test.skip(
    browserName !== 'chromium' ||
      info.project.name !== 'chromium-desktop' ||
      !!process.env.LIVE_URL,
    'Local Chromium lifecycle test'
  );
  const root = path.resolve(__dirname, '../..');
  const currentVersion = Number(
    fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/road-cost-offline-v(\d+)/)[1]
  );
  let version = currentVersion;
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.join(root, pathname === '/' ? 'index.html' : pathname);
    fs.readFile(filename, (err, buffer) => {
      if (err) {
        res.writeHead(404).end();
        return;
      }
      const types = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.png': 'image/png',
        '.webmanifest': 'application/manifest+json',
      };
      res.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(
        pathname === '/sw.js'
          ? buffer
              .toString()
              .replaceAll('road-cost-offline-v' + currentVersion, 'road-cost-offline-v' + version)
          : buffer
      );
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.locator('#price').fill('12000');
    await page.locator('#distance').fill('42');
    await page.locator('#trip-name').fill('تبقى بعد التحديث');
    await page.locator('#save-trip').click();
    version = currentVersion + 1;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)
      )
      .toBe(true);
    await expect(page.locator('#update-banner')).toBeVisible();
    await expect(page.locator('#distance')).toHaveValue('42');
    const reload = page.waitForEvent('domcontentloaded');
    await page.locator('#apply-update').click();
    await reload;
    await expect
      .poll(() =>
        page.evaluate(
          async (v) => (await caches.keys()).includes('road-cost-offline-v' + v),
          version
        )
      )
      .toBe(true);
    await expect(page.locator('#distance')).toHaveValue('42');
    await expect(page.locator('#trip-name')).toHaveValue('تبقى بعد التحديث');
    await expect(page.locator('#update-banner')).toBeHidden();
    await page.locator('[data-view=journal]').click();
    await expect(page.locator('#history-list')).toContainText('تبقى بعد التحديث');
    expect(
      await page.evaluate(
        async (v) => (await caches.keys()).includes('road-cost-offline-v' + v),
        currentVersion
      )
    ).toBe(false);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
