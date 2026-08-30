const { app, Menu, MenuItem, dialog, BrowserWindow } = require('electron');

/**
 * electron-jupyter-sandbox 用のアプリケーションメニュー設定モジュール
 * OS別の標準メニュー構成（macOS固有のアプリメニュー、編集ショートカット、DevTools等）を網羅
 */
function createApplicationMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS専用 アプリケーションメニュー
    ...(isMac
      ? [
          {
            label: app.name || 'Jupyter Sandbox',
            submenu: [
              { role: 'about', label: `${app.name || 'Jupyter Sandbox'} について` },
              { type: 'separator' },
              { role: 'services', label: 'サービス' },
              { type: 'separator' },
              { role: 'hide', label: `${app.name || 'Jupyter Sandbox'} を隠す` },
              { role: 'hideOthers', label: 'ほかを隠す' },
              { role: 'unhide', label: 'すべて表示' },
              { type: 'separator' },
              { role: 'quit', label: `${app.name || 'Jupyter Sandbox'} を終了` }
            ]
          }
        ]
      : []),

    // ファイル メニュー
    {
      label: 'ファイル',
      submenu: [
        {
          label: 'ファイルを開く...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:open-file');
            }
          }
        },
        {
          label: '保存...',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:save-file');
            }
          }
        },
        { type: 'separator' },
        isMac
          ? { role: 'close', label: 'ウィンドウを閉じる' }
          : { role: 'quit', label: '終了' }
      ]
    },

    // 編集 メニュー（macOSでのCmd+C/V/X/A等のショートカットを有効化するために標準roleを設定）
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直し' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' }
      ]
    },

    // 表示 メニュー
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'forceReload', label: '強制再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツールを表示' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーン切り替え' }
      ]
    },

    // ウィンドウ メニュー
    {
      label: 'ウィンドウ',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: 'ズーム' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '手前に表示' },
              { type: 'separator' },
              { role: 'window', label: 'ウィンドウ' }
            ]
          : [{ role: 'close', label: '閉じる' }])
      ]
    },

    // ヘルプ メニュー
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'Jupyter Sandbox について',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Jupyter Sandbox',
              message: 'Electron Jupyter Sandbox',
              detail: 'WebAssembly (Pyodide) ベースの完全隔離型・AI連携デスクトップJupyter環境\nVersion: 1.0.0'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * 右クリックコンテキストメニューの設定
 */
function setupContextMenu(window) {
  window.webContents.on('context-menu', (event, params) => {
    // 編集可能なテキスト領域または選択されたテキストがある場合、カスタムコンテキストメニューを表示
    if (params.isEditable || params.selectionText.trim().length > 0) {
      const contextMenu = Menu.buildFromTemplate([
        { role: 'undo', label: '元に戻す', enabled: params.isEditable },
        { role: 'redo', label: 'やり直し', enabled: params.isEditable },
        { type: 'separator' },
        { role: 'cut', label: '切り取り', enabled: params.isEditable && params.selectionText.length > 0 },
        { role: 'copy', label: 'コピー', enabled: params.selectionText.length > 0 },
        { role: 'paste', label: '貼り付け', enabled: params.isEditable },
        { role: 'selectAll', label: 'すべて選択' }
      ]);
      contextMenu.popup({ window });
    }
  });
}

module.exports = {
  createApplicationMenu,
  setupContextMenu
};
