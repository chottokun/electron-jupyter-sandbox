const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { startLocalServer } = require('../src/server');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jupyter-adv-test-'));
}

function requestHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = data;
        if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
          try {
            body = JSON.parse(data);
          } catch (_) {
            // keep raw string
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      if (typeof options.body === 'string') {
        req.write(options.body);
      } else {
        req.write(JSON.stringify(options.body));
      }
    }
    req.end();
  });
}

test('Adversarial Testing: Directory traversal & path normalization attacks', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(tmpDir, 'secret_outside.txt'), 'SUPER_SECRET_TOKEN', 'utf-8');
  fs.writeFileSync(path.join(jupyterliteDir, 'index.html'), '<html>Safe Root</html>', 'utf-8');

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59920);

  try {
    // 1. Raw dot-dot slash
    const res1 = await requestHttp(`http://127.0.0.1:${port}/../secret_outside.txt`);
    assert.strictEqual(res1.status, 404, 'Direct dot-dot should not expose outside files');
    assert.ok(!String(res1.body).includes('SUPER_SECRET_TOKEN'));

    // 2. URL encoded traversal (%2e%2e%2f)
    const res2 = await requestHttp(`http://127.0.0.1:${port}/%2e%2e%2fsecret_outside.txt`);
    assert.strictEqual(res2.status, 404);
    assert.ok(!String(res2.body).includes('SUPER_SECRET_TOKEN'));

    // 3. Double URL encoded traversal (%252e%252e%252f)
    const res3 = await requestHttp(`http://127.0.0.1:${port}/%252e%252e%252fsecret_outside.txt`);
    assert.strictEqual(res3.status, 404);
    assert.ok(!String(res3.body).includes('SUPER_SECRET_TOKEN'));

    // 4. Windows backslash traversal attempts
    const res4 = await requestHttp(`http://127.0.0.1:${port}/..\\secret_outside.txt`);
    assert.strictEqual(res4.status, 404);
    assert.ok(!String(res4.body).includes('SUPER_SECRET_TOKEN'));

    // 5. Escaping using excessive nested slashes
    const res5 = await requestHttp(`http://127.0.0.1:${port}//////secret_outside.txt`);
    assert.strictEqual(res5.status, 404);
    assert.ok(!String(res5.body).includes('SUPER_SECRET_TOKEN'));
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Adversarial Testing: Malformed JSON payload in Contents API', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59921);

  try {
    // Malformed JSON should return 500 or 400 and NOT crash server
    const malformedBody = '{"broken": json...';
    const res = await requestHttp(`http://127.0.0.1:${port}/api/contents/broken.ipynb`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: malformedBody
    });

    assert.strictEqual(res.status, 500, 'Server should catch JSON syntax error and respond with 500');

    // Verify server is still alive and healthy after error
    const healthCheck = await requestHttp(`http://127.0.0.1:${port}/api/contents`);
    assert.strictEqual(healthCheck.status, 200, 'Server should remain operational after malformed payload');
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Adversarial Testing: Checkpoint operations on non-existent files', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59922);

  try {
    // 1. Create checkpoint for non-existent file
    const res1 = await requestHttp(`http://127.0.0.1:${port}/api/contents/ghost.ipynb/checkpoints`, {
      method: 'POST'
    });
    assert.strictEqual(res1.status, 404, 'Creating checkpoint for non-existent file must return 404');

    // 2. Restore non-existent checkpoint
    const res2 = await requestHttp(`http://127.0.0.1:${port}/api/contents/ghost.ipynb/checkpoints/checkpoint-999`, {
      method: 'POST'
    });
    assert.strictEqual(res2.status, 404, 'Restoring non-existent checkpoint must return 404');

    // 3. Delete non-existent checkpoint (idempotent REST operation returns 204)
    const res3 = await requestHttp(`http://127.0.0.1:${port}/api/contents/ghost.ipynb/checkpoints/checkpoint-999`, {
      method: 'DELETE'
    });
    assert.strictEqual(res3.status, 204, 'Deleting non-existent checkpoint is idempotent and returns 204');
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Adversarial Testing: CSP policy toggle boundary & unexpected argument types', async () => {
  const tmpDir = createTmpDir();
  const jupyterliteDir = path.join(tmpDir, 'jupyterlite');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(jupyterliteDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(jupyterliteDir, 'test.js'), 'console.log(1);', 'utf-8');

  // Test with boolean true
  const srvTrue = await startLocalServer(jupyterliteDir, dataDir, 59923, {
    isExternalNetworkAllowed: true
  });
  const resTrue = await requestHttp(`http://127.0.0.1:59923/test.js`);
  assert.ok(resTrue.headers['content-security-policy'].includes("connect-src * 'self'"), 'CSP should allow * when true');
  srvTrue.server.close();

  // Test with boolean false
  const srvFalse = await startLocalServer(jupyterliteDir, dataDir, 59924, {
    isExternalNetworkAllowed: false
  });
  const resFalse = await requestHttp(`http://127.0.0.1:59924/test.js`);
  assert.ok(resFalse.headers['content-security-policy'].includes("connect-src 'self'"), 'CSP should restrict to self when false');
  assert.ok(!resFalse.headers['content-security-policy'].includes("connect-src *"), 'CSP should not have wildcard when false');
  srvFalse.server.close();

  // Test with function dynamic toggle
  let allowFlag = false;
  const srvDyn = await startLocalServer(jupyterliteDir, dataDir, 59925, {
    isExternalNetworkAllowed: () => allowFlag
  });
  const resDyn1 = await requestHttp(`http://127.0.0.1:59925/test.js`);
  assert.ok(!resDyn1.headers['content-security-policy'].includes("connect-src *"));

  allowFlag = true;
  const resDyn2 = await requestHttp(`http://127.0.0.1:59925/test.js`);
  assert.ok(resDyn2.headers['content-security-policy'].includes("connect-src *"));
  srvDyn.server.close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
