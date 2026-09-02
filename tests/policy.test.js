const test = require('node:test');
const assert = require('node:assert');
const { isNetworkConfigurable, getSecurityMode, SECURITY_MODES } = require('../src/policy');

test('policy defaults to STRICT when ALLOW_NETWORK_CONFIG is not set', () => {
  delete process.env.ALLOW_NETWORK_CONFIG;
  assert.strictEqual(isNetworkConfigurable(), false);
  assert.strictEqual(getSecurityMode(), SECURITY_MODES.STRICT);
});

test('policy switches to CONFIGURABLE when ALLOW_NETWORK_CONFIG is "true"', () => {
  process.env.ALLOW_NETWORK_CONFIG = 'true';
  assert.strictEqual(isNetworkConfigurable(), true);
  assert.strictEqual(getSecurityMode(), SECURITY_MODES.CONFIGURABLE);

  // cleanup
  delete process.env.ALLOW_NETWORK_CONFIG;
});
