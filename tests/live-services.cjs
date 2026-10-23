/* Live checks. No mocks: run sparingly and keep public-service rates low. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ORIGIN = 'https://amerkallajo.github.io';
const REFERER = ORIGIN + '/taxi-fuel-calculator/';
const headers = {
  Origin: ORIGIN,
  Referer: REFERER,
  'User-Agent': 'RoadCost-HealthCheck/1.0 (+https://github.com/amerkallajo/taxi-fuel-calculator)',
  Accept: 'application/json',
};
let failed = false;
async function check(name, url, verify) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const cors = response.headers.get('access-control-allow-origin');
    const body = await response.text();
    if (!response.ok) throw Error('HTTP ' + response.status + ' ' + body.slice(0, 120));
    const data = JSON.parse(body);
    const info = verify(data);
    // CORS headers are inspected, not enforced by Node; iPhone must still be tested.
    if (cors !== '*' && cors !== ORIGIN) throw Error('CORS header not usable from Pages: ' + cors);
    console.log('LIVE PASS', name, JSON.stringify({ cors, ...info }));
  } catch (error) {
    failed = true;
    console.error('LIVE FAIL', name, error.message);
  }
}
(async () => {
  for (const query of ['دمشق', 'حمص', 'ساحة الأمويين']) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    for (const [key, val] of Object.entries({
      q: query,
      format: 'jsonv2',
      limit: '7',
      addressdetails: '1',
      'accept-language': 'ar,en',
      viewbox: '35.0,37.5,42.5,32.0',
    }))
      url.searchParams.set(key, val);
    await check('Nominatim ' + query, url.href, (data) => {
      if (
        !Array.isArray(data) ||
        !data.some((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
      )
        throw Error('No valid coordinate results');
      return { results: data.length, first: data[0].display_name?.slice(0, 95) };
    });
    await sleep(1400); // Public Nominatim global limit: at most 1 request/second.
  }
  const photon = new URL('https://photon.komoot.io/api/');
  photon.searchParams.set('q', 'حمص');
  photon.searchParams.set('lang', 'default');
  photon.searchParams.set('limit', '7');
  await check('Photon default-language Arabic', photon.href, (data) => {
    if (!Array.isArray(data.features) || !data.features.length) throw Error('No features');
    return { results: data.features.length, name: data.features[0].properties?.name };
  });
  // Reproduce the legacy request and record its actual HTTP outcome.
  const oldPhoton = new URL('https://photon.komoot.io/api/');
  oldPhoton.searchParams.set('q', 'حمص');
  oldPhoton.searchParams.set('lang', 'ar');
  oldPhoton.searchParams.set('limit', '5');
  try {
    const res = await fetch(oldPhoton, { headers, signal: AbortSignal.timeout(12000) });
    console.log('LIVE DIAGNOSTIC Photon lang=ar:', res.status, (await res.text()).slice(0, 230));
  } catch (error) {
    console.log('LIVE DIAGNOSTIC Photon lang=ar unreachable:', error.message);
  }
  const osrm =
    'https://router.project-osrm.org/route/v1/driving/' +
    '36.291300,33.513800;36.716700,34.733300?overview=full&geometries=geojson&steps=false';
  await check('OSRM Damascus to Homs', osrm, (data) => {
    const r = data.code === 'Ok' && data.routes?.[0];
    if (
      !r ||
      !(r.distance > 0) ||
      !Array.isArray(r.geometry?.coordinates) ||
      r.geometry.coordinates.length < 2
    )
      throw Error('No valid driving route');
    return {
      km: Number((r.distance / 1000).toFixed(2)),
      minutes: Math.round(r.duration / 60),
      points: r.geometry.coordinates.length,
    };
  });
  if (failed) process.exitCode = 1;
})();
