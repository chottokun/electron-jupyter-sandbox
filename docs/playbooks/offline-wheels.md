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

## 4. 注意事項

- **Pure Python wheel のみ対応**: `py3-none-any.whl` 形式のパッケージのみダウンロード可能です。C拡張を含むネイティブパッケージは Pyodide 本体に同梱されているものを使用してください。
- **Pyodide 同梱パッケージ**: numpy, pandas, scipy, matplotlib, scikit-learn, lxml, pillow 等の主要パッケージは Pyodide 本体に含まれています。`--dry-run` オプションで確認できます。
- **バージョン管理**: `wheels/manifest.json` でダウンロード済みパッケージのバージョンと SHA256 を管理しています。Git で追跡することを推奨します。
