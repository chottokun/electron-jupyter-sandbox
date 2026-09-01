const test = require('node:test');
const assert = require('node:assert');
const { isAllowedUrl, applyNetworkFilter } = require('../src/security');

test('isAllowedUrl allows internal and local requests, blocks external requests', () => {
  assert.strictEqual(isAllowedUrl('http://127.0.0.1:58888/lab/index.html'), true);
  assert.strictEqual(isAllowedUrl('http://localhost:11434/api/generate'), true);
  assert.strictEqual(isAllowedUrl('jupyter://app/index.html'), true);
  assert.strictEqual(isAllowedUrl('devtools://devtools/bundled/inspector.html'), true);
  assert.strictEqual(isAllowedUrl('blob:http://127.0.0.1:58888/123-456'), true);
  assert.strictEqual(isAllowedUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), true);

  assert.strictEqual(isAllowedUrl('https://example.com'), false);
  assert.strictEqual(isAllowedUrl('http://8.8.8.8'), false);
  assert.strictEqual(isAllowedUrl('invalid-url'), false);
});

test('applyNetworkFilter attaches listener and triggers callbacks correctly', () => {
  let beforeRequestCallback = null;
  const mockSession = {
    webRequest: {
      onBeforeRequest: (cb) => {
        beforeRequestCallback = cb;
      }
    }
  };

  const loggedMessages = [];
  const mockLogger = (cat, msg) => {
    loggedMessages.push({ cat, msg });
  };

  applyNetworkFilter(mockSession, mockLogger);
  assert.strictEqual(typeof beforeRequestCallback, 'function');

  // Test allowed URL
  let resResult = null;
  beforeRequestCallback({ url: 'http://127.0.0.1:58888/' }, (res) => { resResult = res; });
  assert.deepStrictEqual(resResult, { cancel: false });

  // Test blocked URL
  beforeRequestCallback({ url: 'https://evil.com/leak' }, (res) => { resResult = res; });
  assert.deepStrictEqual(resResult, { cancel: true });
  assert.strictEqual(loggedMessages.length, 1);
  assert.strictEqual(loggedMessages[0].cat, 'SECURITY BLOCKED');
});
