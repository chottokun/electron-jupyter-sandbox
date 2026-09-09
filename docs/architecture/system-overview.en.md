[English](system-overview.en.md) | [日本語](system-overview.md)

---
type: Architecture Overview
title: Fully Isolated Desktop Jupyter Environment Architecture Overview
description: Overall system architecture for a fully isolated, fully offline Python execution environment using WebAssembly (Pyodide)-based JupyterLite wrapped in Electron.
tags:
  - architecture
  - electron
  - jupyterlite
  - pyodide
  - security
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# Overall System Architecture & Design Principles

This system is a desktop application that wraps **WebAssembly (Pyodide)**-based **JupyterLite** inside **Electron**, providing a completely isolated and fully offline Python execution environment that leaves zero footprint on the host OS.

```text
┌─────────────────────────────────────────────────────────────┐
│                      Electron App                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Main Process (Node.js)                                  │ │
│ │  - Internal HTTP Server (http://127.0.0.1:<random_port>) │ │
│ │    - COOP/COEP/CORP header injection (Wasm/Worker)      │ │
│ │    - Accurate MIME-Type serving (.wasm, .whl, .mjs etc)  │ │
│ │  - Physical External Network Blocking (drops non-local) │ │
│ │  - OS File Dialogs (Open / Save IPC)                    │ │
│ │  - Integrated File Logger (app.log)                     │ │
│ └─────────────────────────┬───────────────────────────────┘ │
│                           │ IPC (contextBridge)             │
│ ┌─────────────────────────▼───────────────────────────────┐ │
│ │ Renderer Process (Chromium Sandbox)                     │ │
│ │  ┌────────────────────────────────────────────────────┐ │ │
│ │  │ JupyterLite (JupyterLab UI)                        │ │ │
│ │  │  ┌──────────────────────────────────────────────┐  │ │ │
│ │  │  │ AI Error Copy Extension (JupyterLab Plugin)   │  │ │ │
│ │  │  │  - Cell execution error signal monitoring     │  │ │ │
│ │  │  │  - 🤖 Dynamic AI error copy button mount      │  │ │ │
│ │  │  └──────────────────────────────────────────────┘  │ │ │
│ │  │  ┌──────────────────────────────────────────────┐  │ │ │
│ │  │  │ Pyodide / WebAssembly Worker                 │  │ │ │
│ │  │  │  - Fully isolated Python environment (NumPy)  │  │ │ │
│ │  │  │  - Virtual Filesystem (IndexedDB)            │  │ │ │
│ │  │  └──────────────────────────────────────────────┘  │ │ │
│ │  └────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Security Design Principles

1. **Guaranteed Fully Offline / Network Isolation**
   - Electron's `webRequest.onBeforeRequest` physically drops all external internet access attempt outside `127.0.0.1`.
   - Zero risk of external data leakage even when handling confidential notebook data or executing erroneous scripts.

2. **OS Protection & Sandboxing**
   - Python code executes strictly within WebAssembly (Pyodide) inside the browser sandbox, ensuring zero risk of host OS filesystem destruction or unauthorized system modification.

3. **Internal HTTP Server Delivery**
   - A standard Node.js lightweight HTTP server listens on a random free port on `127.0.0.1`, serving Pyodide's `micropip` and standard HTTP/WS schemes expected by JupyterLite.
