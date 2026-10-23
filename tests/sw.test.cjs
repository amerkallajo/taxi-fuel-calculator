const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const currentCache = fs.readFileSync('sw.js', 'utf8').match(/road-cost-offline-v\d+/)[0];
function worker() {
  const handlers = {},
    calls = { skip: 0, claimed: 0, deleted: [], fetch: [] },
    entries = new Map();
  const cache = {
    addAll: async (urls) => {
      calls.precache = urls;
      urls.forEach((u) => entries.set(u, { url: u, cached: true }));
    },
    match: async (q) => entries.get(typeof q === 'string' ? q : q.url),
  };
  const self = {
    registration: { scope: 'https://example.com/taxi-fuel-calculator/' },
    addEventListener: (n, fn) => (handlers[n] = fn),
    skipWaiting: () => calls.skip++,
    clients: { claim: async () => calls.claimed++ },
  };
  const caches = {
    open: async () => cache,
    keys: async () => [
      'road-cost-offline-v9',
      'taxi-fuel-offline-v1',
      'unrelated-app',
      currentCache,
    ],
    delete: async (n) => calls.deleted.push(n),
  };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    self,
    caches,
    URL,
    Set,
    fetch: async (r) => {
      calls.fetch.push(r);
      return { network: true };
    },
  });
  return { handlers, calls, cache, entries };
}
async function install(w) {
  let promise;
  w.handlers.install({ waitUntil: (p) => (promise = p) });
  await promise;
}
test('complete shell contains existing files and no remote URLs; install waits for user', async () => {
  const w = worker();
  await install(w);
  assert.equal(w.calls.skip, 0);
  for (const url of w.calls.precache) {
    const u = new URL(url);
    assert.equal(u.origin, 'https://example.com');
    const file = u.pathname.replace('/taxi-fuel-calculator/', '') || 'index.html';
    assert.ok(fs.existsSync(file), file);
  }
  const html = fs.readFileSync('index.html', 'utf8');
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))
    assert.ok(
      w.calls.precache.some((u) => u.endsWith('/' + match[1])),
      match[1]
    );
});
test('activation deletes only old Road Cost caches', async () => {
  const w = worker();
  let promise;
  w.handlers.activate({ waitUntil: (p) => (promise = p) });
  await promise;
  assert.deepEqual(w.calls.deleted, ['road-cost-offline-v9', 'taxi-fuel-offline-v1']);
  assert.equal(w.calls.claimed, 1);
});
test('only an explicit activation message skips waiting', () => {
  const w = worker();
  w.handlers.message({ data: { type: 'OTHER' } });
  assert.equal(w.calls.skip, 0);
  w.handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(w.calls.skip, 1);
});
test('navigation queries return the installed shell without growing cache', async () => {
  const w = worker();
  await install(w);
  const count = w.entries.size;
  let result;
  w.handlers.fetch({
    request: {
      method: 'GET',
      url: 'https://example.com/taxi-fuel-calculator/?fresh=123',
      mode: 'navigate',
    },
    respondWith: (p) => (result = p),
  });
  assert.equal((await result).cached, true);
  assert.equal(w.entries.size, count);
  assert.equal(w.calls.fetch.length, 0);
});
test('cross-origin APIs, tiles, unknown assets and POST are never intercepted', () => {
  const w = worker();
  let intercepted = 0;
  for (const [url, method] of [
    ['https://nominatim.openstreetmap.org/search?q=test', 'GET'],
    ['https://tile.openstreetmap.org/1/1/1.png', 'GET'],
    ['https://example.com/other/index.html', 'GET'],
    ['https://example.com/taxi-fuel-calculator/sw.js', 'GET'],
    ['https://example.com/taxi-fuel-calculator/index.html', 'POST'],
  ])
    w.handlers.fetch({ request: { url, method }, respondWith: () => intercepted++ });
  assert.equal(intercepted, 0);
});
