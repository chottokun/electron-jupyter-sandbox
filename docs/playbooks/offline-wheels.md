[English](offline-wheels.en.md) | [日本語](offline-wheels.md)

---
type: Playbook
title: 完全オフライン Wheel 追加手順書
description: 閉空間環境で利用するPythonパッケージ（.whl）を事前ダウンロードしてJupyterLiteに同梱する手順。
tags:
  - wheels
  - offline
  - pip
  - playbook
status: stable
generated:
  by: agent:antigravity
  at: '2026-09-09T11:30:00Z'
---

# 完全オフライン Wheel 追加手順書

閉空間（エアギャップPC）向けに独自の Python パッケージを追加同梱する手順です。

## 1. 自動化スクリプトによる追加（推奨）

### プリセットで一括追加

オフィス系パッケージ（Excel/Word/PowerPoint/PDF対応）を一括ダウンロード:

```bash
npm run wheels:preset:office
```

含まれるパッケージ: openpyxl, xlsxwriter, python-docx, python-pptx, pypdf, tabulate, reportlab, defusedxml

### 個別パッケージの追加

```bash
# パッケージ名を指定してダウンロード（依存関係は自動解決）
npm run wheels:add -- openpyxl python-docx

# ドライラン（ダウンロードせず依存関係のみ確認）
npm run wheels:add -- openpyxl --dry-run

# クリーンダウンロード（既存ファイルをクリアしてから再ダウンロード）
npm run wheels:add -- --clean --preset office
```

### スクリプトの機能

- **依存関係の再帰解決**: PyPI API から `requires_dist` を解析し、必要な依存パッケージも自動ダウンロード
- **Pyodide 同梱パッケージの自動除外**: `pyodide-lock.json` を読み込み、Pyodide 本体に含まれるパッケージ（numpy, pandas, lxml 等 356 件）は自動的にスキップ
- **SHA256 ハッシュ検証**: ダウンロード後に整合性を検証
- **マニフェスト生成**: `wheels/manifest.json` にパッケージ一覧と依存関係ツリーを記録

### 脆弱性チェック

```bash
# pip-audit による脆弱性チェック
npm run wheels:audit
```

### ビルド後の整合性検証

```bash
# JupyterLite を再ビルド
npm run build:jupyter

# wheel がビルド出力に正しく反映されたか検証
npm run wheels:verify
```

## 2. 手動による追加

`wheels/` ディレクトリに Pure Python (`py3-none-any.whl`) または Wasm 対応の `.whl` を手動配置することも可能です。

```bash
mkdir -p wheels
# 例: openpyxl のダウンロード
python3 -c "
import urllib.request, json
for pkg in ['openpyxl', 'et_xmlfile']:
    req = urllib.request.Request(f'https://pypi.org/pypi/{pkg}/json', headers={'User-Agent': 'Python'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        whls = [u for u in data['urls'] if u['filename'].endswith('any.whl')]
        if whls:
            urllib.request.urlretrieve(whls[-1]['url'], f'wheels/{whls[-1][\"filename\"]}')
"
```

## 3. ビルドと反映

```bash
npm run build:jupyter
```

これで `jupyterlite` 内の `piplite` にホイールが登録され、オフライン下で `%pip install openpyxl` や `import openpyxl` が即座に動作します。

## 4. 追加ライブラリの動作可否（利用できるもの／できないもの）

JupyterLite（Pyodide）はブラウザの WebAssembly (WASM) サンドボックス内で動作するため、**利用できるパッケージと利用できないパッケージの明確な境界** が存在します。

```mermaid
flowchart TD
    A["追加したい Python パッケージ"] --> B{"Pyodide 公式同梱<br>(pyodide-lock.json) に存在？"}
    B -->|Yes| C["🟢 利用可能 (設定追加のみ)<br>config.json の preloadPackages または import で即座に使用可能"]
    B -->|No| D{"Pure Python wheel<br>(py3-none-any.whl) が存在？"}
    D -->|Yes| E{"OS システムコール /<br>C/Rust 依存を含む？"}
    E -->|No| F["🟢 利用可能 (wheels/ へ追加)<br>npm run wheels:add <pkg> で追加可能"]
    E -->|Yes| G["🔴 利用不可 / 制限あり<br>ソケット通信、multiprocessing、OS直接操作は不可"]
    D -->|No| H["🔴 利用不可<br>WASM 未対応の C/C++/Rust ネイティブ拡張"]
```

