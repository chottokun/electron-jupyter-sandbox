const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createApplicationMenu, setupContextMenu } = require('./menu');
const { loadConfig, saveConfig, getResolvedDataDir } = require('./config');
const { log, initLogger, getLogDir, getLogPath } = require('./logger');
const { getSettingsDir, getOverridesPath, loadOverrides } = require('./settings');
const { startLocalServer, DEFAULT_PORT } = require('./server');
const { applyNetworkFilter } = require('./security');

// Base directory resolution
const appRootDir = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : path.resolve(__dirname, '..');

// Data directory resolution & userData path initialization
const currentDataDir = getResolvedDataDir(appRootDir);
try {
  if (!fs.existsSync(currentDataDir)) {
    fs.mkdirSync(currentDataDir, { recursive: true });
  }
  app.setPath('userData', currentDataDir);
} catch (e) {
  console.error('Failed to initialize data directory:', e);
}

// Log wrapper for current app instance
function logMsg(category, message) {
  log(category, message, { isPackaged: app.isPackaged, dataDir: currentDataDir });
}

let server = null;
let serverPort = 0;

process.on('uncaughtException', (err) => {
  logMsg('FATAL ERROR', `Uncaught Exception: ${err.stack || err}`);
  try {
    dialog.showErrorBox('Application Error', `予期せぬエラーが発生しました:\n${err.message}\n\n詳細はログをご確認ください。`);
  } catch (e) {
    // ignore
  }
});

process.on('unhandledRejection', (reason) => {
  logMsg('UNHANDLED REJECTION', `Unhandled Rejection: ${reason}`);
});

async function changeDataDirectory(parentWin) {
  const current = getResolvedDataDir(appRootDir);
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWin, {
    title: 'データ保存先ディレクトリを選択',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  });

  if (canceled || filePaths.length === 0) return;

  const selectedPath = filePaths[0];
  const success = saveConfig(appRootDir, { dataDir: selectedPath });

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

async function handleImportFile(parentWin) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWin, {
    title: 'インポートするノートブック / ファイルを選択',
    properties: ['openFile'],
    filters: [
      { name: 'Jupyter Notebook / Python / Data', extensions: ['ipynb', 'py', 'csv', 'json', 'txt'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) return;

  try {
    const filePath = filePaths[0];
    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    if (parentWin && !parentWin.isDestroyed()) {
      parentWin.webContents.send('app:import-file', { fileName, content, path: filePath });
    }
    logMsg('MAIN', `File imported: ${filePath}`);
  } catch (err) {
    dialog.showErrorBox('インポートエラー', `ファイルの読み込みに失敗しました: ${err.message}`);
  }
}

async function handleExportFile(parentWin) {
  const { canceled, filePath } = await dialog.showSaveDialog(parentWin, {
    title: 'ノートブックのエクスポート先を選択',
    defaultPath: 'notebook.ipynb',
    filters: [
      { name: 'Jupyter Notebook', extensions: ['ipynb'] },
      { name: 'Python Script', extensions: ['py'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ]
  });

  if (canceled || !filePath) return;

  if (parentWin && !parentWin.isDestroyed()) {
    parentWin.webContents.send('app:request-export-data', { targetPath: filePath });
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

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelStr = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'LOG';
    logMsg(`RENDERER ${levelStr}`, `${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['保存せずに終了', 'キャンセル'],
      defaultId: 0,
      cancelId: 1,
      title: '未保存の変更',
      message: '未保存の変更がある可能性があります。',
      detail: '保存せずにアプリケーションを終了しますか？'
    });

    if (choice === 0) {
      event.preventDefault();
    }
  });

  createApplicationMenu(mainWindow, {
    changeDataDirectory,
    getResolvedDataDir: () => getResolvedDataDir(appRootDir),
    getOverridesPath: () => getOverridesPath(currentDataDir),
    getSettingsDir: () => getSettingsDir(currentDataDir),
    getLogPath: () => getLogPath(currentDataDir),
    getLogDir: () => getLogDir(currentDataDir),
    handleImportFile,
    handleExportFile
  });
  setupContextMenu(mainWindow);

  mainWindow.loadURL(`http://127.0.0.1:${port}/lab/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Prevent multi-instance running
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
    initLogger(currentDataDir);

    const rootDir = app.isPackaged
      ? path.join(app.getAppPath(), 'jupyterlite')
      : path.resolve(__dirname, '../jupyterlite');

    logMsg('MAIN', `Starting app (isPackaged: ${app.isPackaged}, rootDir: ${rootDir}, dataDir: ${currentDataDir})`);

    // 1. Start local server
    const serverResult = await startLocalServer({
      rootDir,
      dataDir: currentDataDir,
      preferredPort: DEFAULT_PORT,
      logFn: logMsg,
      loadOverridesFn: (dir) => loadOverrides(dir, logMsg)
    });
    server = serverResult.server;
    serverPort = serverResult.port;

    // 2. Network isolation filter
    applyNetworkFilter(session.defaultSession, logMsg);
    applyNetworkFilter(session.fromPartition('persist:jupyter-data'), logMsg);

    createWindow(serverPort);
  });
}

// 4. File I/O IPC Handlers
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

// 5. Application termination
app.on('window-all-closed', () => {
  logMsg('MAIN', 'すべてのウィンドウが閉じられました。アプリケーションを完全終了します。');
  app.quit();
});

app.on('will-quit', () => {
  if (server) {
    try {
      server.close();
      logMsg('MAIN', 'ローカルHTTPサーバーを安全に停止しました。');
    } catch (e) {
      // ignore
    }
  }
  logMsg('MAIN', `=== Application Terminated at ${new Date().toISOString()} ===`);
});
