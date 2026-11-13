const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('Syrian cash denominations include 2500 rather than 2000', () => {
  assert.deepEqual(C.DENOMINATIONS, [50000, 20000, 10000, 5000, 2500, 1000, 500]);
  const r = C.cashTotals({ 50000: 2, 2500: '٣', 1000: 1, 500: 2 });
  assert.equal(r.total, 109500);
  assert.equal(r.notes, 8);
  assert.equal(r.counts[2000], undefined);
});
test('invalid quantities and zero cash never save', () => {
  for (const counts of [null, [], {}, { 2500: -1 }, { 2500: 1.5 },
    { 2500: 1000001 }, { 2500: 'no' }])
    assert.equal(C.cashTotals(counts), null);
});
test('financial records survive backup restore, preserving timestamps and stripping extras', () => {
  const state = C.defaultState();
  const date = Date.UTC(2026, 10, 13, 13, 21);
  state.cashHistory = [{ id: 'c1', date, counts: { 50000: 4, 2500: 1 }, ignored: 'omit' }];
  state.expenses = [{
    id: 'e1', date, type: 'diesel', amount: '١٥٠٬٠٠٠', currency: 'ل.س',
    vehicleId: 'kia', vehicleName: 'Carnival', note: 'Full tank', untrusted: 'omit',
  }];
  const clean = C.sanitizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(clean.cashHistory[0].total, 202500);
  assert.equal(clean.cashHistory[0].notes, 5);
  assert.equal(clean.cashHistory[0].ignored, undefined);
  assert.equal(clean.expenses[0].amount, 150000);
  assert.equal(clean.expenses[0].vehicleName, 'Carnival');
  assert.equal(clean.expenses[0].untrusted, undefined);
  assert.equal(C.sanitizeState(clean).cashHistory.length, 1);
});
test('older v4 backups without financial records remain compatible', () => {
  const old = C.defaultState();
  delete old.cashHistory;
  delete old.expenses;
  const restored = C.sanitizeState(old);
  assert.deepEqual(restored.cashHistory, []);
  assert.deepEqual(restored.expenses, []);
});
test('import validation rejects bad financial data and duplicate IDs', () => {
  const state = C.defaultState();
  assert.throws(() => C.sanitizeState({ ...state, expenses: {} }));
  assert.throws(() => C.sanitizeState({ ...state, cashHistory: {} }));
  state.cashHistory = [
    { id: 'x', date: Date.now(), counts: { 2500: 3 } },
    { id: 'x', date: Date.now(), counts: { 2500: 3 } },
    { id: 'bad', date: 1e20, counts: { 50000: 1 } },
  ];
  state.expenses = [
    { id: 'bad1', date: Date.now(), type: 'diesel', amount: -20, currency: 'ل.س' },
    { id: 'bad2', date: Date.now(), type: 'unknown', amount: 500, currency: 'ل.س' },
  ];
  const clean = C.sanitizeState(state);
  assert.equal(clean.cashHistory.length, 1);
  assert.equal(clean.expenses.length, 0);
});
