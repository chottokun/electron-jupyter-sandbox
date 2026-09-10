const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

class FileContentsManager {
  constructor(rootDir) {
    if (!rootDir) {
      throw new Error('rootDir is required for FileContentsManager');
    }
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * API パス（例: "sub/notebook.ipynb"）を OS パスに変換し、パストラバーサル境界を検証する。
   */
  toOsPath(apiPath = '') {
    const parts = String(apiPath).split(/[/\\]+/).filter(p => p !== '');
    const osPath = path.resolve(this.rootDir, ...parts);

    const rel = path.relative(this.rootDir, osPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      const err = new Error(`Access Denied: Path outside root directory (${apiPath})`);
      err.statusCode = 403;
      throw err;
    }
    return osPath;
  }

  /**
   * OS パスを API 相対パス（/ 区切り）に変換する。
   */
  toApiPath(osPath) {
    const rel = path.relative(this.rootDir, osPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      const err = new Error(`Path outside root directory: ${osPath}`);
      err.statusCode = 403;
      throw err;
    }
    if (!rel || rel === '.') {
      return '';
    }
    return rel.split(path.sep).join('/');
  }

  /**
   * パスまたはその親ディレクトリが隠し要素（ドット開始）か判定する。
   */
  isHidden(osPath) {
    const rel = path.relative(this.rootDir, osPath);
    if (!rel || rel === '.') return false;
    const parts = rel.split(path.sep);
    return parts.some(part => part.startsWith('.'));
  }

  /**
   * コンテンツモデルを取得する。
   */
  async get(apiPath = '', options = {}) {
    const { content = true, type = null, format = null } = options;
    const osPath = this.toOsPath(apiPath);

    let stats;
    try {
      stats = await fsPromises.stat(osPath);
    } catch (err) {
      const error = new Error(`Not Found: ${apiPath}`);
      error.statusCode = 404;
      throw error;
    }

    const normApiPath = this.toApiPath(osPath);

    if (stats.isDirectory()) {
      if (type && type !== 'directory') {
        const err = new Error(`Type mismatch: expected ${type}, got directory`);
        err.statusCode = 400;
        throw err;
      }
      return await this.getDirModel(osPath, normApiPath, content);
    }

    const ext = path.extname(osPath).toLowerCase();
    const isNotebook = ext === '.ipynb' || type === 'notebook';

    if (isNotebook) {
      return await this.getNotebookModel(osPath, normApiPath, content);
    } else {
      return await this.getFileModel(osPath, normApiPath, content, format);
    }
  }

  /**
   * ディレクトリモデルを構築する。
   */
  async getDirModel(osPath, apiPath, content = true) {
    const stats = await fsPromises.stat(osPath);
    const model = {
      name: path.basename(osPath) || '',
      path: apiPath,
      type: 'directory',
      writable: true,
      created: stats.birthtime ? stats.birthtime.toISOString() : stats.ctime.toISOString(),
      last_modified: stats.mtime.toISOString(),
      mimetype: null,
      content: null,
      format: 'json',
      size: null
    };

    if (content) {
      const entries = await fsPromises.readdir(osPath, { withFileTypes: true });
      const children = [];

      for (const entry of entries) {
        // ドットから始まる隠しファイル・フォルダのうち、.ipynb_checkpoints は除外
        if (entry.name.startsWith('.')) continue;

        const childOsPath = path.join(osPath, entry.name);
        const childApiPath = this.toApiPath(childOsPath);

        try {
          const childStats = await fsPromises.stat(childOsPath);
          if (childStats.isDirectory()) {
            children.push({
              name: entry.name,
              path: childApiPath,
              type: 'directory',
              writable: true,
              created: childStats.birthtime ? childStats.birthtime.toISOString() : childStats.ctime.toISOString(),
              last_modified: childStats.mtime.toISOString(),
              mimetype: null,
              content: null,
              format: null,
              size: null
            });
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            const childType = ext === '.ipynb' ? 'notebook' : 'file';
            children.push({
              name: entry.name,
              path: childApiPath,
              type: childType,
              writable: true,
              created: childStats.birthtime ? childStats.birthtime.toISOString() : childStats.ctime.toISOString(),
              last_modified: childStats.mtime.toISOString(),
              mimetype: childType === 'notebook' ? 'application/x-ipynb+json' : null,
              content: null,
              format: null,
              size: childStats.size
            });
          }
        } catch (e) {
          // 削除アクセス不能なファイルはスキップ
        }
      }
      model.content = children;
    }

    return model;
  }

  /**
   * ファイルモデルを構築する。
   */
  async getFileModel(osPath, apiPath, content = true, requestedFormat = null) {
    const stats = await fsPromises.stat(osPath);
    const model = {
      name: path.basename(osPath),
      path: apiPath,
      type: 'file',
      writable: true,
      created: stats.birthtime ? stats.birthtime.toISOString() : stats.ctime.toISOString(),
      last_modified: stats.mtime.toISOString(),
      mimetype: null,
      content: null,
      format: null,
      size: stats.size
    };

    if (content) {
      const buffer = await fsPromises.readFile(osPath);
      let format = requestedFormat;

      if (!format) {
        // 簡易バイナリ判定（ヌルバイトを含むか）
        const isBinary = buffer.includes(0);
        format = isBinary ? 'base64' : 'text';
      }

      model.format = format;
      if (format === 'base64') {
        model.content = buffer.toString('base64');
      } else {
        model.content = buffer.toString('utf-8');
      }
    }

    return model;
  }

  /**
   * ノートブックモデルを構築する。
   */
  async getNotebookModel(osPath, apiPath, content = true) {
    const stats = await fsPromises.stat(osPath);
    const model = {
      name: path.basename(osPath),
      path: apiPath,
      type: 'notebook',
      writable: true,
      created: stats.birthtime ? stats.birthtime.toISOString() : stats.ctime.toISOString(),
      last_modified: stats.mtime.toISOString(),
      mimetype: 'application/x-ipynb+json',
      content: null,
      format: 'json',
      size: stats.size
    };

    if (content) {
      const rawText = await fsPromises.readFile(osPath, 'utf-8');
      try {
        model.content = JSON.parse(rawText);
      } catch (err) {
        // JSON パース失敗時
        const parseError = new Error(`Unreadable notebook JSON: ${apiPath}`);
        parseError.statusCode = 400;
        throw parseError;
      }
    }

    return model;
  }

  /**
   * コンテンツの保存（作成・更新）を行う。
   */
  async save(model, apiPath = '') {
    if (!model || typeof model !== 'object') {
      const err = new Error('Model is required');
      err.statusCode = 400;
      throw err;
    }

    const osPath = this.toOsPath(apiPath);
    const normApiPath = this.toApiPath(osPath);
    const parentDir = path.dirname(osPath);

    await fsPromises.mkdir(parentDir, { recursive: true });

    if (model.type === 'directory') {
      await fsPromises.mkdir(osPath, { recursive: true });
      return await this.getDirModel(osPath, normApiPath, false);
    }

    if (model.type === 'notebook') {
      let contentStr = '';
      if (typeof model.content === 'object' && model.content !== null) {
        contentStr = JSON.stringify(model.content, null, 1) + '\n';
      } else if (typeof model.content === 'string') {
        contentStr = model.content;
      } else {
        contentStr = JSON.stringify({ cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 }, null, 1) + '\n';
      }
      await fsPromises.writeFile(osPath, contentStr, 'utf-8');
      return await this.getNotebookModel(osPath, normApiPath, false);
    }

    // 通常ファイル
    if (model.format === 'base64' && typeof model.content === 'string') {
      const buffer = Buffer.from(model.content, 'base64');
      await fsPromises.writeFile(osPath, buffer);
    } else {
      const text = typeof model.content === 'string' ? model.content : String(model.content || '');
      await fsPromises.writeFile(osPath, text, 'utf-8');
    }

    return await this.getFileModel(osPath, normApiPath, false);
  }

  /**
   * 新規無題コンテンツ（Untitled）を自動生成する。
   */
  async newUntitled(apiPath = '', options = {}) {
    const { type = 'notebook', ext = '' } = options;
    const parentOsPath = this.toOsPath(apiPath);

    let baseName = 'Untitled';
    let extension = ext;

    if (type === 'directory') {
      baseName = 'Untitled Folder';
      extension = '';
    } else if (type === 'notebook') {
      baseName = 'Untitled';
      extension = ext || '.ipynb';
    } else if (type === 'file') {
      baseName = 'untitled';
      extension = ext || '.txt';
    }

    let untitledName = `${baseName}${extension}`;
    let counter = 0;

    while (fs.existsSync(path.join(parentOsPath, untitledName))) {
      counter++;
      if (type === 'directory') {
        untitledName = `${baseName} ${counter}`;
      } else if (type === 'notebook') {
        untitledName = `${baseName}${counter}${extension}`;
      } else {
        untitledName = `${baseName}${counter}${extension}`;
      }
    }

    const childApiPath = apiPath ? `${apiPath}/${untitledName}` : untitledName;
    const initialModel = {
      type,
      format: type === 'notebook' ? 'json' : 'text',
      content: type === 'notebook'
        ? { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 }
        : (type === 'directory' ? null : '')
    };

    return await this.save(initialModel, childApiPath);
  }

  /**
   * ファイルまたはディレクトリをコピーする。
   */
  async copy(fromApiPath, toApiPath) {
    const fromOsPath = this.toOsPath(fromApiPath);
    let targetOsPath;

    if (!toApiPath) {
      const dirName = path.dirname(fromOsPath);
      const ext = path.extname(fromOsPath);
      const baseName = path.basename(fromOsPath, ext);

      let copyName = `${baseName}-Copy${ext}`;
      let counter = 1;
      while (fs.existsSync(path.join(dirName, copyName))) {
        counter++;
        copyName = `${baseName}-Copy${counter}${ext}`;
      }
      targetOsPath = path.join(dirName, copyName);
    } else {
      let resolvedTarget = this.toOsPath(toApiPath);
      try {
        const stats = fs.statSync(resolvedTarget);
        if (stats.isDirectory()) {
          targetOsPath = path.join(resolvedTarget, path.basename(fromOsPath));
        } else {
          targetOsPath = resolvedTarget;
        }
      } catch (e) {
        targetOsPath = resolvedTarget;
      }
    }

    await fsPromises.cp(fromOsPath, targetOsPath, { recursive: true });
    const targetApiPath = this.toApiPath(targetOsPath);
    return await this.get(targetApiPath, { content: false });
  }

  /**
   * ファイルまたはディレクトリをリネーム・移動する。
   */
  async rename(oldApiPath, newApiPath) {
    const oldOsPath = this.toOsPath(oldApiPath);
    const newOsPath = this.toOsPath(newApiPath);

    if (!fs.existsSync(oldOsPath)) {
      const err = new Error(`Not Found: ${oldApiPath}`);
      err.statusCode = 404;
      throw err;
    }

    if (fs.existsSync(newOsPath) && oldOsPath !== newOsPath) {
      const err = new Error(`Conflict: ${newApiPath} already exists`);
      err.statusCode = 409;
      throw err;
    }

    await fsPromises.mkdir(path.dirname(newOsPath), { recursive: true });
    await fsPromises.rename(oldOsPath, newOsPath);

    const normNewApiPath = this.toApiPath(newOsPath);
    return await this.get(normNewApiPath, { content: false });
  }

  /**
   * ファイルまたはディレクトリを削除する。
   */
  async delete(apiPath) {
    const osPath = this.toOsPath(apiPath);
    if (!fs.existsSync(osPath)) {
      const err = new Error(`Not Found: ${apiPath}`);
      err.statusCode = 404;
      throw err;
    }

    await fsPromises.rm(osPath, { recursive: true, force: true });
  }

  /**
   * チェックポイント管理用のヘルパーパスを取得
   */
  _getCheckpointPath(apiPath, checkpointId = 'checkpoint-1') {
    const osPath = this.toOsPath(apiPath);
    const parentDir = path.dirname(osPath);
    const fileName = path.basename(osPath);
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);

    const checkpointDir = path.join(parentDir, '.ipynb_checkpoints');
    const checkpointFileName = `${base}-${checkpointId}${ext}`;
    return {
      checkpointDir,
      checkpointOsPath: path.join(checkpointDir, checkpointFileName),
      checkpointId
    };
  }

