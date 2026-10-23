/* Road Cost 4. UI orchestration; all arithmetic and durable data validation live in core.js. */
(() => {
  'use strict';
  const C = window.RoadCore,
    $ = (id) => document.getElementById(id);
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = {
      getItem: () => null,
      setItem: () => {
        throw Error('Unavailable');
      },
    };
  }
  const loaded = C.load(storage);
  let state = loaded.state,
    current = null,
    routeMeta = null,
    editVehicleId = null,
    pendingImport = null;
  let toastTimer,
    swRegistration,
    installPrompt,
    lastSave = '',
    canonicalEfficiency = C.number(state.settings.efficiency);
  let currentUnit = state.settings.unit;
  const numericFields = ['distance', 'efficiency', 'price', 'passengers', 'extra', 'reserve'];
  const t = (ar, en) => (state.settings.lang === 'en' ? en : ar);
  const fmt = (n, digits = 2) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
  const currencyLabel = (c) => (c === 'ل.س' && state.settings.lang === 'en' ? 'SYP' : c);
  const kmLabel = () => t('كم', 'km'),
    literLabel = () => t('لتر', 'L');
  const icon = (name) => '<svg class="i" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const money = (n, c = state.settings.currency) => fmt(n) + ' ' + currencyLabel(c);
  const uid = () =>
    window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3400);
  }
  function warn(message) {
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = message;
  }
  function persist(next = state) {
    try {
      storage.setItem(C.STORAGE_KEY, JSON.stringify(next));
      state = next;
      // The previous application's key remains readable to older installations.
      try {
        storage.setItem(
          C.LEGACY_KEY,
          JSON.stringify({
            efficiency: state.settings.efficiency,
            price: state.settings.price,
            currency: state.settings.currency,
          })
        );
      } catch {
        /* v4 data is already safe. */
      }
      return true;
    } catch {
      warn(
        t(
          'تعذّر حفظ البيانات على الجهاز. صدّر نسخة احتياطية؛ التغييرات الجديدة قد تُفقد عند الإغلاق.',
          'Device storage is unavailable or full. Export a backup; new changes may be lost on close.'
        )
      );
      return false;
    }
  }
  function inputValues() {
    return {
      distance: $('distance').value,
      efficiency: canonicalEfficiency,
      price: $('price').value,
      passengers: $('passengers').value,
      extra: $('extra').value,
      reserve: $('reserve').value,
      roundtrip: $('roundtrip').checked,
    };
  }
  function saveDraft() {
    const draft = {};
    for (const id of [...numericFields, 'trip-name', 'commute-days']) draft[id] = $(id).value;
    draft.roundtrip = $('roundtrip').checked;
    draft.favorite = $('save-favorite').checked;
    draft.unit = currentUnit;
    draft.currency = state.settings.currency;
    draft.fuel = state.settings.fuel;
    try {
      sessionStorage.setItem('road-cost-draft-v4', JSON.stringify(draft));
    } catch {
      /* Draft storage is optional. */
    }
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem('road-cost-draft-v4') || 'null');
      if (!d || typeof d !== 'object') return;
      for (const id of [...numericFields, 'trip-name', 'commute-days'])
        if (typeof d[id] === 'string') $(id).value = d[id].slice(0, 80);
      $('roundtrip').checked = d.roundtrip === true;
      $('save-favorite').checked = d.favorite === true;
      if (C.currencies.includes(d.currency)) state.settings.currency = d.currency;
      state.settings.fuel = d.fuel === 'diesel' ? 'diesel' : 'gasoline';
      currentUnit = d.unit === 'l100' ? 'l100' : 'kml';
      const n = C.number($('efficiency').value);
      canonicalEfficiency = currentUnit === 'l100' ? 100 / n : n;
    } catch {
      /* Invalid drafts never affect durable history. */
    }
  }
  function fieldError(id, n, min, max, integer = false) {
    const invalid = !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n));
    const blank = $(id).value.trim() === '';
    $('error-' + id).textContent =
      invalid && !blank
        ? t(
            'أدخل رقماً بين ' + min + ' و' + fmt(max) + (integer ? ' (عدد صحيح)' : ''),
            'Enter a number between ' +
              min +
              ' and ' +
              fmt(max) +
              (integer ? ' (whole number)' : '')
          )
        : '';
    $(id).setAttribute('aria-invalid', invalid && !blank ? 'true' : 'false');
    return !invalid;
  }
  function setMetric(id, value, unit = '', digits = 2) {
    const el = $(id);
    el.replaceChildren();
    if (value === null || !Number.isFinite(value)) {
      el.textContent = '—';
      return;
    }
    const span = document.createElement('span');
    span.dir = 'ltr';
    span.textContent = fmt(value, digits);
    el.append(span);
    if (unit) {
      const small = document.createElement('small');
      small.textContent = ' ' + unit;
      el.append(small);
    }
  }
  function readEfficiency() {
    const v = C.number($('efficiency').value);
    canonicalEfficiency = currentUnit === 'l100' ? 100 / v : v;
  }
  function update({ read = false, save = true } = {}) {
    if (read) readEfficiency();
    const i = inputValues();
    fieldError('distance', C.number(i.distance), 0.01, C.limits.distance);
    const efficiencyMin = currentUnit === 'l100' ? 0.1 : 0.01,
      efficiencyMax = currentUnit === 'l100' ? 10000 : 1000;
    fieldError('efficiency', C.number($('efficiency').value), efficiencyMin, efficiencyMax);
    fieldError('price', C.number(i.price), 0, C.limits.price);
    fieldError('passengers', C.number(i.passengers), 1, 50, true);
    fieldError('extra', C.number(i.extra), 0, C.limits.extra);
    fieldError('reserve', C.number(i.reserve), 0, 100);
    // Restrict sub-centimeter/absurd efficiency values consistently with field guidance.
    const rawEfficiency = C.number($('efficiency').value);
    const fieldsValid =
      Number.isFinite(rawEfficiency) &&
      rawEfficiency >= efficiencyMin &&
      rawEfficiency <= efficiencyMax &&
      C.number(i.distance) >= 0.01 &&
      canonicalEfficiency >= 0.01 &&
      canonicalEfficiency <= 1000;
    current = fieldsValid ? C.calculate(i) : null;
    const d = C.number(i.distance),
      km = Number.isFinite(d) && d > 0 && d <= C.limits.distance ? d * (i.roundtrip ? 2 : 1) : null;
    const liters =
      km !== null && canonicalEfficiency >= 0.01 && canonicalEfficiency <= 1000
        ? km / canonicalEfficiency
        : null;
    $('cost-number').textContent = current ? fmt(current.total) : '—';
    $('mobile-total').textContent = current ? money(current.total) : '—';
    $('cost-unit').textContent = current ? currencyLabel(state.settings.currency) : '';
    $('cost-hint').textContent = current
      ? t('حسبة واضحة قبل ما تتحرك.', 'A clear budget before you set off.')
      : $('price').value.trim() === ''
        ? t('أضف سعر اللتر لنحسبها سوا.', 'Add your fuel price to see the budget.')
        : t(
            'تحقق من مدخلات الرحلة لإكمال الحساب.',
            'Check the trip fields to complete the estimate.'
          );
    setMetric('distance-total', km, kmLabel());
    setMetric('consumption', liters, literLabel(), 3);
    setMetric('per-km', current?.perKm ?? null, currencyLabel(state.settings.currency));
    for (const [id, key] of [
      ['fuel-cost', 'fuel'],
      ['reserve-cost', 'buffer'],
      ['extra-cost', 'extra'],
      ['per-person', 'perPerson'],
    ])
      $(id).textContent = current ? money(current[key]) : '—';
    const days = C.number($('commute-days').value),
      daysValid = fieldError('commute-days', days, 1, 366, true);
    setMetric(
      'monthly',
      current && daysValid ? current.total * days : null,
      currencyLabel(state.settings.currency)
    );
    setMetric(
      'yearly',
      current && daysValid ? current.total * days * 12 : null,
      currencyLabel(state.settings.currency)
    );
    $('copy').disabled = !current;
    $('save-trip').disabled = !current || saveSignature() === lastSave;
    $('distance-source').textContent = routeMeta
      ? t('طريق محسوب · OSRM', 'Road route · OSRM')
      : t('إدخال يدوي', 'Manual distance');
    $('distance-source').classList.toggle('road', !!routeMeta);
    $('price-currency').textContent = currencyLabel(state.settings.currency);
    document
      .querySelectorAll('[data-distance]')
      .forEach((b) => b.setAttribute('aria-pressed', String(d === Number(b.dataset.distance))));
    document
      .querySelectorAll('[data-fuel]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.fuel === state.settings.fuel))
      );
    $('efficiency-unit').value = currentUnit;
    $('currency').value = state.settings.currency;
    if (save) {
      if (
        Number.isFinite(canonicalEfficiency) &&
        canonicalEfficiency >= 0.01 &&
        canonicalEfficiency <= 1000
      )
        state.settings.efficiency = String(canonicalEfficiency);
      if (
        $('price').value.trim() === '' ||
        (C.number(i.price) >= 0 && C.number(i.price) <= C.limits.price)
      )
        state.settings.price = $('price').value;
      state.settings.unit = currentUnit;
      persist();
      saveDraft();
    }
    renderComparison();
  }
  function saveSignature() {
    return JSON.stringify([
      inputValues(),
      state.settings.currency,
      state.settings.fuel,
      $('trip-name').value,
      $('save-favorite').checked,
    ]);
  }
  function saveTrip() {
    if (!current || lastSave === saveSignature()) return;
    if (state.trips.length >= 500) {
      toast(
        t(
          'السجل ممتلئ (500 رحلة). صدّر نسخة ثم احذف رحلات قديمة.',
          'Journal is full (500 trips). Export a backup, then remove older trips.'
        )
      );
      return;
    }
    const item = {
      id: uid(),
      name: $('trip-name').value.trim() || t('مشوار جديد', 'New trip'),
      date: Date.now(),
      currency: state.settings.currency,
      input: inputValues(),
      fuel: state.settings.fuel,
      favorite: $('save-favorite').checked,
      source: routeMeta ? 'road' : 'manual',
    };
    const next = {
      ...state,
      trips: [C.sanitizeState({ ...state, trips: [item] }).trips[0], ...state.trips],
    };
    if (!persist(next)) return;
    lastSave = saveSignature();
    update({ save: false });
    renderJournal();
    renderFavorites();
    toast(t('انحفظ المشوار في دفتر رحلاتك.', 'Trip saved to your journal.'));
  }
  function loadTrip(id) {
    const trip = state.trips.find((x) => x.id === id);
    if (!trip) return;
    // Favorites reuse the distance/options with the CURRENT fuel settings and price.
    for (const key of ['distance', 'passengers', 'extra', 'reserve'])
      $(key).value = String(trip.input[key]);
    $('roundtrip').checked = trip.input.roundtrip;
    if (trip.currency !== state.settings.currency) {
      $('extra').value = '0';
      toast(
        t(
          'عملة مختلفة: صُفّرت الإضافات. راجع السعر والميزانية الحالية.',
          'Different currency: extras reset. Review the current price and budget.'
        )
      );
    } else
      toast(
        t(
          'حُمل المشوار بسعر الوقود وإعدادات السيارة الحالية.',
          'Trip loaded with your current vehicle settings and fuel price.'
        )
      );
    $('trip-name').value = trip.name;
    $('save-favorite').checked = trip.favorite;
    routeMeta = null;
    lastSave = '';
    window.dispatchEvent(new Event('roadcost:clear-route'));
    update();
    location.hash = 'trip';
    $('distance').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderFavorites() {
    const favorites = state.trips.filter((x) => x.favorite).slice(0, 4);
    $('favorites-list').innerHTML = favorites.length
      ? favorites
          .map(
            (x) =>
              '<div class="favorite-item">' +
              icon('route') +
              '<div><strong>' +
              escape(x.name) +
              '</strong><small>' +
              fmt(x.input.distance * (x.input.roundtrip ? 2 : 1)) +
              ' ' +
              kmLabel() +
              ' · ' +
              t('أعد الحساب بالسعر الحالي', 'Recalculate at current price') +
              '</small></div><button class="button secondary" data-load-trip="' +
              escape(x.id) +
              '">' +
              t('احسبها', 'Use trip') +
              '</button></div>'
          )
          .join('')
      : '<p class="empty-inline">' +
        t(
          'احفظ مشوارك كمفضلة، وارجع احسبه بسعر اليوم بكبسة واحدة.',
          'Save a favorite, then recalculate it at today’s price in one tap.'
        ) +
        '</p>';
    $('trip-count').textContent = state.trips.length;
  }
  function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }
  function filteredTrips() {
    return state.trips.filter(
      (x) =>
        x.currency === $('journal-currency').value &&
        monthKey(new Date(x.date)) === $('journal-month').value &&
        (!$('favorites-only').checked || x.favorite)
    );
  }
  function renderJournal() {
    const trips = filteredTrips(),
      currency = $('journal-currency').value;
    let sum = 0,
      km = 0;
    trips.forEach((x) => {
      const r = C.calculate(x.input);
      sum += r.total;
      km += r.km;
    });
    setMetric('journal-total', sum, currencyLabel(currency));
    setMetric('journal-km', km, kmLabel());
    $('journal-trips').textContent = trips.length;
    $('history-count').textContent = trips.length + ' ' + t('رحلة', 'trips');
    $('export-csv').disabled = !trips.length;
    $('chart-currency').textContent = currencyLabel(currency);
    $('history-list').innerHTML = trips.length
      ? trips
          .map((x) => {
            const r = C.calculate(x.input);
            const date = new Intl.DateTimeFormat(state.settings.lang === 'en' ? 'en-GB' : 'ar-SY', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }).format(new Date(x.date));
            return (
              '<article class="card trip-record"><div class="record-icon">' +
              icon('route') +
              '</div><div class="record-main"><h3>' +
              escape(x.name) +
              '</h3><p>' +
              escape(date) +
              ' · ' +
              fmt(r.km) +
              ' ' +
              kmLabel() +
              ' · ' +
              (x.source === 'road'
                ? t('مسافة طريق محفوظة', 'Saved road distance')
                : t('مسافة يدوية', 'Manual distance')) +
              '</p></div><div class="record-price">' +
              fmt(r.total) +
              ' <small>' +
              currencyLabel(x.currency) +
              '</small></div><div class="record-actions"><button class="text-button" data-load-trip="' +
              escape(x.id) +
              '">' +
              t('إعادة الحساب', 'Recalculate') +
              '</button><button class="icon-button ' +
              (x.favorite ? 'is-favorite' : '') +
              '" data-favorite="' +
              escape(x.id) +
              '" aria-pressed="' +
              x.favorite +
              '" aria-label="' +
              t('المفضلة', 'Favorite') +
              '">' +
              icon('star') +
              '</button><button class="icon-button" data-delete-trip="' +
              escape(x.id) +
              '" aria-label="' +
              t('حذف الرحلة', 'Delete trip') +
              '">' +
              icon('trash') +
              '</button></div></article>'
            );
          })
          .join('')
      : '<div class="empty-state">' +
        icon('history') +
        '<h2>' +
        t('أول مشوار بيبلّش من هون.', 'Your first trip starts here.') +
        '</h2><p>' +
        t(
          'احفظ رحلة من الحاسبة، أو غيّر الشهر والعملة لتشوف رحلاتك.',
          'Save a trip from the planner, or change the month and currency to find your trips.'
        ) +
        '</p><a class="button primary" href="#trip" style="margin-top:20px">' +
        t('خطّط رحلة', 'Plan a trip') +
        '</a></div>';
    const selected = /^\d{4}-\d{2}$/.test($('journal-month').value)
      ? $('journal-month').value
      : monthKey(new Date());
    const [year, month] = selected.split('-').map(Number),
      months = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(year, month - 1 - offset, 1),
        key = monthKey(date);
      const total = state.trips
        .filter(
          (x) =>
            x.currency === currency &&
            monthKey(new Date(x.date)) === key &&
            (!$('favorites-only').checked || x.favorite)
        )
        .reduce((sum, x) => sum + C.calculate(x.input).total, 0);
      months.push({ date, total });
    }
    const max = Math.max(...months.map((x) => x.total), 1);
    $('history-chart').innerHTML = months
      .map(
        (x) =>
          '<div class="chart-column"><b>' +
          fmt(x.total, 0) +
          '</b><div class="chart-bar" style="--height:' +
          Math.max(2, (x.total / max) * 112) +
          'px"></div><small>' +
          escape(
            new Intl.DateTimeFormat(state.settings.lang === 'en' ? 'en-GB' : 'ar-SY', {
              month: 'short',
              year: '2-digit',
            }).format(x.date)
          ) +
          '</small></div>'
      )
      .join('');
    $('history-chart').setAttribute(
      'aria-label',
      months.map((x) => monthKey(x.date) + ': ' + money(x.total, currency)).join('; ')
    );
  }
  function renderVehicles() {
    const selected = $('vehicle-select').value;
    $('vehicle-select').innerHTML =
      '<option value="">' +
      t('سيارة مخصصة', 'Custom vehicle') +
      '</option>' +
      state.vehicles
        .map((v) => '<option value="' + escape(v.id) + '">' + escape(v.name) + '</option>')
        .join('');
    if (state.vehicles.some((v) => v.id === selected)) $('vehicle-select').value = selected;
    $('vehicles-list').innerHTML = state.vehicles.length
      ? state.vehicles
          .map(
            (v) =>
              '<article class="card vehicle-card"><div class="vehicle-icon">' +
              icon('car') +
              '</div><h2>' +
              escape(v.name) +
              '</h2><p>' +
              (v.fuel === 'diesel' ? t('مازوت', 'Diesel') : t('بنزين', 'Gasoline')) +
              ' · ' +
              t('إعداداتك المحفوظة', 'Your saved settings') +
              '</p><div class="vehicle-stats"><div><span>' +
              t('كم/لتر', 'km/L') +
              '</span><strong>' +
              fmt(v.efficiency, 3) +
              '</strong></div><div><span>' +
              t('سعر اللتر', 'Price per liter') +
              '</span><strong>' +
              escape(money(v.price, v.currency)) +
              '</strong></div></div><div class="vehicle-actions"><button class="button primary" data-use-vehicle="' +
              escape(v.id) +
              '">' +
              t('استخدم للمشوار', 'Use for trip') +
              '</button><button class="button secondary" data-edit-vehicle="' +
              escape(v.id) +
              '">' +
              t('تعديل', 'Edit') +
              '</button><button class="icon-button" data-delete-vehicle="' +
              escape(v.id) +
              '" aria-label="' +
              t('حذف السيارة', 'Delete vehicle') +
              '">' +
              icon('trash') +
              '</button></div></article>'
          )
          .join('')
      : '<div class="empty-state">' +
        icon('car') +
        '<h2>' +
        t('خلّي سيارتك جاهزة للحسبة.', 'Keep your vehicle ready to go.') +
        '</h2><p>' +
        t(
          'أضف سيارتك واستهلاكها وسعر الوقود، لتستعملها بأي مشوار وتقارنها مع غيرها.',
          'Add a vehicle, its fuel economy and fuel price to reuse or compare on any trip.'
        ) +
        '</p></div>';
    renderComparison();
  }
  function renderComparison() {
    const i = inputValues();
    const rows = state.vehicles
      .filter((v) => v.currency === state.settings.currency)
      .map((v) => ({
        v,
        r: C.calculate({ ...i, efficiency: v.efficiency, price: v.price, extra: 0, reserve: 0 }),
      }))
      .filter((x) => x.r)
      .sort((a, b) => a.r.fuel - b.r.fuel);
    const km = C.number(i.distance) * (i.roundtrip ? 2 : 1);
    $('compare-distance').textContent =
      Number.isFinite(km) && km > 0
        ? fmt(km) + ' ' + kmLabel() + ' · ' + currencyLabel(state.settings.currency)
        : '—';
    const max = Math.max(...rows.map((x) => x.r.fuel), 1);
    $('vehicle-comparison').innerHTML = rows.length
      ? rows
          .map(
            ({ v, r }, index) =>
              '<div class="comparison-row"><div class="comparison-name">' +
              escape(v.name) +
              '<small>' +
              (index === 0 && rows.length > 1
                ? t('الأقل تكلفة للوقود', 'Lowest fuel cost')
                : fmt(v.efficiency, 2) + ' ' + t('كم/لتر', 'km/L')) +
              '</small></div><div class="bar-track"><div class="bar-fill" style="width:' +
              Math.max(1, (r.fuel / max) * 100) +
              '%"></div></div><b>' +
              escape(money(r.fuel, v.currency)) +
              '</b></div>'
          )
          .join('')
      : '<p class="empty-inline">' +
        t(
          'أضف سيارة بنفس عملة الحاسبة وأدخل مسافة صالحة للمقارنة.',
          'Add a vehicle in the planner’s currency and enter a valid distance to compare.'
        ) +
        '</p>';
  }
  function vehicleDialog(id = null) {
    const v = state.vehicles.find((v) => v.id === id);
    editVehicleId = v?.id || null;
    $('vehicle-name').value = v?.name || '';
    $('vehicle-efficiency').value =
      v?.efficiency ??
      (Number.isFinite(canonicalEfficiency)
        ? fmt(canonicalEfficiency, 6).replaceAll(',', '')
        : '12');
    $('vehicle-price').value = v?.price ?? $('price').value;
    $('vehicle-fuel').value = v?.fuel || state.settings.fuel;
    $('vehicle-currency').value = v?.currency || state.settings.currency;
    $('vehicle-error').textContent = '';
    $('vehicle-dialog').showModal();
  }
  function useVehicle(id) {
    const v = state.vehicles.find((v) => v.id === id);
    if (!v) return;
    if (state.settings.currency !== v.currency) {
      $('extra').value = '0';
      toast(t('تغيّرت العملة؛ صُفّرت المصاريف الإضافية.', 'Currency changed; extra costs reset.'));
    }
    canonicalEfficiency = v.efficiency;
    $('efficiency').value = String(currentUnit === 'l100' ? 100 / v.efficiency : v.efficiency);
    $('price').value = String(v.price);
    state.settings.currency = v.currency;
    state.settings.fuel = v.fuel;
    $('vehicle-select').value = v.id;
    lastSave = '';
    update();
  }
  function applyTheme() {
    const dark =
      state.settings.theme === 'dark' ||
      (state.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#101929' : '#f3f6fb';
    $('theme').setAttribute('aria-pressed', String(dark));
  }
  function translateStatic() {
    const english = state.settings.lang === 'en';
    document.documentElement.lang = english ? 'en' : 'ar';
    document.documentElement.dir = english ? 'ltr' : 'rtl';
    document.querySelectorAll('[data-en]').forEach((el) => {
      if (el.dataset.ar === undefined) el.dataset.ar = el.textContent;
      el.textContent = english ? el.dataset.en : el.dataset.ar;
    });
    for (const [data, attr] of [
      ['enAria', 'aria-label'],
      ['enPlaceholder', 'placeholder'],
    ]) {
      const selector = data === 'enAria' ? '[data-en-aria]' : '[data-en-placeholder]';
      document.querySelectorAll(selector).forEach((el) => {
        const key = 'original' + data;
        if (el.dataset[key] === undefined) el.dataset[key] = el.getAttribute(attr);
        el.setAttribute(attr, english ? el.dataset[data] : el.dataset[key]);
      });
    }
    $('language').textContent = english ? 'ع' : 'EN';
    $('language').setAttribute('aria-label', english ? 'التبديل للعربية' : 'Switch to English');
    $('efficiency-unit').options[0].textContent = t('كم/لتر', 'km/L');
    $('efficiency-unit').options[1].textContent = t('لتر/100كم', 'L/100km');
    renderVehicles();
    renderFavorites();
    renderJournal();
    update({ save: false });
    showView(false);
    connectionStatus();
    window.dispatchEvent(new Event('roadcost:language'));
  }
  function showView(focus = false) {
    const view = ['trip', 'garage', 'journal'].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : 'trip';
    document.querySelectorAll('.view').forEach((el) => (el.hidden = el.id !== 'view-' + view));
    document
      .querySelectorAll('[data-view]')
      .forEach((el) =>
        el.dataset.view === view
          ? el.setAttribute('aria-current', 'page')
          : el.removeAttribute('aria-current')
      );
    $('page-label').textContent = {
      trip: t('خطّط رحلة', 'Plan a trip'),
      garage: t('سياراتي', 'My vehicles'),
      journal: t('سجل الرحلات', 'Trip journal'),
    }[view];
    if (view === 'garage') renderVehicles();
    if (view === 'journal') renderJournal();
    if (focus) {
      $('main').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  function download(filename, body, type) {
    const blob = new Blob([body], { type }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function share() {
    if (!current) return;
    const r = current,
      text =
        'Road Cost – ' +
        ($('trip-name').value.trim() || t('ميزانية رحلة', 'Trip budget')) +
        '\n' +
        t('المسافة: ', 'Distance: ') +
        fmt(r.km) +
        ' ' +
        kmLabel() +
        ' (' +
        (routeMeta ? 'OSRM' : t('يدوية', 'manual')) +
        ')\n' +
        t('الوقود: ', 'Fuel: ') +
        fmt(r.liters, 3) +
        ' ' +
        literLabel() +
        '\n' +
        t('سعر اللتر: ', 'Price per liter: ') +
        money(C.number($('price').value)) +
        '\n' +
        t('احتياط + إضافات: ', 'Cushion + extras: ') +
        money(r.buffer + r.extra) +
        '\n' +
        t('الإجمالي التقديري: ', 'Total estimate: ') +
        money(r.total) +
        '\n' +
        t('حصة الشخص: ', 'Per person: ') +
        money(r.perPerson) +
        ' / ' +
        r.passengers +
        '\nhttps://amerkallajo.github.io/taxi-fuel-calculator/';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Road Cost', text });
        return;
      }
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        if (!ok) throw Error('Copy failed');
      }
      toast(t('نُسخت حسبة المشوار.', 'Trip summary copied.'));
    } catch (e) {
      if (e.name !== 'AbortError')
        toast(
          t(
            'تعذّرت المشاركة. جرّب النسخ من متصفح آخر.',
            'Sharing failed. Try copying in another browser.'
          )
        );
    }
  }
  function connectionStatus() {
    $('connectivity').classList.toggle('off', !navigator.onLine);
    $('connection-label').textContent = navigator.onLine
      ? t('جاهز للطريق', 'Ready to go')
      : t('شغّال بلا نت', 'Working offline');
  }
  async function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    let hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloading) return;
      reloading = true;
      saveDraft();
      location.reload();
    });
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js', {
        updateViaCache: 'none',
      });
      const waiting = () => {
        $('update-banner').hidden = !navigator.serviceWorker.controller || !swRegistration.waiting;
      };
      waiting();
      swRegistration.addEventListener('updatefound', () => {
        const installing = swRegistration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' || installing.state === 'activated')
            setTimeout(waiting, 0);
        });
      });
      const check = () => {
        if (navigator.onLine) swRegistration.update().catch(() => {});
      };
      window.addEventListener('pageshow', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    } catch {
      toast(
        t(
          'تعذّر تجهيز وضع أوفلاين. افتح التطبيق متصلاً وحاول مجدداً.',
          'Offline setup failed. Open online and try again.'
        )
      );
    }
  }
  function init() {
    if (loaded.recovered) {
      try {
        storage.setItem('road-cost-recovery-v4', storage.getItem(C.STORAGE_KEY) || '');
      } catch {
        /* Best-effort recovery copy. */
      }
      warn(
        t(
          'تعذّرت قراءة البيانات الحديثة. احتفظنا بنسخة استرداد واستعدنا الإعدادات القديمة المتاحة.',
          'Recent data could not be read. A recovery copy was attempted and available legacy preferences restored.'
        )
      );
    }
    $('efficiency').value = String(
      currentUnit === 'l100' ? 100 / canonicalEfficiency : canonicalEfficiency
    );
    $('price').value = state.settings.price;
    restoreDraft();
    $('journal-month').value = monthKey(new Date());
    $('journal-currency').value = state.settings.currency;
    numericFields.forEach((id) =>
      $(id).addEventListener('input', () => {
        if (id === 'distance') {
          routeMeta = null;
          window.dispatchEvent(new Event('roadcost:manual-distance'));
        }
        if (id === 'efficiency' || id === 'price') $('vehicle-select').value = '';
        update({ read: id === 'efficiency' });
      })
    );
    for (const id of ['roundtrip', 'commute-days', 'trip-name', 'save-favorite'])
      $(id).addEventListener('input', () => update());
    $('efficiency-unit').addEventListener('change', () => {
      currentUnit = $('efficiency-unit').value;
      if (Number.isFinite(canonicalEfficiency) && canonicalEfficiency > 0)
        $('efficiency').value = String(
          currentUnit === 'l100' ? 100 / canonicalEfficiency : canonicalEfficiency
        );
      update();
    });
    $('currency').addEventListener('change', () => {
      state.settings.currency = $('currency').value;
      $('vehicle-select').value = '';
      update();
    });
    document.querySelectorAll('[data-fuel]').forEach((b) =>
      b.addEventListener('click', () => {
        state.settings.fuel = b.dataset.fuel;
        $('vehicle-select').value = '';
        update();
      })
    );
    document.querySelectorAll('[data-distance]').forEach((b) =>
      b.addEventListener('click', () => {
        $('distance').value = b.dataset.distance;
        $('distance').dispatchEvent(new Event('input', { bubbles: true }));
      })
    );
    $('open-map').addEventListener('click', () => {
      $('map-section').open = true;
      $('map-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('show-summary').addEventListener('click', () =>
      document.querySelector('.estimate-card').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      })
    );
    $('vehicle-select').addEventListener('change', () => useVehicle($('vehicle-select').value));
    $('save-trip').addEventListener('click', saveTrip);
    $('copy').addEventListener('click', share);
    $('reset').addEventListener('click', () => {
      $('distance').value = '20';
      $('passengers').value = '1';
      $('extra').value = '0';
      $('reserve').value = '0';
      $('trip-name').value = '';
      $('roundtrip').checked = false;
      $('save-favorite').checked = false;
      routeMeta = null;
      lastSave = '';
      window.dispatchEvent(new Event('roadcost:clear-route'));
      update();
      toast(t('رحلة جديدة. إعدادات سيارتك باقية.', 'New trip. Your vehicle settings are kept.'));
    });
    $('theme').addEventListener('click', () => {
      state.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      persist();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    $('language').addEventListener('click', () => {
      state.settings.lang = state.settings.lang === 'ar' ? 'en' : 'ar';
      translateStatic();
      persist();
    });
    ['open-settings', 'mobile-settings'].forEach((id) =>
      $(id).addEventListener('click', () => $('settings-dialog').showModal())
    );
    document
      .querySelectorAll('[data-close]')
      .forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    document.querySelector('.skip-link').addEventListener('click', (e) => {
      e.preventDefault();
      $('main').focus();
      $('main').scrollIntoView({ block: 'start' });
    });
    $('install-help').addEventListener('click', () => $('install-dialog').showModal());
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      $('install-native').hidden = false;
    });
    $('install-native').addEventListener('click', async () => {
      if (!installPrompt) return;
      await installPrompt.prompt();
      installPrompt = null;
      $('install-native').hidden = true;
    });
    $('add-vehicle').addEventListener('click', () => {
      if (state.vehicles.length >= 20) {
        toast(t('يمكنك حفظ 20 سيارة.', 'You can save up to 20 vehicles.'));
        return;
      }
      vehicleDialog();
    });
    $('vehicle-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = {
        id: editVehicleId || uid(),
        name: $('vehicle-name').value.trim(),
        efficiency: C.number($('vehicle-efficiency').value),
        price: C.number($('vehicle-price').value),
        fuel: $('vehicle-fuel').value,
        currency: $('vehicle-currency').value,
      };
      const clean = C.sanitizeState({ ...state, vehicles: [v] }).vehicles[0];
      if (!clean) {
        $('vehicle-error').textContent = t(
          'أدخل اسماً، كفاءة من 0.01 إلى 1000، وسعراً من 0 إلى مليار.',
          'Enter a name, efficiency from 0.01 to 1,000 and a price from 0 to 1 billion.'
        );
        return;
      }
      const next = {
        ...state,
        vehicles: editVehicleId
          ? state.vehicles.map((x) => (x.id === editVehicleId ? clean : x))
          : [...state.vehicles, clean],
      };
      if (persist(next)) {
        $('vehicle-dialog').close();
        renderVehicles();
        toast(t('حُفظت السيارة.', 'Vehicle saved.'));
      }
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.loadTrip) loadTrip(b.dataset.loadTrip);
      if (b.dataset.useVehicle) {
        useVehicle(b.dataset.useVehicle);
        location.hash = 'trip';
      }
      if (b.dataset.editVehicle) vehicleDialog(b.dataset.editVehicle);
      if (b.dataset.deleteVehicle) {
        if (
          persist({
            ...state,
            vehicles: state.vehicles.filter((x) => x.id !== b.dataset.deleteVehicle),
          })
        ) {
          renderVehicles();
          toast(
            t('حُذفت السيارة. الرحلات المحفوظة باقية.', 'Vehicle deleted. Saved trips are kept.')
          );
        }
      }
      if (b.dataset.favorite) {
        if (
          persist({
            ...state,
            trips: state.trips.map((x) =>
              x.id === b.dataset.favorite ? { ...x, favorite: !x.favorite } : x
            ),
          })
        ) {
          renderJournal();
          renderFavorites();
        }
      }
      if (b.dataset.deleteTrip) {
        if (
          persist({ ...state, trips: state.trips.filter((x) => x.id !== b.dataset.deleteTrip) })
        ) {
          lastSave = '';
          renderJournal();
          renderFavorites();
          update({ save: false });
          toast(t('حُذفت الرحلة.', 'Trip deleted.'));
        }
      }
    });
    ['journal-month', 'journal-currency', 'favorites-only'].forEach((id) =>
      $(id).addEventListener('change', renderJournal)
    );
    $('export-csv').addEventListener('click', () =>
      download(
        'road-cost-' + $('journal-month').value + '.csv',
        C.csv(filteredTrips()),
        'text/csv;charset=utf-8'
      )
    );
    $('export-backup').addEventListener('click', () =>
      download(
        'road-cost-backup-' + monthKey(new Date()) + '.json',
        JSON.stringify(state, null, 2),
        'application/json'
      )
    );
    $('import-backup').addEventListener('change', async () => {
      pendingImport = null;
      $('import-preview').hidden = true;
      $('import-message').textContent = '';
      const file = $('import-backup').files[0];
      if (!file) return;
      try {
        if (file.size > 2000000) throw Error('Too large');
        const raw = JSON.parse(await file.text()),
          clean = C.sanitizeState(raw);
        if (
          clean.trips.length !== raw.trips.length ||
          clean.vehicles.length !== raw.vehicles.length
        )
          throw Error('Invalid records');
        pendingImport = clean;
        $('import-description').textContent =
          t('تحتوي النسخة على ', 'Backup contains ') +
          clean.vehicles.length +
          t(' سيارة و', ' vehicles and ') +
          clean.trips.length +
          t(' رحلة. ستستبدل بياناتك الحالية.', ' trips. This replaces your current data.');
        $('import-preview').hidden = false;
      } catch {
        $('import-message').textContent = t(
          'الملف غير صالح أو أكبر من 2MB. لم تتغير بياناتك.',
          'Invalid backup or larger than 2MB. Your data has not changed.'
        );
      }
      $('import-backup').value = '';
    });
    $('confirm-import').addEventListener('click', () => {
      if (!pendingImport || !persist(pendingImport)) return;
      pendingImport = null;
      $('import-preview').hidden = true;
      currentUnit = state.settings.unit;
      canonicalEfficiency = C.number(state.settings.efficiency);
      $('efficiency').value = String(
        currentUnit === 'l100' ? 100 / canonicalEfficiency : canonicalEfficiency
      );
      $('price').value = state.settings.price;
      $('journal-currency').value = state.settings.currency;
      lastSave = '';
      applyTheme();
      translateStatic();
      update();
      $('settings-dialog').close();
      toast(t('استُعيدت النسخة الاحتياطية.', 'Backup restored.'));
    });
    $('check-update').addEventListener('click', async () => {
      if (!navigator.onLine) {
        toast(
          t(
            'التحديث يحتاج إنترنت. الحاسبة تعمل.',
            'Updates need internet. The calculator still works.'
          )
        );
        return;
      }
      try {
        if (!swRegistration) throw Error('No worker');
        await swRegistration.update();
        toast(
          swRegistration.waiting || swRegistration.installing
            ? t(
                'جارٍ تجهيز التحديث. سيظهر التنبيه عند اكتماله.',
                'Preparing the update. A notice will appear when ready.'
              )
            : t('لم يعثر المتصفح على تحديث جديد.', 'The browser found no new update.')
        );
      } catch {
        toast(t('تعذّر التحقق. جرّب لاحقاً.', 'Could not check for updates. Try later.'));
      }
    });
    $('apply-update').addEventListener('click', () => {
      if (swRegistration?.waiting) {
        saveDraft();
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    window.addEventListener('roadcost:route', (e) => {
      routeMeta = e.detail;
      lastSave = '';
      update();
    });
    window.addEventListener('roadcost:route-invalid', () => {
      routeMeta = null;
      update({ save: false });
    });
    window.addEventListener('hashchange', () => showView(true));
    window.addEventListener('online', connectionStatus);
    window.addEventListener('offline', connectionStatus);
    window.addEventListener('pagehide', saveDraft);
    applyTheme();
    translateStatic();
    update();
    registerWorker();
    window.RoadApp = { getLanguage: () => state.settings.lang, t };
  }
  init();
})();
