const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const STATIC_DIR = path.join(__dirname, '../jupyterlite/extensions/@jupyterlite/pyodide-kernel-extension/static');

test('Worker static scripts do not delete opts.packages', () => {
  assert.ok(fs.existsSync(STATIC_DIR), 'Worker static directory should exist');

  const files = fs.readdirSync(STATIC_DIR).filter(f => f.endsWith('.js'));
  assert.ok(files.length > 0, 'Should find JS files in pyodide-kernel-extension static dir');

  let foundWorker = false;

  for (const file of files) {
    const filePath = path.join(STATIC_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Regression check: delete opts.packages must never exist
    assert.strictEqual(
      content.includes('delete opts.packages'),
      false,
      `File ${file} should not contain "delete opts.packages"`
    );

    if (file.includes('worker')) {
      foundWorker = true;
      // Ensure worker scripts handle both loadPyodideOptions and piplitePreloadPackages
      assert.ok(
        content.includes('loadPyodideOptions'),
        `Worker ${file} should reference loadPyodideOptions`
      );
      assert.ok(
        content.includes('piplitePreloadPackages'),
        `Worker ${file} should reference piplitePreloadPackages`
      );
    }
  }

  assert.strictEqual(foundWorker, true, 'At least one worker JS file should be tested');
});
