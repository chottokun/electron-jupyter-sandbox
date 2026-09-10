const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  DEFAULT_PRELOAD_PACKAGES,
  isValidPackageName,
  normalizePackageName,
  getLocalWheelPackageSet,
  loadConfig,
  saveConfig,
  getResolvedDataDir,
  isExternalNetworkAllowed,
  setExternalNetworkAllowed,
  resetRuntimeNetworkAllowed,
  getPreloadPackages,
  isPreloadPackageEnabled,
  setPreloadPackageEnabled,
  getCategorizedPreloadPackages
} = require('../src/config');


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
  resetRuntimeNetworkAllowed();
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');

  // 1. Strict モード（デフォルト）: config.json に true が保存されていても常に false
  delete process.env.ALLOW_NETWORK_CONFIG;
  setExternalNetworkAllowed(configFilePath, true);
  assert.strictEqual(isExternalNetworkAllowed(configFilePath), false);

  // 2. Configurable モード: ALLOW_NETWORK_CONFIG = 'true' の時は config.json の値が反映される
  process.env.ALLOW_NETWORK_CONFIG = 'true';
  resetRuntimeNetworkAllowed();
  setExternalNetworkAllowed(configFilePath, true);
  assert.strictEqual(isExternalNetworkAllowed(configFilePath), true);

  setExternalNetworkAllowed(configFilePath, false);
  assert.strictEqual(isExternalNetworkAllowed(configFilePath), false);

  // クリーンアップ
  delete process.env.ALLOW_NETWORK_CONFIG;
  resetRuntimeNetworkAllowed();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('getPreloadPackages, isPreloadPackageEnabled, and setPreloadPackageEnabled behavior', () => {
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');

  // 1. デフォルト値の検証
  assert.deepStrictEqual(getPreloadPackages(configFilePath), DEFAULT_PRELOAD_PACKAGES);
  assert.strictEqual(isPreloadPackageEnabled(configFilePath, 'japanize-noto-sans-jp'), true);
  assert.strictEqual(isPreloadPackageEnabled(configFilePath, 'pandas'), false);

  // 2. パッケージの有効化
  setPreloadPackageEnabled(configFilePath, 'pandas', true);
  assert.strictEqual(isPreloadPackageEnabled(configFilePath, 'pandas'), true);
  assert.ok(getPreloadPackages(configFilePath).includes('pandas'));

  // 3. パッケージの無効化
  setPreloadPackageEnabled(configFilePath, 'matplotlib', false);
  assert.strictEqual(isPreloadPackageEnabled(configFilePath, 'matplotlib'), false);
  assert.strictEqual(getPreloadPackages(configFilePath).includes('matplotlib'), false);

  // 4. 重複追加の防止
  setPreloadPackageEnabled(configFilePath, 'pandas', true);
  const currentList = getPreloadPackages(configFilePath);
  const pandasCount = currentList.filter(p => p === 'pandas').length;
  assert.strictEqual(pandasCount, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('isValidPackageName validates package names correctly and prevents injection', () => {
  assert.strictEqual(isValidPackageName('matplotlib'), true);
  assert.strictEqual(isValidPackageName('japanize-noto-sans-jp'), true);
  assert.strictEqual(isValidPackageName('python_docx'), true);
  assert.strictEqual(isValidPackageName('a'), true);

  // 異常系・インジェクション攻撃文字列の除外
  assert.strictEqual(isValidPackageName(''), false);
  assert.strictEqual(isValidPackageName('invalid;import os'), false);
  assert.strictEqual(isValidPackageName('pkgName"'), false);
  assert.strictEqual(isValidPackageName('-invalid'), false);
  assert.strictEqual(isValidPackageName('invalid-'), false);
  assert.strictEqual(isValidPackageName(null), false);
  assert.strictEqual(isValidPackageName(123), false);
});

test('normalizePackageName normalizes package names', () => {
  assert.strictEqual(normalizePackageName('Japanize_Noto_Sans_JP'), 'japanize-noto-sans-jp');
  assert.strictEqual(normalizePackageName('Python.Docx'), 'python-docx');
});

test('getCategorizedPreloadPackages handles dynamic manifest and sanitizes invalid names', () => {
  const tmpDir = createTmpDir();
  const configFilePath = path.join(tmpDir, 'config.json');
  const customManifestPath = path.join(tmpDir, 'manifest.json');

  fs.writeFileSync(customManifestPath, JSON.stringify({
    packages: {
      'custom-local-pkg': { name: 'custom-local-pkg' }
    }
  }), 'utf-8');

  saveConfig(configFilePath, {
    preloadPackages: [
      'custom-local-pkg',
      'matplotlib',
      'invalid;package',
      'japanize-noto-sans-jp'
    ]
  });

  const categorized = getCategorizedPreloadPackages(configFilePath, customManifestPath);
  assert.deepStrictEqual(categorized.pyodidePackages, ['matplotlib', 'japanize-noto-sans-jp']);
  assert.deepStrictEqual(categorized.piplitePackages, ['custom-local-pkg']);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
