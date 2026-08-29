# 完全隔離型・AI連携デスクトップJupyter環境：実装計画書（改訂版）

## 1. 概要とアーキテクチャ方針

本システムは、**WebAssembly (Pyodide)** ベースの **JupyterLite** を **Electron** でラップし、ローカルPCの環境を一切汚さない「完全隔離型・完全オフライン」のPython実行環境を提供するデスクトップアプリケーションです。
さらに、コード実行時のエラー発生時に **AI（ローカルLLM / Web AIチャット）へ渡す最適なプロンプトをワンクリックで生成・コピーできる機能** をJupyterLab拡張機能として統合します。

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron App                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Main Process (Node.js)                                  │ │
│ │  - 特権カスタムプロトコル (jupyter://) によるアセット配信  │ │
│ │  - 外部ネットワーク通信の完全遮断 (オフライン保証)        │ │
│ │  - OSファイルダイアログ (Open / Save IPC)               │ │
│ └─────────────────────────┬───────────────────────────────┘ │
│                           │ IPC (contextBridge)             │
│ ┌─────────────────────────▼───────────────────────────────┐ │
│ │ Renderer Process (Chromium Sandbox)                     │ │
│ │  ┌────────────────────────────────────────────────────┐ │ │
│ │  │ JupyterLite (JupyterLab UI)                        │ │ │
│ │  │  ┌──────────────────────────────────────────────┐  │ │ │
│ │  │  │ JupyterLab Frontend Extension                │  │ │ │
│ │  │  │  - セル実行エラーのシグナル監視               │  │ │ │
│ │  │  │  - 🤖 AIエラーコピーボタンの生成             │  │ │ │
│ │  │  └──────────────────────────────────────────────┘  │ │ │
│ │  │  ┌──────────────────────────────────────────────┐  │ │ │
│ │  │  │ Pyodide / WebAssembly Worker                 │  │ │ │
│ │  │  │  - 完全隔離されたPython実行環境 (NumPy等)     │  │ │ │
│ │  │  │  - 仮想ファイルシステム (IndexedDB)          │  │ │ │
│ │  │  └──────────────────────────────────────────────┘  │ │ │
│ │  └────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 技術的検証とベストプラクティス

### ① JupyterLiteにおけるパッケージ制限
* **検証結果:** 動作可能（Pure Python または Pyodide公式/Wasm対応ホイール）
* **対応パッケージ:** `pandas`, `numpy`, `scipy`, `matplotlib`, `scikit-learn`、オフィス系 (`openpyxl`, `python-docx`, `python-pptx`, `beautifulsoup4`) など。
* **ベストプラクティス:** `jupyter_lite_config.json` にて必要な wheel パッケージを事前ダウンロード・同梱（`jupyter lite build` 時にバンドル）し、オフライン環境下で即座にインポート可能とします。

### ② ElectronとJupyterLiteの統合方式（Service Worker / Wasm 対策）
* **課題:** `file://` プロトコル直接読み込み（`win.loadFile`）では、Chromiumの仕様上 **Service Worker** が動作せず、Wasm実行に必要な **COOP / COEP ヘッダー** や **MIME タイプ** が満たされません。
* **ベストプラクティス:** `protocol.registerSchemesAsPrivileged` を用いて特権カスタムプロトコル（例: `jupyter://`）を定義し、メインプロセス側で適切なセキュリティヘッダーを付与して静的アセットを配信します。

### ③ JupyterLab フロントエンド拡張機能の実装方針
* **課題:** DOM を直接 `MutationObserver` で監視する手法は、JupyterLab のバージョンアップやセルの再実行・フォーカス移動で破綻しやすい。
* **ベストプラクティス:** JupyterLab 公式の **OutputModel シグナル** (`ICodeCellModel.outputs.changed`) および **Widget ライフサイクル** を利用してエラー出力（`ename`, `evalue`, `traceback`, `stderr`）を確実に検知・ボタンをマウントします。

### ④ 双方向ファイル I/O 設計（インポート / エクスポート）
* **課題:** JupyterLite の仮想ファイルシステム（IndexedDB）と OS のローカルファイルシステムの相互運用。
* **ベストプラクティス:** `preload.js` 経由で `openFile`（ローカルファイルの読み込み）と `saveFile`（ローカルへの保存）の IPC を提供し、JupyterLite の Contents API またはフロントエンド拡張からシームレスに扱えるようにします。

### ⑤ ネットワーク完全隔離（セキュリティ）
* **ベストプラクティス:** Electron の `webRequest.onBeforeRequest` を用い、内部プロトコル（`jupyter:`）およびローカルLLM用（`localhost`, `127.0.0.1`）以外の**すべての外部 HTTP/HTTPS 通信を物理的にブロック**します。

---

## 3. 詳細実装仕様

### 3.1 メインプロセス (`src/main.js`)

```javascript
// src/main.js
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
  // 2. カスタムプロトコルハンドラー (COOP/COEPヘッダーを付与して配信)
  protocol.handle(SCHEME, (request) => {
    const requestUrl = new url.URL(request.url);
    // パス正規化
    let relativePath = requestUrl.pathname;
    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html';
    }
    
    const filePath = path.join(__dirname, '../jupyterlite', relativePath);
    const fileUrl = url.pathToFileURL(filePath).toString();

    return net.fetch(fileUrl, {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    });
  });

  // 3. ネットワーク完全隔離 (外部通信を遮断・ローカル通信のみ許可)
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const parsed = new URL(details.url);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    const isInternal = parsed.protocol === `${SCHEME}:` || parsed.protocol === 'devtools:';

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
```

---

### 3.2 プリロードスクリプト (`src/preload.js`)

```javascript
// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ElectronApp', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultName, data) => ipcRenderer.invoke('dialog:saveFile', { defaultName, data }),
  isElectron: true
});
```

---

### 3.3 JupyterLab 拡張機能 (`src/extension.ts`)

JupyterLab のモデルシグナルを活用し、エラー発生時にプロンプト生成ボタンを表示します。

```typescript
// src/extension.ts
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { CodeCell } from '@jupyterlab/cells';
import { IOutputModel } from '@jupyterlab/rendermime';

const aiCopyPlugin: JupyterFrontEndPlugin<void> = {
  id: 'electron-jupyter-ai-copy:plugin',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    
    tracker.widgetAdded.connect((sender, nbPanel: NotebookPanel) => {
      nbPanel.content.model?.cells.changed.connect((_, change) => {
        if (change.type === 'add') {
          change.newValues.forEach(cellModel => {
            if (cellModel.type === 'code') {
              // 出力変更シグナルの監視
              cellModel.outputs.changed.connect((outputsList) => {
                const errorOutput = outputsList.find((out: IOutputModel) => out.type === 'error');
                if (!errorOutput) return;

                // セルのDOM要素を取得
                const cellWidget = nbPanel.content.widgets.find(w => w.model.id === cellModel.id) as CodeCell;
                if (!cellWidget) return;

                attachAICopyButton(cellWidget, cellModel.sharedModel.getSource(), errorOutput);
              });
            }
          });
        }
      });
    });
  }
};

function attachAICopyButton(cellWidget: CodeCell, sourceCode: string, errorOutput: IOutputModel) {
  const outputAreaNode = cellWidget.outputArea.node;
  if (outputAreaNode.querySelector('.ai-copy-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'ai-copy-btn jp-mod-styled jp-mod-reject';
  btn.innerText = '🤖 AI用にエラーをコピー';
  btn.style.margin = '6px 0';
  btn.style.padding = '4px 10px';
  btn.style.fontSize = '12px';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';

  btn.onclick = async () => {
    const errorData = errorOutput.data as any;
    // トレースバックの整形（ANSIカラーコードを除去）
    const traceback = Array.isArray(errorData?.traceback)
      ? errorData.traceback.join('\n').replace(/\u001b\[.*?m/g, '')
      : `${errorData?.ename || 'Error'}: ${errorData?.evalue || ''}`;

    const prompt = [
      '以下のJupyter (Python/Pyodide WASM) 環境でコード実行時にエラーが発生しました。',
      '原因の解説と、修正したコードを提示してください。',
      '',
      '【実行コード】',
      '```python',
      sourceCode,
      '```',
      '',
      '【エラー内容 / トレースバック】',
      '```text',
      traceback,
      '```'
    ].join('\n');

    await navigator.clipboard.writeText(prompt);
    btn.innerText = '✅ コピー完了！';
    setTimeout(() => { btn.innerText = '🤖 AI用にエラーをコピー'; }, 2500);
  };

  outputAreaNode.insertBefore(btn, outputAreaNode.firstChild);
}

