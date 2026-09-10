const path = require('path');
const fs = require('fs');

const { isNetworkConfigurable } = require('./policy');

const DEFAULT_PRELOAD_PACKAGES = [
  'japanize-noto-sans-jp',
  'matplotlib',
  'openpyxl'
];

const FALLBACK_LOCAL_WHEEL_PACKAGES = new Set([
  'japanize-noto-sans-jp',
  'openpyxl',
  'python-docx',
  'python-pptx',
  'pypdf',
  'reportlab',
  'tabulate',
  'xlsxwriter',
  'et-xmlfile',
  'defusedxml'
]);

const LOCAL_WHEEL_PACKAGES = FALLBACK_LOCAL_WHEEL_PACKAGES;

const PACKAGE_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

function isValidPackageName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 100) return false;
  return PACKAGE_NAME_REGEX.test(name);
}

function normalizePackageName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function getLocalWheelPackageSet(customManifestPath = null) {
  const manifestPath = customManifestPath || path.resolve(__dirname, '../wheels/manifest.json');
  try {
    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      if (manifest && manifest.packages && typeof manifest.packages === 'object') {
        const names = new Set();
        for (const [normKey, info] of Object.entries(manifest.packages)) {
          names.add(normKey);
          names.add(normKey.replace(/-/g, '_'));
          if (info && info.name) {
            names.add(info.name);
            names.add(info.name.toLowerCase().replace(/[-_.]+/g, '-'));
          }
        }
        return names;
      }
    }
  } catch (e) {
    console.error('Failed to load wheels/manifest.json:', e);
  }
  return FALLBACK_LOCAL_WHEEL_PACKAGES;
}

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

/**
 * プリロード対象パッケージを Pyodide 標準パッケージと独自 wheel に分離して取得
 * @param {string} [configFilePath]
 * @param {string} [customManifestPath]
 * @returns {{ pyodidePackages: string[], piplitePackages: string[] }}
 */
function getCategorizedPreloadPackages(configFilePath = null, customManifestPath = null) {
  const allPackages = getPreloadPackages(configFilePath);
  const localWheelPackages = getLocalWheelPackageSet(customManifestPath);
  const pyodidePackages = [];
  const piplitePackages = [];

  for (const pkg of allPackages) {
    if (!isValidPackageName(pkg)) {
      continue;
    }
    const norm = normalizePackageName(pkg);
    if (localWheelPackages.has(pkg) || localWheelPackages.has(norm) || localWheelPackages.has(pkg.replace(/-/g, '_'))) {
      piplitePackages.push(pkg);
    } else {
      pyodidePackages.push(pkg);
    }
  }

  return { pyodidePackages, piplitePackages };
}

module.exports = {
  DEFAULT_PRELOAD_PACKAGES,
  LOCAL_WHEEL_PACKAGES,
  FALLBACK_LOCAL_WHEEL_PACKAGES,
  isValidPackageName,
  normalizePackageName,
  getLocalWheelPackageSet,
  loadConfig,
  saveConfig,
  getResolvedDataDir,
  isExternalNetworkAllowed,
  setExternalNetworkAllowed,
  resetRuntimeNetworkAllowed,
  getPreloadPackages,
  isPreloadPackageEnabled,
  setPreloadPackageEnabled,
  getCategorizedPreloadPackages
};
