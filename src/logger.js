const fs = require('fs');
const path = require('path');

const LOG_MAX_SIZE = 2 * 1024 * 1024; // 2MB

const CRITICAL_CATEGORIES = new Set([
  'MAIN',
  'FATAL ERROR',
  'UNHANDLED REJECTION',
  'SERVER ERROR',
  'RENDERER ERROR',
  'RENDERER WARN',
  'SECURITY BLOCKED',
  'STARTUP ERROR'
]);

/**
 * Ensures and returns the logs directory path inside dataDir
 * @param {string} dataDir
 * @returns {string}
 */
function getLogDir(dataDir) {
  const logDirPath = path.join(dataDir, 'logs');
  try {
    if (!fs.existsSync(logDirPath)) {
      fs.mkdirSync(logDirPath, { recursive: true });
    }
  } catch (e) {
    console.error('Failed to create logs directory:', e);
  }
  return logDirPath;
}

/**
 * Returns the app.log file path inside dataDir
 * @param {string} dataDir
 * @returns {string}
 */
function getLogPath(dataDir) {
  try {
    const dir = getLogDir(dataDir);
    return path.join(dir, 'app.log');
  } catch (e) {
    return null;
  }
}

/**
 * Initializes the log file with a startup header
 * @param {string} dataDir
 */
function initLogger(dataDir) {
  const filePath = getLogPath(dataDir);
  if (filePath) {
    try {
      fs.writeFileSync(filePath, `=== Application Started at ${new Date().toISOString()} ===\n`, 'utf-8');
    } catch (e) {
      console.error('Failed to init log file:', e);
    }
  }
}

/**
 * Logs a message with rotation support
 * @param {string} category
 * @param {string} message
 * @param {Object} [options]
 * @param {boolean} [options.isPackaged=false]
 * @param {string} [options.dataDir='']
 */
function log(category, message, options = {}) {
  const { isPackaged = false, dataDir = '' } = options;
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${category}] ${message}`;
  console.log(logLine);

  if (isPackaged) {
    const isCritical = CRITICAL_CATEGORIES.has(category) || category.includes('ERROR') || category.includes('WARN');
    if (!isCritical) {
      return;
    }
  }

  if (!dataDir) return;

  try {
    const filePath = getLogPath(dataDir);
    if (filePath) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size > LOG_MAX_SIZE) {
          try {
            fs.renameSync(filePath, `${filePath}.old`);
          } catch (e) {
            // ignore
          }
        }
      }
      fs.appendFileSync(filePath, logLine + '\n', 'utf-8');
    }
  } catch (e) {
    // ignore logging failures
  }
}

module.exports = {
  LOG_MAX_SIZE,
  CRITICAL_CATEGORIES,
  getLogDir,
  getLogPath,
  initLogger,
  log
};
