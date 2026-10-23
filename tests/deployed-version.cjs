/* Compare public GitHub Pages bytes with the checked-out commit after deploy.
 * Different from a CI build success: checks content served to anonymous visitors. */
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const base = 'https://amerkallajo.github.io/taxi-fuel-calculator/';
const assets = [
  'index.html',
  'styles.css',
  'core.js',
  'app.js',
  'map.js',
  'sw.js',
  'manifest.webmanifest',
  'fonts/alexandria.woff2',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
];
const hash = (data) => createHash('sha256').update(data).digest('hex');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function check() {
  for (const path of assets) {
    const url = base + path + '?deploy-check=' + Date.now();
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) throw Error(path + ' HTTP ' + response.status);
    const live = Buffer.from(await response.arrayBuffer());
    const local = fs.readFileSync(path);
    if (hash(live) !== hash(local)) {
      throw Error(
        path +
          ' is not yet identical to checkout (live ' +
          hash(live).slice(0, 12) +
          ', checkout ' +
          hash(local).slice(0, 12) +
          ')'
      );
    }
    console.log('DEPLOY ASSET MATCH', path, hash(local).slice(0, 18));
  }
}
(async () => {
  let err;
  for (let i = 0; i < 16; i++) {
    try {
      await check();
      console.log('DEPLOY PASS: Live GitHub Pages content matches this commit');
      return;
    } catch (e) {
      err = e;
      console.log('DEPLOY RETRY', i + 1, e.message);
      if (i < 15) await delay(10000);
    }
  }
  throw err;
})().catch((e) => {
  console.error('DEPLOY FAIL:', e.message);
  process.exitCode = 1;
});
