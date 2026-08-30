const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const http = require('http');
const { createApplicationMenu, setupContextMenu } = require('./menu');

// アプリケーションのベースディレクトリ解決
const appRootDir = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : path.resolve(__dirname, '..');

const configFilePath = path.join(appRootDir, 'config.json');

function loadConfig() {
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

function saveConfig(updates) {
  try {
    const current = loadConfig();
    const merged = { ...current, ...updates };
    fs.writeFileSync(configFilePath, JSON.stringify(merged, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write config.json:', err);
    return false;
  }
}

function getResolvedDataDir() {
  const config = loadConfig();
  if (config.dataDir) {
    return path.isAbsolute(config.dataDir)
      ? config.dataDir
      : path.resolve(appRootDir, config.dataDir);
  }
  return path.join(appRootDir, 'data');
}

// 起動初期（app.whenReady前）に userData を設定して永続化ディレクトリを決定
const currentDataDir = getResolvedDataDir();
try {
  if (!fs.existsSync(currentDataDir)) {
    fs.mkdirSync(currentDataDir, { recursive: true });
  }
  app.setPath('userData', currentDataDir);
} catch (e) {
  console.error('Failed to initialize data directory:', e);
}

let server = null;
let serverPort = 0;

let logFilePath = null;
let logDirPath = null;
let settingsDirPath = null;
let overridesFilePath = null;

function getSettingsDir() {
  if (!settingsDirPath) {
    settingsDirPath = path.join(currentDataDir, 'settings');
    try {
      if (!fs.existsSync(settingsDirPath)) {
        fs.mkdirSync(settingsDirPath, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create settings directory:', e);
    }
  }
  return settingsDirPath;
}

function getOverridesPath() {
  if (!overridesFilePath) {
    const dir = getSettingsDir();
    overridesFilePath = path.join(dir, 'overrides.json');
    try {
      if (!fs.existsSync(overridesFilePath)) {
        fs.writeFileSync(overridesFilePath, '{\n  "@jupyterlab/apputils-extension:themes": {\n    "theme": "JupyterLab Dark"\n  }\n}\n', 'utf-8');
      }
    } catch (e) {
      // ignore
    }
  }
  return overridesFilePath;
}

function loadOverrides() {
  try {
    const filePath = getOverridesPath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    log('SERVER ERROR', `Failed to parse overrides.json: ${e.message}`);
  }
  return null;
}

function getLogDir() {
  if (!logDirPath) {
    logDirPath = path.join(currentDataDir, 'logs');
    try {
      if (!fs.existsSync(logDirPath)) {
        fs.mkdirSync(logDirPath, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create logs directory:', e);
    }
  }
  return logDirPath;
}

function getLogPath() {
  if (!logFilePath) {
    try {
      const dir = getLogDir();
      logFilePath = path.join(dir, 'app.log');
    } catch (e) {
      logFilePath = null;
    }
  }
  return logFilePath;
}

function initLogger() {
  const filePath = getLogPath();
  if (filePath) {
    try {
      fs.writeFileSync(filePath, `=== Application Started at ${new Date().toISOString()} ===\n`, 'utf-8');
    } catch (e) {
      console.error('Failed to init log file:', e);
    }
  }
}

const LOG_MAX_SIZE = 2 * 1024 * 1024; // 2MB

// パッケージ版でファイル記録する重要カテゴリ
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

function log(category, message) {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = `[${timestamp}] [${category}] ${message}`;
  console.log(logLine);

  // パッケージ版の場合は、重要イベント（起動情報・エラー・警告・セキュリティブロック）のみ保存
  if (app.isPackaged) {
    const isCritical = CRITICAL_CATEGORIES.has(category) || category.includes('ERROR') || category.includes('WARN');
    if (!isCritical) {
      return;
    }
  }

  try {
    const filePath = getLogPath();
    if (filePath) {
      // ログローテーション（2MB超過時にバックアップして初期化）
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

process.on('uncaughtException', (err) => {
  log('FATAL ERROR', `Uncaught Exception: ${err.stack || err}`);
  try {
    dialog.showErrorBox('Application Error', `予期せぬエラーが発生しました:\n${err.message}\n\n詳細はログをご確認ください。`);
  } catch (e) {
    // ignore
  }
});

process.on('unhandledRejection', (reason) => {
  log('UNHANDLED REJECTION', `Unhandled Rejection: ${reason}`);
});

// MIMEタイプの定義
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ipynb': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.whl': 'application/x-wheel+zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.webmanifest': 'application/manifest+json'
};

const DEFAULT_PORT = 58888;

function startLocalServer(rootDir, preferredPort = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      try {
        const parsedUrl = new url.URL(req.url, `http://127.0.0.1:${serverPort}`);
        let relativePath = decodeURIComponent(parsedUrl.pathname);

        if (relativePath === '/' || relativePath === '') {
          relativePath = '/lab/index.html';
        }

        // パストラバーサル対策
        const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
        const filePath = path.join(rootDir, safePath);

        if (!filePath.startsWith(rootDir)) {
          log('HTTP 403', `Access Denied: ${relativePath}`);
          res.writeHead(403);
          return res.end('Access Denied');
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          log('HTTP 404', `Not Found: ${relativePath}`);
          res.writeHead(404);
          return res.end(`Not Found: ${relativePath}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Wasm / ServiceWorker 実行に必要なセキュリティヘッダーを付与
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1:*; img-src 'self' data: blob:;",
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cache-Control': 'no-cache'
        });

        // jupyter-lite.json の場合、dataDir/settings/overrides.json の設定を動的にマージして配信
        if (path.basename(filePath) === 'jupyter-lite.json') {
          try {
            const baseContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const userOverrides = loadOverrides();
            if (userOverrides) {
              baseContent['jupyter-config-data'] = baseContent['jupyter-config-data'] || {};
              baseContent['jupyter-config-data']['settingsOverrides'] = {
                ...(baseContent['jupyter-config-data']['settingsOverrides'] || {}),
                ...userOverrides
              };
            }
            return res.end(JSON.stringify(baseContent, null, 2));
          } catch (err) {
            log('SERVER ERROR', `Failed to inject overrides: ${err.message}`);
          }
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (err) {
        log('SERVER ERROR', `${err.message}`);
        res.writeHead(500);
        res.end(err.message);
      }
    });

    // IndexedDBの同一オリジン(Same-Origin)維持のため、固定ポートを優先バインド
    const tryListen = (portToTry) => {
      server.listen(portToTry, '127.0.0.1', () => {
        serverPort = server.address().port;
        log('MAIN', `Local Server started on http://127.0.0.1:${serverPort}`);
        resolve(serverPort);
      });
    };

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log('MAIN', `Port ${preferredPort} is in use, trying next port...`);
        preferredPort++;
        tryListen(preferredPort);
      } else {
        reject(err);
      }
    });

    tryListen(preferredPort);
  });
}

function applyNetworkFilter(targetSession) {
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const parsed = new URL(details.url);
      const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      const isInternal = parsed.protocol === 'devtools:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:';

      if (isInternal || isLocal) {
        callback({ cancel: false });
      } else {
        log('SECURITY BLOCKED', `外部通信を遮断しました: ${details.url}`);
        callback({ cancel: true });
      }
    } catch (e) {
      log('SECURITY BLOCKED', `無効なURL要求を遮断しました: ${details.url}`);
      callback({ cancel: true });
    }
  });
}

async function changeDataDirectory(parentWin) {
  const current = getResolvedDataDir();
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWin, {
    title: 'データ保存先ディレクトリを選択',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  });

  if (canceled || filePaths.length === 0) return;

  const selectedPath = filePaths[0];
  const success = saveConfig({ dataDir: selectedPath });

  if (success) {
    const response = await dialog.showMessageBox(parentWin, {
      type: 'question',
      buttons: ['今すぐ再起動', 'あとで手動で再起動'],
      defaultId: 0,
      cancelId: 1,
      title: '設定の更新',
      message: 'データ保存先フォルダを更新しました。',
      detail: `新しい保存先:\n${selectedPath}\n\n※ 変更を反映するにはアプリケーションの再起動が必要です。今すぐ再起動しますか？`
    });

    if (response.response === 0) {
      app.relaunch();
      app.exit(0);
    }
  } else {
    dialog.showErrorBox('設定保存エラー', 'config.json への書き込みに失敗しました。');
  }
}

