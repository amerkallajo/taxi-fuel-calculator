# Layout redesign · 13 November 2026

The repository was cloned from `amerkallajo/taxi-fuel-calculator`, starting at
`64695b2`, into the local `taxi-fuel-calculator` directory. Changes were prepared on
`codex/welcome-service-layout`. Publication is checked separately through the
GitHub Pages deployment and verification of the public assets against the commit.

## Findings and decisions

The previous entrance opened directly into the full trip planner. The inputs,
estimate, monthly forecast and favorites competed for attention, especially on
mobile. There was no welcome or creator introduction.

The new entrance is a brief Arabic welcome, with an immediately visible start
button, followed by four service destinations. Existing `#trip`, `#garage`,
`#journal` and `#finance` links still work. `#welcome` and `#services` are additive.
On mobile, inputs and results have separate keyboard-accessible tabs and a fixed button to switch between them. Monthly forecasts and favorite trips now use native disclosure controls. The
estimate follows the same light/dark palette as the surrounding page. The
mobile header and bottom navigation remain available inside the tools.

The visual direction is a calm everyday road companion: Alexandria for Arabic,
Segoe UI for Latin utility text and numbers, a blue accent `#315dcc`, ink
`#203657`, secondary text `#596b85`, a cool background `#f5f7fb`, and white panels.
The signature is an olive-lined road photograph paired with a short Arabic
welcome, followed by Amer's actual portrait and name. Motion is limited to a
brief entrance and interaction feedback, respecting reduced-motion settings.
The existing logo and locally hosted fonts are retained; no runtime library or
third-party font request was added.

## Syrian tank calculation

One tank is **20 liters**. The `kmtank` unit converts to canonical km/L by dividing
by 20. Display conversion multiplies km/L by 20. The canonical value is retained
when switching units, so display rounding does not feed back into calculations.

Example: 240 km/tank = 12 km/L. A 120 km trip consumes 10 liters. At an entered
price of 12,000 SYP/L, the trip fuel costs 120,000 SYP and a tank costs 240,000 SYP.
Tank fuel cost excludes trip extras and reserve, and no current fuel price is
implied. Arabic numerals, blank prices, zero prices and invalid efficiency inputs
continue to be handled explicitly. Drafts, preferences and backups support the
new unit while retaining the existing storage schema and km/L vehicle records.

## Privacy wording

The welcome says the calculator is free for everyone and calculations are not
saved on a platform server. It explicitly explains browser-local records and
optional external map searches. Existing local settings, vehicles, trip journal
and expense records are preserved. This is not a promise that no browser storage
is used. No analytics, account flow or new network service was introduced.

## Assets

- `assets/amer-kallajo.webp`: optimized copy of the portrait supplied by the user,
  with no generated alterations to the person. Original attachment remains intact.
- `assets/welcome-road.webp`: generated using the built-in image generation tool,
  then resized and encoded as WebP. It is an illustrative scene, not a claimed
  actual location. Final generation prompt:

> Generate a premium editorial photograph for the welcome screen of Road Cost,
> an Arabic fuel and journey calculator. Landscape 4:3 aspect ratio. A quiet,
> beautifully paved two-lane winding road through a Mediterranean countryside
> of soft green hills and olive trees, distant hazy blue mountains and a pale
> powder-blue sky, clear morning sunlight. A very small white compact car seen
> from behind in the middle distance, driving away along the curve. Refined soft
> natural palette, dominant powder blue and soft sage landscape, realistic gentle
> shadows, not oversaturated, calm hopeful everyday travel, no dramatic cliffs.
> Camera slightly elevated, road starts at bottom center and curves into the
> upper left distance, generous open sky upper third. Photographic, polished,
> tangible texture, no text, no lettering, no logos, no UI, no border. This is an
> illustrative road scene, not a factual location.

Both images and the new stylesheet are included in the version 16 offline shell.
Existing tests now enter the calculator using its preserved `#trip` URL; separate
welcome tests exercise the actual welcome-to-service-to-calculator journey.

## Verification

- `npm run check`: passed.
- `npm test`: 25 unit tests passed, plus the map regression harness.
- Browser suite: 54 passed, 3 intentionally skipped across desktop Chrome,
  mobile Chrome and mobile WebKit. The skipped worker/update combinations are
  covered by the supported Chromium projects. No physical iPhone was tested.
- New browser coverage includes welcome/service navigation and browser back,
  portrait loading, Arabic/English layouts at 320/390/768/1440px, tank inputs,
  reload persistence, mobile result tabs and their arrow-key operation.
- Chromium verifies real service-worker offline loading, including the welcome
  images, as well as complete-shell updates and preserved local records.
- Browser map tests mock external providers; their passing does not establish
  current upstream availability or real-world road conditions.
- Reviewed desktop/mobile screenshots in light and dark themes. Local image
  payloads total approximately 280 KiB. `git diff --check` passed.

The final shell identifier and new UI file URLs were advanced to version 16 so
an earlier local preview can update. Shell consistency was rechecked with the
unit suite after that version-only change.

Before publication, the unit suite also detected an intentionally inverted unit
validation condition in a disposable copy. The original source was unchanged.
The deployed-asset check includes the new stylesheet and both welcome images,
alongside the calculator, finance modules and existing core assets.
