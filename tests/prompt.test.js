const test = require('node:test');
const assert = require('node:assert');
const { cleanTraceback, formatAIPrompt } = require('../packages/ai-copy-extension/lib/prompt');

test('prompt module: cleanTraceback strips ANSI color codes', () => {
  const tracebackWithAnsi = [
    '\u001b[0;31mNameError\u001b[0m: name \'x\' is not defined',
    '  File \u001b[0;32m"<stdin>"\u001b[0m, line 1'
  ];
  const cleaned = cleanTraceback(tracebackWithAnsi);
  assert.strictEqual(cleaned.includes('\u001b['), false);
  assert.strictEqual(cleaned, 'NameError: name \'x\' is not defined\n  File "<stdin>", line 1');
});

test('prompt module: formatAIPrompt formats prompt correctly with traceback or fallback ename/evalue', () => {
  const code = 'print(x)';
  const errWithTraceback = {
    ename: 'NameError',
    evalue: "name 'x' is not defined",
    traceback: ["NameError: name 'x' is not defined"]
  };
  const prompt1 = formatAIPrompt(code, errWithTraceback);
  assert.strictEqual(prompt1.includes('print(x)'), true);
  assert.strictEqual(prompt1.includes("NameError: name 'x' is not defined"), true);

  const errWithoutTraceback = {
    ename: 'ZeroDivisionError',
    evalue: 'division by zero'
  };
  const prompt2 = formatAIPrompt(code, errWithoutTraceback);
  assert.strictEqual(prompt2.includes('ZeroDivisionError: division by zero'), true);
});
