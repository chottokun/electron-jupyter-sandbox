const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { FileContentsManager } = require('../src/contents-api');

test('FileContentsManager path resolution and security checks', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-test-'));
  const fcm = new FileContentsManager(tmpDir);

  await t.test('toOsPath resolves path within root directory', () => {
    const osPath = fcm.toOsPath('test/notebook.ipynb');
    assert.equal(osPath, path.join(tmpDir, 'test', 'notebook.ipynb'));
  });

  await t.test('toOsPath blocks path traversal attempts', () => {
    assert.throws(() => {
      fcm.toOsPath('../../etc/passwd');
    }, (err) => {
      return err.statusCode === 403;
    });
  });

  await t.test('toApiPath converts OS path back to API relative path', () => {
    const osPath = path.join(tmpDir, 'sub', 'demo.ipynb');
    assert.equal(fcm.toApiPath(osPath), 'sub/demo.ipynb');
  });

  await t.test('isHidden correctly identifies hidden files and folders', () => {
    assert.equal(fcm.isHidden(path.join(tmpDir, '.hidden')), true);
    assert.equal(fcm.isHidden(path.join(tmpDir, 'normal.txt')), false);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('FileContentsManager CRUD operations on files and notebooks', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-crud-test-'));
  const fcm = new FileContentsManager(tmpDir);

  await t.test('newUntitled creates notebook and file models', async () => {
    const nbModel = await fcm.newUntitled('', { type: 'notebook' });
    assert.equal(nbModel.name, 'Untitled.ipynb');
    assert.equal(nbModel.type, 'notebook');

    const fileModel = await fcm.newUntitled('', { type: 'file', ext: '.txt' });
    assert.equal(fileModel.name, 'untitled.txt');
    assert.equal(fileModel.type, 'file');
  });

  await t.test('save and get text file', async () => {
    const saved = await fcm.save({ type: 'file', format: 'text', content: 'Hello World' }, 'hello.txt');
    assert.equal(saved.name, 'hello.txt');

    const fetched = await fcm.get('hello.txt');
    assert.equal(fetched.content, 'Hello World');
    assert.equal(fetched.format, 'text');
  });

  await t.test('save and get binary file (base64)', async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const b64 = buf.toString('base64');

    await fcm.save({ type: 'file', format: 'base64', content: b64 }, 'test.png');
    const fetched = await fcm.get('test.png', { format: 'base64' });

    assert.equal(fetched.content, b64);
    assert.equal(fetched.format, 'base64');
  });

  await t.test('copy file into directory target', async () => {
    await fcm.save({ type: 'file', format: 'text', content: 'Original' }, 'sample.txt');
    await fcm.save({ type: 'directory' }, 'target_dir');

    const copied = await fcm.copy('sample.txt', 'target_dir');
    assert.equal(copied.path, 'target_dir/sample.txt');
    assert.equal(fs.existsSync(path.join(tmpDir, 'target_dir', 'sample.txt')), true);
  });

  await t.test('rename conflict (409) check', async () => {
    await fcm.save({ type: 'file', content: '1' }, 'file1.txt');
    await fcm.save({ type: 'file', content: '2' }, 'file2.txt');

    await assert.rejects(
      async () => {
        await fcm.rename('file1.txt', 'file2.txt');
      },
      (err) => err.statusCode === 409
    );
  });

  await t.test('rename, copy and delete file', async () => {
    await fcm.save({ type: 'file', format: 'text', content: 'Rename test' }, 'original.txt');

    // copy
    const copied = await fcm.copy('original.txt', 'copied.txt');
    assert.equal(copied.path, 'copied.txt');

    // rename
    const renamed = await fcm.rename('original.txt', 'renamed.txt');
    assert.equal(renamed.path, 'renamed.txt');
    assert.equal(fs.existsSync(path.join(tmpDir, 'original.txt')), false);

    // delete
    await fcm.delete('renamed.txt');
    assert.equal(fs.existsSync(path.join(tmpDir, 'renamed.txt')), false);
  });

  await t.test('checkpoints operations', async () => {
    await fcm.save({ type: 'notebook', content: { cells: [] } }, 'check.ipynb');

    const checkpoint = await fcm.createCheckpoint('check.ipynb');
    assert.equal(checkpoint.id, 'checkpoint-1');

    const checkpoints = await fcm.listCheckpoints('check.ipynb');
    assert.equal(checkpoints.length, 1);

    await fcm.save({ type: 'notebook', content: { cells: [{ cell_type: 'code', source: 'print(1)' }] } }, 'check.ipynb');
    await fcm.restoreCheckpoint('check.ipynb', 'checkpoint-1');

    const restored = await fcm.get('check.ipynb');
    assert.deepEqual(restored.content.cells, []);

    await fcm.deleteCheckpoint('check.ipynb', 'checkpoint-1');
    const checkpointsAfter = await fcm.listCheckpoints('check.ipynb');
    assert.equal(checkpointsAfter.length, 0);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
