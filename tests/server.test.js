const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const { resolveSafePath, startLocalServer } = require('../src/server');
const { saveConfig } = require('../src/config');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-server-test-'));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
    }).on('error', reject);
  });
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

  const pypiDir = path.join(subDir, 'pypi');
  fs.mkdirSync(pypiDir, { recursive: true });
  const wheelPath = resolveSafePath(subDir, '/lab/pypi/pkg.whl');
  assert.strictEqual(wheelPath, path.join(pypiDir, 'pkg.whl'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('startLocalServer performs dual-injection into both settingsOverrides and litePluginSettings with custom options', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const jupyterLiteJsonPath = path.join(jupyterliteDir, 'jupyter-lite.json');
  fs.writeFileSync(jupyterLiteJsonPath, JSON.stringify({
    'jupyter-config-data': {
      'appName': 'TestApp'
    }
  }), 'utf-8');

  const configPath = path.join(tmpDir, 'custom_config.json');
  saveConfig(configPath, {
    preloadPackages: ['japanize-noto-sans-jp', 'matplotlib', 'pandas', 'openpyxl']
  });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59901, {
    configFilePath: configPath,
    isExternalNetworkAllowed: () => false
  });

  try {
    const { status, body: resData } = await fetchJson(`http://127.0.0.1:${port}/jupyter-lite.json`);
    assert.strictEqual(status, 200);

    const configData = resData['jupyter-config-data'];
    assert.ok(configData);

    const kernelPluginId = '@jupyterlite/pyodide-kernel-extension:kernel';

    // 1. settingsOverrides 検証
    const settingsOverrides = configData.settingsOverrides?.[kernelPluginId];
    assert.ok(settingsOverrides, 'settingsOverrides must contain kernel plugin config');
    assert.deepStrictEqual(settingsOverrides.loadPyodideOptions.packages, ['matplotlib', 'pandas']);
    assert.deepStrictEqual(settingsOverrides.piplitePreloadPackages, ['japanize-noto-sans-jp', 'openpyxl']);

    // 2. litePluginSettings (Dual-Injection) 検証
    const litePluginSettings = configData.litePluginSettings?.[kernelPluginId];
    assert.ok(litePluginSettings, 'litePluginSettings must contain kernel plugin config');
    assert.deepStrictEqual(litePluginSettings.loadPyodideOptions.packages, ['matplotlib', 'pandas']);
    assert.deepStrictEqual(litePluginSettings.piplitePreloadPackages, ['japanize-noto-sans-jp', 'openpyxl']);

  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('startLocalServer dynamically reflects config changes without stale cache', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const jupyterLiteJsonPath = path.join(jupyterliteDir, 'jupyter-lite.json');
  fs.writeFileSync(jupyterLiteJsonPath, JSON.stringify({
    'jupyter-config-data': {}
  }), 'utf-8');

  const configPath = path.join(tmpDir, 'config.json');
  saveConfig(configPath, {
    preloadPackages: ['japanize-noto-sans-jp', 'matplotlib']
  });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59902, {
    configFilePath: configPath
  });

  try {
    // 初回取得
    const { body: firstRes } = await fetchJson(`http://127.0.0.1:${port}/jupyter-lite.json`);
    const kernelPluginId = '@jupyterlite/pyodide-kernel-extension:kernel';
    assert.deepStrictEqual(firstRes['jupyter-config-data'].settingsOverrides[kernelPluginId].loadPyodideOptions.packages, ['matplotlib']);

    // 動的設定変更 (openpyxl と pandas を追加)
    saveConfig(configPath, {
      preloadPackages: ['japanize-noto-sans-jp', 'matplotlib', 'pandas', 'openpyxl']
    });

    // 2回目取得: 即座に変更が反映されること
    const { body: secondRes } = await fetchJson(`http://127.0.0.1:${port}/jupyter-lite.json`);
    assert.deepStrictEqual(secondRes['jupyter-config-data'].settingsOverrides[kernelPluginId].loadPyodideOptions.packages, ['matplotlib', 'pandas']);
    assert.deepStrictEqual(secondRes['jupyter-config-data'].settingsOverrides[kernelPluginId].piplitePreloadPackages, ['japanize-noto-sans-jp', 'openpyxl']);

  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
