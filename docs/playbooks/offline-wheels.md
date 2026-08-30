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
  at: '2026-08-30T02:30:00Z'
---

# 完全オフライン Wheel 追加手順書

閉空間（エアギャップPC）向けに独自の Python パッケージを追加同梱する手順です。

## 1. Wheel ファイルの取得
`wheels/` ディレクトリに Pure Python (`py3-none-any.whl`) または Wasm 対応の `.whl` を配置します。

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

## 2. ビルドと反映
```bash
npm run build:jupyter
```

これで `jupyterlite` 内の `piplite` にホイールが登録され、オフライン下で `%pip install openpyxl` や `import openpyxl` が即座に動作します。
