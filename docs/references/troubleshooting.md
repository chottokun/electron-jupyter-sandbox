---
type: Troubleshooting Knowledge
title: トラブルシューティング & 既知の課題ナレッジベース
description: ElectronとJupyterLite統合環境における既知の課題、ログ解析手法、解決策の集約。
tags:
  - troubleshooting
  - knowledge
  - errors
  - debugging
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# トラブルシューティング & ナレッジベース

本ドキュメントでは、Electron + JupyterLite (Pyodide Wasm) の統合環境開発において遭遇する特有の課題と解決策をまとめています。

## 1. ログファイルによるデバッグ (`app.log`)

アプリのすべてのログ（Node.js, 内部HTTPサーバー, Renderer, Worker, セキュリティブロック）はプロジェクトルートの **`app.log`** に自動保存されます。

## 2. 既知の課題と解決策一覧

### ① `TypeError: Cannot download from a non-remote location: 'jupyter://...'`
* **事象**: 特権カスタムプロトコル（`jupyter://`）でアセットを配信した際、Pyodide の `micropip` がホイールのフェッチに失敗してカーネルが起動しない。
* **原因**: `micropip` の内部実装が `http://` または `https://` スキームのみを有効なリモートロケーションとして受け付ける設計になっているため。
* **解決策**: カスタムスキームではなく、メインプロセス内で **Node.js 標準の軽量ローカル HTTP サーバー（`http://127.0.0.1:<random_port>`）** を起動してアセットを配信する。

### ② `SyntaxError: Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'`
* **事象**: カスタムプロトコル（`jupyter://`）上で JupyterLab が WebSocket 接続を作ろうとして例外が発生する。
* **原因**: JupyterLab の URL スキーム推論が `jupyter:` を `ws:` に変換できないため。
* **解決策**: ローカル HTTP サーバー配信に移行することで、自動的に `ws://127.0.0.1:<port>` となり解決。

### ③ `ImportError: cannot import name 'CompatibilityLayer' from 'micropip.package_index'`
* **事象**: Pyodide ランタイムロード中に `piplite` のインポートで失敗する。
* **原因**: `jupyterlite-pyodide-kernel 0.8.5` が内包する `piplite` と、Pyodide `0.27.x` 系の `micropip` 内部 API にバージョンの非互換があるため。
* **解決策**: `jupyter_lite_config.json` の `PyodideAddon.pyodide_url` に **`314.0.5`**（`jupyterlite-pyodide-kernel` の想定バージョン）を指定して再ビルドする。

### ④ `ValueError: Can't find a pure Python 3 wheel for: 'comm'`
* **事象**: Pyodide 初期化時に `comm` パッケージの探索で PyPI（外部通信）にアクセスし、セキュリティ遮断されてカーネル起動が停止する。
* **原因**: `comm` パッケージが Pyodide 標準バイナリに含まれておらず、初期化時にオンデマンドで PyPI を参照しようとするため。
* **解決策**: `wheels/comm-*-py3-none-any.whl` をローカルにダウンロードし、`jupyter_lite_config.json` の `PipliteAddon.piplite_urls: ["wheels"]` で事前同梱・ローカルインデックス化する。

### ⑤ `TypeError: Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')`
* **事象**: `npm start` 実行時に Electron API が未定義エラーとなる。
* **原因**: 環境変数に `ELECTRON_RUN_AS_NODE=1` が設定されているため。
* **解決策**: 実行時に `unset ELECTRON_RUN_AS_NODE` を行う。

### ⑥ `Electron Security Warning (Insecure Content-Security-Policy)`
* **事象**: 開発モードで DevTools に CSP の警告が表示される。
* **原因**: レスポンスヘッダーに `Content-Security-Policy` が未指定だったため。
* **解決策**: ローカル HTTP サーバーのレスポンスヘッダーに `Content-Security-Policy: default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1:*;` を付与して解消。

### ⑦ 新規起動時や未保存ノートブックがある状態でウィンドウの「×」ボタンを押しても終了しない
* **事象**: ノートブックを編集中のまま、または新規起動直後に Electron ウィンドウの「×」ボタンを押してもウィンドウが閉じない（無反応になる）。
* **原因**: JupyterLab が未保存の変更（dirty state）を検出してブラウザの `beforeunload` ガードを有効化しているが、Electron ではデフォルトでブラウザの離脱確認プロンプトが表示されず、クローズ要求が内部でキャンセル（ブロック）されるため。
* **解決策**: メインプロセス側で `mainWindow.webContents.on('will-prevent-unload')` をリスンし、Electron ネイティブの終了確認ダイアログ（「保存せずに終了 / キャンセル」）を表示してアンロード阻止を解除（`event.preventDefault()`）する。

### ⑧ 再起動するたびに保存したノートブックや設定が消えてしまう
* **事象**: ノートブックを保存してアプリを終了し、再度立ち上げるとファイル一覧が空になり、前回のデータが見当たらない。
* **原因**: 内部HTTPサーバーが `server.listen(0)` でランダムポートを使用していたため、起動するたびにオリジン（`http://127.0.0.1:<port>`）が変わり、Chromium の同一生成元ポリシー（Same-Origin Policy）により別オリジンの IndexedDB が参照されていたため。
* **解決策**: `DEFAULT_PORT = 58888` でポートを固定し、`app.requestSingleInstanceLock()` による多重起動防止と組み合わせることで同一オリジンを恒久的に維持する。
