/* Road Cost 5. UI orchestration; all arithmetic and durable data validation live in core.js. */
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
    vehicleKml = NaN,
    pendingImport = null;
  let toastTimer,
    swRegistration,
    installPrompt,
    canonicalEfficiency = C.number(state.settings.efficiency);
  let currentUnit = state.settings.unit;
  const numericFields = ['distance', 'efficiency', 'price'];
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
      roundtrip: $('roundtrip').checked,
    };
  }
  function saveDraft() {
    const draft = {};
    for (const id of [...numericFields, 'commute-days']) draft[id] = $(id).value;
    draft.roundtrip = $('roundtrip').checked;
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
      for (const id of [...numericFields, 'commute-days'])
        if (typeof d[id] === 'string') $(id).value = d[id].slice(0, 80);
      $('roundtrip').checked = d.roundtrip === true;
      if (C.currencies.includes(d.currency)) state.settings.currency = d.currency;
      state.settings.fuel = d.fuel === 'diesel' ? 'diesel' : 'gasoline';
      currentUnit = C.efficiencyUnits.includes(d.unit) ? d.unit : 'kml';
      const n = C.number($('efficiency').value);
      canonicalEfficiency = C.efficiencyToKml(n, currentUnit);
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
    canonicalEfficiency = C.efficiencyToKml(v, currentUnit);
  }
  function update({ read = false, save = true } = {}) {
    if (read) readEfficiency();
    const i = inputValues();
    fieldError('distance', C.number(i.distance), 0.01, C.limits.distance);
    const efficiencyMin = currentUnit === 'l100' ? 0.1 : currentUnit === 'kmtank' ? 0.2 : 0.01,
      efficiencyMax = currentUnit === 'l100' ? 10000 : currentUnit === 'kmtank' ? 20000 : 1000;
    fieldError('efficiency', C.number($('efficiency').value), efficiencyMin, efficiencyMax);
    fieldError('price', C.number(i.price), 0, C.limits.price);
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
    const efficiencyValid =
      Number.isFinite(rawEfficiency) &&
      rawEfficiency >= efficiencyMin &&
      rawEfficiency <= efficiencyMax;
    setMetric(
      'tank-range',
      efficiencyValid ? canonicalEfficiency * C.TANK_LITERS : null,
      kmLabel()
    );
    const tankPrice = C.number(i.price);
    setMetric(
      'tank-cost',
      Number.isFinite(tankPrice) && tankPrice >= 0 && tankPrice <= C.limits.price
        ? tankPrice * C.TANK_LITERS
        : null,
      currencyLabel(state.settings.currency)
    );
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
      ? t('حسبة واضحة قبل ما تتحرك.', 'A clear number before you set off.')
      : $('price').value.trim() === ''
        ? t('أضف سعر اللتر لنحسبها سوا.', 'Add your fuel price to see the cost.')
        : t(
            'تحقق من مدخلات الرحلة لإكمال الحساب.',
            'Check the trip fields to complete the estimate.'
          );
    setMetric('distance-total', km, kmLabel());
    setMetric('consumption', liters, literLabel(), 3);
    setMetric('per-km', current?.perKm ?? null, currencyLabel(state.settings.currency));
    setMetric('tanks-needed', liters === null ? null : liters / C.TANK_LITERS, '', 2);
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
  function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
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
    const stat = (label, value, highlight = false) =>
      '<div' +
      (highlight ? ' class="highlight"' : '') +
      '><span>' +
      label +
      '</span><strong dir="auto">' +
      escape(value) +
      '</strong></div>';
    $('vehicles-list').innerHTML = state.vehicles.length
      ? state.vehicles
          .map(
            (v) =>
              '<article class="card vehicle-card"><div class="vehicle-head"><div class="vehicle-icon">' +
              icon('car') +
              '</div><div class="vehicle-title"><h2>' +
              escape(v.name) +
              '</h2><span class="pill">' +
              (v.fuel === 'diesel' ? t('مازوت', 'Diesel') : t('بنزين', 'Gasoline')) +
              '</span></div><button class="icon-button danger" data-delete-vehicle="' +
              escape(v.id) +
              '" aria-label="' +
              t('حذف السيارة', 'Delete vehicle') +
              '">' +
              icon('trash') +
              '</button></div><div class="vehicle-stats">' +
              stat(t('كم باللتر', 'Km per liter'), fmt(v.efficiency, 2), true) +
              stat(
                t('كم بالتنكة (20 لتر)', 'Km per tank (20 L)'),
                fmt(v.efficiency * C.TANK_LITERS, 1),
                true
              ) +
              stat(t('سعر اللتر', 'Price per liter'), money(v.price, v.currency)) +
              stat(t('سعر التنكة', 'Tank price'), money(v.price * C.TANK_LITERS, v.currency)) +
              '</div><div class="vehicle-actions"><button class="button primary" data-use-vehicle="' +
              escape(v.id) +
              '">' +
              t('استخدم للمشوار', 'Use for trip') +
              '</button><button class="button secondary" data-edit-vehicle="' +
              escape(v.id) +
              '">' +
              t('تعديل', 'Edit') +
              '</button></div></article>'
          )
          .join('')
      : '<div class="empty-state">' +
        icon('car') +
        '<h2>' +
        t('خلّي سيارتك جاهزة للحسبة.', 'Keep your vehicle ready to go.') +
        '</h2><p>' +
        t(
          'أضف سيارتك وكم بتمشي باللتر أو بالتنكة، لتستعملها بأي مشوار وتقارنها مع غيرها.',
          'Add a vehicle and how far it goes per liter or per tank, then reuse or compare it on any trip.'
        ) +
        '</p><button class="button primary" data-add-vehicle>' +
        icon('plus') +
        t('إضافة سيارة', 'Add vehicle') +
        '</button></div>';
    renderComparison();
  }
  function renderComparison() {
    const i = inputValues();
    const rows = state.vehicles
      .filter((v) => v.currency === state.settings.currency)
      .map((v) => ({
        v,
        r: C.calculate({ ...i, efficiency: v.efficiency, price: v.price }),
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
              '<div class="comparison-row' +
              (index === 0 && rows.length > 1 ? ' best' : '') +
              '"><div class="comparison-name">' +
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
    const kml =
      v?.efficiency ??
      (canonicalEfficiency >= 0.01 && canonicalEfficiency <= 1000 ? canonicalEfficiency : 12);
    vehicleKml = kml;
    $('vehicle-efficiency').value = trimNumber(kml);
    $('vehicle-tank').value = trimNumber(kml * C.TANK_LITERS);
    $('vehicle-price').value = v?.price ?? $('price').value;
    $('vehicle-fuel').value = v?.fuel || state.settings.fuel;
    $('vehicle-currency').value = v?.currency || state.settings.currency;
    $('vehicle-error').textContent = '';
    $('vehicle-dialog').showModal();
  }
  // The garage form keeps km/L and km per 20 L tank in step; the last edited box wins.
  const trimNumber = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(4))) : '');
  function linkEfficiency(source) {
    const n = C.number($(source).value),
      valid = Number.isFinite(n) && n > 0,
      fromTank = source === 'vehicle-tank';
    vehicleKml = valid ? (fromTank ? n / C.TANK_LITERS : n) : NaN;
    $(fromTank ? 'vehicle-efficiency' : 'vehicle-tank').value = valid
      ? trimNumber(fromTank ? n / C.TANK_LITERS : n * C.TANK_LITERS)
      : '';
  }
  function useVehicle(id) {
    const v = state.vehicles.find((v) => v.id === id);
    if (!v) return;
    canonicalEfficiency = v.efficiency;
    $('efficiency').value = String(C.efficiencyFromKml(v.efficiency, currentUnit));
    $('price').value = String(v.price);
    state.settings.currency = v.currency;
    state.settings.fuel = v.fuel;
    $('vehicle-select').value = v.id;
    update();
  }
  function applyTheme() {
    const dark =
      state.settings.theme === 'dark' ||
      (state.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#090f1c' : '#f3f5f9';
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
    $('efficiency-unit').options[2].textContent = t('كم/تنكة', 'km/20L');
    renderVehicles();
    update({ save: false });
    showView(false);
    connectionStatus();
    window.dispatchEvent(new Event('roadcost:language'));
  }
  function showView(focus = false) {
    const hash = location.hash.slice(1),
      view = ['trip', 'garage', 'finance'].includes(hash) ? hash : 'home';
    document.body.dataset.page = view;
    document.querySelectorAll('.view').forEach((el) => (el.hidden = el.id !== 'view-' + view));
    document
      .querySelectorAll('[data-view]')
      .forEach((el) =>
        el.dataset.view === view
          ? el.setAttribute('aria-current', 'page')
          : el.removeAttribute('aria-current')
      );
    if (view === 'garage') renderVehicles();
    if (view === 'finance') window.dispatchEvent(new Event('roadcost:finance-view'));
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
        t('تكلفة وقود المشوار', 'Trip fuel cost') +
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
        t('التكلفة التقديرية: ', 'Estimated cost: ') +
        money(r.total) +
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
      // Request a fresh worker check on every launch, including iOS home-screen mode.
      check();
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
    $('efficiency').value = String(C.efficiencyFromKml(canonicalEfficiency, currentUnit));
    $('price').value = state.settings.price;
    restoreDraft();
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
    for (const id of ['roundtrip', 'commute-days']) $(id).addEventListener('input', () => update());
    $('efficiency-unit').addEventListener('change', () => {
      currentUnit = $('efficiency-unit').value;
      if (Number.isFinite(canonicalEfficiency) && canonicalEfficiency > 0)
        $('efficiency').value = String(C.efficiencyFromKml(canonicalEfficiency, currentUnit));
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
      $('map-section').scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    $('show-summary').addEventListener('click', () =>
      document.querySelector('.estimate-card').scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'center',
      })
    );
    // The floating total is only useful while the full result card is off screen.
    if ('IntersectionObserver' in window)
      new IntersectionObserver(
        ([entry]) =>
          document
            .querySelector('.mobile-total-bar')
            .classList.toggle('is-hidden', entry.isIntersecting),
        { threshold: 0.35 }
      ).observe(document.querySelector('.estimate-card'));
    $('vehicle-select').addEventListener('change', () => useVehicle($('vehicle-select').value));
    $('copy').addEventListener('click', share);
    $('reset').addEventListener('click', () => {
      $('distance').value = '20';
      $('roundtrip').checked = false;
      routeMeta = null;
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
      const previousScroll = window.scrollY;
      state.settings.lang = state.settings.lang === 'ar' ? 'en' : 'ar';
      translateStatic();
      persist();
      // RTL/LTR text reflow should not move the reader away from their fields.
      window.scrollTo({ top: previousScroll, behavior: 'instant' });
    });
    $('open-settings').addEventListener('click', () => $('settings-dialog').showModal());
    // A tap on the dimmed backdrop closes a sheet, as people expect on phones.
    document.querySelectorAll('dialog').forEach((dialog) =>
      dialog.addEventListener('click', (e) => {
        if (e.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (
          e.clientX < box.left ||
          e.clientX > box.right ||
          e.clientY < box.top ||
          e.clientY > box.bottom
        )
          dialog.close();
      })
    );
    for (const id of ['vehicle-efficiency', 'vehicle-tank'])
      $(id).addEventListener('input', () => linkEfficiency(id));
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
    const addVehicle = () => {
      if (state.vehicles.length >= 20) {
        toast(t('يمكنك حفظ 20 سيارة.', 'You can save up to 20 vehicles.'));
        return;
      }
      vehicleDialog();
    };
    $('add-vehicle').addEventListener('click', addVehicle);
    $('vehicle-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = {
        id: editVehicleId || uid(),
        name: $('vehicle-name').value.trim(),
        efficiency: vehicleKml,
        price: C.number($('vehicle-price').value),
        fuel: $('vehicle-fuel').value,
        currency: $('vehicle-currency').value,
      };
      const clean = C.sanitizeState({ ...state, vehicles: [v] }).vehicles[0];
      if (!clean) {
        $('vehicle-error').textContent = t(
          'أدخل اسماً، وكم بتمشي السيارة باللتر (0.01 إلى 1000) أو بالتنكة، وسعراً صالحاً للتر.',
          'Enter a name, the km per liter (0.01 to 1,000) or per tank, and a valid price per liter.'
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
      if ('addVehicle' in b.dataset) addVehicle();
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
          toast(t('حُذفت السيارة.', 'Vehicle deleted.'));
        }
      }
    });
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
          clean.vehicles.length !== raw.vehicles.length ||
          clean.cashHistory.length !== (raw.cashHistory || []).length ||
          clean.expenses.length !== (raw.expenses || []).length
        )
          throw Error('Invalid records');
        pendingImport = clean;
        $('import-description').textContent =
          t('تحتوي النسخة على ', 'Backup contains ') +
          clean.vehicles.length +
          t(' سيارة، و', ' vehicles, ') +
          clean.cashHistory.length +
          t(' عملية عد نقدي، و', ' cash counts, ') +
          clean.expenses.length +
          t(' مصروف. ستستبدل بياناتك الحالية.', ' expenses. This replaces your current data.');
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
      $('efficiency').value = String(C.efficiencyFromKml(canonicalEfficiency, currentUnit));
      $('price').value = state.settings.price;
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
    window.RoadApp = {
      getLanguage: () => state.settings.lang,
      t,
      getFinanceData: () => ({
        cashHistory: state.cashHistory,
        expenses: state.expenses,
        vehicles: state.vehicles,
        defaultCurrency: state.settings.currency,
      }),
      saveFinanceData: (cashHistory, expenses) => {
        try {
          if (
            !Array.isArray(cashHistory) ||
            !Array.isArray(expenses) ||
            cashHistory.length > 500 ||
            expenses.length > 1000
          )
            return false;
          const next = C.sanitizeState({ ...state, cashHistory, expenses });
          if (
            next.cashHistory.length !== cashHistory.length ||
            next.expenses.length !== expenses.length
          )
            return false;
          return persist(next);
        } catch {
          return false;
        }
      },
    };
  }
  init();
})();
