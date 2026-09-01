const test = require('node:test');
const assert = require('node:assert');
const { buildAIPrompt, formatTraceback } = require('../packages/ai-copy-extension/lib/prompt.js');

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
