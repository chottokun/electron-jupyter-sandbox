const { app, BrowserWindow, ipcMain, dialog, session, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const http = require('http');

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

function startLocalServer(rootDir) {
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

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (err) {
        log('SERVER ERROR', `${err.message}`);
        res.writeHead(500);
        res.end(err.message);
      }
    });

    // ポート 0 を指定して空いているポートを自動取得
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      log('MAIN', `Local Server started on http://127.0.0.1:${serverPort}`);
      resolve(serverPort);
    });

    server.on('error', reject);
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

function setupApplicationMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: `${app.name} について` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `${app.name} を隠す` },
        { role: 'hideOthers', label: 'ほかを隠す`' },
        { role: 'unhide', label: 'すべて表示' },
        { type: 'separator' },
        { role: 'quit', label: `${app.name} を終了` }
      ]
    }] : []),
    {
      label: 'ファイル',
      submenu: [
        isMac ? { role: 'close', label: 'ウィンドウを閉じる' } : { role: 'quit', label: '終了' }
      ]
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直す' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' }
      ]
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'forceReload', label: '強制再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーン切り替え' }
      ]
    },
    {
      label: '設定',
      submenu: [
        {
          label: 'データ保存先フォルダを変更...',
          click: async () => {
            await changeDataDirectory(mainWindow);
          }
        },
        {
          label: 'データ保存先フォルダを開く (エクスプローラー)',
          click: async () => {
            const dataDir = getResolvedDataDir();
            if (fs.existsSync(dataDir)) {
              await shell.openPath(dataDir);
            } else {
              dialog.showErrorBox('エラー', `ディレクトリが存在しません: ${dataDir}`);
            }
          }
        }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'ログファイルを開く (app.log)',
          click: async () => {
            const logPath = getLogPath();
            if (logPath && fs.existsSync(logPath)) {
              await shell.openPath(logPath);
            } else {
              dialog.showErrorBox('エラー', 'ログファイルがまだ作成されていないか、存在しません。');
            }
          }
        },
        {
          label: 'ログフォルダを開く',
          click: async () => {
            const logDir = getLogDir();
            if (fs.existsSync(logDir)) {
              await shell.openPath(logDir);
            } else {
              dialog.showErrorBox('エラー', `ログフォルダが存在しません: ${logDir}`);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'バージョン・環境情報',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Electron Jupyter Sandbox',
              message: 'Electron Jupyter Sandbox v1.0.0',
              detail: `現在のデータ保存先:\n${getResolvedDataDir()}\n\nログ保存先:\n${getLogPath()}\n\n・完全隔離型 WebAssembly (Pyodide) 実行環境\n・オフライン保証 (外部通信完全遮断)`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    title: 'Electron Jupyter Sandbox',
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
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'LOG';
    log(`RENDERER ${levelStr}`, `${message} (${sourceId}:${line})`);
  });

  // アプリケーションメニューの構築
  setupApplicationMenu(win);

  // ローカルHTTPサーバー経由でJupyterLabをロード
  win.loadURL(`http://127.0.0.1:${port}/lab/index.html`);
}

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
