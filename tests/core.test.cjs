const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const base = { distance: 150, efficiency: 10, price: 12000 };
test('Arabic, Persian and English digits, decimal separators and thousands', () => {
  for (const [s, n] of [
    ['١٢٬٥٠٠', 12500],
    ['۱۲٫۵', 12.5],
    ['12,5', 12.5],
    ['1,234.5', 1234.5],
    ['١٢ ٥٠٠', 12500],
    ['.5', 0.5],
    ['٠', 0],
  ])
    assert.equal(C.number(s), n, s);
});
test('reject malformed numbers, negatives, exponents and non-finite values', () => {
  for (const s of ['', null, '12abc', '-1', '1e3', '1,2,3', 'Infinity', Infinity, {}, '1.2.3'])
    assert.ok(Number.isNaN(C.number(s)), String(s));
});
test('legacy baseline result and round-trip arithmetic', () => {
  assert.equal(C.calculate(base).total, 180000);
  assert.equal(C.calculate({ ...base, roundtrip: true }).total, 360000);
  assert.equal(C.calculate({ ...base, roundtrip: true }).liters, 30);
});
test('no intermediate rounding, equivalent consumption units', () => {
  const r = C.calculate({ distance: '١٠٠', efficiency: 12, price: '١٫٥' });
  assert.equal(r.total, 12.5);
  assert.equal(r.liters, 100 / 12);
  assert.equal(C.calculate({ ...base, efficiency: 100 / (100 / 12) }).liters, 150 / 12);
});
test('cushion applies to fuel only; extra fees added once; split includes driver', () => {
  const r = C.calculate({ ...base, reserve: 10, extra: 20000, passengers: 4, roundtrip: true });
  assert.deepEqual(r, {
    km: 300,
    liters: 30,
    fuel: 360000,
    buffer: 36000,
    extra: 20000,
    total: 416000,
    perKm: 416000 / 300,
    perPerson: 104000,
    passengers: 4,
  });
});
test('free fuel is valid, missing fuel price is not', () => {
  assert.equal(C.calculate({ ...base, price: 0 }).total, 0);
  assert.equal(C.calculate({ ...base, price: '' }), null);
});
test('invalid ranges and overflow never create an apparently valid result', () => {
  for (const patch of [
    { distance: 0 },
    { distance: 1e7 },
    { efficiency: 0 },
    { efficiency: 0.001 },
    { price: -1 },
    { price: 1e10 },
    { passengers: 0 },
    { passengers: 1.5 },
    { passengers: 51 },
    { reserve: 101 },
    { extra: 1e13 },
  ])
    assert.equal(C.calculate({ ...base, ...patch }), null, JSON.stringify(patch));
});
function storage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}
test('copy migration preserves Arabic legacy preferences and never deletes legacy data', () => {
  const original = JSON.stringify({ efficiency: '١٠', price: '١٢٬٠٠٠', currency: 'ل.س' }),
    s = storage({ [C.LEGACY_KEY]: original });
  const r = C.load(s);
  assert.equal(r.state.settings.efficiency, '١٠');
  assert.equal(r.state.settings.price, '١٢٬٠٠٠');
  assert.equal(r.recovered, false);
  assert.equal(s.getItem(C.LEGACY_KEY), original);
  assert.equal(
    C.calculate({ ...base, efficiency: r.state.settings.efficiency, price: r.state.settings.price })
      .total,
    180000
  );
});
test('corrupt v4 falls back without modifying raw stored data', () => {
  const s = storage({ [C.STORAGE_KEY]: '{bad', [C.LEGACY_KEY]: JSON.stringify({ price: '100' }) });
  const r = C.load(s);
  assert.equal(r.recovered, true);
  assert.equal(r.state.settings.price, '100');
  assert.equal(s.getItem(C.STORAGE_KEY), '{bad');
});
test('storage access denied still yields a working default', () => {
  const r = C.load({
    getItem() {
      throw Error('Denied');
    },
  });
  assert.equal(r.state.settings.efficiency, '12');
  assert.equal(r.recovered, true);
});
const trip = {
  id: 'a',
  name: 'دمشق ← حمص',
  date: Date.UTC(2026, 9, 23),
  currency: 'ل.س',
  input: base,
  favorite: true,
  source: 'road',
  lat: 33.5,
  lon: 36.3,
};
test('backup roundtrip preserves data and strips unrecognized coordinate fields', () => {
  const s = C.defaultState();
  s.trips = [trip];
  s.vehicles = [
    { id: 'v', name: 'سيارتي', efficiency: 12, price: 12000, currency: 'ل.س', fuel: 'diesel' },
  ];
  const clean = C.sanitizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(clean.trips[0].name, trip.name);
  assert.equal(clean.trips[0].favorite, true);
  assert.equal(clean.vehicles[0].fuel, 'diesel');
  assert.equal(clean.trips[0].lat, undefined);
  assert.equal(C.calculate(clean.trips[0].input).total, 180000);
});
test('schema validation bounds imported records and rejects malformed data', () => {
  assert.throws(() => C.sanitizeState({ version: 3 }));
  const s = C.defaultState();
  s.trips = [
    trip,
    trip,
    { ...trip, id: 'bad', input: { ...base, efficiency: 0 } },
    { ...trip, id: 'date', date: 1e20 },
  ];
  assert.equal(C.sanitizeState(s).trips.length, 1);
  s.vehicles = [{ id: 'v', name: 'bad', efficiency: 0, price: 1, currency: '$' }];
  assert.equal(C.sanitizeState(s).vehicles.length, 0);
});
test('UTF-8 CSV preserves Arabic, escapes quotes/newlines and neutralizes formulas', () => {
  const csv = C.csv([trip, { ...trip, id: 'b', name: ' =HYPERLINK("url")\nسوريا' }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv, /دمشق ← حمص/);
  assert.ok(csv.includes('"\' =HYPERLINK(""url"")\nسوريا"'));
  assert.match(csv, /180000.00/);
});
