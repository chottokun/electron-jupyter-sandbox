const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const STATIC_DIR = path.join(__dirname, '../jupyterlite/extensions/@jupyterlite/pyodide-kernel-extension/static');

test('JupyterLite static scripts maintain clean bundle integrity without worker patches', (t) => {
  if (!fs.existsSync(STATIC_DIR)) {
    t.skip('STATIC_DIR not found. Run npm run build:jupyter first.');
    return;
  }

  const files = fs.readdirSync(STATIC_DIR).filter(f => f.endsWith('.js'));
  assert.ok(files.length > 0, 'Should find JS files in pyodide-kernel-extension static dir');

  for (const file of files) {
    const filePath = path.join(STATIC_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Regression check: worker patch code must never exist in worker assets
    assert.strictEqual(
      content.includes('delete opts.packages'),
      false,
      `File ${file} should not contain "delete opts.packages"`
    );
    assert.strictEqual(
      content.includes('piplitePreloadPackages'),
      false,
      `File ${file} should not contain custom patch "piplitePreloadPackages"`
    );
  }
});
