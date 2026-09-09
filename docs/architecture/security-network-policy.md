# セキュリティ＆ネットワークポリシー設計書

`electron-jupyter-sandbox` における外部通信制御、多層防御、およびビルド時セキュリティポリシーの仕様解説です。

---

## 🛡️ 基本方針と多層防御アーキテクチャ

本アプリケーションは、ローカル環境での完全隔離実行を前提とした安全な Jupyter 実行基盤を提供します。
企業・機密環境におけるエアギャップ要件と、一般開発環境における柔軟性の双方を満たすため、**「ビルド時ポリシー」**、**「実行時設定」**、**「ブラウザ層（CSP/COEP）」** を組み合わせた多層防御構造を採用しています。

```mermaid
graph TD
    A[Pyodide / レンダラーからの通信要求] --> B{内部URL判定<br/>jupyter:, localhost, blob:, data:}
    B -- Yes (内部通信) --> C[無条件許可 (Pass)]
    B -- No (外部通信) --> D{ビルド時静的ポリシー<br/>isNetworkConfigurable}
    D -- false (Strict 完全隔離版) --> E[強制遮断 (Block)]
    D -- true (Configurable 設定可能版) --> F{ランタイム許可判定<br/>isExternalNetworkAllowed}
    F -- false (OFF) --> E
    F -- true (ON) --> G[通信許可 (Pass)]
    G --> H[CORP/CORS ヘッダー自動補完 & 動的CSP適用]
```

---

## 🔒 2つのセキュリティモード

### 1. 完全隔離モード（Strict Mode / デフォルト）
* **対象**: 企業内、機密データ分析、オフライン専用環境、エアギャップ環境
* **動作仕様**:
  * 外部インターネットへの通信は**コードレベルで恒久的に遮断**されます。
  * `config.json` を手動で改ざんしても外部通信は有効化されません（多層防御）。
  * アプリケーションメニューの項目は `外部ネットワーク接続: 完全隔離 (変更不可)` としてグレーアウト表示されます。
* **ビルド方法**:
  ```bash
  npm run package:win
  # または
  npm run package:linux
  ```

### 2. 設定可能モード（Configurable Mode）
* **対象**: 個人開発、外部API連携、オンラインPyPIパッケージ・外部CDNスクリプト（OpenCV.js等）利用環境
* **動作仕様**:
  * 初期状態（デフォルト）では外部通信は遮断されています。
  * ユーザーは「設定」メニューの `外部ネットワーク接続を許可する` トグルから通信を有効化／無効化できます。
  * 有効化時には誤操作防止のための**セキュリティ警告ダイアログ**および**再読み込み確認**が表示されます。
* **ビルド方法**:
  ```bash
  npm run package:win:configurable
  ```

---

## ⚙️ レイヤー別の技術仕様

### 1. Electron セッション層 (`src/security.js`)
* **`onBeforeRequest`**: すべてのネットワーク要求を検査し、許可されていない外部通信を `callback({ cancel: true })` で即座に破棄。
* **`onHeadersReceived`**: 外部通信許可時、レスポンスヘッダーに `Cross-Origin-Resource-Policy: cross-origin` および CORS ヘッダーを自動付与。
* **Private Network Access (PNA) 制限解除**: `127.0.0.1`（ローカルIP）から公衆インターネットへのアクセスにおける Chromium の PNA 制限を解除。

### 2. ローカルサーバー & ブラウザ層 (`src/server.js`)
* **Cross-Origin-Embedder-Policy (COEP)**: `credentialless` を採用。Pyodide の高速実行（`SharedArrayBuffer`）要件を満たしつつ、外部への `fetch` がブラウザにより `AbortError` で破棄されるのを防止。
* **動的 CSP（Content-Security-Policy）**:
  * **遮断時**: `default-src 'self' ...; connect-src 'self' ...; script-src 'self' ...;`
  * **許可時**: `connect-src * ...; script-src * ...; worker-src * ...; img-src * ...;`

### 3. 設定永続化 & 権限安全機構 (`src/config.js`, `src/main.js`)
* **メモリ即時反映**: メニューでトグルを切り替えた瞬間、メモリ上のランタイムフラグが同期され、ファイルI/Oの遅延や失敗に影響されず動作。
* **UAC / 保護ディレクトリ対応**: Windows の `C:\Program Files` などの書き込み制限環境下では、自動的に `%APPDATA%` (`userData`) 配下の書き込み可能な領域に `config.json` を安全解決・保存。

---

## 💻 内部通信として常に許可されるURL

以下のURL/スキームは、JupyterLite 本体の動作およびローカルAI連携に必要なため、セキュリティモードに関わらず常に許可されます：

* `jupyter://` : 内包された JupyterLite アセット
* `http://localhost:*`, `http://127.0.0.1:*` : 内包ローカルHTTPサーバーおよびローカルLLM（Ollama等）
* `devtools://` : 開発者ツール
* `blob:`, `data:` : グラフ描画・画像生成用内部データURI

---

## 🐍 Python / Pyodide での外部通信レシピ集

外部ネットワーク接続が「ON（許可）」の状態で、JupyterLab ノートブックから利用できるコード例です。

### 1. 外部 Web API からの JSON 取得 (`pyfetch`)
```python
import json
from pyodide.http import pyfetch

res = await pyfetch("https://jsonplaceholder.typicode.com/todos/1")
data = await res.json()
print("✅ 取得データ:", json.dumps(data, indent=2))
```

### 2. 外部 CDN からの OpenCV.js (WASM) 動的ロード
```python
import js
import time
from pyodide.http import pyfetch

async def load_opencv():
    if hasattr(js, "cv") and hasattr(js.cv, "Mat"):
        print("✅ OpenCV.js はロード済みです。")
        return True

    opencv_url = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js"
    print(f"⏳ OpenCV.js ダウンロード中: {opencv_url}")
    
    res = await pyfetch(opencv_url)
    script_text = await res.string()
    js.eval(script_text)

    start_time = time.time()
    while time.time() - start_time < 30.0:
        if hasattr(js, "cv") and hasattr(js.cv, "Mat"):
            print(f"✅ OpenCV.js 初期化完了 ({time.time() - start_time:.2f}秒)")
            return True
        time.sleep(0.3)
    return False

await load_opencv()

# 動作テスト
mat = js.cv.Mat.zeros(100, 100, js.cv.CV_8UC3)
print(f"Mat created: {mat.rows}x{mat.cols}")
mat.delete()
```

---

## 📝 設定ファイル (`config.json`) の仕様

| キー | 型 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| `dataDir` | `string` | `"./data"` | ノートブック・設定の保存先パス |
| `allowExternalNetwork` | `boolean` | `false` | 外部ネットワーク通信の許可フラグ（※設定可能モード時のみ有効） |
