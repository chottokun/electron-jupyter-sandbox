const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');

const DEFAULT_OVERRIDES_CONTENT = '{\n  "@jupyterlab/apputils-extension:themes": {\n    "theme": "JupyterLab Dark"\n  }\n}\n';

function getSettingsDir(currentDataDir) {
  const settingsDirPath = path.join(currentDataDir, 'settings');
  try {
    if (!fs.existsSync(settingsDirPath)) {
      fs.mkdirSync(settingsDirPath, { recursive: true });
    }
  } catch (e) {
    console.error('Failed to create settings directory:', e);
  }
  return settingsDirPath;
}

function getOverridesPath(currentDataDir) {
  const dir = getSettingsDir(currentDataDir);
  const overridesFilePath = path.join(dir, 'overrides.json');
  try {
    if (!fs.existsSync(overridesFilePath)) {
      fs.writeFileSync(overridesFilePath, DEFAULT_OVERRIDES_CONTENT, 'utf-8');
    }
  } catch (e) {
    // ignore
  }
  return overridesFilePath;
}

function loadOverrides(currentDataDir) {
  try {
    const filePath = getOverridesPath(currentDataDir);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    logger.log('SERVER ERROR', `Failed to parse overrides.json: ${e.message}`);
  }
  return null;
}

module.exports = {
  getSettingsDir,
  getOverridesPath,
  loadOverrides
};
