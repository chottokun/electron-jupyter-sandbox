const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getSettingsDir, getOverridesPath, loadOverrides } = require('../src/settings');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-settings-test-'));
}

test('getSettingsDir creates settings directory if it does not exist', () => {
  const tmpDir = createTmpDir();
  const settingsDir = path.join(tmpDir, 'settings');

  assert.strictEqual(fs.existsSync(settingsDir), false);
  getSettingsDir(tmpDir);
  assert.strictEqual(fs.existsSync(settingsDir), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('getOverridesPath initializes default overrides.json and loadOverrides reads it', () => {
  const tmpDir = createTmpDir();
  const overridesFilePath = getOverridesPath(tmpDir);

  assert.strictEqual(fs.existsSync(overridesFilePath), true);

  const overrides = loadOverrides(tmpDir);
  assert.deepStrictEqual(overrides, {
    "@jupyterlab/apputils-extension:themes": {
      "theme": "JupyterLab Dark"
    }
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
