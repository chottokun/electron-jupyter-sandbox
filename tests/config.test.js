const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig, saveConfig, getResolvedDataDir } = require('../src/config');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-config-'));
}

test('config module: loadConfig returns empty object when file missing', () => {
  const tmpDir = createTempDir();
  const config = loadConfig(tmpDir);
  assert.deepStrictEqual(config, {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('config module: saveConfig updates config.json and getResolvedDataDir resolves paths', () => {
  const tmpDir = createTempDir();

  // Save relative config
  const ok = saveConfig(tmpDir, { dataDir: 'custom_data' });
  assert.strictEqual(ok, true);

  const loaded = loadConfig(tmpDir);
  assert.strictEqual(loaded.dataDir, 'custom_data');

  const resolvedRelative = getResolvedDataDir(tmpDir);
  assert.strictEqual(resolvedRelative, path.join(tmpDir, 'custom_data'));

  // Absolute path
  const absPath = path.join(os.tmpdir(), 'absolute_data');
  saveConfig(tmpDir, { dataDir: absPath });
  const resolvedAbs = getResolvedDataDir(tmpDir);
  assert.strictEqual(resolvedAbs, absPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
