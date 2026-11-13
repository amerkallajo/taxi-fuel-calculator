/* Cash counter and real vehicle expenses. Stored in Road Cost v4 backups. */
(() => {
  'use strict';
  const C = window.RoadCore;
  const App = window.RoadApp;
  if (!C || !App) return;
  const $ = (id) => document.getElementById(id);
  const t = App.t;
  const fmt = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  const currency = (c) => c === 'ل.س' && App.getLanguage() === 'en' ? 'SYP' : c;
  const money = (amount, c) => fmt(amount) + ' ' + currency(c);
  const lang = () => App.getLanguage() === 'en' ? 'en-GB' : 'ar-SY-u-nu-latn';
  const when = (timestamp) => new Intl.DateTimeFormat(lang(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp));
  const dateKey = (timestamp) => {
    const date = new Date(timestamp);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  };
  const uid = () => window.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const typeLabels = {
    diesel: ['مازوت', 'Diesel'],
    gasoline: ['بنزين', 'Gasoline'],
    maintenance: ['صيانة / تصليح', 'Maintenance / repair'],
    parking: ['موقف سيارات', 'Parking'],
    toll: ['رسوم طريق', 'Road fees'],
    other: ['مصروف آخر', 'Other expense']
  };
  const labelType = (type) => (typeLabels[type] || typeLabels.other)[App.getLanguage() === 'en' ? 1 : 0];
  const inputs = new Map();
  const data = () => App.getFinanceData();
  const store = (cash, expenses) => App.saveFinanceData(cash, expenses);
  const message = (id, value) => { $(id).textContent = value; };

  for (const denomination of C.DENOMINATIONS) {
    const row = document.createElement('div');
    row.className = 'finance-cash-row';
    const label = document.createElement('label');
    label.htmlFor = 'cash-note-' + denomination;
    label.textContent = fmt(denomination);
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.placeholder = '0';
    input.setAttribute('aria-label', fmt(denomination));
    const subtotal = document.createElement('strong');
    subtotal.textContent = '0';
    row.append(label, input, subtotal);
    $('cash-rows').append(row);
    inputs.set(denomination, { input, subtotal });
    input.addEventListener('input', refreshCash);
  }
  function readCash() {
    const counts = {};
    let invalid = false;
    for (const [denomination, item] of inputs) {
      const raw = item.input.value.trim();
      const value = raw === '' ? 0 : C.number(raw);
      const valid = Number.isInteger(value) && value >= 0 && value <= 1000000;
      item.input.setAttribute('aria-invalid', String(!valid));
      item.subtotal.textContent = valid ? fmt(value * denomination) : '—';
      if (!valid) invalid = true;
      else counts[denomination] = value;
    }
    return { invalid, summary: invalid ? null : C.cashTotals(counts) };
  }
  function refreshCash() {
    const result = readCash();
    $('cash-total').textContent = result.invalid ? '—' : money(result.summary?.total || 0, 'ل.س');
    $('cash-notes').textContent = fmt(result.summary?.notes || 0) + ' ' + t('ورقة', 'notes');
    $('cash-save').disabled = result.invalid || !result.summary;
    return result;
  }
  function saveCash() {
    const calculated = refreshCash();
    if (calculated.invalid || !calculated.summary) return;
    const current = data();
    if (current.cashHistory.length >= 500) {
      message('cash-message', t('السجل وصل للحد الأقصى (500). صدّر نسخة احتياطية قبل حذف سجلات قديمة.', 'Cash history reached 500 records. Back up before deleting older entries.'));
      return;
    }
    const record = {
      id: uid(), date: Date.now(), counts: calculated.summary.counts,
      total: calculated.summary.total, notes: calculated.summary.notes
    };
    if (!store([record, ...current.cashHistory], current.expenses)) {
      message('cash-message', t('تعذر الحفظ. تحقق من مساحة تخزين الجهاز.', 'Could not save. Check device storage.'));
      return;
    }
    message('cash-message', t('انحفظ المبلغ مع التاريخ والساعة.', 'Cash total saved with date and time.'));
    render();
  }
  function vehicleOptions() {
    const current = $('expense-vehicle').value;
    const vehicles = data().vehicles;
    $('expense-vehicle').innerHTML = '<option value="">' +
      escape(t('عام / بدون سيارة', 'General / no vehicle')) + '</option>' +
      vehicles.map((v) => '<option value="' + escape(v.id) + '">' + escape(v.name) + '</option>').join('');
    if (vehicles.some((v) => v.id === current)) $('expense-vehicle').value = current;
  }
  function saveExpense(event) {
    event.preventDefault();
    const amount = C.number($('expense-amount').value);
    const valid = Number.isFinite(amount) && amount > 0 && amount <= 1e12;
    $('expense-amount').setAttribute('aria-invalid', String(!valid));
    if (!valid) {
      message('expense-message', t('اكتب مبلغ صحيح وأكبر من صفر.', 'Enter a valid amount greater than zero.'));
      return;
    }
    const current = data();
    if (current.expenses.length >= 1000) {
      message('expense-message', t('السجل وصل للحد الأقصى (1000). صدّر نسخة احتياطية أولاً.', 'Expense history reached 1000 records. Back up first.'));
      return;
    }
    const vehicleId = $('expense-vehicle').value;
    const vehicle = current.vehicles.find((v) => v.id === vehicleId);
    const record = {
      id: uid(), date: Date.now(), type: $('expense-type').value,
      amount, currency: $('expense-currency').value,
      vehicleId: vehicle?.id || '', vehicleName: vehicle?.name || '',
      note: $('expense-note').value.trim()
    };
    if (!C.cleanExpense(record) || !store(current.cashHistory, [record, ...current.expenses])) {
      message('expense-message', t('تعذر حفظ الدفعة. تحقق من المعلومات ومساحة التخزين.', 'Could not save payment. Check details and storage.'));
      return;
    }
    $('expense-amount').value = '';
    $('expense-amount').setAttribute('aria-invalid', 'false');
    $('expense-note').value = '';
    message('expense-message', t('انحفظت الدفعة مع التاريخ والساعة.', 'Payment saved with date and time.'));
    render();
  }
  function cashHTML(record) {
    const breakdown = C.DENOMINATIONS.filter((d) => record.counts[d] > 0)
      .map((d) => fmt(d) + ' × ' + fmt(record.counts[d])).join(' · ');
    return '<article class="finance-entry"><div class="finance-entry-top"><div class="finance-entry-title">' +
      '<strong dir="auto">' + escape(money(record.total, 'ل.س')) + '</strong>' +
      '<small>' + escape(when(record.date)) + ' · ' + fmt(record.notes) + ' ' + escape(t('ورقة', 'notes')) + '</small></div>' +
      '<button type="button" class="finance-delete" data-delete-cash="' + escape(record.id) +
      '" aria-label="' + escape(t('حذف العملية', 'Delete record')) + '">✕</button></div>' +
      '<details><summary>' + escape(t('تفاصيل الأوراق', 'Note breakdown')) +
      '</summary><div dir="auto">' + escape(breakdown) + '</div></details></article>';
  }
  function expenseHTML(record) {
    const vehicle = record.vehicleName ? ' · ' + record.vehicleName : '';
    return '<article class="finance-entry"><div class="finance-entry-top"><div class="finance-entry-title">' +
      '<strong dir="auto">' + escape(money(record.amount, record.currency)) + '</strong>' +
      '<small>' + escape(labelType(record.type)) + escape(vehicle) + '</small>' +
      '<small>' + escape(when(record.date)) + '</small></div>' +
      '<button type="button" class="finance-delete" data-delete-expense="' + escape(record.id) +
      '" aria-label="' + escape(t('حذف المصروف', 'Delete expense')) + '">✕</button></div>' +
      (record.note ? '<p>' + escape(record.note) + '</p>' : '') + '</article>';
  }
  function render() {
    const current = data();
    vehicleOptions();
    $('cash-history-count').textContent = String(current.cashHistory.length);
    $('cash-history').innerHTML = current.cashHistory.length ?
      [...current.cashHistory].sort((a, b) => b.date - a.date).map(cashHTML).join('') :
      '<p class="finance-empty">' + escape(t('لسه ما حفظت أي مبلغ.', 'No saved cash counts yet.')) + '</p>';
    const month = $('expense-month').value;
    const selected = $('expense-filter-currency').value;
    const filtered = current.expenses.filter((r) => dateKey(r.date) === month && r.currency === selected)
      .sort((a, b) => b.date - a.date);
    $('expense-month-total').textContent = money(filtered.reduce((sum, r) => sum + r.amount, 0), selected);
    $('expense-month-count').textContent = fmt(filtered.length) + ' ' + t('عملية', 'payments');
    $('expense-history').innerHTML = filtered.length ? filtered.map(expenseHTML).join('') :
      '<p class="finance-empty">' +
        escape(t('ما في مصاريف محفوظة بهالشهر وبهالعملة.', 'No expenses for this month and currency.')) +
      '</p>';
  }
  function removeRecord(event, kind) {
    const attr = kind === 'cash' ? 'data-delete-cash' : 'data-delete-expense';
    const button = event.target.closest('button[' + attr + ']');
    if (!button) return;
    if (!window.confirm(t('متأكد بدك تحذف هالعملية؟', 'Delete this record?'))) return;
    const current = data();
    const id = button.getAttribute(attr);
    const cash = kind === 'cash' ? current.cashHistory.filter((r) => r.id !== id) : current.cashHistory;
    const expenses = kind === 'expense' ? current.expenses.filter((r) => r.id !== id) : current.expenses;
    if (!store(cash, expenses)) {
      message(kind === 'cash' ? 'cash-message' : 'expense-message',
        t('تعذر الحذف بسبب مشكلة بالتخزين.', 'Could not delete because storage is unavailable.'));
      return;
    }
    render();
  }
  function exportExpenses() {
    const cell = (value) => '"' + String(value).replace(/^\s*[=+@-]/, (s) => "'" + s)
      .replace(/"/g, '""') + '"';
    const rows = [['Date (ISO)', 'Category', 'Amount', 'Currency', 'Vehicle', 'Note']];
    for (const record of data().expenses) {
      rows.push([new Date(record.date).toISOString(), record.type, record.amount,
        record.currency, record.vehicleName, record.note]);
    }
    const blob = new Blob(['\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'road-cost-expenses-' + dateKey(Date.now()) + '.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('cash-save').addEventListener('click', saveCash);
  $('cash-clear').addEventListener('click', () => {
    inputs.forEach(({ input }) => { input.value = ''; });
    message('cash-message', '');
    refreshCash();
  });
  $('expense-form').addEventListener('submit', saveExpense);
  $('cash-history').addEventListener('click', (event) => removeRecord(event, 'cash'));
  $('expense-history').addEventListener('click', (event) => removeRecord(event, 'expense'));
  $('expense-month').addEventListener('change', render);
  $('expense-filter-currency').addEventListener('change', render);
  $('expense-export').addEventListener('click', exportExpenses);
  window.addEventListener('roadcost:language', () => { refreshCash(); render(); });
  window.addEventListener('roadcost:finance-view', render);
  $('expense-month').value = dateKey(Date.now());
  $('expense-filter-currency').value = data().defaultCurrency;
  $('expense-currency').value = data().defaultCurrency;
  refreshCash();
  render();
})();
