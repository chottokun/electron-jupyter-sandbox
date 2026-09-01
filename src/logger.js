const path = require('path');
const fs = require('fs');

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

class Logger {
  constructor() {
    this.logDirPath = null;
    this.logFilePath = null;
  }

  getLogDir(currentDataDir) {
    if (!this.logDirPath && currentDataDir) {
      this.logDirPath = path.join(currentDataDir, 'logs');
      try {
        if (!fs.existsSync(this.logDirPath)) {
          fs.mkdirSync(this.logDirPath, { recursive: true });
        }
      } catch (e) {
        console.error('Failed to create logs directory:', e);
      }
    }
    return this.logDirPath;
  }

  getLogPath(currentDataDir) {
    if (!this.logFilePath && currentDataDir) {
      try {
        const dir = this.getLogDir(currentDataDir);
        this.logFilePath = path.join(dir, 'app.log');
      } catch (e) {
        this.logFilePath = null;
      }
    }
    return this.logFilePath;
  }

  initLogger(currentDataDir) {
    const filePath = this.getLogPath(currentDataDir);
    if (filePath) {
      try {
        fs.writeFileSync(filePath, `=== Application Started at ${new Date().toISOString()} ===\n`, 'utf-8');
      } catch (e) {
        console.error('Failed to init log file:', e);
      }
    }
  }

  log(category, message, isPackaged = false, currentDataDir = null, maxLogSize = LOG_MAX_SIZE) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] [${category}] ${message}`;
    console.log(logLine);

    if (isPackaged) {
      const isCritical = CRITICAL_CATEGORIES.has(category) || category.includes('ERROR') || category.includes('WARN');
      if (!isCritical) {
        return;
      }
    }

    try {
      const filePath = currentDataDir ? this.getLogPath(currentDataDir) : this.logFilePath;
      if (filePath) {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > maxLogSize) {
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
}

const defaultLogger = new Logger();

module.exports = {
  Logger,
  logger: defaultLogger
};