---

### 🟢 1. すでに最初から使えるパッケージ（同梱済み）

以下のパッケージは **追加作業不要** で、ノートブック上で `import` するだけで即座に利用可能です。

* **Pyodide 標準同梱**: `numpy`, `pandas`, `matplotlib`, `scipy`, `scikit-learn`, `sympy`, `beautifulsoup4`, `altair`, `networkx`, `tqdm`, `jinja2`, `python-dateutil`, `lxml`, `pillow` など
* **本アプリの `wheels/` 同梱済み**: `openpyxl`, `xlsxwriter`, `python-docx`, `python-pptx`, `pypdf`, `reportlab`, `tabulate`, `defusedxml`, `japanize-noto-sans-jp`

---

### 📦 2. 未同梱だが追加導入できるおすすめライブラリ（追加候補）

必要に応じて `npm run wheels:add` で簡単に追加できる Pure Python ライブラリです。

| 分類 | パッケージ名 | 用途・メリット |
| :--- | :--- | :--- |
| **日本語テキスト解析** | `janome` | 辞書内蔵の Pure Python 形態素解析器。外部通信不要で分かち書きやワードクラウド、頻度集計が可能。 |
| **統計データ可視化** | `seaborn` | matplotlib ベースの美しい統計グラフ・ヒートマップ描画。 |
| **Markdown 変換** | `markdown` | テキスト内の Markdown 記法を HTML / 構造化テキストにパース・変換。 |
| **HTML 検索強化** | `soupsieve` | BeautifulSoup4 用のモダンな CSS セレクタ検索エンジン。 |
| **画像 EXIF 解析** | `piexif` | 写真・画像データの EXIF メタデータをオフラインで安全に読み書き・削除。 |

---

### 🔴 利用できない・制限のあるパッケージ

| パッケージ例 | 動作しない理由 | 代替策・備考 |
| :--- | :--- | :--- |
| **`torch` (PyTorch), `tensorflow`** | WASM 未対応の巨大な C++/CUDA ネイティブバイナリ | 軽量モデルであれば `onnxruntime-web` や `scikit-learn` を使用 |
| **`polars` (ネイティブ版)** | Rust でコンパイルされたプラットフォーム固有バイナリ | `pandas` または Pyodide 公式 WASM ビルド版を使用 |
| **`cv2` (opencv-python)** | C++ ネイティブ画像処理ライブラリ | `pillow` (Pillow は Pyodide に WASM 最適化済みで同梱) |
| **`cryptography` (一部機能)** | OpenSSL / Rust C-FFI バインディング | Pure Python 暗号ライブラリまたは標準 `hashlib` |
| **`multiprocessing`** | OS プロセス生成 (`fork`/`spawn`) がブラウザサンドボックスで禁止 | `asyncio` やシングルスレッド処理に書き換え |
| **`socket`, `requests`** (直接通信) | ブラウザは生 TCP/UDP ソケットを持たない | `pyodide.http.pyfetch` (HTTP通信許可時のみ) |
| **`tkinter`, `PyQt`, `wxPython`** | OS ネイティブ GUI ウィンドウ描画 API が存在しない | JupyterLab の UI (ipywidgets / HTML / SVG) を利用 |

---

## 5. 新規パッケージの追加手順まとめ

1. **Pure Python wheel の確認**:
   ```bash
   # ドライランで依存関係と wheel 形式を事前チェック
   npm run wheels:add -- janome beautifulsoup4 jinja2 --dry-run
   ```
2. **ダウンロードとマニフェスト登録**:
   ```bash
   npm run wheels:add -- janome beautifulsoup4 jinja2
   ```
3. **脆弱性監査**:
   ```bash
   npm run wheels:audit
   ```
4. **JupyterLite の再ビルド**:
   ```bash
   npm run build:jupyter
   ```
5. **整合性検証**:
   ```bash
   npm run wheels:verify
   ```
