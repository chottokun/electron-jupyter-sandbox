---
type: Playbook
title: Electron メニュー・アイコンカスタマイズガイド
description: electron-jupyter-sandbox におけるアプリケーションメニュー、コンテキストメニュー、トレイアイコン、およびパッケージング用各種OSアイコン設定のベストプラクティス。
tags:
  - menu
  - icon
  - electron
  - playbook
  - customization
status: stable
generated:
  by: agent:jules
  at: '2026-08-30T03:00:00Z'
---

# Electron メニュー・アイコンカスタマイズガイド

本ガイドでは、本プロジェクト（`electron-jupyter-sandbox`）における **メニュー（アプリケーション・コンテキストメニュー）** および **アイコン（起動用・ウィンドウ・タスクバー/Dock・トレイ）** の設計原則とカスタマイズのベストプラクティスを解説します。

---

## 1. メニュー設計のベストプラクティス

JupyterLite を Electron でラップする構成において、デスクトップネイティブの操作性と JupyterLab UI の両立が重要です。

### 1.1 OS別アプリケーションメニューの定義 (`src/menu.js`)
- **macOS要件**: macOSではアプリケーションメニューに標準ロール（`undo`, `copy`, `paste`, `selectAll` など）を記述しないと、`Cmd+C` や `Cmd+V` などのキーボードショートカットが動作しません。
- **マルチプラットフォーム分岐**: `process.platform === 'darwin'` で分岐し、macOS専用の「アプリ名メニュー（About, Hide, Quit）」を追加します。
- **IPC連動**: 「ファイルを開く（Cmd/Ctrl+O）」や「保存（Cmd/Ctrl+S）」等の標準ショートカットは、レンダラープロセスの JupyterLite UI 側へ IPC メッセージを送信して連動させます。

### 1.2 右クリックコンテキストメニュー (`setupContextMenu`)
- JupyterLab 自体が独自コンテキストメニューを描画しますが、テキスト編集領域や外部フォーム等では `context-menu` イベントをフックし、標準の切り取り/コピー/貼り付けポップアップメニューを `menu.popup({ window })` で表示します。

---

## 2. アイコン設計のベストプラクティス

アイコン設定は、「**開発・実行時（ウィンドウ/タスクバー）**」と「**ビルド・パッケージング時（.exe / .app / AppImage）**」の2段階で管理します。

### 2.1 ディレクトリ構造 (`build/`)
electron-builder の推奨構成に従い、リポジトリルート直下の `build/` ディレクトリに各OS向けアイコンアセットを配置します。

```text
build/
├── icon.png          # Linux (AppImage) & 実行時 BrowserWindow アイコン (512x512 PNG)
├── icon.ico          # Windows (.exe インストーラー / ポータブル版用マルチサイズ ICO)
├── icon.icns         # macOS (.app / .dmg 用 ICNS)
└── tray-icon.png     # タスクバー/システムトレイ常駐アイコン (32x32 または Template PNG)
```

### 2.2 OS別推奨フォーマット一覧

| プラットフォーム | ファイル形式 | 解像度 | 用途 |
| :--- | :--- | :--- | :--- |
| **Windows** | `.ico` | 16x16, 32x32, 48x48, 256x256 内包マルチサイズ | `.exe` アイコン、NSISインストーラー/アンインストーラー |
| **macOS** | `.icns` | 16x16 〜 1024x1024 (@2x) | Dock、Finder、DMGインストーラー |
| **Linux** | `.png` | 512x512 | AppImage、デスクトップエントリー |

### 2.3 `package.json` での設定 (`electron-builder`)
```json
"build": {
  "appId": "com.example.electron-jupyter-sandbox",
  "productName": "JupyterSandbox",
  "directories": {
    "buildResources": "build"
  },
  "linux": {
    "icon": "build/icon.png"
  },
  "win": {
    "icon": "build/icon.ico"
  },
  "nsis": {
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico"
  },
  "mac": {
    "icon": "build/icon.icns"
  }
}
```

### 2.4 実行時 Window アイコン (`src/main.js`)
`BrowserWindow` のインスタンス化時に `icon` オプションで `build/icon.png` を指定します：

```javascript
const iconPath = path.resolve(__dirname, '../build/icon.png');
const win = new BrowserWindow({
  width: 1280,
  height: 850,
  icon: fs.existsSync(iconPath) ? iconPath : undefined,
  // ...
});
```

---

## 3. まとめ
1. **メニュー**: `src/menu.js` に集約し、macOSショートカット互換性とIPC連携を考慮したメニュー構造を維持する。
2. **アイコン**: `build/` フォルダ以下に各OSに最適なアセットを配置し、`package.json` および `BrowserWindow` オプションで紐付ける。
