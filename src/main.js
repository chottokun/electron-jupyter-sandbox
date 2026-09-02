const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

const { saveConfig, getResolvedDataDir, isExternalNetworkAllowed, setExternalNetworkAllowed } = require('./config');
const { logger } = require('./logger');
const { getSettingsDir, getOverridesPath } = require('./settings');
const { startLocalServer } = require('./server');
const { applyNetworkFilter } = require('./security');
const { createApplicationMenu, setupContextMenu } = require('./menu');
const { getSecurityMode, isNetworkConfigurable } = require('./policy');


// アプリケーションのベースディレクトリ解決
const appRootDir = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : path.resolve(__dirname, '..');

const configFilePath = path.join(appRootDir, 'config.json');

const currentDataDir = getResolvedDataDir(appRootDir, configFilePath);
try {
  if (!fs.existsSync(currentDataDir)) {
    fs.mkdirSync(currentDataDir, { recursive: true });
  }
  app.setPath('userData', currentDataDir);
} catch (e) {
  console.error('Failed to initialize data directory:', e);
}

let serverInstance = null;

process.on('uncaughtException', (err) => {
  logger.log('FATAL ERROR', `Uncaught Exception: ${err.stack || err}`, app.isPackaged, currentDataDir);
  try {
    dialog.showErrorBox('Application Error', `予期せぬエラーが発生しました:\n${err.message}\n\n詳細はログをご確認ください。`);
  } catch (e) {
    // ignore
  }
});

process.on('unhandledRejection', (reason) => {
  logger.log('UNHANDLED REJECTION', `Unhandled Rejection: ${reason}`, app.isPackaged, currentDataDir);
});

async function changeDataDirectory(parentWin) {
  const current = getResolvedDataDir(appRootDir, configFilePath);
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWin, {
    title: 'データ保存先ディレクトリを選択',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory']
  });

  if (canceled || filePaths.length === 0) return;

  const selectedPath = filePaths[0];
  const success = saveConfig(configFilePath, { dataDir: selectedPath });

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
    logger.log('MAIN', `File imported: ${filePath}`, app.isPackaged, currentDataDir);
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
    logger.log(`RENDERER ${levelStr}`, `${message} (${sourceId}:${line})`, app.isPackaged, currentDataDir);
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
    getResolvedDataDir: () => getResolvedDataDir(appRootDir, configFilePath),
    getOverridesPath: () => getOverridesPath(currentDataDir),
    getSettingsDir: () => getSettingsDir(currentDataDir),
    getLogPath: () => logger.getLogPath(currentDataDir),
    getLogDir: () => logger.getLogDir(currentDataDir),
    handleImportFile,
    handleExportFile,
    isExternalNetworkAllowed: () => isExternalNetworkAllowed(configFilePath),
    toggleExternalNetwork: async (newVal) => {
      setExternalNetworkAllowed(configFilePath, newVal);
      logger.log('SECURITY', `外部ネットワーク設定を更新しました: ${newVal ? '許可' : '遮断'}`, app.isPackaged, currentDataDir);
    }
  });
  setupContextMenu(mainWindow);

  mainWindow.loadURL(`http://127.0.0.1:${port}/lab/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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
    logger.initLogger(currentDataDir);

    const rootDir = app.isPackaged
      ? path.join(app.getAppPath(), 'jupyterlite')
      : path.resolve(__dirname, '../jupyterlite');

    const securityMode = getSecurityMode();
    const networkAllowed = isExternalNetworkAllowed(configFilePath);
    logger.log('MAIN', `Starting app (isPackaged: ${app.isPackaged}, rootDir: ${rootDir}, dataDir: ${currentDataDir})`, app.isPackaged, currentDataDir);
    logger.log('SECURITY', `Security Policy: ${securityMode} (Network Toggle Configurable: ${isNetworkConfigurable()}, External Network Allowed: ${networkAllowed})`, app.isPackaged, currentDataDir);

    const { server, port } = await startLocalServer(rootDir, currentDataDir, 58888, () => isExternalNetworkAllowed(configFilePath));
    serverInstance = server;


    const logHandler = (cat, msg) => logger.log(cat, msg, app.isPackaged, currentDataDir);
    const networkFilterOptions = {
      logFunc: logHandler,
      isNetworkAllowed: () => isExternalNetworkAllowed(configFilePath)
    };
    applyNetworkFilter(session.defaultSession, networkFilterOptions);
    applyNetworkFilter(session.fromPartition('persist:jupyter-data'), networkFilterOptions);

    createWindow(port);
  });
}


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

app.on('window-all-closed', () => {
  logger.log('MAIN', 'すべてのウィンドウが閉じられました。アプリケーションを完全終了します。', app.isPackaged, currentDataDir);
  app.quit();
});

app.on('will-quit', () => {
  if (serverInstance) {
    try {
      serverInstance.close();
      logger.log('MAIN', 'ローカルHTTPサーバーを安全に停止しました。', app.isPackaged, currentDataDir);
    } catch (e) {
      // ignore
    }
  }
  logger.log('MAIN', `=== Application Terminated at ${new Date().toISOString()} ===`, app.isPackaged, currentDataDir);
});
