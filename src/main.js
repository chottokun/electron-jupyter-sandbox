const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const http = require('http');

let server = null;
let serverPort = 0;

let logFilePath = null;

function getLogPath() {
  if (!logFilePath) {
    try {
      const baseDir = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..');
      logFilePath = path.join(baseDir, 'app.log');
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
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // レンダラープロセスのコンソールログをターミナルおよびapp.logに出力
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'LOG';
    log(`RENDERER ${levelStr}`, `${message} (${sourceId}:${line})`);
  });

  // 開発・デバッグ用（必要に応じて Ctrl+Shift+I で開くか、以下のコメントを外してください）
  // win.webContents.openDevTools();

  // ローカルHTTPサーバー経由でJupyterLabをロード
  win.loadURL(`http://127.0.0.1:${port}/lab/index.html`);
}

app.whenReady().then(async () => {
  initLogger();

  const rootDir = app.isPackaged
    ? path.join(app.getAppPath(), 'jupyterlite')
    : path.resolve(__dirname, '../jupyterlite');

  log('MAIN', `Starting app (isPackaged: ${app.isPackaged}, rootDir: ${rootDir})`);

  // 1. ローカル配信HTTPサーバーの起動
  const port = await startLocalServer(rootDir);

  // 2. ネットワーク完全隔離 (127.0.0.1 以外の外部通信をすべて遮断)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const parsed = new URL(details.url);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    const isInternal = parsed.protocol === 'devtools:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:';

    if (isInternal || isLocal) {
      callback({ cancel: false });
    } else {
      log('SECURITY BLOCKED', `外部通信を遮断しました: ${details.url}`);
      callback({ cancel: true });
    }
  });

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
