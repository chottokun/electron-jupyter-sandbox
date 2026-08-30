# Electron Jupyter Sandbox (完全隔離型・AI連携デスクトップJupyter環境)

WebAssembly (Pyodide) ベースの **JupyterLite** を **Electron** でラップし、ローカルPCの環境を一切汚さない「完全隔離型・完全オフライン」のPython実行環境を提供するデスクトップアプリケーションです。

さらに、コード実行エラー時に **AI（ローカルLLM / Web AIチャット）へ渡す最適なプロンプトをワンクリックで生成・コピーできる機能** をJupyterLab拡張機能として標準統合しています。

---

## 🚀 クイックスタート

### 1. 前提条件
- Node.js (Volta による管理推奨: `node@20.18.0`, `npm@10.8.2`)
- Python & `uv` (JupyterLite ビルドツール管理)

### 2. インストール & ビルド
```bash
# 1. Volta 環境のロード
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# 2. 依存関係のインストール (workspaces 経由で一括)
npm install

# 3. Python 仮想環境同期
uv sync

# 4. 全体ビルド (拡張機能 + Pyodide同梱JupyterLite)
npm run build
```

### 3. 起動
```bash
npm start
```

---

## 📁 ドキュメント一覧 (`docs/` - OKF v0.2 準拠)

本プロジェクトの技術ドキュメントは、**Open Knowledge Format (OKF) v0.2** に準拠して体系化されています：

- 📖 **[ナレッジベース目次 (`docs/index.md`)](docs/index.md)**
- 🏛️ **アーキテクチャ (`docs/architecture/`)**
  - [システムアーキテクチャ概要 (`docs/architecture/system-overview.md`)](docs/architecture/system-overview.md)
  - [バージョン整合性マトリクス (`docs/architecture/version-matrix.md`)](docs/architecture/version-matrix.md)
- 🧩 **コンポーネント (`docs/components/`)**
  - [AI エラーコピー拡張機能 仕様 (`docs/components/ai-copy-extension.md`)](docs/components/ai-copy-extension.md)
  - [Pyodide Wasm カーネル & 配信基盤 (`docs/components/pyodide-kernel.md`)](docs/components/pyodide-kernel.md)
- 📋 **手順書 / プレイブック (`docs/playbooks/`)**
  - [Electron パッケージング手順書 (`docs/playbooks/packaging-guide.md`)](docs/playbooks/packaging-guide.md)
  - [完全オフライン Wheel 追加手順書 (`docs/playbooks/offline-wheels.md`)](docs/playbooks/offline-wheels.md)
  - [JupyterLab UI 日本語化手順書 (`docs/playbooks/localization.md`)](docs/playbooks/localization.md)
- 🛠️ **リファレンス (`docs/references/`)**
  - [トラブルシューティング & ナレッジベース (`docs/references/troubleshooting.md`)](docs/references/troubleshooting.md)

---

## 🛡️ セキュリティ仕様

1. **完全オフライン保証**: Electron の `webRequest` フィルターにより、`127.0.0.1` 以外の外部インターネットアクセスを物理的に遮断。
2. **OS保護**: Python コードはブラウザ内の WebAssembly (Pyodide) 上で実行されるため、OS ファイルシステムの直接破壊リスクはゼロ。
3. **ローカルログ永続化**: アプリケーションのすべての通信・エラーログは `./app.log` に自動記録。
