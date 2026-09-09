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

1. **完全ローカル同梱 (`jupyterlite/static/pyodide/` & `wheels/`)**
   - Pyodide `314.0.5` の Wasm バイナリ、標準ライブラリ、各種データサイエンス系 wheel パッケージ（NumPy, Pandas, SciPy, Matplotlib 等）をローカルに内包。
   - 追加のオフィス・ドキュメント系 wheel パッケージ（Excel, Word, PowerPoint, PDF 等）を `wheels/` に同梱し、`piplite` 経由でオフライン利用可能。
   - 外部 CDN へのリクエストは一切行いません。

2. **内部 HTTP サーバー (`http://127.0.0.1:<port>`)**
   - Node.js 標準の `http` モジュールで起動。
   - `Cross-Origin-Opener-Policy: same-origin` および `Cross-Origin-Embedder-Policy: require-corp` を付与し、`SharedArrayBuffer` の利用を保証。

3. **MIME タイプの完全サポート**
   - `.wasm` (`application/wasm`)、`.whl` (`application/x-wheel+zip`)、`.mjs` (`application/javascript`) などの正確な配信を担保。

## 同梱・組み込みパッケージ一覧

完全オフライン環境で即座にインポートまたは `piplite.install()` 可能なパッケージ一覧です。

### 1. オフィス・ドキュメント操作系 Wheel (`wheels/`)
事前ダウンロードされ、`jupyterlite/pypi/` に内包されているパッケージ群です。

| パッケージ名 | バージョン | 主な用途 | 依存パッケージ (Pyodide同梱 / wheels) | ライセンス |
| :--- | :--- | :--- | :--- | :--- |
| `openpyxl` | 3.1.5 | Excel (`.xlsx`) 読み書き・スタイル設定 | `et-xmlfile` | MIT |
| `et-xmlfile` | 2.0.0 | openpyxl 用 XML 生成ヘルパー | なし | MIT |
| `xlsxwriter` | 3.2.9 | 高速 Excel (`.xlsx`) 生成・グラフ作成 | なし | BSD-2-Clause |
| `python-docx` | 1.2.0 | Word (`.docx`) 読み書き・生成 | `lxml`, `typing-extensions` | MIT |
| `python-pptx` | 1.0.2 | PowerPoint (`.pptx`) スライド自動生成 | `pillow`, `xlsxwriter`, `lxml`, `typing-extensions` | MIT |
| `pypdf` | 6.18.0 | PDF 抽出・結合・暗号化・メタデータ操作 | なし | BSD-3-Clause |
| `reportlab` | 5.0.1 | PDF レポート・ドキュメント描画生成 | `pillow`, `charset-normalizer` | BSD-3-Clause |
| `tabulate` | 0.10.0 | テキスト/Markdown 表形式データ整形出力 | なし | MIT |
| `defusedxml` | 0.7.1 | XML 脆弱性対策・安全なパーサー | なし | Python-2.0 |

> [!NOTE]
> これらはノートブック上で `import piplite; await piplite.install(['openpyxl', 'python-docx'])` などの形でオフラインインストールして利用します。

### 2. Pyodide 標準同梱データサイエンスパッケージ (`jupyterlite/static/pyodide/`)
Pyodide ランタイム自身に Wasm/C 拡張コンパイル済みとして同梱されている主要パッケージ群です。

- **科学計算 / 数値解析**: `numpy`, `scipy`, `sympy`, `mpmath`
- **データ分析 / 処理**: `pandas`, `pyarrow`, `polars` (micro)
- **可視化 / グラフ**: `matplotlib`, `seaborn`, `bokeh`, `altair`
- **機械学習 / 統計**: `scikit-learn`, `statsmodels`
- **パーサー / ユーティリティ**: `lxml`, `pillow`, `beautifulsoup4`, `regex`, `typing-extensions`, `charset-normalizer`

