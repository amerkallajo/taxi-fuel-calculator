/* Road Cost optional map v7. The calculator is independent of this script. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CONFIG = {
    geocoder: 'https://photon.komoot.io/api/',
    router: 'https://router.project-osrm.org/route/v1/driving/',
    tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  };
  const LAST_ROUTE_KEY = 'road-cost-last-route-summary-v1';
  const endpoints = {start: null, end: null};
  const markers = {start: null, end: null};
  const searches = {start: null, end: null};
  const searchSeq = {start: 0, end: 0};
  const geocodeCache = new Map();
  let map = null, pathLayer = null, mode = 'end', leafletPromise = null;
  let routeController = null, routeSeq = 0, lastSearchTime = 0, lastRouteTime = 0;

  function status(text, error = false) {
    $('map-status').textContent = text;
    $('map-status').classList.toggle('map-error', error);
  }
  function valid(p) {
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  }
  function travelTime(seconds) {
    const mins = Math.round(seconds / 60);
    return mins < 60 ? mins + ' دقيقة' :
      Math.floor(mins / 60) + ' ساعة' + (mins % 60 ? ' و' + (mins % 60) + ' دقيقة' : '');
  }
  function showResult(km, seconds, cached = false) {
    $('map-result').hidden = false;
    $('map-result-title').textContent = cached ? 'آخر مسافة محسوبة (للعرض فقط)' : 'مسافة الطريق باتجاه واحد';
    $('map-km').textContent = km.toFixed(2) + ' كم';
    $('map-duration').textContent = seconds === null ? 'غير متوفر' : travelTime(seconds);
  }
  function invalidateRoute(note) {
    routeSeq++;
    if (routeController) routeController.abort();
    routeController = null;
    if (pathLayer && map) map.removeLayer(pathLayer);
    pathLayer = null;
    $('map-result').hidden = true;
    if (note) status(note);
  }
  function chooseMode(next) {
    mode = next;
    document.querySelectorAll('[data-map-pick]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.mapPick === next ? 'true' : 'false'));
  }
  function drawMarker(which) {
    if (!map || !window.L) return;
    if (markers[which]) map.removeLayer(markers[which]);
    markers[which] = null;
    const p = endpoints[which];
    if (!valid(p)) return;
    markers[which] = L.circleMarker([p.lat, p.lon], {
      radius: 9, color: '#10202a', weight: 3,
      fillColor: which === 'start' ? '#76edbb' : '#ffc989', fillOpacity: 1
    }).addTo(map).bindTooltip(which === 'start' ? 'نقطة الانطلاق' : 'الوجهة');
  }
  function zoomToPoints() {
    if (!map || !window.L) return;
    const points = [endpoints.start, endpoints.end].filter(valid);
    if (points.length === 2) map.fitBounds(
      L.latLngBounds(points.map(p => [p.lat, p.lon])), {padding: [35, 35], maxZoom: 12});
    else if (points.length === 1) map.setView([points[0].lat, points[0].lon], 12);
  }
  function setPoint(which, point, label) {
    if (!valid(point)) return;
    searchSeq[which]++;
    if (searches[which]) searches[which].abort();
    endpoints[which] = {lat: point.lat, lon: point.lon};
    $('map-' + which + '-input').value = label;
    $('map-' + which + '-results').replaceChildren();
    invalidateRoute('تم تغيير النقطة. احسب الطريق لتحديث المسافة في الحاسبة.');
    drawMarker(which);
    zoomToPoints();
    if (which === 'start' && !endpoints.end) chooseMode('end');
  }
  function inputEdited(which) {
    searchSeq[which]++;
    if (searches[which]) searches[which].abort();
    $('map-' + which + '-results').replaceChildren();
    if (!endpoints[which]) return;
    endpoints[which] = null;
    drawMarker(which);
    invalidateRoute('اختر نتيجة البحث أو نقطة على الخريطة، ثم أعد حساب الطريق. المسافة السابقة لم تتغير.');
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      style.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      style.crossOrigin = 'anonymous';
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      js.crossOrigin = 'anonymous';
      js.onload = () => window.L ? resolve() : reject(Error('Leaflet missing'));
      js.onerror = () => reject(Error('Leaflet download failed'));
      document.head.append(style, js);
    }).catch(e => {leafletPromise = null; throw e;});
    return leafletPromise;
  }
  async function showMap() {
    if (map) {setTimeout(() => map.invalidateSize(), 100); return;}
    if (!navigator.onLine) {
      status('الخريطة الجديدة تحتاج إنترنت. الحاسبة اليدوية تعمل دون اتصال.', true); return;
    }
    status('عم نحمّل الخريطة…');
    try {
      await loadLeaflet();
      if (!$('map-section').open || map) return;
      map = L.map('road-map', {scrollWheelZoom: false}).setView([34.7, 37.0], 6);
      L.tileLayer(CONFIG.tiles, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxZoom: 19
      }).addTo(map);
      map.on('click', e => {
        setPoint(mode, {lat: e.latlng.lat, lon: e.latlng.lng},
          e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5));
      });
      drawMarker('start'); drawMarker('end'); zoomToPoints();
      setTimeout(() => map.invalidateSize(), 120);
      status('ابحث عن مكان أو اضغط على الخريطة لتحديد الانطلاق أو الوجهة.');
    } catch (e) {status('تعذّر تحميل الخريطة. تحقق من الإنترنت ثم أعد فتح القسم.', true);}
  }
  async function getJSON(url, controller) {
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {signal: controller.signal, headers: {Accept: 'application/json'}});
      if (!res.ok) throw Error('HTTP ' + res.status);
      return await res.json();
    } finally {clearTimeout(timer);}
  }
  function placeName(f) {
    const p = f.properties || {};
    return [...new Set([p.name, p.street, p.city, p.state, p.country].filter(Boolean))]
      .join('، ') || 'مكان بلا اسم';
  }
  async function searchPlace(which) {
    const query = $('map-' + which + '-input').value.trim();
    const resultList = $('map-' + which + '-results');
    if (query.length < 2) {status('اكتب اسم مكان أو عنوان من حرفين على الأقل.', true); return;}
    if (!navigator.onLine) {status('البحث يحتاج اتصالاً بالإنترنت.', true); return;}
    if (Date.now() - lastSearchTime < 1100) {
      status('انتظر ثانية بين عمليات البحث لحماية الخدمة المجانية.', true); return;
    }
    lastSearchTime = Date.now();
    if (searches[which]) searches[which].abort();
    const controller = new AbortController();
    searches[which] = controller;
    const id = ++searchSeq[which];
    resultList.replaceChildren();
    status('عم نبحث عن «' + query + '»…');
    try {
      const url = new URL(CONFIG.geocoder);
      url.searchParams.set('q', query);
      url.searchParams.set('lang', 'ar');
      url.searchParams.set('limit', '5');
      const data = geocodeCache.has(url.href) ? geocodeCache.get(url.href) : await getJSON(url.href, controller);
      if (id !== searchSeq[which]) return;
      if (!geocodeCache.has(url.href)) {
        if (geocodeCache.size >= 25) geocodeCache.delete(geocodeCache.keys().next().value);
        geocodeCache.set(url.href, data);
      }
      const places = (Array.isArray(data.features) ? data.features : []).filter(f => {
        const c = f.geometry && f.geometry.coordinates;
        return Array.isArray(c) && valid({lat: c[1], lon: c[0]});
      });
      if (!places.length) {status('ما لقينا نتائج. جرّب اسم المحافظة أو البلد.', true); return;}
      for (const f of places) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-search-result';
        const name = placeName(f);
        button.textContent = name;
        button.addEventListener('click', () =>
          setPoint(which, {lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1]}, name));
        resultList.append(button);
      }
      status('اختر المكان الصحيح من نتائج البحث.');
    } catch (e) {
      if (id === searchSeq[which]) status('خدمة البحث غير متاحة حالياً. حاول مجدداً.', true);
    } finally {
      if (searches[which] === controller) searches[which] = null;
    }
  }
  function useGPS() {
    if (!navigator.geolocation) {status('GPS غير مدعوم على الجهاز.', true); return;}
    if (!window.isSecureContext) {status('GPS يحتاج فتح التطبيق عبر HTTPS.', true); return;}
    $('map-gps').disabled = true;
    status('بانتظار إذن الموقع من الجهاز…');
    navigator.geolocation.getCurrentPosition(p => {
      $('map-gps').disabled = false;
      setPoint('start', {lat: p.coords.latitude, lon: p.coords.longitude}, 'موقعي الحالي');
      status('تم تحديد موقعك. اختر الوجهة ثم احسب الطريق.');
    }, e => {
      $('map-gps').disabled = false;
      status(e.code === 1 ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح أو حدد الانطلاق يدوياً.' :
        e.code === 3 ? 'انتهت مهلة GPS، حاول مجدداً.' : 'تعذّر تحديد GPS. اختر موقعاً يدوياً.', true);
    }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 30000});
  }
  async function route() {
    if (!valid(endpoints.start) || !valid(endpoints.end)) {
      status('حدد الانطلاق والوجهة أولاً.', true); return;
    }
    if (!navigator.onLine) {status('حساب مسار جديد يحتاج الإنترنت. الحاسبة اليدوية تعمل.', true); return;}
    if (routeController) return;
    if (Date.now() - lastRouteTime < 1100) {status('انتظر ثانية قبل حساب مسار آخر.', true); return;}
    lastRouteTime = Date.now();
    const controller = new AbortController();
    routeController = controller;
    const id = ++routeSeq;
    $('map-route-button').disabled = true;
    status('عم نحسب الطريق الفعلي…');
    const coords = [endpoints.start, endpoints.end].map(p =>
      p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const url = CONFIG.router + coords + '?overview=full&geometries=geojson&steps=false';
    try {
      const data = await getJSON(url, controller);
      if (id !== routeSeq) return;
      const result = data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes[0];
      const geometry = result && result.geometry;
      if (!result || !Number.isFinite(result.distance) || result.distance <= 0 ||
          !geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) ||
          geometry.coordinates.length < 2) {
        status('لا يوجد مسار قيادة صالح بين النقطتين. غيّر نقطة الانطلاق أو الوجهة.', true); return;
      }
      const latlngs = geometry.coordinates.filter(c =>
        Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90).map(c => [c[1], c[0]]);
      if (latlngs.length < 2) {status('بيانات مسار الطريق غير صالحة.', true); return;}
      const km = result.distance / 1000;
      const duration = Number.isFinite(result.duration) && result.duration >= 0 ? result.duration : null;
      if (pathLayer && map) map.removeLayer(pathLayer);
      pathLayer = map ? L.polyline(latlngs, {color: '#5ce7c1', weight: 5, opacity: .95}).addTo(map) : null;
      if (pathLayer) map.fitBounds(pathLayer.getBounds(), {padding: [30, 30], maxZoom: 13});
      $('distance').value = km.toFixed(2);
      $('distance').dispatchEvent(new Event('input', {bubbles: true}));
      showResult(km, duration);
      try {
        localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({km: km, duration: duration, date: Date.now()}));
      } catch (e) {}
      status('تم تحديث الحاسبة. مدة القيادة تقديرية دون بيانات مرور مباشرة.');
    } catch (e) {
      if (id === routeSeq) status('تعذّر حساب الطريق. لم نستخدم مسافة خط مستقيم ولم نغيّر الحاسبة.', true);
    } finally {
      if (routeController === controller) routeController = null;
      $('map-route-button').disabled = false;
    }
  }
  function swap() {
    const previous = endpoints.start;
    endpoints.start = endpoints.end; endpoints.end = previous;
    const label = $('map-start-input').value;
    $('map-start-input').value = $('map-end-input').value;
    $('map-end-input').value = label;
    for (const which of ['start', 'end']) {
      searchSeq[which]++;
      if (searches[which]) searches[which].abort();
      $('map-' + which + '-results').replaceChildren();
      drawMarker(which);
    }
    invalidateRoute('تم تبديل الاتجاه؛ اضغط «احسب الطريق» للحصول على المسافة الجديدة.');
    zoomToPoints();
  }
  function restorePrevious() {
    try {
      const p = JSON.parse(localStorage.getItem(LAST_ROUTE_KEY) || 'null');
      if (p && Number.isFinite(p.km) && p.km > 0 &&
          (p.duration === null || Number.isFinite(p.duration))) showResult(p.km, p.duration, true);
    } catch (e) {}
  }
  function init() {
    $('map-section').addEventListener('toggle', () => {
      if ($('map-section').open) showMap();
    });
    $('map-gps').addEventListener('click', useGPS);
    $('map-swap').addEventListener('click', swap);
    $('map-route-button').addEventListener('click', route);
    document.querySelectorAll('[data-map-pick]').forEach(b => b.addEventListener('click', () => {
      chooseMode(b.dataset.mapPick);
      status('اضغط على الخريطة لتحديد ' + (mode === 'start' ? 'الانطلاق.' : 'الوجهة.'));
    }));
    ['start', 'end'].forEach(which => {
      $('map-' + which + '-search').addEventListener('click', () => searchPlace(which));
      $('map-' + which + '-input').addEventListener('keydown', event => {
        if (event.key === 'Enter') {event.preventDefault(); searchPlace(which);}
      });
      $('map-' + which + '-input').addEventListener('input', () => inputEdited(which));
    });
    window.addEventListener('offline', () => {
      if (routeController) invalidateRoute();
      status('أنت أوفلاين: الحاسبة تعمل، لكن بحث الخرائط والمسارات يحتاج الإنترنت.', true);
    });
    restorePrevious();
  }
  init();
})();