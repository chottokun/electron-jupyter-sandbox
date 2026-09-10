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

## Architecture Comparison with JupyterLab Desktop (Official)

The architectural philosophy and operational differences between the official **JupyterLab Desktop (`jupyterlab-desktop`)** and this project (**Electron Jupyter Sandbox**) are as follows:

```text
[JupyterLab Desktop (Official)]
  [ JupyterLab UI ] 
         ↓ (HTTP/WS)
  [ Native Python Process (jupyter-server) ]
         ↓ (Executed directly with host OS privileges)
  [ Host OS (Unrestricted access to files, network, and shell commands) ]
  * No sandboxing (Regular Python execution with full host OS manipulation)

[This Project (Electron Jupyter Sandbox)]
  [ JupyterLab UI ] 
         ↓ (WASM / Web Worker)
  [ Pyodide Python Runtime (Secure Browser Sandbox) ]
         ↓ (Isolation & Filtered API)
  [ Internal Node.js (Contents API) ] ➔ [ Restricted to data/notebooks/ only ]
  * Fully Isolated (Host OS destruction and unauthorized external egress are 100% blocked)
```

### Detailed Feature & Architecture Comparison Table

| Comparison Item | JupyterLab Desktop (Official) | This Project (Sandbox) |
| :--- | :--- | :--- |
| **Python Execution Base** | **Native Python on Host OS** (Conda/CPython) | **WebAssembly (Pyodide)** (In-browser sandbox) |
| **Security / Isolation** | **No Isolation**<br>(Full OS command execution, network egress, full filesystem access) | **Fully Isolated (Sandboxed)**<br>(No OS command execution, network blocked, restricted directory boundary) |
| **Filesystem Integration** | Python process directly calls native OS system calls | Node.js **Contents API** safely mediates with path traversal defense |
| **External Network Control** | Uncontrolled (same as regular PC environment) | **Full network blocking / configurable toggle** with defense-in-depth |
| **Package Management** | Downloaded from external internet via `pip` / `conda` | **Safely installed from bundled offline Wheels** |
| **Portability** | Heavy installer due to native Python/C compiler dependencies | Lightweight WASM base with zero host DLL/compiler conflicts |
| **Target Use Cases** | Standard development & data science (trusted code only) | **Education, safe AI-generated code execution, secure enterprise, air-gap** |

### Design Rationale: Contents API Direct Binding

To achieve **"the seamless local file operations of JupyterLab Desktop (direct mapping to host OS `data/notebooks/`)"** while simultaneously preserving **"the robust WebAssembly sandbox isolation and offline security"**, this project ports the official Jupyter Server **`FileContentsManager` (Contents REST API)** to the internal Node.js server.

