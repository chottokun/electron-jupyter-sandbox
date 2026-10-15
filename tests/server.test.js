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

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        if (body && res.headers['content-type']?.includes('application/json')) {
          try { json = JSON.parse(body); } catch (e) {}
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json || body });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
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

test('startLocalServer serves static files with MIME types and security headers, and handles 404/403', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(jupyterliteDir, 'style.css'), 'body { margin: 0; }', 'utf-8');

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59904, {
    isExternalNetworkAllowed: () => false
  });

  try {
    // 1. Static file success
    const resCss = await fetchJson(`http://127.0.0.1:${port}/style.css`);
    assert.strictEqual(resCss.status, 200);
    assert.strictEqual(resCss.headers['content-type'], 'text/css; charset=utf-8');
    assert.ok(resCss.headers['content-security-policy']);
    assert.strictEqual(resCss.headers['cross-origin-opener-policy'], 'same-origin');
    assert.strictEqual(resCss.headers['cross-origin-embedder-policy'], 'credentialless');

    // 2. 404 Not Found
    const res404 = await fetchJson(`http://127.0.0.1:${port}/nonexistent.js`);
    assert.strictEqual(res404.status, 404);

    // 3. Safe path resolution prevents escaping root dir (file inside root is sought, resulting in 404 if not found)
    const resTraverse = await fetchJson(`http://127.0.0.1:${port}/..%2f..%2fsecret.txt`);
    assert.strictEqual(resTraverse.status, 404);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleContentsApi handles OPTIONS preflight, errors, and checkpoints', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59905);

  try {
    // 1. OPTIONS preflight
    const resOpt = await fetchJson(`http://127.0.0.1:${port}/api/contents/sample.txt`, { method: 'OPTIONS' });
    assert.strictEqual(resOpt.status, 200);
    assert.strictEqual(resOpt.headers['access-control-allow-origin'], '*');
    assert.ok(resOpt.headers['access-control-allow-methods']);

    // 2. 404 Error response for missing file
    const resErr = await fetchJson(`http://127.0.0.1:${port}/api/contents/missing.txt`);
    assert.strictEqual(resErr.status, 404);
    assert.strictEqual(typeof resErr.body.message, 'string');

    // 3. Checkpoints API
    const resPut = await fetchJson(`http://127.0.0.1:${port}/api/contents/cp_test.ipynb`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: { type: 'notebook', content: { cells: [] } }
    });
    assert.strictEqual(resPut.status, 200);

    // POST create checkpoint
    const resCpCreate = await fetchJson(`http://127.0.0.1:${port}/api/contents/cp_test.ipynb/checkpoints`, {
      method: 'POST'
    });
    assert.strictEqual(resCpCreate.status, 201);
    assert.strictEqual(resCpCreate.body.id, 'checkpoint-1');

    // GET list checkpoints
    const resCpList = await fetchJson(`http://127.0.0.1:${port}/api/contents/cp_test.ipynb/checkpoints`);
    assert.strictEqual(resCpList.status, 200);
    assert.strictEqual(resCpList.body.length, 1);

    // POST restore checkpoint
    const resCpRestore = await fetchJson(`http://127.0.0.1:${port}/api/contents/cp_test.ipynb/checkpoints/checkpoint-1`, {
      method: 'POST'
    });
    assert.strictEqual(resCpRestore.status, 204);

    // DELETE checkpoint
    const resCpDel = await fetchJson(`http://127.0.0.1:${port}/api/contents/cp_test.ipynb/checkpoints/checkpoint-1`, {
      method: 'DELETE'
    });
    assert.strictEqual(resCpDel.status, 204);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('startLocalServer routes /api/contents requests to FileContentsManager', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59903);

  try {
    // 1. GET /api/contents
    const resGet = await fetchJson(`http://127.0.0.1:${port}/api/contents`);
    assert.strictEqual(resGet.status, 200);
    assert.strictEqual(resGet.body.type, 'directory');

    // 2. PUT /api/contents/test.ipynb (Notebook作成)
    const resPut = await fetchJson(`http://127.0.0.1:${port}/api/contents/test.ipynb`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: { type: 'notebook', content: { cells: [] } }
    });
    assert.strictEqual(resPut.status, 200);
    assert.strictEqual(resPut.body.name, 'test.ipynb');

    // 3. GET /api/contents/test.ipynb
    const resNb = await fetchJson(`http://127.0.0.1:${port}/api/contents/test.ipynb`);
    assert.strictEqual(resNb.status, 200);
    assert.strictEqual(resNb.body.type, 'notebook');

    // 4. DELETE /api/contents/test.ipynb
    const resDel = await fetchJson(`http://127.0.0.1:${port}/api/contents/test.ipynb`, { method: 'DELETE' });
    assert.strictEqual(resDel.status, 204);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