export default aiCopyPlugin;
```

---

## 4. 開発・ビルド・パッケージング手順

### 4.1 プロジェクト初期化と環境構築
```bash
# 1. 依存ライブラリのインストール
npm init -y
npm install --save-dev electron electron-builder typescript @jupyterlab/application @jupyterlab/notebook @jupyterlab/cells @jupyterlab/rendermime

# 2. Python (JupyterLite) ビルドツールのインストール
pip install jupyterlite-core jupyterlite-pyodide
```

### 4.2 `jupyter_lite_config.json` の設定
オフラインで動作させるPyodideパッケージを明示します。
```json
{
  "LiteBuildConfig": {
    "output_dir": "jupyterlite",
    "apps": ["lab"],
    "federated_extensions": []
  }
}
```

### 4.3 ビルドとパッケージング (`package.json`)
```json
{
  "name": "electron-jupyter-sandbox",
  "version": "1.0.0",
  "main": "src/main.js",
  "scripts": {
    "build:ext": "tsc -p tsconfig.json",
    "build:jupyter": "jupyter lite build --config jupyter_lite_config.json",
    "build": "npm run build:ext && npm run build:jupyter",
    "start": "electron .",
    "package:win": "electron-builder --win --x64",
    "package:mac": "electron-builder --mac",
    "package:linux": "electron-builder --linux AppImage"
  },
  "build": {
    "appId": "com.example.electron-jupyter-sandbox",
    "productName": "JupyterSandbox",
    "files": [
      "src/**/*",
      "jupyterlite/**/*"
    ],
    "win": {
      "target": ["nsis", "portable"]
    }
  }
}
```

---

## 5. セキュリティと隔離環境の保証

1. **完全オフライン・ネットワーク遮断**
   - Electronの `webRequest.onBeforeRequest` で外部インターネットアクセスを拒否。
   - 機密データを含むノートブックや誤ったスクリプト実行時にも、外部への意図しないデータ漏洩リスクを物理的に排除。
2. **サンドボックスとOS保護**
   - Pythonコードはブラウザ内の WebAssembly (Pyodide) 上で実行されるため、OSのファイルシステム直接書き換えやシステム破壊のリスクはゼロ。
   - ノートブックファイルは必要なものだけを Electron のファイルダイアログ経由で明示的にエクスポート。
3. **ローカルAI（Ollama等）とのシームレスな併用**
   - クリップボード経由での連携に加えて、将来的に `http://localhost:11434` (Ollama) 等のエンドポイントへの通信を許可することで、完全オフラインのままでAIによる自動修正・解説を受けられる拡張性も確保。

---

## 6. 実装ロードマップ

* [ ] **Phase 1 (MVP基盤構築)**
  - Electron の特権カスタムプロトコル (`jupyter://`) 実装
  - JupyterLite の最小構成ビルドと Electron 起動確認
* [ ] **Phase 2 (AI拡張機能 & IPC統合)**
  - JupyterLab フロントエンド拡張機能の実装（シグナルベースのエラー検知とクリップボードコピー）
  - ローカルファイル Open / Save ダイアログの IPC 接続
* [ ] **Phase 3 (パッケージ同梱 & オフライン検証)**
  - NumPy, Pandas, Matplotlib などの Pyodide wheel パッケージ同梱設定
  - 外部ネットワーク切断状態での完全動作検証
* [ ] **Phase 4 (マルチプラットフォームビルド)**
  - Windows (`.exe`) / macOS (`.dmg`) / Linux (`.AppImage`) のパッケージング