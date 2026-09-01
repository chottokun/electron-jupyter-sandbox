const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { resolveServerPath, mergeOverrides, startLocalServer } = require('../src/server');

test('server module: path resolution and 404 handling', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-server-'));
  const subDir = path.join(tmpDir, 'www');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'index.html'), '<h1>OK</h1>');

  // Valid access
  const resValid = resolveServerPath(subDir, '/index.html');
  assert.strictEqual(resValid.status, 200);
  assert.strictEqual(resValid.contentType, 'text/html; charset=utf-8');

  // Default path redirection
  const resDefault = resolveServerPath(subDir, '/');
  assert.strictEqual(resDefault.status, 404); // /lab/index.html doesn't exist yet

  // Non-existent file
  const res404 = resolveServerPath(subDir, '/nonexistent.txt');
  assert.strictEqual(res404.status, 404);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('server module: overrides injection into jupyter-lite.json', () => {
  const baseJson = {
    "jupyter-config-data": {
      "appName": "JupyterLite",
      "settingsOverrides": {
        "existingSetting": true
      }
    }
  };
  const userOverrides = {
    "@jupyterlab/apputils-extension:themes": {
      "theme": "JupyterLab Dark"
    }
  };

  const result = mergeOverrides(baseJson, userOverrides);
  assert.strictEqual(result['jupyter-config-data']['appName'], 'JupyterLite');
  assert.strictEqual(result['jupyter-config-data']['settingsOverrides']['existingSetting'], true);
  assert.strictEqual(result['jupyter-config-data']['settingsOverrides']['@jupyterlab/apputils-extension:themes']['theme'], 'JupyterLab Dark');
});

test('server module: startLocalServer starts server and responds', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-server-run-'));
  fs.mkdirSync(path.join(tmpDir, 'lab'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'lab', 'index.html'), '<html>Hello</html>');

  const { server, port } = await startLocalServer({
    rootDir: tmpDir,
    dataDir: tmpDir,
    preferredPort: 59123,
    logFn: () => {}
  });

  assert.strictEqual(typeof port, 'number');

  // Perform HTTP GET request
  const body = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/lab/index.html`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  assert.strictEqual(body, '<html>Hello</html>');

  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
