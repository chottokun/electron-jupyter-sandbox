const fs = require('fs');
const path = require('path');

/**
 * loads configuration from config.json in appRootDir
 * @param {string} appRootDir
 * @returns {Object}
 */
function loadConfig(appRootDir) {
  const configFilePath = path.join(appRootDir, 'config.json');
  try {
    if (fs.existsSync(configFilePath)) {
      const raw = fs.readFileSync(configFilePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read config.json:', err);
  }
  return {};
}

/**
 * Saves updates to config.json in appRootDir
 * @param {string} appRootDir
 * @param {Object} updates
 * @returns {boolean}
 */
function saveConfig(appRootDir, updates) {
  const configFilePath = path.join(appRootDir, 'config.json');
  try {
    const current = loadConfig(appRootDir);
    const merged = { ...current, ...updates };
    fs.writeFileSync(configFilePath, JSON.stringify(merged, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write config.json:', err);
    return false;
  }
}

/**
 * Resolves the user data directory based on config or default 'data'
 * @param {string} appRootDir
 * @returns {string}
 */
function getResolvedDataDir(appRootDir) {
  const config = loadConfig(appRootDir);
  if (config.dataDir) {
    return path.isAbsolute(config.dataDir)
      ? config.dataDir
      : path.resolve(appRootDir, config.dataDir);
  }
  return path.join(appRootDir, 'data');
}

module.exports = {
  loadConfig,
  saveConfig,
  getResolvedDataDir
};
