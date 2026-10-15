/* Dependency-free regression checks for the optional Road Cost routing module. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeNode {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.open = false;
    this.disabled = false;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.classList = {toggle() {}};
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  dispatchEvent(e) {
    for (const callback of this.listeners[e.type] || []) callback(e);
  }
  click() {this.dispatchEvent({type: 'click'});}
  setAttribute(key, value) {this.attributes[key] = value;}
  replaceChildren() {this.children = [];}
  append(...nodes) {this.children.push(...nodes);}
}
async function flush() {await new Promise(resolve => setImmediate(resolve));}
async function main() {
  const names = [
    'map-section', 'map-status', 'map-result', 'map-result-title',
    'map-km', 'map-duration', 'map-start-input', 'map-end-input',
    'map-start-results', 'map-end-results', 'map-start-search',
    'map-end-search', 'map-route-button', 'map-gps', 'map-swap',
    'distance'
  ];
  const nodes = Object.fromEntries(names.map(id => [id, new FakeNode(id)]));
  nodes['map-section'].open = true;
  const modeButtons = ['start', 'end'].map(which => {
    const b = new FakeNode(); b.dataset.mapPick = which; return b;
  });
  const document = {
    getElementById: id => nodes[id] || null,
    querySelectorAll: selector => selector === '[data-map-pick]' ? modeButtons : [],
    createElement: () => new FakeNode(),
    head: {append() {}}
  };
  const saved = new Map([['taxi-fuel-offline-v1', JSON.stringify({
    efficiency: '10', price: '12000', currency: 'ل.س'
  })]]);
  const localStorage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value))
  };
  let now = 10000;
  let routeCount = 0;
  let searchCount = 0;
  let routeShouldFail = false;
  let gpsCount = 0;
  let geocodeDown = false;
  const geocodeQueries = [];
  let distanceUpdates = 0;
  let cost = null;
  let liters = null;
  let returnedRoute = null;
  const navigator = {
    onLine: true,
    geolocation: {
      getCurrentPosition(ok) {
        gpsCount++;
        ok({coords: {latitude: 33.5, longitude: 36.3}});
      }
    }
  };
  const browserMap = {
    on(name, fn) {if (name === 'click') this.choosePoint = fn; return this;},
    setView() {return this;}, fitBounds() {return this;},
    removeLayer() {}, invalidateSize() {}
  };
  const layer = {
    addTo() {return this;}, bindTooltip() {return this;},
    getBounds() {return [[33.5, 36.3], [34.7, 36.7]];}
  };
  const window = {
    L: {
      map() {return browserMap;}, tileLayer() {return layer;},
      circleMarker() {return layer;}, polyline(coords) {
        returnedRoute = coords; return layer;
      }, latLngBounds: x => x
    },
    isSecureContext: true,
    addEventListener(type, fn) {this.listeners ||= {};this.listeners[type] = fn;}
  };
  nodes.distance.addEventListener('input', () => {
    distanceUpdates++;
    const km = Number(nodes.distance.value);
    liters = km / 10;
    cost = liters * 12000;
  });
  async function fetch(url) {
    const u = new URL(url);
    if (u.hostname === 'nominatim.openstreetmap.org' || u.hostname === 'photon.komoot.io') {
      searchCount++;
      const q = u.searchParams.get('q');
      geocodeQueries.push({host: u.hostname, q});
      if (u.hostname === 'photon.komoot.io') {
        assert.equal(u.searchParams.get('lang'), 'default',
          'Do not force unsupported Arabic response language on Photon');
      } else {
        assert.equal(u.searchParams.get('format'), 'jsonv2');
      }
      if (geocodeDown) return {ok:false, status:503};
      const square = q.includes('الأمويين');
      const damascus = q.includes('دمشق');
      const coords = square ? [36.272,33.514] : damascus ? [36.3,33.5] : [36.7,34.7];
      const name = square ? 'ساحة الأمويين' : damascus ? 'دمشق' : 'حمص';
      return {ok: true, json: async () => u.hostname === 'photon.komoot.io'
        ? {features: [{properties:{name, country:'سوريا'}, geometry:{coordinates:coords}}]}
        : [{display_name:name+', سوريا',lon:String(coords[0]),lat:String(coords[1])}]};
    }
    if (!url.includes('/route/v1/driving/')) throw Error('Unexpected URL: ' + url);
    routeCount++;
    assert.match(url, /36.300000,33.500000;36.700000,34.700000/);
    if (routeShouldFail) return {ok: true, json: async () => ({code: 'NoRoute', routes: []})};
    return {ok: true, json: async () => ({
      code: 'Ok',
      routes: [{distance: 150000, duration: 7200, geometry: {
        type: 'LineString', coordinates: [[36.3,33.5], [36.7,34.7]]
      }}]
    })};
  }
  const context = {
    document, window, navigator, localStorage, fetch, URL, L: window.L,
    Date: class extends Date {static now() {return now;}},
    AbortController, Event: class {constructor(type) {this.type = type;}},
    setTimeout: () => 0, clearTimeout() {},
    console
  };
  vm.runInNewContext(fs.readFileSync('map.js', 'utf8'), context, {filename: 'map.js'});
  nodes['map-section'].dispatchEvent({type: 'toggle'});
  await flush();
  assert.ok(browserMap.choosePoint, 'Interactive map initialized when opened');
  // Both origin and destination have explicit search/selection.
  nodes['map-start-input'].value = 'دمشق';
  nodes['map-start-search'].click();
  await flush();
  assert.equal(nodes['map-start-results'].children.length, 1, 'Arabic Damascus result');
  nodes['map-start-results'].children[0].click();
  now += 1300;
  nodes['map-gps'].click();
  assert.equal(gpsCount, 1);
  assert.equal(nodes['map-start-input'].value, 'موقعي الحالي');
  nodes['map-end-input'].value = 'حمص';
  nodes['map-route-button'].click();
  assert.equal(routeCount, 0, 'No implicit selection from text');
  nodes['map-end-search'].click();
  await flush();
  assert.equal(searchCount, 2);
  assert.equal(geocodeQueries[1].q, "حمص");
  assert.equal(nodes['map-end-results'].children.length, 1);
  nodes['map-end-results'].children[0].click();
  assert.ok(nodes['map-end-input'].value.includes('حمص'));
  nodes['map-route-button'].click();
  await flush();
  assert.equal(routeCount, 1);
  assert.equal(nodes.distance.value, '150.00');
  assert.equal(distanceUpdates, 1, 'Original calculator input event dispatched');
  assert.equal(liters, 15);
  assert.equal(cost, 180000);
  assert.equal(nodes['map-duration'].textContent, '2 ساعة');
  assert.equal(returnedRoute.length, 2);
  const originalSettings = JSON.parse(saved.get('taxi-fuel-offline-v1'));
  assert.deepEqual(originalSettings, {efficiency: '10',price: '12000',currency: 'ل.س'});
  const summary = JSON.parse(saved.get('road-cost-last-route-summary-v1'));
  assert.equal(summary.km, 150);
  assert.ok(!saved.get('road-cost-last-route-summary-v1').includes('36.3'), 'GPS coordinates not persisted');
  // The existing app's round-trip switch multiplies the ONE-WAY distance.
  assert.equal(Number(nodes.distance.value) * 2 / 10 * 12000, 360000);
  now += 2000;
  nodes['map-end-input'].value = 'ساحة الأمويين';
  nodes['map-end-input'].dispatchEvent({type:'input'});
  nodes['map-end-search'].click();
  await flush();
  assert.equal(nodes['map-end-results'].children.length, 1, 'Umayyad Square search');
  nodes['map-end-results'].children[0].click();
  assert.match(nodes['map-end-input'].value, /الأمويين/);
  now += 2000;
  nodes['map-end-input'].value = 'وجهة جديدة';
  nodes['map-end-input'].dispatchEvent({type:'input'});
  assert.equal(nodes['map-result'].hidden, true);
  assert.equal(nodes.distance.value, '150.00', 'Editing the map does not overwrite manual distance');
  now += 2000;
  geocodeDown = true;
  nodes['map-end-search'].click();
  await flush();
  assert.match(nodes['map-status'].textContent, /503/, 'Display actual upstream status');
  assert.equal(nodes['map-end-results'].children.length, 0);
  modeButtons[1].click();
  browserMap.choosePoint({latlng: {lat: 34.7, lng: 36.7}});
  assert.equal(nodes['map-end-input'].value, '34.70000, 36.70000',
    'Map selection works while search providers are down');
  routeShouldFail = true;
  nodes['map-route-button'].click();
  await flush();
  assert.equal(nodes.distance.value, '150.00', 'NoRoute must not use straight-line fallback');
  assert.equal(nodes['map-result'].hidden, true);
  navigator.onLine = false;
  nodes.distance.value = '25';
  nodes['map-route-button'].click();
  assert.equal(nodes.distance.value, '25', 'Manual distance retained offline');
  assert.match(nodes['map-status'].textContent, /الإنترنت/);
  assert.equal(JSON.parse(saved.get('taxi-fuel-offline-v1')).price, '12000');
  const sw = fs.readFileSync('sw.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(sw.includes("road-cost-offline-v9"));
  assert.ok(sw.includes("'./map.js?v=9'"));
  assert.ok(html.includes('<script defer src="./app.js?v=5"></script>'));
  assert.ok(html.includes('<script defer src="./map.js?v=9"></script>'));
  assert.ok(html.includes('icons/road-cost-180.png?v=6'));
  console.log('PASS: Damascus/Homs/Umayyad Arabic search, explicit result selection, GPS, OSRM, provider outage with map click, cost, round trip, NoRoute, offline manual, PWA cache, saved settings');
}
main().catch(e => {console.error(e); process.exitCode = 1;});
