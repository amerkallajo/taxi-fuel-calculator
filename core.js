/* Pure calculations and versioned data. Shared by browsers and Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'road-cost-v4';
  const LEGACY_KEY = 'taxi-fuel-offline-v1';
  const currencies = ['ل.س', '$', '€', '₺'];
  const limits = {
    distance: 1000000,
    efficiency: 1000,
    price: 1e9,
    extra: 1e12,
    reserve: 100,
    passengers: 50,
  };
  function number(input) {
    if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
    let s = String(input ?? '')
      .trim()
      .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
      .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/٫/g, '.')
      .replace(/٬/g, ',')
      .replace(/[\s\u200e\u200f]/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
  }
  function valid(n, min, max) {
    return Number.isFinite(n) && n >= min && n <= max;
  }
  function calculate(input) {
    const d = number(input.distance),
      efficiency = number(input.efficiency),
      price = number(input.price);
    const extra = number(input.extra ?? 0),
      reserve = number(input.reserve ?? 0),
      passengers = number(input.passengers ?? 1);
    if (
      !valid(d, 0.01, limits.distance) ||
      !valid(efficiency, 0.01, limits.efficiency) ||
      !valid(price, 0, limits.price) ||
      !valid(extra, 0, limits.extra) ||
      !valid(reserve, 0, limits.reserve) ||
      !valid(passengers, 1, limits.passengers) ||
      !Number.isInteger(passengers)
    )
      return null;
    const km = d * (input.roundtrip ? 2 : 1);
    const liters = km / efficiency;
    const fuel = liters * price;
    const buffer = (fuel * reserve) / 100;
    const total = fuel + buffer + extra;
    const result = {
      km,
      liters,
      fuel,
      buffer,
      extra,
      total,
      perKm: total / km,
      perPerson: total / passengers,
      passengers,
    };
    return Object.values(result).every(Number.isFinite) && total <= 1e15 ? result : null;
  }
  function defaultState(legacy = {}) {
    const value = (v, fallback, min, max) => (valid(number(v), min, max) ? String(v) : fallback);
    return {
      version: 4,
      settings: {
        efficiency: value(legacy.efficiency, '12', 0.01, 1000),
        price: value(legacy.price, '', 0, 1e9),
        currency: currencies.includes(legacy.currency) ? legacy.currency : 'ل.س',
        fuel: 'gasoline',
        unit: 'kml',
        theme: 'system',
        lang: 'ar',
      },
      vehicles: [],
      trips: [],
    };
  }
  function text(value, max = 80) {
    return typeof value === 'string' ? value.slice(0, max).trim() : '';
  }
  function cleanVehicle(v) {
    if (
      !v ||
      typeof v !== 'object' ||
      !text(v.id) ||
      !text(v.name) ||
      !valid(number(v.efficiency), 0.01, 1000) ||
      !valid(number(v.price), 0, 1e9) ||
      !currencies.includes(v.currency)
    )
      return null;
    return {
      id: text(v.id),
      name: text(v.name, 40),
      efficiency: number(v.efficiency),
      price: number(v.price),
      currency: v.currency,
      fuel: v.fuel === 'diesel' ? 'diesel' : 'gasoline',
    };
  }
  function cleanTrip(t) {
    if (
      !t ||
      typeof t !== 'object' ||
      !text(t.id) ||
      !text(t.name) ||
      !t.input ||
      !calculate(t.input) ||
      !currencies.includes(t.currency) ||
      !Number.isFinite(t.date) ||
      t.date < 0 ||
      t.date > 8640000000000000
    )
      return null;
    const input = {};
    for (const key of ['distance', 'efficiency', 'price', 'extra', 'reserve', 'passengers'])
      input[key] = number(t.input[key] ?? (key === 'passengers' ? 1 : 0));
    input.roundtrip = t.input.roundtrip === true;
    return {
      id: text(t.id),
      name: text(t.name),
      date: t.date,
      currency: t.currency,
      input,
      favorite: t.favorite === true,
      fuel: t.fuel === 'diesel' ? 'diesel' : 'gasoline',
      source: t.source === 'road' ? 'road' : 'manual',
    };
  }
  function sanitizeState(raw) {
    if (
      !raw ||
      raw.version !== 4 ||
      !raw.settings ||
      !Array.isArray(raw.vehicles) ||
      !Array.isArray(raw.trips)
    )
      throw Error('Invalid backup');
    const state = defaultState(raw.settings);
    const s = raw.settings;
    state.settings.fuel = s.fuel === 'diesel' ? 'diesel' : 'gasoline';
    state.settings.unit = s.unit === 'l100' ? 'l100' : 'kml';
    state.settings.theme = ['light', 'dark', 'system'].includes(s.theme) ? s.theme : 'system';
    state.settings.lang = s.lang === 'en' ? 'en' : 'ar';
    state.vehicles = raw.vehicles.slice(0, 20).map(cleanVehicle).filter(Boolean);
    state.trips = raw.trips.slice(0, 500).map(cleanTrip).filter(Boolean);
    state.vehicles = state.vehicles.filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
    state.trips = state.trips.filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
    return state;
  }
  function load(storage) {
    let legacy = {},
      raw;
    try {
      legacy = JSON.parse(storage.getItem(LEGACY_KEY) || '{}') || {};
    } catch {
      /* Keep the legacy key untouched. */
    }
    try {
      raw = storage.getItem(STORAGE_KEY);
      if (raw) return { state: sanitizeState(JSON.parse(raw)), recovered: false };
    } catch {
      return { state: defaultState(legacy), recovered: true };
    }
    return { state: defaultState(legacy), recovered: false };
  }
  function csv(trips) {
    // Prevent spreadsheet formula execution, including leading whitespace.
    const cell = (x) =>
      '"' +
      String(x)
        .replace(/^[\s]*[=+@-]/, (s) => "'" + s)
        .replace(/"/g, '""') +
      '"';
    const rows = [
      [
        'Date',
        'Trip',
        'Currency',
        'Distance km',
        'Fuel liters',
        'Fuel cost',
        'Reserve cost',
        'Extra costs',
        'Total estimate',
        'Passengers',
        'Per person',
        'Distance source',
      ],
    ];
    for (const t of trips) {
      const r = calculate(t.input);
      if (!r) continue;
      rows.push([
        new Date(t.date).toISOString(),
        t.name,
        t.currency,
        r.km,
        r.liters.toFixed(3),
        r.fuel.toFixed(2),
        r.buffer.toFixed(2),
        r.extra.toFixed(2),
        r.total.toFixed(2),
        r.passengers,
        r.perPerson.toFixed(2),
        t.source,
      ]);
    }
    return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
  }
  return {
    STORAGE_KEY,
    LEGACY_KEY,
    currencies,
    limits,
    number,
    calculate,
    defaultState,
    sanitizeState,
    load,
    csv,
  };
});
