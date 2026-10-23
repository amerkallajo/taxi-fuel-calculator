# Road Cost 4 — audit and implementation direction

Audited 23 October 2026, baseline `74822ac7`. The repository had 44 commits, no issues returned by GitHub, a successful legacy Pages deployment, and no local source checkout before fetching `main`.

## Existing application

Static HTML, CSS and dependency-free JavaScript. A narrow, dark-only calculator correctly computes distance / km-per-liter × price, handles Arabic/Persian digits, remembers `taxi-fuel-offline-v1`, and doubles distance for returns. Optional Leaflet loads from a CDN. Nominatim/Photon searches are explicit, OSRM routing uses selected coordinates, and a separate route key stores only distance/duration. No straight-line fallback. The baseline map regression test passes.

The live site was inspected in Chromium and captured before changes. The manual workflow works; maps rely on external connectivity. Existing tests cover map logic through a fake DOM, a WebKit mocked journey, external probes and deployed asset equality. No pure calculation suite, package lock, browser layout coverage, real service-worker lifecycle test, vehicle/history data model, backup or localization.

## Findings and decisions

- Keep vanilla JavaScript: a framework/build migration would add cost without helping this static private tool.
- Separate pure arithmetic and versioned storage validation from UI. Never round intermediates. Preserve the old settings key, migrate by copying, and validate backups before applying them.
- Replace the 590px dark-only layout with a responsive cockpit: cobalt, ink, cool white, soft blue and a restrained amber accent; local Arabic typography, calm route diagram, dedicated trip/vehicle/journal navigation.
- Daily value: vehicle comparisons, passenger splitting, optional fuel reserve and extra fees, recurring-trip forecasts, favorites, currency-separated saved-estimate statistics, CSV and JSON backup.
- Manual distance and road distance must remain visibly distinct. Return trips double the outbound distance; they are not separately routed. Routing is not a road-safety or live-traffic service.
- Cache only an explicit same-origin app shell. Do not cache external APIs or bulk-download tiles. Avoid the old unbounded navigation-query caching. A waiting worker activates when the user accepts; persist drafts before reload. Existing old workers may force one transition reload.
- Keep explicit search, result selection, local query cache and throttling; expose providers in configuration. Public demo services have no SLA and Nominatim's aggregate limit cannot be enforced by a static site. Document the scaling boundary honestly.
- No accounts, analytics, API secrets or paid dependencies. Data stays in this browser unless the user exports/shares it. GPS only on request. Coordinates remain session-only.

## Validation strategy

Node calculation, migration/backup and worker lifecycle tests; retained map regression tests; Chromium and WebKit mobile/desktop journeys; real Chromium offline cache/reload and worker update; external probes reported separately from deterministic checks; post-push Pages commit and asset hashes. Safari engine emulation is never described as physical iPhone testing.
