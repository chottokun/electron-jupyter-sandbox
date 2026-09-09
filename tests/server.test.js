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

test('startLocalServer injects categorized preload packages into jupyter-lite.json response', async () => {
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

  const configPath = path.join(tmpDir, 'config.json');
  saveConfig(configPath, {
    preloadPackages: ['japanize-noto-sans-jp', 'matplotlib', 'pandas', 'openpyxl']
  });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59900);

  try {
    const resData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/jupyter-lite.json`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    const settingsOverrides = resData['jupyter-config-data']?.settingsOverrides;
    assert.ok(settingsOverrides);

    const kernelSettings = settingsOverrides['@jupyterlite/pyodide-kernel-extension:kernel'];
    assert.ok(kernelSettings);

    // Pyodide標準パッケージ (matplotlib, pandas)
    assert.deepStrictEqual(kernelSettings.loadPyodideOptions.packages, ['matplotlib', 'pandas']);

    // 独自wheelパッケージ (japanize-noto-sans-jp, openpyxl)
    assert.deepStrictEqual(kernelSettings.piplitePreloadPackages, ['japanize-noto-sans-jp', 'openpyxl']);

  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
