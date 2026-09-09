const path = require('path');
const fs = require('fs');

const { isNetworkConfigurable } = require('./policy');

const DEFAULT_PRELOAD_PACKAGES = [
  'japanize-noto-sans-jp',
  'matplotlib',
  'openpyxl'
];

let runtimeNetworkAllowed = null;

function loadConfig(configFilePath) {
  try {
    if (configFilePath && fs.existsSync(configFilePath)) {
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
    if (configFilePath) {
      const dir = path.dirname(configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configFilePath, JSON.stringify(merged, null, 2), 'utf-8');
    }
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
 * ※ 完全隔離モード（isNetworkConfigurable === false）の場合は常に false
 * 
 * @param {string} [configFilePath] 
 * @returns {boolean}
 */
function isExternalNetworkAllowed(configFilePath = null) {
  if (!isNetworkConfigurable()) {
    return false;
  }
  if (runtimeNetworkAllowed !== null) {
    return runtimeNetworkAllowed;
  }
  if (configFilePath) {
    const config = loadConfig(configFilePath);
    runtimeNetworkAllowed = config.allowExternalNetwork === true;
    return runtimeNetworkAllowed;
  }
  return false;
}

/**
 * 外部ネットワーク通信設定を更新（メモリ状態および設定ファイルを更新）
 * 
 * @param {string} configFilePath 
 * @param {boolean} allowed 
 * @returns {boolean}
 */
function setExternalNetworkAllowed(configFilePath, allowed) {
  const boolVal = Boolean(allowed);
  runtimeNetworkAllowed = boolVal;
  return saveConfig(configFilePath, { allowExternalNetwork: boolVal });
}

/**
 * テスト用: メモリ上のランタイム状態をリセット
 */
function resetRuntimeNetworkAllowed() {
  runtimeNetworkAllowed = null;
}

/**
 * プリロードパッケージ一覧を取得
 * @param {string} [configFilePath]
 * @returns {string[]}
 */
function getPreloadPackages(configFilePath = null) {
  if (configFilePath) {
    const config = loadConfig(configFilePath);
    if (Array.isArray(config.preloadPackages)) {
      return config.preloadPackages;
    }
  }
  return [...DEFAULT_PRELOAD_PACKAGES];
}

/**
 * 対象パッケージがプリロード対象か判定
 * @param {string} configFilePath
 * @param {string} packageName
 * @returns {boolean}
 */
function isPreloadPackageEnabled(configFilePath, packageName) {
  const list = getPreloadPackages(configFilePath);
  return list.includes(packageName);
}

/**
 * プリロードパッケージの有効化/無効化を設定
 * @param {string} configFilePath
 * @param {string} packageName
 * @param {boolean} enabled
 * @returns {boolean}
 */
function setPreloadPackageEnabled(configFilePath, packageName, enabled) {
  let list = getPreloadPackages(configFilePath);
  if (enabled) {
    if (!list.includes(packageName)) {
      list = [...list, packageName];
    }
  } else {
    list = list.filter((p) => p !== packageName);
  }
  return saveConfig(configFilePath, { preloadPackages: list });
}

module.exports = {
  DEFAULT_PRELOAD_PACKAGES,
  loadConfig,
  saveConfig,
  getResolvedDataDir,
  isExternalNetworkAllowed,
  setExternalNetworkAllowed,
  resetRuntimeNetworkAllowed,
  getPreloadPackages,
  isPreloadPackageEnabled,
  setPreloadPackageEnabled
};


