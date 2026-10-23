/* Road Cost map v10. Explicit geocoding, cancellable routing and local Leaflet. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CONFIG = {
    geocoder: 'https://photon.komoot.io/api/',
    backupGeocoder: 'https://nominatim.openstreetmap.org/search',
    router: 'https://router.project-osrm.org/route/v1/driving/',
    tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  };
  const LAST_ROUTE_KEY = 'road-cost-last-route-summary-v1';
  const endpoints = { start: null, end: null };
  const markers = { start: null, end: null };
  const searches = { start: null, end: null };
  const searchSeq = { start: 0, end: 0 };
  const geocodeCache = new Map();
  let map = null,
    pathLayer = null,
    mode = 'end',
    leafletPromise = null;
  let applyingRoute = false;
  let nominatimQueue = Promise.resolve(),
    lastNominatimRequest = 0;
  let routeController = null,
    routeSeq = 0,
    lastSearchTime = 0,
    lastRouteTime = 0;
  const tr = (ar, en) => (window.RoadApp ? window.RoadApp.t(ar, en) : ar);
  const notify = (name, detail) => {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function')
      window.dispatchEvent(new CustomEvent(name, { detail }));
  };
  let lastStatus = '',
    lastStatusError = false;
  let lastResult = null;
  const english = {
    'تم تغيير النقطة. احسب الطريق لتحديث المسافة في الحاسبة.':
      'Point changed. Calculate a route to update the planner.',
    'اختر نتيجة البحث أو نقطة على الخريطة، ثم أعد حساب الطريق. المسافة السابقة لم تتغير.':
      'Choose a search result or a map point, then recalculate. The previous planner distance is kept.',
    'الخريطة الجديدة تحتاج إنترنت. الحاسبة اليدوية تعمل دون اتصال.':
      'A new map needs internet. The manual calculator works offline.',
    'عم نحمّل الخريطة…': 'Loading the map…',
    'ابحث عن مكان أو اضغط على الخريطة لتحديد الانطلاق أو الوجهة.':
      'Search or tap the map to choose your origin or destination.',
    'تعذّر تحميل الخريطة. تحقق من الإنترنت ثم أعد فتح القسم.':
      'Map could not load. Check your connection and reopen this section.',
    'اكتب اسم مكان أو عنوان من حرفين على الأقل.':
      'Enter a place or address with at least two characters.',
    'البحث يحتاج اتصالاً بالإنترنت.': 'Place search needs internet.',
    'انتظر ثانية بين عمليات البحث لحماية الخدمة المجانية.':
      'Wait a second between searches to protect the free service.',
    'لم يتم العثور على مكان. جرّب اسم المدينة أو اكتب الاسم بالإنجليزية، أو اضغط على الخريطة.':
      'No results. Try a city name, another language or a point on the map.',
    'GPS غير مدعوم على الجهاز.': 'Location is unavailable on this device.',
    'GPS يحتاج فتح التطبيق عبر HTTPS.': 'Location requires HTTPS.',
    'بانتظار إذن الموقع من الجهاز…': 'Waiting for location permission…',
    'تم تحديد موقعك. اختر الوجهة ثم احسب الطريق.':
      'Location selected. Choose a destination and calculate the route.',
    'تم رفض إذن الموقع. فعّله من إعدادات المتصفح أو حدد الانطلاق يدوياً.':
      'Location permission denied. Enable it in browser settings or select your origin manually.',
    'انتهت مهلة GPS، حاول مجدداً.': 'Location timed out. Please try again.',
    'تعذّر تحديد GPS. اختر موقعاً يدوياً.': 'Location could not be found. Select a point manually.',
    'حدد الانطلاق والوجهة باختيار نتيجة البحث أو بالضغط على الخريطة. كتابة الاسم وحدها لا تكفي.':
      'Select both endpoints from search results or the map. Typing a name alone does not select a place.',
    'حساب مسار جديد يحتاج الإنترنت. الحاسبة اليدوية تعمل.':
      'New routes need internet. The manual calculator still works.',
    'انتظر ثانية قبل حساب مسار آخر.': 'Wait a second before calculating another route.',
    'عم نحسب الطريق الفعلي…': 'Calculating the driving route…',
    'لا يوجد مسار قيادة صالح بين النقطتين. غيّر نقطة الانطلاق أو الوجهة.':
      'No driving route found. Change the origin or destination.',
    'بيانات مسار الطريق غير صالحة.': 'The route data is invalid.',
    'تم تحديث الحاسبة. مدة القيادة تقديرية دون بيانات مرور مباشرة.':
      'Planner updated. Driving time is an estimate without live traffic.',
    'تم تبديل الاتجاه؛ اضغط «احسب الطريق» للحصول على المسافة الجديدة.':
      'Direction swapped. Calculate again to update the distance.',
    'أنت أوفلاين: الحاسبة تعمل، لكن بحث الخرائط والمسارات يحتاج الإنترنت.':
      'You are offline. The calculator works; place search and new routes need internet.',
    'اضغط على الخريطة لتحديد الانطلاق.': 'Tap the map to set the origin.',
    'اضغط على الخريطة لتحديد الوجهة.': 'Tap the map to set the destination.',
  };

  function status(text, error = false) {
    lastStatus = text;
    lastStatusError = error;
    $('map-status').textContent = tr(text, english[text] || text);
    $('map-status').classList.toggle('map-error', error);
  }
  function valid(p) {
    return (
      p &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180
    );
  }
  function travelTime(seconds) {
    const mins = Math.round(seconds / 60);
    if (tr('ar', 'en') === 'en')
      return mins < 60
        ? mins + ' min'
        : Math.floor(mins / 60) + ' h ' + (mins % 60 ? (mins % 60) + ' min' : '');
    return mins < 60
      ? mins + ' دقيقة'
      : Math.floor(mins / 60) + ' ساعة' + (mins % 60 ? ' و' + (mins % 60) + ' دقيقة' : '');
  }
  function showResult(km, seconds, cached = false) {
    lastResult = { km, seconds, cached };
    $('map-result').hidden = false;
    $('map-result-title').textContent = cached
      ? tr('آخر مسافة محسوبة (للعرض فقط)', 'Previous road distance (reference only)')
      : tr('مسافة الطريق باتجاه واحد', 'One-way road distance');
    $('map-km').textContent = km.toFixed(2) + tr(' كم', ' km');
    $('map-duration').textContent =
      seconds === null ? tr('غير متوفر', 'Unavailable') : travelTime(seconds);
  }
  function invalidateRoute(note) {
    routeSeq++;
    if (routeController) routeController.abort();
    routeController = null;
    $('map-route-button').disabled = false;
    if (pathLayer && map) map.removeLayer(pathLayer);
    pathLayer = null;
    $('map-result').hidden = true;
    lastResult = null;
    notify('roadcost:route-invalid');
    if (note) status(note);
  }
  function chooseMode(next) {
    mode = next;
    document
      .querySelectorAll('[data-map-pick]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', b.dataset.mapPick === next ? 'true' : 'false')
      );
  }
  function drawMarker(which) {
    if (!map || !window.L) return;
    if (markers[which]) map.removeLayer(markers[which]);
    markers[which] = null;
    const p = endpoints[which];
    if (!valid(p)) return;
    markers[which] = L.circleMarker([p.lat, p.lon], {
      radius: 9,
      color: '#10202a',
      weight: 3,
      fillColor: which === 'start' ? '#76edbb' : '#ffc989',
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(which === 'start' ? tr('نقطة الانطلاق', 'Origin') : tr('الوجهة', 'Destination'));
  }
  function zoomToPoints() {
    if (!map || !window.L) return;
    const points = [endpoints.start, endpoints.end].filter(valid);
    if (points.length === 2)
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), {
        padding: [35, 35],
        maxZoom: 12,
      });
    else if (points.length === 1) map.setView([points[0].lat, points[0].lon], 12);
  }
  function setPoint(which, point, label) {
    if (!valid(point)) return;
    searchSeq[which]++;
    if (searches[which]) searches[which].abort();
    endpoints[which] = { lat: point.lat, lon: point.lon };
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
    invalidateRoute(
      'اختر نتيجة البحث أو نقطة على الخريطة، ثم أعد حساب الطريق. المسافة السابقة لم تتغير.'
    );
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = './vendor/leaflet.css';
      const js = document.createElement('script');
      js.src = './vendor/leaflet.js';
      js.onload = () => (window.L ? resolve() : reject(Error('Leaflet missing')));
      js.onerror = () => reject(Error('Leaflet download failed'));
      document.head.append(style, js);
    }).catch((e) => {
      leafletPromise = null;
      throw e;
    });
    return leafletPromise;
  }
  async function showMap() {
    if (map) {
      setTimeout(() => map.invalidateSize(), 100);
      return;
    }
    if (!navigator.onLine) {
      status('الخريطة الجديدة تحتاج إنترنت. الحاسبة اليدوية تعمل دون اتصال.', true);
      return;
    }
    status('عم نحمّل الخريطة…');
    try {
      await loadLeaflet();
      if (!$('map-section').open || map) return;
      map = L.map('road-map', { scrollWheelZoom: false }).setView([34.7, 37.0], 6);
      L.tileLayer(CONFIG.tiles, {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }).addTo(map);
      map.on('click', (e) => {
        setPoint(
          mode,
          { lat: e.latlng.lat, lon: e.latlng.lng },
          e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5)
        );
      });
      drawMarker('start');
      drawMarker('end');
      zoomToPoints();
      setTimeout(() => map.invalidateSize(), 120);
      status('ابحث عن مكان أو اضغط على الخريطة لتحديد الانطلاق أو الوجهة.');
    } catch (e) {
      status('تعذّر تحميل الخريطة. تحقق من الإنترنت ثم أعد فتح القسم.', true);
    }
  }
  // Each HTTP request has its own timeout: a Photon timeout must not prevent
  // a fresh attempt via Nominatim. The parent signal cancels both on input edits.
  async function getJSON(url, parent, timeoutMs = 12000) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    parent.signal.addEventListener('abort', cancel, { once: true });
    if (parent.signal.aborted) controller.abort();
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const error = new Error('HTTP ' + response.status);
        error.httpStatus = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (expired) {
        const timeoutError = new Error('Request timed out');
        timeoutError.kind = 'timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      parent.signal.removeEventListener('abort', cancel);
    }
  }
  function placeName(f) {
    const p = f.properties || {};
    return (
      [...new Set([p.name, p.street, p.city, p.state, p.country].filter(Boolean))].join('، ') ||
      'مكان بلا اسم'
    );
  }
  function describeFailure(error, provider) {
    if (tr('ar', 'en') === 'en')
      return (
        provider +
        ': ' +
        (error.kind === 'timeout'
          ? 'connection timed out'
          : error.httpStatus
            ? 'HTTP ' + error.httpStatus
            : 'network, DNS or CORS error')
      );
    if (error.kind === 'timeout') return provider + ': انتهت مهلة الاتصال';
    if (error.httpStatus === 429) return provider + ': تجاوز حد الطلبات (429)';
    if (error.httpStatus === 403) return provider + ': الوصول مرفوض (403)';
    if (error.httpStatus >= 500) return provider + ': خطأ بالخادم (' + error.httpStatus + ')';
    if (error.httpStatus) return provider + ': خطأ HTTP ' + error.httpStatus;
    if (error.name === 'AbortError') return provider + ': تم إلغاء الطلب';
    return provider + ': تعذّر الاتصال (شبكة أو DNS أو CORS)';
  }
  async function queryProvider(provider, query, controller) {
    const url = new URL(provider === 'Photon' ? CONFIG.geocoder : CONFIG.backupGeocoder);
    url.searchParams.set('q', query); // URLSearchParams safely encodes Arabic as UTF-8.
    url.searchParams.set('limit', '7');
    if (provider === 'Photon') {
      // The public Photon instance does not promise 'ar' support. Local names
      // remain searchable without asking it to return an unsupported language.
      url.searchParams.set('lang', 'default');
    } else {
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', tr('ar,en', 'en,ar'));
      // Bias towards Syria without disallowing international routes.
      url.searchParams.set('viewbox', '35.0,37.5,42.5,32.0');
    }
    let data = geocodeCache.get(url.href);
    if (!data) {
      if (provider === 'Nominatim') {
        // Serialize this page's Nominatim starts, including fallback requests.
        const slot = nominatimQueue.then(async () => {
          const delay = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (controller.signal.aborted)
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
          lastNominatimRequest = Date.now();
        });
        nominatimQueue = slot.catch(() => {});
        await slot;
      }
      data = await getJSON(url.href, controller);
      if (geocodeCache.size >= 25) geocodeCache.delete(geocodeCache.keys().next().value);
      geocodeCache.set(url.href, data);
    }
    if (provider === 'Photon') {
      return (Array.isArray(data.features) ? data.features : [])
        .map((f) => ({
          lat: f.geometry && f.geometry.coordinates && f.geometry.coordinates[1],
          lon: f.geometry && f.geometry.coordinates && f.geometry.coordinates[0],
          label: placeName(f),
        }))
        .filter(valid);
    }
    return (Array.isArray(data) ? data : [])
      .map((p) => ({
        lat: Number(p.lat),
        lon: Number(p.lon),
        label: p.display_name || p.name || 'مكان بلا اسم',
      }))
      .filter(valid);
  }
  async function searchPlace(which) {
    const query = $('map-' + which + '-input').value.trim();
    const resultList = $('map-' + which + '-results');
    if (query.length < 2) {
      status('اكتب اسم مكان أو عنوان من حرفين على الأقل.', true);
      return false;
    }
    if (!navigator.onLine) {
      status('البحث يحتاج اتصالاً بالإنترنت.', true);
      return false;
    }
    if (Date.now() - lastSearchTime < 1100) {
      status('انتظر ثانية بين عمليات البحث لحماية الخدمة المجانية.', true);
      return false;
    }
    lastSearchTime = Date.now();
    if (searches[which]) searches[which].abort();
    const controller = new AbortController();
    searches[which] = controller;
    const id = ++searchSeq[which];
    const button = $('map-' + which + '-search');
    button.disabled = true;
    resultList.replaceChildren();
    status(tr('جاري البحث عن «' + query + '»…', 'Searching for “' + query + '”…'));
    // Nominatim public: explicit user-initiated searches only, never autocomplete.
    // Arabic names work better there; English tries Photon first.
    const providers = /[\u0600-\u06FF]/.test(query)
      ? ['Nominatim', 'Photon']
      : ['Photon', 'Nominatim'];
    const failures = [];
    let succeeded = false;
    try {
      for (const provider of providers) {
        if (controller.signal.aborted) return false;
        try {
          const places = await queryProvider(provider, query, controller);
          if (id !== searchSeq[which] || controller.signal.aborted) return false;
          succeeded = true;
          if (!places.length) continue;
          for (const place of places) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'map-search-result';
            item.textContent = place.label;
            item.addEventListener('click', () => setPoint(which, place, place.label));
            resultList.append(item);
          }
          status(
            tr(
              'تم العثور على ' +
                places.length +
                ' نتائج عبر ' +
                provider +
                '. اختر المكان الصحيح من القائمة.',
              places.length + ' results via ' + provider + '. Select the correct place.'
            )
          );
          return true;
        } catch (error) {
          if (controller.signal.aborted || id !== searchSeq[which]) return false;
          failures.push(describeFailure(error, provider));
        }
      }
      if (id === searchSeq[which]) {
        status(
          succeeded && !failures.length
            ? 'لم يتم العثور على مكان. جرّب اسم المدينة أو اكتب الاسم بالإنجليزية، أو اضغط على الخريطة.'
            : tr(
                'تعذّر إكمال البحث: ' +
                  failures.join('؛ ') +
                  '. يمكنك تحديد الموقع مباشرة على الخريطة.',
                'Search failed: ' +
                  failures.join('; ') +
                  '. You can still choose points on the map.'
              ),
          true
        );
      }
      return false;
    } finally {
      if (searches[which] === controller) {
        searches[which] = null;
        button.disabled = false;
      }
    }
  }
  function useGPS() {
    if (!navigator.geolocation) {
      status('GPS غير مدعوم على الجهاز.', true);
      return;
    }
    if (!window.isSecureContext) {
      status('GPS يحتاج فتح التطبيق عبر HTTPS.', true);
      return;
    }
    $('map-gps').disabled = true;
    status('بانتظار إذن الموقع من الجهاز…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        $('map-gps').disabled = false;
        setPoint(
          'start',
          { lat: p.coords.latitude, lon: p.coords.longitude },
          tr('موقعي الحالي', 'My location')
        );
        status('تم تحديد موقعك. اختر الوجهة ثم احسب الطريق.');
      },
      (e) => {
        $('map-gps').disabled = false;
        status(
          e.code === 1
            ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح أو حدد الانطلاق يدوياً.'
            : e.code === 3
              ? 'انتهت مهلة GPS، حاول مجدداً.'
              : 'تعذّر تحديد GPS. اختر موقعاً يدوياً.',
          true
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }
  async function route() {
    if (!valid(endpoints.start) || !valid(endpoints.end)) {
      status(
        'حدد الانطلاق والوجهة باختيار نتيجة البحث أو بالضغط على الخريطة. كتابة الاسم وحدها لا تكفي.',
        true
      );
      return;
    }
    if (!navigator.onLine) {
      status('حساب مسار جديد يحتاج الإنترنت. الحاسبة اليدوية تعمل.', true);
      return;
    }
    if (routeController) return;
    if (Date.now() - lastRouteTime < 1100) {
      status('انتظر ثانية قبل حساب مسار آخر.', true);
      return;
    }
    lastRouteTime = Date.now();
    const controller = new AbortController();
    routeController = controller;
    const id = ++routeSeq;
    $('map-route-button').disabled = true;
    status('عم نحسب الطريق الفعلي…');
    const coords = [endpoints.start, endpoints.end]
      .map((p) => p.lon.toFixed(6) + ',' + p.lat.toFixed(6))
      .join(';');
    const url = CONFIG.router + coords + '?overview=full&geometries=geojson&steps=false';
    try {
      const data = await getJSON(url, controller);
      if (id !== routeSeq) return;
      const result = data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes[0];
      const geometry = result && result.geometry;
      if (
        !result ||
        !Number.isFinite(result.distance) ||
        result.distance <= 0 ||
        !geometry ||
        geometry.type !== 'LineString' ||
        !Array.isArray(geometry.coordinates) ||
        geometry.coordinates.length < 2
      ) {
        status('لا يوجد مسار قيادة صالح بين النقطتين. غيّر نقطة الانطلاق أو الوجهة.', true);
        return;
      }
      const latlngs = geometry.coordinates
        .filter(
          (c) =>
            Array.isArray(c) &&
            Number.isFinite(c[0]) &&
            Number.isFinite(c[1]) &&
            Math.abs(c[0]) <= 180 &&
            Math.abs(c[1]) <= 90
        )
        .map((c) => [c[1], c[0]]);
      if (latlngs.length < 2) {
        status('بيانات مسار الطريق غير صالحة.', true);
        return;
      }
      const km = result.distance / 1000;
      const duration =
        Number.isFinite(result.duration) && result.duration >= 0 ? result.duration : null;
      if (pathLayer && map) map.removeLayer(pathLayer);
      pathLayer = map
        ? L.polyline(latlngs, { color: '#5ce7c1', weight: 5, opacity: 0.95 }).addTo(map)
        : null;
      if (pathLayer) map.fitBounds(pathLayer.getBounds(), { padding: [30, 30], maxZoom: 13 });
      $('distance').value = km.toFixed(2);
      applyingRoute = true;
      try {
        $('distance').dispatchEvent(new Event('input', { bubbles: true }));
      } finally {
        applyingRoute = false;
      }
      showResult(km, duration);
      notify('roadcost:route', { km, duration });
      try {
        localStorage.setItem(
          LAST_ROUTE_KEY,
          JSON.stringify({ km: km, duration: duration, date: Date.now() })
        );
      } catch (e) {}
      status('تم تحديث الحاسبة. مدة القيادة تقديرية دون بيانات مرور مباشرة.');
    } catch (e) {
      if (id === routeSeq)
        status(
          describeFailure(e, 'OSRM') +
            tr(
              '. لم نستخدم مسافة خط مستقيم ولم نغيّر المسافة في الحاسبة.',
              '. No straight-line estimate was used. Your planner distance is unchanged.'
            ),
          true
        );
    } finally {
      if (routeController === controller) {
        routeController = null;
        $('map-route-button').disabled = false;
      }
    }
  }
  function swap() {
    const previous = endpoints.start;
    endpoints.start = endpoints.end;
    endpoints.end = previous;
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
      if (
        p &&
        Number.isFinite(p.km) &&
        p.km > 0 &&
        (p.duration === null || Number.isFinite(p.duration))
      )
        showResult(p.km, p.duration, true);
    } catch (e) {}
  }
  function init() {
    window.addEventListener('roadcost:manual-distance', () => {
      // A route result sets this field programmatically; it is re-applied after the event.
      // User edits must cancel a pending response so it cannot overwrite their input.
      if (applyingRoute) return;
      invalidateRoute();
    });
    window.addEventListener('roadcost:clear-route', () => {
      endpoints.start = null;
      endpoints.end = null;
      ['start', 'end'].forEach((which) => {
        $('map-' + which + '-input').value = '';
        inputEdited(which);
        drawMarker(which);
      });
      invalidateRoute();
    });
    window.addEventListener('roadcost:language', () => {
      status(lastStatus, lastStatusError);
      if (lastResult) showResult(lastResult.km, lastResult.seconds, lastResult.cached);
      drawMarker('start');
      drawMarker('end');
    });
    $('map-section').addEventListener('toggle', () => {
      if ($('map-section').open) showMap();
    });
    $('map-gps').addEventListener('click', useGPS);
    $('map-swap').addEventListener('click', swap);
    $('map-route-button').addEventListener('click', route);
    document.querySelectorAll('[data-map-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        chooseMode(b.dataset.mapPick);
        status('اضغط على الخريطة لتحديد ' + (mode === 'start' ? 'الانطلاق.' : 'الوجهة.'));
      })
    );
    ['start', 'end'].forEach((which) => {
      $('map-' + which + '-search').addEventListener('click', () => searchPlace(which));
      $('map-' + which + '-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          searchPlace(which);
        }
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
