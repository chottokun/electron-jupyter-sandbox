const path = require('path');
const fs = require('fs');

const { isNetworkConfigurable } = require('./policy');

function loadConfig(configFilePath) {
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

function saveConfig(configFilePath, updates) {
  try {
    const current = loadConfig(configFilePath);
    const merged = { ...current, ...updates };
    fs.writeFileSync(configFilePath, JSON.stringify(merged, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write config.json:', err);
    return false;
  }
}

function getResolvedDataDir(appRootDir, configFilePath) {
  const config = loadConfig(configFilePath);
  if (config.dataDir) {
    return path.isAbsolute(config.dataDir)
      ? config.dataDir
      : path.resolve(appRootDir, config.dataDir);
  }
  return path.join(appRootDir, 'data');
}

/**
 * 外部ネットワーク通信が許可されているか判定
 * ※ 完全隔離モード（isNetworkConfigurable === false）の場合は config.json の値に関わらず常に false
 * 
 * @param {string} configFilePath 
 * @returns {boolean}
 */
function isExternalNetworkAllowed(configFilePath) {
  if (!isNetworkConfigurable()) {
    return false;
  }
  const config = loadConfig(configFilePath);
  return config.allowExternalNetwork === true;
}

/**
 * 外部ネットワーク通信設定を更新
 * 
 * @param {string} configFilePath 
 * @param {boolean} allowed 
 * @returns {boolean}
 */
function setExternalNetworkAllowed(configFilePath, allowed) {
  return saveConfig(configFilePath, { allowExternalNetwork: Boolean(allowed) });
}

module.exports = {
  loadConfig,
  saveConfig,
  getResolvedDataDir,
  isExternalNetworkAllowed,
  setExternalNetworkAllowed
};

