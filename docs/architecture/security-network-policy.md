# セキュリティ＆ネットワークポリシー設計書

`electron-jupyter-sandbox` における外部通信制御およびビルド時セキュリティポリシーの仕様解説です。

---

## 🛡️ 基本方針と多層防御アーキテクチャ

本アプリケーションは、ローカル環境での完全隔離実行を前提とした安全な Jupyter 実行基盤を提供します。
企業・機密環境におけるエアギャップ要件と、一般開発環境における柔軟性の双方を満たすため、**「ビルド時ポリシー」** と **「実行時設定」** を組み合わせた多層防御構造を採用しています。

```mermaid
graph TD
    A[Electron WebRequest] --> B{内部URL判定<br/>jupyter:, localhost, blob:, data:}
    B -- Yes (内部通信) --> C[無条件許可 (Allow)]
    B -- No (外部通信) --> D{ビルド時ポリシー<br/>isNetworkConfigurable}
    D -- false (Strict 完全隔離版) --> E[強制遮断 (Block)]
    D -- true (Configurable 設定可能版) --> F{config.json 設定<br/>allowExternalNetwork}
    F -- false --> E
    F -- true --> G[外部通信許可 (Allow)]
```

---

## 🔒 2つのセキュリティモード

### 1. 完全隔離モード（Strict Mode / デフォルト）
* **対象**: 企業内、機密データ分析、オフライン専用環境
* **動作仕様**:
  * 外部インターネットへの通信は**コードレベルで恒久的に遮断**されます。
  * `config.json` を手動で改ざんしても外部通信は有効化されません。
  * アプリケーションメニューの項目は `外部ネットワーク接続: 完全隔離 (変更不可)` としてグレーアウト表示されます。
* **ビルド方法**:
  ```bash
  npm run package:win
  ```

### 2. 設定可能モード（Configurable Mode）
* **対象**: 個人開発、外部API連携、オンラインPyPIパッケージ利用環境
* **動作仕様**:
  * デフォルト状態では外部通信は遮断されています。
  * ユーザーは「設定」メニューの `外部ネットワーク接続を許可する` トグルから通信を有効化／無効化できます。
  * 有効化時には誤操作防止のための**セキュリティ警告ダイアログ**が表示されます。
* **ビルド方法**:
  ```bash
  ALLOW_NETWORK_CONFIG=true npm run package:win
  ```

---

## 💻 内部通信として常に許可されるURL

以下のURL/スキームは、JupyterLite 本体の動作およびローカルAI連携に必要なため、セキュリティモードに関わらず常に許可されます：

* `jupyter://` : 内包された JupyterLite アセット
* `http://localhost:*`, `http://127.0.0.1:*` : 内包ローカルHTTPサーバーおよびローカルLLM（Ollama等）
* `devtools://` : 開発者ツール
* `blob:`, `data:` : グラフ描画・画像生成用内部データURI

---

## 📝 設定ファイル (`config.json`) の仕様

| キー | 型 | デフォルト値 | 説明 |
| :--- | :---: | :---: | :--- |
| `dataDir` | `string` | `"./data"` | ノートブック・設定の保存先パス |
| `allowExternalNetwork` | `boolean` | `false` | 外部ネットワーク通信の許可フラグ（※設定可能モード時のみ有効） |
