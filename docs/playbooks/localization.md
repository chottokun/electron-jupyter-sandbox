---
type: Playbook
title: JupyterLab UI 日本語化手順書
description: 公式言語パック（jupyterlab-language-pack-ja-JP）を導入してメニューやツールバーを日本語化する手順。
tags:
  - localization
  - japanese
  - jupyterlab
  - playbook
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# JupyterLab UI 日本語化手順書

JupyterLab の UI を日本語化する手順です。

## 1. `pyproject.toml` に言語パックを追加
```toml
[project]
dependencies = [
    "jupyterlite-core>=0.4.0",
    "jupyterlite-pyodide-kernel>=0.4.0",
    "jupyterlab-language-pack-ja-JP",
    "jupyterlab_server"
]
```

## 2. 仮想環境同期と再ビルド
```bash
uv sync
npm run build:jupyter
```

## 3. アプリでの日本語切り替え
1. `npm start` でアプリを起動。
2. **`Settings` ➔ `Language` ➔ `Japanese (日本語)`** を選択してリロード。
