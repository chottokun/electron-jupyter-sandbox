const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { logger } = require('./logger');
const { loadOverrides } = require('./settings');
const { getCategorizedPreloadPackages } = require('./config');
const { FileContentsManager } = require('./contents-api');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ipynb': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.whl': 'application/x-wheel+zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.webmanifest': 'application/manifest+json'
};

const DEFAULT_PORT = 58888;

function resolveSafePath(rootDir, relativePath) {
  let rel = relativePath;
  if (rel === '/' || rel === '') {
    rel = '/lab/index.html';
  }

  // JupyterLab が /lab/ 配下から ./pypi/ を相対要求した場合へのルーティング対応
  if (rel.startsWith('/lab/pypi/')) {
    rel = rel.replace('/lab/pypi/', '/pypi/');
  }

  const normalizedRel = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.resolve(rootDir, '.' + (normalizedRel.startsWith('/') ? normalizedRel : '/' + normalizedRel));
  const relFromRoot = path.relative(rootDir, filePath);

  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    return null;
  }
  return filePath;
}

/**
 * REST API /api/contents リクエストを処理する関数
 */
async function handleContentsApi(req, res, contentsManager, parsedUrl) {
  const pathname = decodeURIComponent(parsedUrl.pathname);
  // /api/contents または /api/contents/ 以降のパス
  const apiSubPath = pathname.substring('/api/contents'.length);
  const cleanApiPath = apiSubPath.replace(/^[/\\]+/, '');

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // リクエストボディの読み込みヘルパー
  const readJsonBody = () => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

  try {
    // 1. チェックポイント ルーティング
    // パス末尾の /checkpoints または /checkpoints/<checkpoint_id> にマッチ
    const checkpointMatch = cleanApiPath.match(/^(?:(.*)\/)?checkpoints(?:\/([^/]+))?$/);
    if (checkpointMatch) {
      const targetApiPath = checkpointMatch[1] || '';
      const checkpointId = checkpointMatch[2];

      if (req.method === 'GET') {
        const list = await contentsManager.listCheckpoints(targetApiPath);
        res.writeHead(200);
        return res.end(JSON.stringify(list));
      } else if (req.method === 'POST') {
        // Restore もしくは Create
        let body = {};
        try { body = await readJsonBody(); } catch (e) {}
        if (checkpointId) {
          // Restore
          await contentsManager.restoreCheckpoint(targetApiPath, checkpointId);
          res.writeHead(204);
          return res.end();
        } else {
          // Create
          const cp = await contentsManager.createCheckpoint(targetApiPath);
          res.writeHead(201);
          return res.end(JSON.stringify(cp));
        }
      } else if (req.method === 'DELETE' && checkpointId) {
        await contentsManager.deleteCheckpoint(targetApiPath, checkpointId);
        res.writeHead(204);
        return res.end();
      }
    }

    // 2. 通常の Contents API ルーティング
    if (req.method === 'GET') {
      const contentParam = parsedUrl.searchParams.get('content') !== '0';
      const typeParam = parsedUrl.searchParams.get('type') || null;
      const formatParam = parsedUrl.searchParams.get('format') || null;

      const model = await contentsManager.get(cleanApiPath, {
        content: contentParam,
        type: typeParam,
        format: formatParam
      });
      res.writeHead(200);
      return res.end(JSON.stringify(model));
    } else if (req.method === 'POST') {
      const body = await readJsonBody();
      if (body.copy_from) {
        // コピー操作
        const model = await contentsManager.copy(body.copy_from, cleanApiPath);
        res.writeHead(201);
        return res.end(JSON.stringify(model));
      } else {
        // new_untitled 操作
        const model = await contentsManager.newUntitled(cleanApiPath, {
          type: body.type || 'notebook',
          ext: body.ext || ''
        });
        res.writeHead(201);
        return res.end(JSON.stringify(model));
      }
    } else if (req.method === 'PUT') {
      const body = await readJsonBody();
      const model = await contentsManager.save(body, cleanApiPath);
      res.writeHead(200);
      return res.end(JSON.stringify(model));
    } else if (req.method === 'PATCH') {
      const body = await readJsonBody();
      if (body.path) {
        const model = await contentsManager.rename(cleanApiPath, body.path);
        res.writeHead(200);
        return res.end(JSON.stringify(model));
      } else {
        const model = await contentsManager.get(cleanApiPath, { content: false });
        res.writeHead(200);
        return res.end(JSON.stringify(model));
      }
    } else if (req.method === 'DELETE') {
      await contentsManager.delete(cleanApiPath);
      res.writeHead(204);
      return res.end();
    } else {
      res.writeHead(455);
      return res.end(JSON.stringify({ message: 'Method Not Allowed' }));
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.writeHead(statusCode);
    return res.end(JSON.stringify({ message: err.message }));
  }
}

function startLocalServer(rootDir, currentDataDir, preferredPort = DEFAULT_PORT, options = {}) {
  const isExternalNetworkAllowed = typeof options === 'function' ? options : options.isExternalNetworkAllowed;
  const configFilePath = (typeof options === 'object' && options !== null && options.configFilePath)
    ? options.configFilePath
    : path.join(path.dirname(currentDataDir), 'config.json');

  const notebooksDir = path.join(currentDataDir, 'notebooks');
  if (!fs.existsSync(notebooksDir)) {
    fs.mkdirSync(notebooksDir, { recursive: true });
  }
  const contentsManager = new FileContentsManager(notebooksDir);

  return new Promise((resolve, reject) => {
    let serverPort = 0;
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new url.URL(req.url, `http://127.0.0.1:${serverPort}`);
        const relativePath = decodeURIComponent(parsedUrl.pathname);

        // /api/contents へのリクエストを横取りして Contents API で処理
        if (relativePath === '/api/contents' || relativePath.startsWith('/api/contents/')) {
          return await handleContentsApi(req, res, contentsManager, parsedUrl);
        }

        const filePath = resolveSafePath(rootDir, relativePath);

        if (!filePath) {
          logger.log('HTTP 403', `Access Denied: ${relativePath}`);
          res.writeHead(403);
          return res.end('Access Denied');
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          logger.log('HTTP 404', `Not Found: ${relativePath}`);
          res.writeHead(404);
          return res.end(`Not Found: ${relativePath}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const allowExternal = typeof isExternalNetworkAllowed === 'function' ? isExternalNetworkAllowed() : false;
        const connectSrc = allowExternal
          ? "* 'self' blob: data: http://127.0.0.1:* ws://127.0.0.1:*"
          : "'self' blob: data: http://127.0.0.1:* ws://127.0.0.1:*";
        const scriptSrc = allowExternal
          ? "* 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1:*"
          : "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1:*";
        const imgSrc = allowExternal
          ? "* 'self' data: blob:"
          : "'self' data: blob:";

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Security-Policy': `default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1; script-src ${scriptSrc}; connect-src ${connectSrc}; img-src ${imgSrc};`,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'no-cache'
        });

        if (path.basename(filePath) === 'jupyter-lite.json') {
          try {
            const baseContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const userOverrides = loadOverrides(currentDataDir) || {};

            baseContent['jupyter-config-data'] = baseContent['jupyter-config-data'] || {};
            const existingOverrides = baseContent['jupyter-config-data']['settingsOverrides'] || {};
            const existingLitePluginSettings = baseContent['jupyter-config-data']['litePluginSettings'] || {};

            const { pyodidePackages, piplitePackages } = getCategorizedPreloadPackages(configFilePath);
            const kernelPluginId = '@jupyterlite/pyodide-kernel-extension:kernel';

            const existingKernelSettings = userOverrides[kernelPluginId] || existingOverrides[kernelPluginId] || existingLitePluginSettings[kernelPluginId] || {};
            const existingLoadPyodideOptions = existingKernelSettings.loadPyodideOptions || {};

            const mergedKernelSettings = {
              ...existingKernelSettings,
              loadPyodideOptions: {
                ...existingLoadPyodideOptions,
                packages: pyodidePackages
              },
              piplitePreloadPackages: piplitePackages
            };

            baseContent['jupyter-config-data']['settingsOverrides'] = {
              ...existingOverrides,
              ...userOverrides,
              [kernelPluginId]: mergedKernelSettings
            };

            baseContent['jupyter-config-data']['litePluginSettings'] = {
              ...existingLitePluginSettings,
              [kernelPluginId]: mergedKernelSettings
            };

            return res.end(JSON.stringify(baseContent, null, 2));
          } catch (err) {
            logger.log('SERVER ERROR', `Failed to inject overrides: ${err.message}`);
          }
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (err) {
        logger.log('SERVER ERROR', `${err.message}`);
        res.writeHead(500);
        res.end(err.message);
      }
    });

    const tryListen = (portToTry) => {
      server.listen(portToTry, '127.0.0.1', () => {
        serverPort = server.address().port;
        logger.log('MAIN', `Local Server started on http://127.0.0.1:${serverPort}`);
        resolve({ server, port: serverPort });
      });
    };

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.log('MAIN', `Port ${preferredPort} is in use, trying next port...`);
        preferredPort++;
        tryListen(preferredPort);
      } else {
        reject(err);
      }
    });

    tryListen(preferredPort);
  });
}

module.exports = {
  MIME_TYPES,
  DEFAULT_PORT,
  resolveSafePath,
  startLocalServer,
  handleContentsApi
};
