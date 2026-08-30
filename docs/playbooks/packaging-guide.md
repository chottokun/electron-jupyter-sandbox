---
type: Playbook
title: Electron パッケージング手順書
description: Linux (AppImage), Windows (exe), macOS (dmg) 向けの配布用バイナリ生成手順。
tags:
  - packaging
  - electron-builder
  - playbook
  - deployment
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# Electron パッケージング手順書

本プレイブックでは、本デスクトップアプリを単一の実行可能ファイル（インストーラー / 単体実行バイナリ）にパッケージ化する手順を解説します。

## 1. ビルド準備
```bash
# Volta 環境のロード
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# アセットの一括ビルド
npm run build
```

## 2. プラットフォーム別パッケージングコマンド

### 🐧 Linux (`.AppImage`)
```bash
npm run package:linux
```
- **生成物**: `dist/JupyterSandbox-1.0.0.AppImage`

### 🪟 Windows (`.exe` / インストーラー & ポータブル)
```bash
npm run package:win
```
- **生成物**: `dist/JupyterSandbox Setup 1.0.0.exe`, `dist/JupyterSandbox 1.0.0.exe`

### 🍎 macOS (`.dmg`)
```bash
npm run package:mac
```
- **生成物**: `dist/JupyterSandbox-1.0.0.dmg`
