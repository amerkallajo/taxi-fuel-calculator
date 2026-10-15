/* Browser integration in WebKit (Safari engine), mocked network/GPS.
   This does NOT substitute for a physical iPhone test. */
const {webkit} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await webkit.launch({headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,
    hasTouch:true,locale:'ar-SY'});
  page.on('pageerror', e => console.log('WEBKIT PAGE ERROR', e.message));
  page.on('requestfailed', r => console.log('WEBKIT REQUEST FAILED', r.url(), r.failure()?.errorText));
  await page.addInitScript(() => {
    window.localStorage.setItem('taxi-fuel-offline-v1',
      JSON.stringify({efficiency:'10',price:'12000',currency:'ل.س'}));
    const layer = {addTo(){return this;},bindTooltip(){return this;},
      getBounds(){return [[33.5,36.3],[34.7,36.7]];}};
    window.L = {
      map(){window.__roadMockMap = {on(type,fn){if(type==='click')this.pick=fn;return this;},
        setView(){return this;},fitBounds(){return this;},removeLayer(){},
        invalidateSize(){}};return window.__roadMockMap;},
      tileLayer(){return layer;},circleMarker(){return layer;},
      polyline(){return layer;},latLngBounds(points){return points;}
    };
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      getCurrentPosition(ok){ok({coords:{latitude:33.5,longitude:36.3}});}
    }});
  });
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    const u = new URL(route.request().url());
    const q=u.searchParams.get('q');
    const result=q.includes('حمص')
      ? [{display_name:'حمص، سوريا',lat:'34.7',lon:'36.7'}] : [];
    route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
  });
  await page.route('https://router.project-osrm.org/**', route =>
    route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},body:JSON.stringify({
        code:'Ok',routes:[{distance:150000,duration:7200,geometry:{
          type:'LineString',coordinates:[[36.3,33.5],[36.7,34.7]]}}]
      })})
  );
  try {
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#map-section summary').click();
    await page.locator('#map-gps').click();
    await page.locator('#map-end-input').fill('حمص');
    await page.locator('#map-end-search').click();
    await page.locator('#map-end-results button').first().waitFor();
    await page.locator('#map-route-button').click();
    assert.equal(await page.locator('#distance').inputValue(), '20',
      'Must not route until a search result is selected');
    await page.locator('#map-end-results button').first().click();
    await page.locator('#map-route-button').click();
    console.log('WEBKIT DEBUG', JSON.stringify(await page.evaluate(() => ({
      start:document.querySelector('#map-start-input').value,
      end:document.querySelector('#map-end-input').value,
      status:document.querySelector('#map-status').textContent,
      distance:document.querySelector('#distance').value
    }))));
    await page.waitForFunction(() => document.querySelector('#distance').value==='150.00',
      {timeout:15000});
    assert.match(await page.locator('#consumption').innerText(), /15/);
    await page.waitForFunction(() => document.querySelector('#cost-number').textContent.includes('180,000'));
    await page.locator('#roundtrip').check();
    await page.waitForFunction(() => document.querySelector('#cost-number').textContent.includes('360,000'));
    const settings=await page.evaluate(() => JSON.parse(localStorage.getItem('taxi-fuel-offline-v1')));
    assert.equal(settings.efficiency,'10');
    assert.equal(settings.price,'12000');
    console.log('WEBKIT PASS: iPhone-sized viewport, GPS permission stub, Arabic search result, explicit selection, OSRM, fuel, round trip, storage');
  } finally {
    await browser.close();
  }
})().catch(e => {console.error(e);process.exitCode=1;});
