# Visitor analytics — Cloudflare Web Analytics

The public GitHub Pages app runs at `https://amerkallajo.github.io/taxi-fuel-calculator/`.
The lightweight `analytics.js` integration is installed **but disabled by default**.
It does not make an analytics request until a valid Cloudflare site token is configured.

## Enable tracking

1. Open [Cloudflare Web Analytics](https://dash.cloudflare.com/?to=/:account/analytics/web-analytics). A free Cloudflare account is required.
2. Choose **Add a site** and enter the hostname **`amerkallajo.github.io`** (not the path, not `github.com`). Choose the manually inserted JavaScript beacon option. Copy the **site token** (the value of `token` in the generated script).
3. Open [analytics.js](https://github.com/amerkallajo/taxi-fuel-calculator/blob/main/analytics.js) and replace `const SITE_TOKEN = '';` with `const SITE_TOKEN = 'your-cloudflare-site-token';` using the actual value. Commit to `main`.
4. After GitHub Pages deploys and visitors open the updated app online, check Cloudflare **Web Analytics** for views, visitors, countries, and referring sites. The data is not retroactive.
5. Verify in browser Network tools: `static.cloudflareinsights.com/beacon.min.js` should load, then a RUM request to `cloudflareinsights.com` should appear. Localhost and other hostnames intentionally do not send anything.

**Important:** The site token is a *public* identifier intended to be embedded in a webpage, not a Cloudflare API key. Never paste a Cloudflare API token or account password into this repository. If switching to a custom domain, update `PRODUCTION_HOST` in `analytics.js` and the Cloudflare hostname.

## Privacy, limits, and offline mode

- Cloudflare counts page views and estimates unique visitors with privacy-first, cookieless measurement. It may process browser/network metadata (including traffic origin). It **does not** read the app's locally stored vehicles, financial records, or GPS location from this integration.
- Only the main page URL is measured: this is an app with tabs on one page; navigating between tabs is **not** a new page view (`spa: false`). Browser blockers and offline sessions may not be counted.
- The beacon is only requested on `amerkallajo.github.io`, when a valid token is present and the client is online. A failure to load the beacon has no effect on core calculations or saved data.
- The `analytics.js` loader is in the offline application shell. The third-party beacon itself is never precached.
- GitHub repository **Insights → Traffic** counts repository visitors, not users of the published app.
- Do not use the Cloudflare traffic dashboard to claim the exact number of *people* who used the app; metrics are estimates and filtering can vary.

Official setup: https://developers.cloudflare.com/web-analytics/get-started/
