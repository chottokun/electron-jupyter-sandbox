const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { startLocalServer } = require('../src/server');
const { saveConfig } = require('../src/config');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-e2e-preload-'));
}

test('Pyodide kernel preloads packages without piplite.install', { timeout: 120000 }, async () => {
  const tmpDir = createTmpDir();
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const jupyterliteDir = path.join(__dirname, '../jupyterlite');
  const configPath = path.join(tmpDir, 'config.json');

  saveConfig(configPath, {
    preloadPackages: ['japanize-noto-sans-jp', 'matplotlib', 'pandas', 'numpy', 'openpyxl']
  });

  const { server, port } = await startLocalServer(jupyterliteDir, dataDir, 59910);

  try {
    const pythonScript = path.join(__dirname, 'kernel-preload.e2e.py');

    await new Promise((resolve, reject) => {
      const child = spawn('python3', [pythonScript, String(port)], {
        encoding: 'utf-8'
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });

      child.on('close', code => {
        if (code === 0 && (stdout.includes('E2E_PRELOAD_SUCCESS') || stdout.includes('SUCCESS'))) {
          resolve();
        } else {
          reject(new Error(`E2E python script failed with code ${code}:\n${stderr}\n${stdout}`));
        }
      });

      child.on('error', reject);
    });

  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
