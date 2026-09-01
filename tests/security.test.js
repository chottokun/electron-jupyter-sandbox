const test = require('node:test');
const assert = require('node:assert');
const { isAllowedUrl } = require('../src/security');

test('security module: URL filtering permits local/internal and blocks external requests', () => {
  // Allowed local and internal requests
  assert.strictEqual(isAllowedUrl('http://127.0.0.1:58888/lab/index.html'), true);
  assert.strictEqual(isAllowedUrl('http://localhost:11434/api/generate'), true);
  assert.strictEqual(isAllowedUrl('blob:http://127.0.0.1:58888/1234-5678'), true);
  assert.strictEqual(isAllowedUrl('data:text/plain;base64,SGVsbG8='), true);
  assert.strictEqual(isAllowedUrl('devtools://devtools/bundled/inspector.html'), true);

  // Blocked external requests
  assert.strictEqual(isAllowedUrl('https://google.com'), false);
  assert.strictEqual(isAllowedUrl('http://example.com/api'), false);
  assert.strictEqual(isAllowedUrl('https://pypi.org/simple'), false);
  assert.strictEqual(isAllowedUrl('invalid-url-string'), false);
});
