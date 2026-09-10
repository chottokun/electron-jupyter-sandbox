[English](packaging-guide.en.md) | [日本語](packaging-guide.md)

---
type: Playbook
title: Electron Packaging Guide
description: Binary generation procedures for Linux (AppImage), Windows (portable zip), and macOS (dmg).
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

# Electron Packaging Guide

This playbook details how to package this desktop application into standalone distribution executables across platforms.

## 1. Build Preparation
```bash
# Load Volta environment
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# Build all static assets
npm run build
```

## 2. Platform-Specific Packaging Commands

### 🐧 Linux (`.AppImage`)
Run directly on Linux build hosts:
```bash
npm run package:linux
```
- **Artifact**: `dist/JupyterSandbox-1.0.0.AppImage`
- **Execution**: `chmod +x dist/JupyterSandbox-1.0.0.AppImage && ./dist/JupyterSandbox-1.0.0.AppImage`

---

### 🪟 Windows (`.zip` Portable Distribution Package)

For Windows, **a static portable Zip format is used instead of self-extracting installers to fundamentally prevent antivirus / EDR false positives**.

> [!TIP]
> **Why Zip Portable Format?**:
> Installers (NSIS) or single-file portable EXEs dynamically drop executable binaries into `%TEMP%` at launch. For unsigned binaries, this self-extracting dropper behavior is frequently flagged as suspicious by antivirus scanners.
> Static Zip archives contain no dynamic drops, make pre-execution scanning straightforward, and operate safely without administrator (UAC) elevation.

#### A. GitHub Actions Automated Cloud Build (Recommended)
Automatically compiles, signs, attaches SLSA provenance attestations on Windows virtual runners, and publishes to [GitHub Releases](https://github.com/chottokun/electron-jupyter-sandbox/releases):
```bash
# Tag and push for official release
git tag v1.1.1
git push origin v1.1.1

# Or trigger manually via GitHub CLI
gh workflow run release.yml
```

#### B. Local Build on Linux Host
```bash
npm run package:win
```

#### Output Archive Structure (`dist/`)
- **Artifact**: `dist/JupyterSandbox-<version>-windows.zip`

Using `electron-builder`'s `extraFiles` feature, launcher helper batch files and documentation text are automatically placed at the **top level of the unzipped folder**:

```text
JupyterSandbox-<version>-windows/
├── 00_JupyterSandbox起動.bat    ← ★ Double-click to launch immediately
├── 00_はじめにお読みください.txt ← User instructions & notes
├── JupyterSandbox.exe           ← Application executable
├── ffmpeg.dll, d3dcompiler.dll, ... (Internal runtime DLLs)
├── locales/
└── resources/
```

---

### 🍎 macOS (`.dmg`)
```bash
npm run package:mac
```
- **Artifact**: `dist/JupyterSandbox-1.0.0.dmg`
*(※ macOS DMG building and notarization is recommended on macOS hardware or GitHub Actions macOS runners)*