let mainWindow = null;

function createWindow(port) {
  const iconPath = path.resolve(__dirname, '../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'Electron Jupyter Sandbox',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true,
      partition: 'persist:jupyter-data',
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // レンダラープロセスのコンソールログをターミナルおよびapp.logに出力
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'LOG';
    log(`RENDERER ${levelStr}`, `${message} (${sourceId}:${line})`);
  });

  // アプリケーションメニューおよび右クリックコンテキストメニューの初期化
  createApplicationMenu(mainWindow, {
    changeDataDirectory,
    getResolvedDataDir,
    getOverridesPath,
    getSettingsDir,
    getLogPath,
    getLogDir
  });
  setupContextMenu(mainWindow);

  // ローカルHTTPサーバー経由でJupyterLabをロード
  mainWindow.loadURL(`http://127.0.0.1:${port}/lab/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 二重起動防止（ポート競合・オリジン分散を防止）
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    initLogger();

    const rootDir = app.isPackaged
      ? path.join(app.getAppPath(), 'jupyterlite')
      : path.resolve(__dirname, '../jupyterlite');

    log('MAIN', `Starting app (isPackaged: ${app.isPackaged}, rootDir: ${rootDir}, dataDir: ${currentDataDir})`);

    // 1. ローカル配信HTTPサーバーの起動
    const port = await startLocalServer(rootDir);

    // 2. ネットワーク完全隔離 (デフォルトセッションおよび永続セッション両方で外部通信を遮断)
    applyNetworkFilter(session.defaultSession);
    applyNetworkFilter(session.fromPartition('persist:jupyter-data'));

    createWindow(port);
  });
}

// 4. ファイル I/O 用の IPC ハンドラー
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Jupyter Notebook / Files', extensions: ['ipynb', 'py', 'csv', 'txt', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return {
    filename: path.basename(filePaths[0]),
    path: filePaths[0],
    content
  };
});

ipcMain.handle('dialog:saveFile', async (event, { defaultName, data }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName || 'notebook.ipynb',
    filters: [
      { name: 'Jupyter Notebook', extensions: ['ipynb'] },
      { name: 'Python Script', extensions: ['py'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (filePath) {
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true, filePath };
  }
  return { success: false };
});

// 5. アプリケーション終了処理 (ウィンドウを閉じたら完全停止)
app.on('window-all-closed', () => {
  log('MAIN', 'すべてのウィンドウが閉じられました。アプリケーションを完全終了します。');
  app.quit();
});

app.on('will-quit', () => {
  if (server) {
    try {
      server.close();
      log('MAIN', 'ローカルHTTPサーバーを安全に停止しました。');
    } catch (e) {
      // ignore
    }
  }
  log('MAIN', `=== Application Terminated at ${new Date().toISOString()} ===`);
});
