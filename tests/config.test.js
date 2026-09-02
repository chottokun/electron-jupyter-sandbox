const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadConfig, saveConfig, getResolvedDataDir, isExternalNetworkAllowed, setExternalNetworkAllowed } = require('../src/config');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-config-test-'));
}

test('loadConfig returns empty object when config.json does not exist', () => {
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');

  assert.deepStrictEqual(loadConfig(configFilePath), {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('saveConfig and loadConfig properly persist configuration', () => {
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');

  saveConfig(configFilePath, { dataDir: './custom_data' });
  assert.deepStrictEqual(loadConfig(configFilePath), { dataDir: './custom_data' });

  saveConfig(configFilePath, { anotherSetting: 123 });
  assert.deepStrictEqual(loadConfig(configFilePath), { dataDir: './custom_data', anotherSetting: 123 });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('getResolvedDataDir resolves relative, absolute and default paths correctly', () => {
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');

  // Default
  assert.strictEqual(getResolvedDataDir(tmpDir, configFilePath), path.join(tmpDir, 'data'));

  // Relative
  saveConfig(configFilePath, { dataDir: 'my_relative_data' });
  assert.strictEqual(getResolvedDataDir(tmpDir, configFilePath), path.resolve(tmpDir, 'my_relative_data'));

  // Absolute
  const absPath = path.resolve('/tmp/absolute_data');
  saveConfig(configFilePath, { dataDir: absPath });
  assert.strictEqual(getResolvedDataDir(tmpDir, configFilePath), absPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('isExternalNetworkAllowed and setExternalNetworkAllowed behavior in Strict vs Configurable mode', () => {
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');

  // 1. Strict モード（デフォルト）: config.json に true が保存されていても常に false
  delete process.env.ALLOW_NETWORK_CONFIG;
  setExternalNetworkAllowed(configFilePath, true);
  assert.strictEqual(isExternalNetworkAllowed(configFilePath), false);

  // 2. Configurable モード: ALLOW_NETWORK_CONFIG = 'true' の時は config.json の値が反映される
  process.env.ALLOW_NETWORK_CONFIG = 'true';
  assert.strictEqual(isExternalNetworkAllowed(configFilePath), true);

  setExternalNetworkAllowed(configFilePath, false);
  assert.strictEqual(isExternalNetworkAllowed(configFilePath), false);

  // クリーンアップ
  delete process.env.ALLOW_NETWORK_CONFIG;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

