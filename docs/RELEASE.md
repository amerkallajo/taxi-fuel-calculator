# Road Cost 4.0 — delivery report

23 October 2026. Baseline: `74822ac7`. Repository and public URL preserved.

## Product vision

Road Cost is now a private road companion: plan a trip, keep the vehicles you actually use, and build a useful journal of saved budgets. A favorite is a reusable distance, recalculated with the current vehicle and fuel price. No sign-up, tracking, backend, secret key or paid API was introduced.

## Before / after

| Area        | Before                                             | Delivered                                                                                                                       |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Interface   | Narrow, dark-only calculator                       | Responsive workspace, light/dark, Arabic RTL and English LTR, mobile navigation and persistent total                            |
| Calculation | Distance, km/L, price, return toggle               | Both consumption units, both fuel types, passenger split, fuel cushion, extras and monthly/yearly outlook                       |
| Vehicles    | One remembered efficiency/price                    | 20 editable profiles, quick application, fuel comparisons grouped by currency                                                   |
| Saved trips | Last road distance/duration only                   | 500 named estimates, favorites, month/currency filters, six-month chart, explicit deletion                                      |
| Portability | Copy result                                        | Native share/copy, filtered UTF-8 CSV, validated JSON backup/restore with preview                                               |
| Privacy     | Local preferences, session coordinates             | Same privacy model; saved trip snapshots strip coordinates, no automatic history                                                |
| Maps        | CDN Leaflet, explicit search and routing           | Vendored Leaflet, retained providers, serialized requests, stale response cancellation, road/manual provenance                  |
| PWA         | Eager activation/reload, broad runtime cache       | Explicit bounded shell, complete-install requirement, accepted updates with draft preservation                                  |
| Testing     | Fake-DOM map regression and one mocked WebKit flow | Pure calculation/schema/worker tests, desktop/mobile journeys, real offline and update lifecycle, expanded deployed byte checks |

## What is implemented

- Accurate fuel arithmetic without intermediate rounding for manual inputs; Arabic/Persian/English digits; explicit price and field validation. The road distance transferred from OSRM is rounded to 0.01 km, as shown in the input.
- Budget = fuel + optional fuel-only percentage cushion + whole-trip extra fees. Passenger count includes the driver. Return doubles outbound distance once. Switching display units retains the canonical efficiency rather than repeatedly rounding it.
- Saved estimates and forecasts clearly distinguish plans from actual expenses. Currencies never convert or aggregate together. Reusing a trip in another currency resets extras rather than carrying over an incompatible amount.
- Saved cars, edit/delete, same-trip fuel comparison and one-tap application. Deleting a car leaves previously saved trip estimates intact.
- A six-month chart and month/currency/favorite filtering. CSV exports the displayed subset. JSON backup covers all preferences, vehicles and trips; malformed records are rejected before replacement.
- Kept the original storage key and migrated by copying. Corruption recovery and storage-full messages. No silent deletion when the journal reaches capacity. Session draft survives reload and accepted updates.
- Local Arabic variable font, locally hosted Leaflet and licenses, reduced-motion support, focus styles, native accessible dialogs, keyboard navigation and meaningful empty/error states.
- Map errors preserve manual calculation; GPS is requested only by pressing its button. No straight-line fallback. A pending road response cannot replace a newer manual distance. External map calls remain outside the worker cache.

## Verification

| Check                                | Actual result                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript syntax                    | Pass: core, app, map and worker                                                                                                                                                          |
| Node tests                           | 18 passed: arithmetic, input parsing, migration, malformed data, CSV, explicit cache and worker lifecycle policy                                                                         |
| Retained map regression              | Pass: explicit Arabic search selection, GPS, route/fuel, return, outage, map click, NoRoute, offline and preferences                                                                     |
| Browser journeys                     | All 33 applicable scenarios passed across desktop/mobile Chrome and mobile WebKit; 3 intentional skips for lifecycle cases covered only in Chromium                                      |
| Update lifecycle                     | Real HTTP-served worker transition, waiting until acceptance, reload, draft and journal retained, old cache removed. Retested three times after fixing the test's reload synchronization |
| Offline                              | Actual Chromium worker + network disabled + reload; calculations and journal remain usable; new map request reports the connectivity requirement                                         |
| Responsive / locales                 | 320, 360, 390, 768 and 1440px checked for horizontal overflow; LTR/RTL navigation and dark/light toggles checked                                                                         |
| Real providers (not mocks)           | Nominatim Damascus, Homs, Umayyad Square; Photon Arabic query with default response language; OSRM route and CORS headers all passed                                                     |
| Browser live integration (not mocks) | Real Damascus/Homs results selected, map tiles loaded, road drawn, 160.59 km transferred and corresponding fuel estimate displayed                                                       |
| Dependency audit                     | Zero vulnerabilities reported; no runtime npm dependencies                                                                                                                               |
| Visual review                        | Desktop, mobile, both themes, English, garage and journal screenshots reviewed; no JavaScript page errors in the reviewed sequence                                                       |

The independent Node route probe returned 162.69 km / 116 minutes for its fixed coordinates. The browser's 160.59 km route used the actual selected geocoder results, so it is a different endpoint pair. Fuel prices in test fixtures and screenshots are illustrative user-entered values, not current price claims.

The three skipped cases are the update test on mobile Chromium, and offline/update worker tests on WebKit. Chromium desktop covers both real lifecycle scenarios, mobile Chromium also covers offline reload, and WebKit covers calculation, migration, UI, maps, denied GPS, NoRoute, outages and stale responses. WebKit is an engine test on Windows, not a physical iPhone test.

Local evidence: `output/playwright/before.png`, `final-desktop-light.png`, `mobile-viewport-light.png`, `mobile-viewport-dark.png`, `final-mobile-light.png`, `final-mobile-dark.png`, `live-routing-local.png` and garage/journal/English captures. These generated local files are intentionally excluded from the public repository. `playwright-report/` and `test-results/` contain the latest test run; CI uploads its browser report separately.

## Architecture and rollout

Kept static HTML/CSS/JavaScript and GitHub Pages. `core.js` owns calculations and schemas, `app.js` the UI/storage/update flow, `map.js` geocoding and routing, and `sw.js` an explicit versioned same-origin shell. npm is only for development and testing. Source files are formatted, dependency versions locked, binary/font licenses included, and line endings normalized for deployed byte equality.

Push targets the existing `main` branch and existing legacy GitHub Pages source. The workflow independently runs deterministic tests, Chromium/WebKit journeys, upstream diagnostics and SHA-256 equality of 10 public assets. Deployment status and the final commit SHA are reported in the delivery message after live verification; a local test pass alone is not considered a deployment.

## Known limits

- Nominatim's aggregate one-request-per-second limit cannot be enforced by GitHub Pages across users. Current explicit-search/local throttling is suitable only for very low traffic; expansion needs a dedicated provider or centrally limited/self-hosted search. Public geocoding, routing and map services have no availability guarantee. See the policy links in README.
- New routes and map/search data require internet. This is not an offline navigation engine, a live traffic service or a verification of road safety/opening.
- Return mileage is twice outbound mileage; maintenance/depreciation are only included if the user enters an extra fee. Forecast prices do not adjust for future changes.
- Data is private to this browser, with no cloud synchronization. Export JSON before clearing site data or changing devices. Session drafts are not durable trip records.
- No physical iPhone, Android hardware, field-driving or old-phone performance test was performed. Browser viewport/emulation checks are not those tests.
- Multi-stop routing, alternative-route comparison, fill-up/odometer logs, maintenance reminders and cloud sync are not part of this release. No placeholder UI advertises them as working.
