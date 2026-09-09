---
type: Reference
title: 同梱 Python パッケージ一覧・ライセンスリファレンス
description: 完全オフラインサンドボックスに内包されている Pyodide 標準パッケージおよび追加オフィス系 wheel の詳細一覧、バージョン、用途、ライセンス情報。
tags:
  - wheels
  - pyodide
  - packages
  - licenses
  - offline
status: stable
generated:
  by: agent:antigravity
  at: '2026-09-09T02:50:00Z'
---

# 同梱 Python パッケージ一覧・ライセンスリファレンス

本システムは外部ネットワークから完全に切り離された閉空間環境（オフライン）で動作するため、必要な Python パッケージはすべてアプリケーション内部に事前同梱されています。

同梱パッケージは大きく分けて以下の 2 系統で構成されます。

1. **追加オフィス・ドキュメント操作系 Wheel (`wheels/` -> `jupyterlite/pypi/`)**
   - 開発・ビルド時に `scripts/add_wheels.py` によりダウンロード・検証・配置された純粋 Python wheel 群。
   - `piplite.install()` によりオンデマンドでカーネル環境にロードされます。
2. **Pyodide 標準同梱パッケージ (`jupyterlite/static/pyodide/`)**
   - Pyodide ランタイム自身に Wasm/C 拡張コンパイル済みとして内包されているバイナリパッケージ群。

---

## 1. 追加オフィス・ユーティリティ系 Wheel パッケージ一覧

全パッケージとも純粋 Python (py2.py3-none-any / py3-none-any) であり、商用利用・再配布が許容されるパーミッシブライセンス (MIT, BSD, PSF) のみで選定されています。また、`pip-audit` による脆弱性検証を実施済みです。

| パッケージ名 | バージョン | ファイル名 | SHA256 (短縮) | 依存関係 | ライセンス | 用途 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **openpyxl** | `3.1.5` | `openpyxl-3.1.5-py2.py3-none-any.whl` | `5282c12b...` | `et-xmlfile` | MIT | Excel (`.xlsx`) 読み書き、数式・スタイル設定 |
| **et-xmlfile** | `2.0.0` | `et_xmlfile-2.0.0-py3-none-any.whl` | `7a91720b...` | なし | MIT | openpyxl 用 XML 生成・高速化 |
| **xlsxwriter** | `3.2.9` | `xlsxwriter-3.2.9-py3-none-any.whl` | `9a5db42b...` | なし | BSD-2-Clause | 高速 Excel 生成、チャート・条件付き書式 |
| **python-docx** | `1.2.0` | `python_docx-1.2.0-py3-none-any.whl` | `3fd478f3...` | `lxml`*, `typing-extensions`* | MIT | Word (`.docx`) 作成・段落・表・書式操作 |
| **python-pptx** | `1.0.2` | `python_pptx-1.0.2-py3-none-any.whl` | `160838e0...` | `pillow`*, `xlsxwriter`, `lxml`*, `typing-extensions`* | MIT | PowerPoint (`.pptx`) プレゼンテーション自動生成 |
| **pypdf** | `6.18.0` | `pypdf-6.18.0-py3-none-any.whl` | `05b762b7...` | なし | BSD-3-Clause | PDF 結合・分割・暗号化・テキスト抽出 |
| **reportlab** | `5.0.1` | `reportlab-5.0.1-py3-none-any.whl` | `1c36e6bb...` | `pillow`*, `charset-normalizer`* | BSD-3-Clause | PDF 帳票・グラフィック・レイアウト描画生成 |
| **tabulate** | `0.10.0` | `tabulate-0.10.0-py3-none-any.whl` | `f0b0622e...` | なし | MIT | 2次元データ・テーブルの綺麗なテキスト/Markdown整形 |
| **defusedxml** | `0.7.1` | `defusedxml-0.7.1-py2.py3-none-any.whl` | `a352e7e4...` | なし | Python-2.0 (PSF) | XML 爆弾・エンティティ展開等の脆弱性防御 |
| **japanize-noto-sans-jp** | `1.0.0` | `japanize_noto_sans_jp-1.0.0-py3-none-any.whl` | `dd4a6690...` | `matplotlib`* | SIL OFL 1.1 | Google Noto Sans JP 超軽量サブセット（JIS第1水準・760KB）＆SVG描画自動設定 |

> `*` マークの付いた依存パッケージ（`matplotlib`, `lxml`, `pillow`, `typing-extensions`, `charset-normalizer`）は、Pyodide 内部に Wasm 最適化済みバイナリとして同梱されているため、余計な外部 wheel の二重取得を防止して Pyodide 提供版を優先利用します。

### ノートブックでの呼び出し例

```python
import piplite
await piplite.install(['openpyxl', 'python-docx', 'python-pptx', 'pypdf', 'reportlab', 'tabulate'])

# Excel操作
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws['A1'] = "オフライン JupyterLite"
wb.save("sample.xlsx")

# PDF生成
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
c = canvas.Canvas("sample.pdf", pagesize=letter)
c.drawString(100, 750, "Hello Pyodide Offline!")
c.save()
```

---

## 2. Pyodide 標準同梱データサイエンスパッケージ一覧 (代表例)

Pyodide `314.0.5` ランタイム自身に Wasm/C 拡張コンパイル済みとして内包されており、`import` 時に自動的にロードされます。

| 分野 | パッケージ名 | 主な機能 |
| :--- | :--- | :--- |
| **数値計算・科学技術計算** | `numpy`, `scipy`, `sympy`, `mpmath` | 高速多次元配列演算、線形代数、統計関数、記号代数 |
| **データ操作・テーブル解析** | `pandas`, `pyarrow`, `polars` (micro) | DataFrame、時系列処理、Parquet/Arrow フォーマット |
| **グラフ・可視化** | `matplotlib`, `seaborn`, `bokeh`, `altair` | 2D/3D チャート描画、インタラクティブ可視化 |
| **機械学習** | `scikit-learn`, `statsmodels` | 回帰、分類、クラスタリング、時系列モデル |
| **Web / テキスト / 画像** | `pillow`, `beautifulsoup4`, `lxml`, `regex` | 画像処理、HTML/XML パース、高度正規表現 |
| **ランタイム基盤** | `typing-extensions`, `charset-normalizer`, `micropip` | 型ヒント互換、文字コード判定、パッケージ管理 |

---

## 3. パッケージの更新および追加方法

新たなパッケージを追加したい場合は、以下の手順で自動化スクリプトを実行します。

```bash
# 特定パッケージの追加（依存関係も自動解決してダウンロード）
npm run wheels:add -- <package_name>

# 脆弱性監査
uv run python scripts/add_wheels.py --audit

# JupyterLite への反映
npm run build:jupyter

# 整合性検証
npm run wheels:verify
```

詳細は [完全オフライン Wheel 追加手順書](../playbooks/offline-wheels.md) を参照してください。
