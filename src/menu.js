const { app, Menu, MenuItem, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { isNetworkConfigurable } = require('./policy');

/**
 * electron-jupyter-sandbox アプリケーションメニュー構築モジュール
 * 
 * @param {BrowserWindow} mainWindow - メインウィンドウのインスタンス
 * @param {Object} handlers - メニューアクション用ハンドラー群
 */
function createApplicationMenu(mainWindow, handlers = {}) {
  const isMac = process.platform === 'darwin';

  const {
    changeDataDirectory = async () => {},
    getResolvedDataDir = () => '',
    getOverridesPath = () => '',
    getSettingsDir = () => '',
    getLogPath = () => '',
    getLogDir = () => '',
    handleImportFile = async () => {},
    handleExportFile = async () => {},
    isExternalNetworkAllowed = () => false,
    toggleExternalNetwork = async () => {}
  } = handlers;


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
          label: 'ノートブックをインポート (.ipynb)...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await handleImportFile(mainWindow);
          }
        },
        {
          label: 'ノートブックをエクスポート...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            await handleExportFile(mainWindow);
          }
        },
        { type: 'separator' },
        isMac
          ? { role: 'close', label: 'ウィンドウを閉じる' }
          : { role: 'quit', label: '終了', accelerator: 'CmdOrCtrl+Q' }
      ]
    },

    // 編集 メニュー
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

    // 設定 メニュー
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
            if (dataDir && fs.existsSync(dataDir)) {
              await shell.openPath(dataDir);
            } else {
              dialog.showErrorBox('エラー', `ディレクトリが存在しません: ${dataDir}`);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Jupyter設定ファイルを開く (overrides.json)',
          click: async () => {
            const overridesPath = getOverridesPath();
            if (overridesPath && fs.existsSync(overridesPath)) {
              await shell.openPath(overridesPath);
            } else {
              dialog.showErrorBox('エラー', '設定ファイルが見つかりません。');
            }
          }
        },
        {
          label: 'Jupyter設定フォルダを開く',
          click: async () => {
            const settingsDir = getSettingsDir();
            if (settingsDir && fs.existsSync(settingsDir)) {
              await shell.openPath(settingsDir);
            } else {
              dialog.showErrorBox('エラー', `設定フォルダが存在しません: ${settingsDir}`);
            }
          }
        },
        { type: 'separator' },
        ...(isNetworkConfigurable()
          ? [
              {
                label: '外部ネットワーク接続を許可する',
                type: 'checkbox',
                checked: isExternalNetworkAllowed(),
                click: async (menuItem) => {
                  if (menuItem.checked) {
                    const result = await dialog.showMessageBox(mainWindow, {
                      type: 'warning',
                      buttons: ['許可して有効化', 'キャンセル'],
                      defaultId: 1,
                      cancelId: 1,
                      title: 'セキュリティ警告',
                      message: '外部ネットワーク接続を許可しますか？',
                      detail: '外部ネットワーク通信を有効化すると、インターネット上の外部サーバーへのアクセスが可能になりますが、完全隔離のセキュリティ保護が解除されます。'
                    });

                    if (result.response === 0) {
                      await toggleExternalNetwork(true);
                    } else {
                      menuItem.checked = false;
                    }
                  } else {
                    await toggleExternalNetwork(false);
                  }
                }
              }
            ]
          : [
              {
                label: '外部ネットワーク接続: 完全隔離 (変更不可)',
                enabled: false
              }
            ])
      ]
    },


    // ヘルプ メニュー
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
            if (logDir && fs.existsSync(logDir)) {
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

/**
 * 右クリックコンテキストメニューの設定
 */
function setupContextMenu(window) {
  window.webContents.on('context-menu', (event, params) => {
    if (params.isEditable || params.selectionText.trim().length > 0) {
      const contextMenu = Menu.buildFromTemplate([
        { role: 'undo', label: '元に戻す', enabled: params.isEditable },
        { role: 'redo', label: 'やり直す', enabled: params.isEditable },
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
