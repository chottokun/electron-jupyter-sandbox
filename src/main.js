const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

const SCHEME = 'jupyter';

// 1. 特権スキームの登録 (Service Worker, Fetch, Wasm, CORSを有効化)
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function createWindow() {
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

  // カスタムプロトコル経由でJupyterLiteをロード
  win.loadURL(`${SCHEME}://app/index.html`);
}

app.whenReady().then(() => {
  const rootDir = path.resolve(__dirname, '../jupyterlite');

  // 2. カスタムプロトコルハンドラー (COOP/COEPヘッダーを付与して配信, パストラバーサル対策)
  protocol.handle(SCHEME, (request) => {
    const requestUrl = new url.URL(request.url);
    let relativePath = requestUrl.pathname;
    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html';
    }

    // パストラバーサル対策: rootDir 外へのアクセスを検証
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(rootDir, safePath);

    if (!filePath.startsWith(rootDir)) {
      return new Response('Access Denied', { status: 403 });
    }

    const fileUrl = url.pathToFileURL(filePath).toString();

    return net.fetch(fileUrl, {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    });
  });

  // 3. ネットワーク完全隔離 (外部通信を遮断・ローカル通信、blob:, data: を許可)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const parsed = new URL(details.url);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    const isInternal = parsed.protocol === `${SCHEME}:` || parsed.protocol === 'devtools:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:';

    if (isInternal || isLocal) {
      callback({ cancel: false });
    } else {
      console.warn(`[Security] 外部通信をブロックしました: ${details.url}`);
      callback({ cancel: true });
    }
  });

  createWindow();
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
