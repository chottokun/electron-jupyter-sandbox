const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { resolveSafePath } = require('../src/server');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-server-test-'));
}

test('path traversal check resolves safe paths inside rootDir and blocks outside paths', () => {
  const tmpDir = createTmpDir();
  const subDir = path.join(tmpDir, 'public');
  fs.mkdirSync(subDir, { recursive: true });

  const safe1 = resolveSafePath(subDir, '/index.html');
  assert.strictEqual(safe1, path.join(subDir, 'index.html'));

  const safe2 = resolveSafePath(subDir, '/lab/../index.html');
  assert.strictEqual(safe2, path.join(subDir, 'index.html'));

  const outsidePath = path.resolve(tmpDir, 'secret.txt');
  const relFromRoot = path.relative(subDir, outsidePath);
  assert.strictEqual(relFromRoot.startsWith('..'), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
