[English](system-overview.en.md) | [日本語](system-overview.md)

---
type: Architecture Overview
title: 完全隔離型デスクトップJupyter環境 アーキテクチャ概要
description: ElectronとWebAssembly (Pyodide) ベースのJupyterLiteによる完全隔離・完全オフライン実行環境のシステム全体設計。
tags:
  - architecture
  - electron
  - jupyterlite
  - pyodide
  - security
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# システム全体設計とアーキテクチャ方針

本システムは、**WebAssembly (Pyodide)** ベースの **JupyterLite** を **Electron** でラップし、ローカルPCの環境を一切汚さない「完全隔離型・完全オフライン」のPython実行環境を提供するデスクトップアプリケーションです。

```text
┌─────────────────────────────────────────────────────────────┐
│                      Electron App                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Main Process (Node.js)                                  │ │
│ │  - 内部HTTPサーバー (http://127.0.0.1:<random_port>)     │ │
│ │    ・COOP/COEP/CORP ヘッダー付与 (Wasm/Worker対応)      │ │
│ │    ・正確な MIME-Type 配信 (.wasm, .whl, .mjs 等)        │ │
│ │  - 外部ネットワーク物理遮断 (127.0.0.1 以外の通信を破棄)  │ │
│ │  - OSファイルダイアログ (Open / Save IPC)               │ │
│ │  - 統合ファイルロガー (app.log)                         │ │
│ └─────────────────────────┬───────────────────────────────┘ │
│                           │ IPC (contextBridge)             │
│ ┌─────────────────────────▼───────────────────────────────┐ │
│ │ Renderer Process (Chromium Sandbox)                     │ │
│ │  ┌────────────────────────────────────────────────────┐ │ │
│ │  │ JupyterLite (JupyterLab UI)                        │ │ │
│ │  │  ┌──────────────────────────────────────────────┐  │ │ │
│ │  │  │ AI エラーコピー拡張機能 (JupyterLab Plugin)  │  │ │ │
│ │  │  │  - セル実行エラーのシグナル監視               │  │ │ │
│ │  │  │  - 🤖 AIエラーコピーボタンの動的マウント     │  │ │ │
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

## セキュリティ設計方針

1. **完全オフライン・ネットワーク遮断**
   - Electron の `webRequest.onBeforeRequest` により、`127.0.0.1` 以外の外部インターネットアクセスを物理的に破棄。
   - 機密データを含むノートブックや誤ったスクリプト実行時にも外部漏洩リスクはゼロ。

2. **OS保護とサンドボックス**
   - Pythonコードはブラウザ内の WebAssembly (Pyodide) 上で実行されるため、OSのファイルシステム破壊やシステム改ざんのリスクはありません。

3. **内部HTTPサーバー配信**
   - Node.js 標準の軽量 HTTP サーバーを `127.0.0.1` の空きポートで起動し、Pyodide の `micropip` および WebSocket が期待する標準 HTTP/WS スキームを提供します。

## JupyterLab Desktop (公式) とのアーキテクチャ比較

公式の **JupyterLab Desktop (`jupyterlab-desktop`)** と本プロジェクト（**Electron Jupyter Sandbox**）の設計思想・動作原理の違いは以下の通りです。

```text
【JupyterLab Desktop (公式)】
  [ JupyterLab UI ] 
         ↓ (HTTP/WS)
  [ ネイティブ Python プロセス (jupyter-server) ]
         ↓ (OS権限で直接実行)
  [ ホストOS (ファイル・ネットワーク・コマンド実行が無制限) ]
  ※ サンドボックスなし（通常のPythonと同じでホストOSをそのまま操作可能）

【当プロジェクト (Electron Jupyter Sandbox)】
  [ JupyterLab UI ] 
         ↓ (WASM / Web Worker)
  [ Pyodide Python ランタイム (安全なブラウザサンドボックス) ]
         ↓ (隔離・フィルター)
  [ 内部 Node.js (Contents API) ] ➔ [ 制限された data/notebooks/ のみ ]
  ※ 完全隔離（ホストOSの破壊や意図しない外部通信を100%遮断）
```

### 詳細な差異の比較表

| 比較項目 | JupyterLab Desktop (公式) | 当プロジェクト (本Sandbox) |
| :--- | :--- | :--- |
| **Pythonの実行基盤** | **ホストOS上のネイティブPython** (Conda/CPython) | **WebAssembly (Pyodide)** (ブラウザ内サンドボックス) |
| **セキュリティ / 隔離性** | **隔離なし**<br>（PythonからOSコマンド実行、外部通信、ファイル全アクセスが可能） | **完全隔離（サンドボックス）**<br>（OSコマンド実行不可、外部通信遮断、指定フォルダ外アクセス不可） |
| **ファイルシステム連携** | PythonプロセスがOSのシステムコールで直接アクセス | Node.jsの **Contents API** がパストラバーサル防御付きで安全に仲介 |
| **外部通信制御** | 制御なし（通常のPC環境と同じ） | **ネットワーク完全遮断 / 許可トグル機能** を多層防御で搭載 |
| **パッケージ管理** | 外部インターネットから `pip` / `conda` で取得 | **同梱されたオフラインWheel** から安全にインストール |
| **アプリのポータビリティ** | ネイティブPythonやCコンパイラに依存し容量が大きい | WASMベースのため軽量で、環境依存（DLL衝突等）が起きない |
| **用途・ターゲット** | 通常の開発・データ分析（信頼できるコードのみ） | **教育・AI生成コードの安全な実行・社内セキュア環境・完全オフライン利用** |

### Contents API 直接結合の設計思想

本プロジェクトでは、**「JupyterLab Desktop（公式）と同等の快適なローカルファイル直接操作（ホストOSの `data/notebooks/` 直結）」** を実現しつつ、**「WebAssemblyによる強力なサンドボックス隔離とオフライン安全性」** を両立させるため、Jupyter Server公式の **`FileContentsManager`（Contents REST API）** をNode.jsローカルサーバーへ移植して安全にマッピングしています。

