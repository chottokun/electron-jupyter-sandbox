const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getLogDir, getLogPath, initLogger, log, LOG_MAX_SIZE, CRITICAL_CATEGORIES } = require('../src/logger');
const { getSettingsDir, getOverridesPath, loadOverrides } = require('../src/settings');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-logger-'));
}

test('logger module: initLogger and log writes to file with rotation', () => {
  const tmpDir = createTempDir();
  initLogger(tmpDir);

  const logPath = getLogPath(tmpDir);
  assert.strictEqual(fs.existsSync(logPath), true);
  const initialContent = fs.readFileSync(logPath, 'utf-8');
  assert.strictEqual(initialContent.includes('=== Application Started at'), true);

  // Test logging
  log('MAIN', 'Test message', { isPackaged: false, dataDir: tmpDir });
  const updatedContent = fs.readFileSync(logPath, 'utf-8');
  assert.strictEqual(updatedContent.includes('[MAIN] Test message'), true);

  // Test log rotation
  const bigBuffer = Buffer.alloc(LOG_MAX_SIZE + 100, 'a');
  fs.writeFileSync(logPath, bigBuffer);

  log('MAIN', 'Message after rotation', { isPackaged: false, dataDir: tmpDir });
  assert.strictEqual(fs.existsSync(`${logPath}.old`), true);
  const newLogContent = fs.readFileSync(logPath, 'utf-8');
  assert.strictEqual(newLogContent.includes('[MAIN] Message after rotation'), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('logger module: category filtering when packaged', () => {
  const tmpDir = createTempDir();
  initLogger(tmpDir);
  const logPath = getLogPath(tmpDir);

  // Non-critical when packaged
  log('INFO_NON_CRITICAL', 'Should not write', { isPackaged: true, dataDir: tmpDir });
  let content = fs.readFileSync(logPath, 'utf-8');
  assert.strictEqual(content.includes('Should not write'), false);

  // Critical when packaged
  log('SERVER ERROR', 'Should write error', { isPackaged: true, dataDir: tmpDir });
  content = fs.readFileSync(logPath, 'utf-8');
  assert.strictEqual(content.includes('Should write error'), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('settings module: default overrides creation and loading', () => {
  const tmpDir = createTempDir();
  const settingsDir = getSettingsDir(tmpDir);
  assert.strictEqual(fs.existsSync(settingsDir), true);

  const overridesPath = getOverridesPath(tmpDir);
  assert.strictEqual(fs.existsSync(overridesPath), true);

  const loaded = loadOverrides(tmpDir);
  assert.strictEqual(loaded['@jupyterlab/apputils-extension:themes']['theme'], 'JupyterLab Dark');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
