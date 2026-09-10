[English](version-matrix.en.md) | [日本語](version-matrix.md)

---
type: Reference Matrix
title: Version Compatibility Matrix
description: Tested and verified component versions (Node, Electron, JupyterLite, Pyodide) and selection rules.
tags:
  - version
  - matrix
  - compatibility
  - dependencies
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# Version Compatibility Matrix

This document details verified versions for tools and core dependencies in this application, along with crucial version compatibility rules.

## 1. Verified Component Versions

| Layer / Component | Package Name | Recommended / Verified Version | Notes |
|---|---|---|---|
| **Runtime Manager (Node)** | Volta | `2.0.2` | Version pinned in `package.json` |
| **Node.js** | Node | `22.14.0` (LTS) | Compatible with JupyterLab builder (`^20.19.0 \|\| >=22.12.0`) & Electron |
| **Package Manager** | npm | `10.9.2` | Package separation via npm workspaces |
| **Desktop Framework** | Electron | `^44.1.1` (44.1.1) | Security patches applied |
| **Packaging** | electron-builder | `^26.15.3` | Linux(AppImage) / Win / Mac support |
| **Python Manager** | uv | `>=0.4.0` | Local `.venv` / `pyproject.toml` management |
| **JupyterLite Core** | `jupyterlite-core` | `0.8.3` | JupyterLab 4.6.3 / Notebook 7.6.2 |
| **Pyodide Kernel** | `jupyterlite-pyodide-kernel` | `0.8.5` | Bundles `piplite 0.8.5` |
| **Wasm Runtime** | Pyodide | `314.0.5` | Python 3.14 Wasm (Strict match required) |
| **Required Python Package** | `comm` | `0.2.3` (pure-python whl) | Essential for kernel initialization (`wheels/`) |
| **JupyterLab Extensions** | `@jupyterlab/application` etc. | `^4.0.0` | `packages/ai-copy-extension` |

## 2. Key Version Compatibility Rules

### ① Matching `jupyterlite-pyodide-kernel` and `Pyodide` Versions
When using `jupyterlite-pyodide-kernel 0.8.5`, Pyodide MUST be set to **`314.0.5`**. Setting legacy versions such as `0.26.x` / `0.27.x` will cause `ImportError: cannot import name 'CompatibilityLayer'`.

### ② Pre-Bundling `comm` Package Locally
In air-gapped offline environments, packages cannot be downloaded on-the-fly from PyPI. Therefore, `wheels/comm-*-py3-none-any.whl` must be pre-placed in `wheels/` and registered in `jupyter_lite_config.json` via `PipliteAddon.piplite_urls: ["wheels"]`.