  /**
   * チェックポイント一覧を取得
   */
  async listCheckpoints(apiPath) {
    const { checkpointOsPath, checkpointId } = this._getCheckpointPath(apiPath);
    if (fs.existsSync(checkpointOsPath)) {
      const stats = await fsPromises.stat(checkpointOsPath);
      return [
        {
          id: checkpointId,
          last_modified: stats.mtime.toISOString()
        }
      ];
    }
    return [];
  }

  /**
   * チェックポイントを作成
   */
  async createCheckpoint(apiPath) {
    const osPath = this.toOsPath(apiPath);
    if (!fs.existsSync(osPath)) {
      const err = new Error(`Not Found: ${apiPath}`);
      err.statusCode = 404;
      throw err;
    }

    const { checkpointDir, checkpointOsPath, checkpointId } = this._getCheckpointPath(apiPath);
    await fsPromises.mkdir(checkpointDir, { recursive: true });
    await fsPromises.copyFile(osPath, checkpointOsPath);

    const stats = await fsPromises.stat(checkpointOsPath);
    return {
      id: checkpointId,
      last_modified: stats.mtime.toISOString()
    };
  }

  /**
   * チェックポイントから復元
   */
  async restoreCheckpoint(apiPath, checkpointId = 'checkpoint-1') {
    const osPath = this.toOsPath(apiPath);
    const { checkpointOsPath } = this._getCheckpointPath(apiPath, checkpointId);

    if (!fs.existsSync(checkpointOsPath)) {
      const err = new Error(`Checkpoint Not Found: ${checkpointId}`);
      err.statusCode = 404;
      throw err;
    }

    await fsPromises.copyFile(checkpointOsPath, osPath);
  }

  /**
   * チェックポイントを削除
   */
  async deleteCheckpoint(apiPath, checkpointId = 'checkpoint-1') {
    const { checkpointOsPath } = this._getCheckpointPath(apiPath, checkpointId);

    if (fs.existsSync(checkpointOsPath)) {
      await fsPromises.unlink(checkpointOsPath);
    }
  }
}

module.exports = {
  FileContentsManager
};
