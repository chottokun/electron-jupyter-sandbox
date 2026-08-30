---
type: Component Specification
title: AI エラーコピー拡張機能 仕様とカスタマイズ
description: JupyterLab上でPython実行エラー発生時にAI修正プロンプトをワンクリック生成するフロントエンド拡張機能の仕様。
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

# AI エラーコピー拡張機能 (`packages/ai-copy-extension`)

本拡張機能は、JupyterLab のシグナル（`ICodeCellModel.outputs.changed`）を監視し、エラー発生時に AI（ChatGPT, Claude, Gemini, ローカルLLM）へ渡す最適なプロンプトを生成・コピーするボタンを出力エリアにマウントします。

## 機能仕様

1. **エラー検知**: セル実行時に `error` タイプの出力モデルを自動検知。
2. **最新コード取得**: ボタンクリック時にセル内の最新コード（`sharedModel.getSource()`）を取得。
3. **ANSIエスケープ除去**: トレースバックに含まれるカラーコード（`\u001b[...]`）を除去してプレーンテキスト化。
4. **クリップボード連携**: 整形済みマークダウンプロンプトをクリップボードに格納。

## プロンプトのカスタマイズ方法

ソースコード: `packages/ai-copy-extension/src/index.ts`

```typescript
const prompt = [
  '以下のJupyter (Python/Pyodide WASM) 環境でコード実行時にエラーが発生しました。',
  '原因の解説と、修正したコードを提示してください。',
  '',
  '【実行コード】',
  '```python',
  sourceCode,
  '```',
  '',
  '【エラー内容 / トレースバック】',
  '```text',
  traceback,
  '```'
].join('\n');
```

## ビルドと反映

```bash
npm run build
npm start
```
