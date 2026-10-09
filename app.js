
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const storedKey = 'taxi-fuel-offline-v1';
  const numericFields = ['distance', 'efficiency', 'price'];
  const currencies = ['ل.س', '$', '€', '₺'];
  let currency = 'ل.س';
  let current = null;
  let counterFrame = 0;
  let lastShown = null;
  let toastTimer = null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function savedSettings() {
    try { return JSON.parse(localStorage.getItem(storedKey) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function saveSettings() {
    try {
      localStorage.setItem(storedKey, JSON.stringify({
        efficiency: $('efficiency').value,
        price: $('price').value,
        currency
      }));
    } catch (_) {}
  }

  function normalize(input) {
    const arabic = '٠١٢٣٤٥٦٧٨٩', persian = '۰۱۲۳۴۵۶۷۸۹';
    let s = String(input || '').trim()
      .replace(/[٠-٩]/g, c => String(arabic.indexOf(c)))
      .replace(/[۰-۹]/g, c => String(persian.indexOf(c)))
      .replace(/٫/g, '.').replace(/٬/g, ',')
      .replace(/\s/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }
  function format(value, places = 2) {
    return new Intl.NumberFormat('en-US', {maximumFractionDigits:places}).format(value);
  }
  function parseField(id, mustBePositive) {
    const text = $(id).value.trim();
    const num = normalize(text);
    const invalid = text !== '' && (!Number.isFinite(num) || num < 0 || (mustBePositive && num === 0));
    $('error-' + id).textContent = invalid ? 'أدخل رقم صحيح ' + (mustBePositive ? 'أكبر من صفر' : 'صفر أو أكبر') : '';
    $(id).setAttribute('aria-invalid', invalid ? 'true' : 'false');
    return text && !invalid ? num : null;
  }
  function showCost(value) {
    cancelAnimationFrame(counterFrame);
    const number = $('cost-number');
    if (value === null) {
      number.textContent = '—';
      lastShown = null;
      return;
    }
    const previous = lastShown;
    lastShown = value;
    if (previous === null || reducedMotion || !Number.isFinite(previous)) {
      number.textContent = format(value);
      return;
    }
    const start = performance.now();
    const delta = value - previous;
    const duration = 320;
    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      number.textContent = format(previous + delta * eased);
      if (progress < 1) counterFrame = requestAnimationFrame(frame);
    }
    counterFrame = requestAnimationFrame(frame);
  }
  function numberAndUnit(id, value, unit, digits = 2) {
    $(id).innerHTML = value === null ? '—' : '<span dir="ltr">' + format(value, digits) + '</span> <small>' + unit + '</small>';
  }
  function updateQuick() {
    const distance = normalize($('distance').value);
    document.querySelectorAll('[data-distance]').forEach(button => {
      const pressed = distance === Number(button.dataset.distance);
      button.classList.toggle('selected', pressed);
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
  }
  function calculate() {
    const distance = parseField('distance', true);
    const efficiency = parseField('efficiency', true);
    const price = parseField('price', false);
    const km = distance === null ? null : distance * ($('roundtrip').checked ? 2 : 1);
    const liters = km !== null && efficiency !== null ? km / efficiency : null;
    const perKm = price !== null && efficiency !== null ? price / efficiency : null;
    const cost = liters !== null && price !== null ? liters * price : null;
    const all = [km, liters, perKm, cost];
    if (all.some(v => v !== null && !Number.isFinite(v))) {
      showCost(null);
      numberAndUnit('consumption', null, 'لتر');
      numberAndUnit('distance-total', null, 'كم');
      numberAndUnit('per-km', null, currency);
      $('cost-unit').textContent = '';
      $('cost-hint').textContent = 'أدخل أرقام أصغر للحساب';
      $('copy').disabled = true;
      current = null;
      return;
    }
    showCost(cost);
    $('cost-unit').textContent = cost === null ? '' : currency;
    $('cost-hint').textContent = cost === null ? 'أدخل سعر اللتر لتشوف تكلفة المشوار' : 'تكلفة البنزين المتوقعة لهالمشوار';
    numberAndUnit('consumption', liters, 'لتر', 3);
    numberAndUnit('distance-total', km, 'كم');
    numberAndUnit('per-km', perKm, currency);
    $('copy').disabled = cost === null;
    current = cost === null ? null : {km, liters, perKm, cost, currency};
    updateQuick();
  }
  function update() { saveSettings(); calculate(); }
  function setCurrency(value) {
    if (!currencies.includes(value)) return;
    currency = value;
    document.querySelectorAll('[data-currency]').forEach(btn =>
      btn.setAttribute('aria-pressed', btn.dataset.currency === value ? 'true' : 'false'));
    update();
  }
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }
  async function copyResults() {
    if (!current) return;
    const s = current;
    const result = '🛣️ تكاليف الطريق — مصروف المشوار\n' +
      'المسافة: ' + format(s.km) + ' كم\n' +
      'البنزين: ' + format(s.liters, 3) + ' لتر\n' +
      'تكلفة الكيلومتر: ' + format(s.perKm) + ' ' + s.currency + '\n' +
      'إجمالي البنزين: ' + format(s.cost) + ' ' + s.currency;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(result);
      } else {
        const temp = document.createElement('textarea');
        temp.value = result;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.append(temp);
        temp.select();
        if (!document.execCommand('copy')) throw new Error('copy');
        temp.remove();
      }
      toast('✓ تم نسخ نتيجة المشوار');
    } catch (_) {
      toast('تعذّر النسخ، جرّب مرة ثانية');
    }
  }

  function init() {
    const saved = savedSettings();
    if (typeof saved.efficiency === 'string') $('efficiency').value = saved.efficiency;
    if (typeof saved.price === 'string') $('price').value = saved.price;
    numericFields.forEach(id => $(id).addEventListener('input', update));
    $('roundtrip').addEventListener('change', update);
    document.querySelectorAll('[data-distance]').forEach(btn => btn.addEventListener('click', () => {
      $('distance').value = btn.dataset.distance;
      update();
      if (navigator.vibrate) navigator.vibrate(10);
    }));
    document.querySelectorAll('[data-currency]').forEach(btn => btn.addEventListener('click', () => setCurrency(btn.dataset.currency)));
    $('reset').addEventListener('click', () => {
      $('distance').value = '20';
      $('efficiency').value = '12';
      $('price').value = '';
      $('roundtrip').checked = false;
      setCurrency('ل.س');
      toast('تمت إعادة ضبط الحاسبة');
    });
    $('copy').addEventListener('click', copyResults);
    setCurrency(currencies.includes(saved.currency) ? saved.currency : 'ل.س');
    function status() {
      const online = navigator.onLine;
      $('connectivity').classList.toggle('off', !online);
      $('connection-label').textContent = online ? 'تحديث التطبيق' : 'شغّال أوفلاين';
      $('connectivity').setAttribute('aria-label', online ? 'تحميل أحدث نسخة من الحاسبة' : 'التطبيق يعمل بدون إنترنت');
    }
    $('connectivity').addEventListener('click', () => {
      if (!navigator.onLine) {
        toast('الحاسبة شغّالة أوفلاين — اتصال الإنترنت مطلوب للتحديث');
        return;
      }
      $('connection-label').textContent = 'عم نحدّث…';
      window.location.assign(new URL('./index.html?fresh=' + Date.now(), window.location.href).href);
    });
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    status();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      async function checkForUpdates() {
        if (!navigator.onLine) return;
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        } catch (_) {}
      }
      navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'})
        .then(reg => reg.update().catch(() => {})).catch(() => {});
      window.addEventListener('pageshow', checkForUpdates);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdates();
      });
    }
  }
  init();
})();
