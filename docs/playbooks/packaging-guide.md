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

### 🪟 Windows (`.exe` / `.zip`)

Windows 向けのバイナリ生成には、**「GitHub Actions による自動生成」** と **「ローカル環境（Linux）での生成」** の2通りがあります。

#### A. GitHub Actions クラウド自動ビルド（推奨）
Windows 仮想マシン上でビルド・署名・SLSA 来歴証明の添付を全自動で行い、[GitHub Releases](https://github.com/chottokun/electron-jupyter-sandbox/releases) に公開します：
```bash
# タグを打ってプッシュ（正式リリース時）
git tag v1.0.0
git push origin v1.0.0

# または GitHub CLI から手動実行
gh workflow run release.yml
```

#### B. ローカル（Linux）でのビルド
Linux 上で Windows 向けインストーラー（NSIS）をコンパイルするには `wine` が必要です：
```bash
# 1. Wine のインストール（未導入の場合）
sudo apt update && sudo apt install -y wine

# 2. パッケージング実行
npm run package:win
```

#### 生成物一覧 (`dist/`)
| ファイル名 | 形式 | 用途 |
| :--- | :--- | :--- |
| `JupyterSandbox Setup 1.0.0.exe` | インストーラー (NSIS) | Windows PC への標準インストール（ショートカット作成対応） |
| `JupyterSandbox 1.0.0.exe` | 単体ポータブル exe | インストール不要の単体実行形式 |
| `JupyterSandbox-1.0.0-win.zip` | ポータブル ZIP | 解凍してUSBメモリ等で持ち運べる完全ポータブル版 |
| `win-unpacked/` | 展開済みフォルダ | 展開された実行ファイル群（`JupyterSandbox.exe`） |

---

### 🍎 macOS (`.dmg`)
```bash
npm run package:mac
```
- **生成物**: `dist/JupyterSandbox-1.0.0.dmg`
*(※ macOS の DMG 生成・公証は macOS 実機または GitHub Actions macOS ランナーでの実行を推奨)*
