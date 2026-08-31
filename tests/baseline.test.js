const test = require('node:test');
const assert = require('node:assert');

test('baseline environment check', () => {
  assert.strictEqual(1 + 1, 2);
});
