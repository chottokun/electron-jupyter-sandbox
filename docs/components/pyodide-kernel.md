---
type: Component Specification
title: Pyodide Wasm カーネルとローカル配信基盤
description: WebAssembly上で動作するPython実行環境のローカル同梱・配信基盤の仕様と設計。
tags:
  - pyodide
  - wasm
  - jupyterlite
  - kernel
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# Pyodide Wasm カーネルとローカル配信基盤

本コンポーネントは、ブラウザサンドボックス内で安全に Python コードを実行するための Pyodide WebAssembly ランタイムおよび内部配信サーバーです。

## 主要仕様

1. **完全ローカル同梱 (`jupyterlite/static/pyodide/`)**
   - Pyodide `314.0.5` の Wasm バイナリ、標準ライブラリ、各種データサイエンス系 wheel パッケージ（NumPy, Pandas, SciPy, Matplotlib 等）をローカルに内包。
   - 外部 CDN へのリクエストは一切行いません。

2. **内部 HTTP サーバー (`http://127.0.0.1:<port>`)**
   - Node.js 標準の `http` モジュールで起動。
   - `Cross-Origin-Opener-Policy: same-origin` および `Cross-Origin-Embedder-Policy: require-corp` を付与し、`SharedArrayBuffer` の利用を保証。

3. **MIME タイプの完全サポート**
   - `.wasm` (`application/wasm`)、`.whl` (`application/x-wheel+zip`)、`.mjs` (`application/javascript`) などの正確な配信を担保。
