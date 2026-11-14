/* Cloudflare Web Analytics is disabled until the site owner sets a token.
 * This public site token is not an API secret. No visitor data is sent while empty.
 * See docs/ANALYTICS.md for setup and privacy considerations.
 */
(() => {
  'use strict';

  const SITE_TOKEN = '';
  const PRODUCTION_HOST = 'amerkallajo.github.io';

  // Exclude local previews and tests, and never contact Cloudflare without a token.
  if (location.hostname !== PRODUCTION_HOST || !/^[a-f0-9]{32}$/i.test(SITE_TOKEN)) {
    return;
  }

  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: SITE_TOKEN, spa: false }));
  document.head.appendChild(beacon);
})();
