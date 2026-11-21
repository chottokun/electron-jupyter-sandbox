const test = require('node:test');
const assert = require('node:assert');
const {
  buildAIPrompt,
  buildNotebookAIPrompt,
  formatTraceback
} = require('../packages/ai-copy-extension/lib/prompt.js');

test('buildAIPrompt formats prompt correctly and strips ANSI escape codes', () => {
  const source = 'print(1 / 0)';
  const errorObj = {
    ename: 'ZeroDivisionError',
    evalue: 'division by zero',
    traceback: [
      '\u001b[0;31mZeroDivisionError\u001b[0m: division by zero',
      '  File \u001b[0;32m"<stdin>"\u001b[0m, line \u001b[0;32m1\u001b[0m'
    ]
  };

  const prompt = buildAIPrompt(source, errorObj);
  assert.strictEqual(prompt.includes('ZeroDivisionError: division by zero'), true);
  assert.strictEqual(prompt.includes('\u001b['), false);
  assert.strictEqual(prompt.includes('print(1 / 0)'), true);
});

test('buildAIPrompt fallback when traceback is absent', () => {
  const source = 'x = y';
  const errorObj = {
    ename: 'NameError',
    evalue: "name 'y' is not defined"
  };

  const prompt = buildAIPrompt(source, errorObj);
  assert.strictEqual(prompt.includes("NameError: name 'y' is not defined"), true);
});

test('buildAIPrompt includes notebook name and previous cells context when provided', () => {
  const source = 'df["missing_col"]';
  const errorObj = {
    ename: 'KeyError',
    evalue: "'missing_col'"
  };
  const prompt = buildAIPrompt(source, errorObj, {
    notebookName: 'analysis.ipynb',
    previousCells: ['import pandas as pd', 'df = pd.DataFrame({"a": [1, 2]})']
  });

  assert.strictEqual(prompt.includes('【対象ノートブック】 analysis.ipynb'), true);
  assert.strictEqual(prompt.includes('【直前のセルの文脈（定義済み変数・インポート等）】'), true);
  assert.strictEqual(prompt.includes('import pandas as pd'), true);
  assert.strictEqual(prompt.includes('df = pd.DataFrame({"a": [1, 2]})'), true);
  assert.strictEqual(prompt.includes('df["missing_col"]'), true);
});

test('buildNotebookAIPrompt formats full notebook cells and truncates long outputs', () => {
  const longOutput = 'A'.repeat(1200);
  const prompt = buildNotebookAIPrompt(
    [
      { type: 'markdown', source: '# 売上データ分析' },
      { type: 'code', source: 'print("hello")', outputText: 'hello\n' },
      { type: 'code', source: 'print("long")', outputText: longOutput },
      {
        type: 'code',
        source: '1 / 0',
        errorJson: { ename: 'ZeroDivisionError', evalue: 'division by zero' }
      }
    ],
    'report.ipynb'
  );

  assert.strictEqual(prompt.includes('【ノートブック名】 report.ipynb'), true);
  assert.strictEqual(prompt.includes('### セル 1 (markdown)'), true);
  assert.strictEqual(prompt.includes('# 売上データ分析'), true);
  assert.strictEqual(prompt.includes('### セル 2 (code)'), true);
  assert.strictEqual(prompt.includes('【実行出力】'), true);
  assert.strictEqual(prompt.includes('... (省略)'), true);
  assert.strictEqual(prompt.includes('【エラー出力】'), true);
  assert.strictEqual(prompt.includes('ZeroDivisionError: division by zero'), true);
});
