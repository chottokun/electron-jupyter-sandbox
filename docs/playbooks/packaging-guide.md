[English](packaging-guide.en.md) | [日本語](packaging-guide.md)

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
Linux 環境上でそのまま実行できます：
```bash
npm run package:linux
```
- **生成物**: `dist/JupyterSandbox-1.0.0.AppImage`
- **実行方法**: `chmod +x dist/JupyterSandbox-1.0.0.AppImage && ./dist/JupyterSandbox-1.0.0.AppImage`

---

### 🪟 Windows (`.zip` ポータブル配布パッケージ)

Windows 向けには、**アンチウイルス（EDR / Windows Defender）の誤検知（False Positive）を根本から防止するため、インストーラー（自己解凍スタブ）ではなく静的展開型の「ポータブル Zip 形式」を採用**しています。

> [!TIP]
> **なぜ Zip ポータブル形式なのか？**:
> インストーラー（NSIS）や単一 Portable exe は、実行時に一時ディレクトリ（`%TEMP%`）へ動的にバイナリを展開してサブプロセスを起動する自己解凍動作を行います。無署名アプリの場合、この挙動がマルウェアのドロッパーと誤認され、アンチウイルスに隔離・削除されやすくなります。
> 静的展開型の Zip 形式であれば、動的ドロップ挙動がなく、事前スキャンが容易なため最も誤検知されにくく、管理者権限（UAC）不要で安全に動作します。

#### A. GitHub Actions クラウド自動ビルド（推奨）
Windows 仮想マシン上でビルド・署名・SLSA 来歴証明の添付を全自動で行い、[GitHub Releases](https://github.com/chottokun/electron-jupyter-sandbox/releases) に公開します：
```bash
# タグを打ってプッシュ（正式リリース時）
git tag v1.1.1
git push origin v1.1.1

# または GitHub CLI から手動実行
gh workflow run release.yml
```

#### B. ローカル（Linux）でのビルド
```bash
npm run package:win
```

#### 生成物と解凍後のファイル構成 (`dist/`)
- **生成物**: `dist/JupyterSandbox-<version>-windows.zip`

解凍したフォルダには、`electron-builder` の `extraFiles` 機能により、ユーザーが大量の DLL の中から探す手間をなくすための起動バッチと案内テキストが**フォルダ最上部に自動配置**されます。

```text
JupyterSandbox-<version>-windows/
├── 00_JupyterSandbox起動.bat    ← ★ ダブルクリックで即起動（最上部に表示）
├── 00_はじめにお読みください.txt ← 利用案内・注意事項
├── JupyterSandbox.exe           ← アプリ本体
├── ffmpeg.dll, d3dcompiler.dll, ... (内部ランタイムDLL)
├── locales/
└── resources/
```

- **エンドユーザーへの配布方法**: `JupyterSandbox-<version>-windows.zip` をそのまま配布し、解凍して「`00_JupyterSandbox起動.bat`」を実行するよう案内します。

---

### 🍎 macOS (`.dmg`)
```bash
npm run package:mac
```
- **生成物**: `dist/JupyterSandbox-1.0.0.dmg`
*(※ macOS の DMG 生成・公証は macOS 実機または GitHub Actions macOS ランナーでの実行を推奨)*
