[English](ai-copy-extension.en.md) | [日本語](ai-copy-extension.md)

---
type: Component Specification
title: AI Error Copy Extension Specification & Customization
description: Frontend extension specification for generating one-click AI prompts upon Python execution errors in JupyterLab.
tags:
  - extension
  - ai
  - jupyterlab
  - typescript
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T02:30:00Z'
---

# AI Error Copy Extension (`packages/ai-copy-extension`)

This extension listens to JupyterLab signals (`ICodeCellModel.outputs.changed`) and dynamically mounts a button in the cell output area when execution errors occur. Clicking the button generates and copies an optimized prompt formatted for LLMs (ChatGPT, Claude, Gemini, Local LLMs).

## Specifications & Features

1. **Error Detection**: Automatically detects `error` output type models when a code cell executes.
2. **Latest Source Code Retrieval**: Captures the current cell source code (`sharedModel.getSource()`) at the moment of button click.
3. **ANSI Escape Stripping**: Removes color formatting codes (`\u001b[...]`) from tracebacks to produce clean plain text.
4. **Clipboard Integration**: Copies formatted markdown prompt directly into system clipboard with visual feedback toast.

## Prompt Customization

Source code location: `packages/ai-copy-extension/src/index.ts`

```typescript
const prompt = [
  'An error occurred while executing code in the following Jupyter (Python/Pyodide WASM) environment.',
  'Please explain the cause and provide corrected code.',
  '',
  '【Execution Code】',
  '```python',
  sourceCode,
  '```',
  '',
  '【Error Content / Traceback】',
  '```text',
  traceback,
  '```'
].join('\n');
```

## Build and Reflection Steps

```bash
npm run build
npm start
```
