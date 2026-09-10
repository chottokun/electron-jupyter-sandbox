[English](README.en.md) | [日本語](README.md)

# Electron Jupyter Sandbox (Fully Isolated & AI-Integrated Desktop Jupyter Environment)

[![CI](https://github.com/chottokun/electron-jupyter-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/chottokun/electron-jupyter-sandbox/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/chottokun/electron-jupyter-sandbox?color=blue&logo=github)](https://github.com/chottokun/electron-jupyter-sandbox/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-informational)](#)
[![Python: Pyodide](https://img.shields.io/badge/Pyodide-314.0.5-3776AB?logo=python&logoColor=white)](docs/architecture/version-matrix.md)

A desktop application that wraps **JupyterLite** (powered by WebAssembly / Pyodide) inside **Electron**, providing a completely isolated and fully offline Python execution environment that leaves zero footprint on your local OS environment.


It comes standard with an integrated JupyterLab extension that **generates and copies optimal prompts for AI (Local LLMs / Web AI Chats) with a single click** when code execution errors occur.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (Volta management recommended: `node@22.14.0`, `npm@10.9.2`)
- Python & `uv` (JupyterLite build tool management)

### 2. Installation & Build
```bash
# 1. Load Volta environment
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# 2. Install dependencies (batch installation via workspaces)
npm install

# 3. Synchronize Python virtual environment
uv sync

# 4. Build all assets (extension + JupyterLite with Pyodide)
npm run build
```

### 3. Launch
```bash
npm start
```

### 4. Build Distribution Package (Outputs to `dist/`)
```bash
# Build pre-requisite assets (if not already run)
npm run build

# --- 1. Fully Isolated Edition (Strict / External communication disabled / Enterprise & Air-gap) ---
npm run package:win       # For Windows (Installer .exe / Portable .exe / zip)
npm run package:linux     # For Linux (AppImage)
npm run package:mac       # For macOS (dmg)

# --- 2. Configurable Edition (Configurable / Toggle communication ON/OFF via menu / Personal dev) ---
npm run package:win:configurable
```

> [!TIP]
> **Detailed Security Policy Design**
> For details on the defense-in-depth architecture of Strict and Configurable modes, as well as code examples for external communication from Python, see the [Security & Network Policy Design Document (`docs/architecture/security-network-policy.md`)](docs/architecture/security-network-policy.md).

> [!TIP]
> **Automated Build via GitHub Actions (Recommended)**
> Pushing a Git tag such as `v1.0.0` (or running `gh workflow run release.yml`) automatically builds installer and portable packages on a Windows VM and releases them to [GitHub Releases](https://github.com/chottokun/electron-jupyter-sandbox/releases).

---

## ⚠️ Windows SmartScreen & Security Warning Guidance

For unsigned or newly signed OSS binaries, Windows SmartScreen may display a blue warning screen stating "Windows protected your PC".

1. **First Launch Procedure**: When the warning screen appears, click "More info" and select "Run anyway".
2. **File Integrity Verification (PowerShell)**: To verify that the distributed binary has not been tampered with, compute the hash value in PowerShell and compare it with `SHA256SUMS.txt`.

```powershell
Get-FileHash .\electron-jupyter-sandbox-setup.exe -Algorithm SHA256
```

---

## 📁 Documentation Overview (`docs/` - OKF v0.2 Compliant)

The technical documentation of this project is structured in compliance with **Open Knowledge Format (OKF) v0.2**:

- 📖 **[Knowledge Base Index (`docs/README.md`)](docs/README.md)**
- 🏛️ **Architecture (`docs/architecture/`)**
  - [System Architecture Overview (`docs/architecture/system-overview.md`)](docs/architecture/system-overview.md)
  - [Version Matrix (`docs/architecture/version-matrix.md`)](docs/architecture/version-matrix.md)
- 🧩 **Components (`docs/components/`)**
  - [AI Error Copy Extension Specification (`docs/components/ai-copy-extension.md`)](docs/components/ai-copy-extension.md)
  - [Pyodide Wasm Kernel & Delivery Platform (`docs/components/pyodide-kernel.md`)](docs/components/pyodide-kernel.md)
- 📋 **Playbooks (`docs/playbooks/`)**
  - [Electron Packaging Guide (`docs/playbooks/packaging-guide.md`)](docs/playbooks/packaging-guide.md)
  - [Menu & Icon Customization Guide (`docs/playbooks/menu-and-icon-guide.md`)](docs/playbooks/menu-and-icon-guide.md)
  - [OSS Release & Trust Assurance Guide (`docs/playbooks/release-trust-guide.md`)](docs/playbooks/release-trust-guide.md)
  - [Fully Offline Wheels Guide (`docs/playbooks/offline-wheels.md`)](docs/playbooks/offline-wheels.md)
  - [JupyterLab UI Localization Guide (`docs/playbooks/localization.md`)](docs/playbooks/localization.md)
- 🛠️ **References (`docs/references/`)**
  - [Troubleshooting & Knowledge Base (`docs/references/troubleshooting.md`)](docs/references/troubleshooting.md)

---

## 🛡️ Security Specifications

1. **Guaranteed Fully Offline**: Electron's `webRequest` filter physically blocks external internet access outside `127.0.0.1`.
2. **OS Protection**: Python code runs on WebAssembly (Pyodide) inside the browser sandbox, eliminating direct risk to the host OS filesystem.
3. **Local Log Persistence**: All application communication and error logs are automatically recorded in `logs/app.log` within the user data directory (accessible directly from the "Help" menu).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

