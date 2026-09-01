const fs = require('fs');
const path = require('path');

/**
 * Ensures and returns the settings directory path inside dataDir
 * @param {string} dataDir
 * @returns {string}
 */
function getSettingsDir(dataDir) {
  const settingsDirPath = path.join(dataDir, 'settings');
  try {
    if (!fs.existsSync(settingsDirPath)) {
      fs.mkdirSync(settingsDirPath, { recursive: true });
    }
  } catch (e) {
    console.error('Failed to create settings directory:', e);
  }
  return settingsDirPath;
}

/**
 * Ensures and returns the overrides.json file path
 * @param {string} dataDir
 * @returns {string}
 */
function getOverridesPath(dataDir) {
  const dir = getSettingsDir(dataDir);
  const overridesFilePath = path.join(dir, 'overrides.json');
  try {
    if (!fs.existsSync(overridesFilePath)) {
      fs.writeFileSync(
        overridesFilePath,
        '{\n  "@jupyterlab/apputils-extension:themes": {\n    "theme": "JupyterLab Dark"\n  }\n}\n',
        'utf-8'
      );
    }
  } catch (e) {
    // ignore
  }
  return overridesFilePath;
}

/**
 * Loads user overrides JSON if available
 * @param {string} dataDir
 * @param {Function} [logFn]
 * @returns {Object|null}
 */
function loadOverrides(dataDir, logFn = console.error) {
  try {
    const filePath = getOverridesPath(dataDir);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    if (typeof logFn === 'function') {
      logFn('SERVER ERROR', `Failed to parse overrides.json: ${e.message}`);
    }
  }
  return null;
}

module.exports = {
  getSettingsDir,
  getOverridesPath,
  loadOverrides
};
