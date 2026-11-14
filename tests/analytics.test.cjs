const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('analytics.js', 'utf8');

function run(token, hostname = 'amerkallajo.github.io') {
  const injected = [];
  const source = script.replace("const SITE_TOKEN = '';", `const SITE_TOKEN = '${token}';`);
  assert.notEqual(source, script, 'token setting must remain discoverable');
  const document = {
    createElement(tag) {
      return {
        tag,
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
    },
    head: {
      appendChild(node) {
        injected.push(node);
      },
    },
  };

  vm.runInNewContext(source, { document, location: { hostname } });
  return injected;
}

test('visits are not tracked until Cloudflare token is configured', () => {
  assert.equal(run('').length, 0);
  assert.equal(run('PASTE_TOKEN_HERE').length, 0);
});

test('valid token activates Cloudflare only on the public production hostname', () => {
  const token = '0123456789abcdef0123456789abcdef';
  assert.equal(run(token, 'localhost').length, 0);
  assert.equal(run(token, 'example.com').length, 0);
  const beacon = run(token);
  assert.equal(beacon.length, 1);
  assert.equal(beacon[0].type, 'module');
  assert.equal(beacon[0].src, 'https://static.cloudflareinsights.com/beacon.min.js');
  assert.deepEqual(JSON.parse(beacon[0].attributes['data-cf-beacon']), {
    token,
    spa: false,
  });
});
