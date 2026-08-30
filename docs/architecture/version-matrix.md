---
type: Reference Matrix
title: バージョン整合性マトリクス
description: 本システムで動作検証済みの各コンポーネント（Node, Electron, JupyterLite, Pyodide）のバージョン一覧と選定ルール。
tags:
  - version
  - matrix
  - compatibility
  - dependencies
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# バージョン整合性マトリクス

本ドキュメントは、本システムで動作検証済みのツール・ライブラリのバージョン一覧および、バージョン選定時の重要な整合性ルールをまとめたものです。

## 1. 動作確認済みバージョン一覧

| レイヤー / コンポーネント | パッケージ名 | 推奨・検証済みバージョン | 備考 |
|---|---|---|---|
| **ランタイム管理 (Node)** | Volta | `2.0.2` | `package.json` でバージョン固定 |
| **Node.js** | Node | `22.14.0` (LTS) | JupyterLab builder (`^20.19.0 || >=22.12.0`) & Electron 互換 |
| **パッケージマネージャー** | npm | `10.9.2` | workspaces 機能でパッケージ分離 |
| **デスクトップ基盤** | Electron | `^33.2.0` (33.4.11) | Chromium 130 相当 |
| **パッケージング** | electron-builder | `^25.1.8` | Linux(AppImage)/Win/Mac 対応 |
| **Python 管理** | uv | `>=0.4.0` | `.venv` / `pyproject.toml` ローカル管理 |
| **JupyterLite コア** | `jupyterlite-core` | `0.8.3` | JupyterLab 4.6.3 / Notebook 7.6.2 |
| **Pyodide カーネル** | `jupyterlite-pyodide-kernel` | `0.8.5` | `piplite 0.8.5` 内包 |
| **Wasm ランタイム** | Pyodide | `314.0.5` | Python 3.14 Wasm (互換性最重要) |
| **必須 Python パッケージ** | `comm` | `0.2.3` (pure-python whl) | カーネル初期化に必須 (`wheels/`) |
| **JupyterLab 拡張** | `@jupyterlab/application` 等 | `^4.0.0` | `packages/ai-copy-extension` |

## 2. バージョン整合性における重要ルール

### ① `jupyterlite-pyodide-kernel` と `Pyodide` のバージョン一致
`jupyterlite-pyodide-kernel 0.8.5` を使用する場合、Pyodide は **`314.0.5`** を指定する必要があります。旧系の `0.26.x` / `0.27.x` などを指定すると `ImportError: cannot import name 'CompatibilityLayer'` が発生します。

### ② `comm` パッケージの事前ローカル同梱
完全オフライン環境（外部通信遮断状態）では PyPI からダウンロードできないため、`wheels/comm-*-py3-none-any.whl` を事前に `wheels/` に配置し、`jupyter_lite_config.json` の `PipliteAddon.piplite_urls: ["wheels"]` にて同梱しておく必要があります。
