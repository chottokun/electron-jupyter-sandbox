const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Logger } = require('../src/logger');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-log-test-'));
}

test('logger formats lines and performs rotation when max size exceeded', () => {
  const tmpDir = createTmpDir();
  const logger = new Logger();

  logger.log('MAIN', 'Hello world line 1', false, tmpDir);
  const logFilePath = logger.getLogPath(tmpDir);
  assert.strictEqual(fs.existsSync(logFilePath), true);

  // Write enough data to trigger rotation with small maxLogSize
  logger.log('MAIN', 'A'.repeat(120), false, tmpDir, 100);
  assert.strictEqual(fs.existsSync(logFilePath), true);

  // Trigger rotation on next log call
  logger.log('MAIN', 'After rotation', false, tmpDir, 100);
  assert.strictEqual(fs.existsSync(`${logFilePath}.old`), true);

  const currentContent = fs.readFileSync(logFilePath, 'utf-8');
  assert.strictEqual(currentContent.includes('After rotation'), true);
  assert.strictEqual(currentContent.includes('Hello world line 1'), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
