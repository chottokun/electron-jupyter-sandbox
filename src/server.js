const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

// MIME type definitions
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

/**
 * Resolves request path safely under rootDir and checks access
 * @param {string} rootDir
 * @param {string} relativePath
 * @returns {{ status: number, filePath?: string, contentType?: string, error?: string }}
 */
function resolveServerPath(rootDir, relativePath) {
  if (relativePath === '/' || relativePath === '') {
    relativePath = '/lab/index.html';
  }

  // Path traversal prevention via strict path.relative check
  const normalizedRel = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.resolve(rootDir, '.' + (normalizedRel.startsWith('/') ? normalizedRel : '/' + normalizedRel));
  const relFromRoot = path.relative(rootDir, filePath);

  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    return { status: 403, error: `Access Denied: ${relativePath}` };
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return { status: 404, error: `Not Found: ${relativePath}` };
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  return { status: 200, filePath, contentType };
}

/**
 * Injects user settings overrides into jupyter-lite.json content
 * @param {Object} baseContent
 * @param {Object|null} userOverrides
 * @returns {Object}
 */
function mergeOverrides(baseContent, userOverrides) {
  const result = { ...baseContent };
  if (userOverrides) {
    result['jupyter-config-data'] = result['jupyter-config-data'] || {};
    result['jupyter-config-data']['settingsOverrides'] = {
      ...(result['jupyter-config-data']['settingsOverrides'] || {}),
      ...userOverrides
    };
  }
  return result;
}

/**
 * Starts local HTTP server to serve JupyterLite assets
 * @param {Object} options
 * @param {string} options.rootDir
 * @param {string} options.dataDir
 * @param {number} [options.preferredPort=DEFAULT_PORT]
 * @param {Function} [options.logFn]
 * @param {Function} [options.loadOverridesFn]
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
function startLocalServer({ rootDir, dataDir, preferredPort = DEFAULT_PORT, logFn = console.log, loadOverridesFn }) {
  return new Promise((resolve, reject) => {
    let currentPort = preferredPort;

    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new url.URL(req.url, `http://127.0.0.1:${currentPort}`);
        const relativePath = decodeURIComponent(parsedUrl.pathname);

        const resolved = resolveServerPath(rootDir, relativePath);

        if (resolved.status === 403) {
          if (typeof logFn === 'function') logFn('HTTP 403', resolved.error);
          res.writeHead(403);
          return res.end('Access Denied');
        }

        if (resolved.status === 404) {
          if (typeof logFn === 'function') logFn('HTTP 404', resolved.error);
          res.writeHead(404);
          return res.end(resolved.error);
        }

        const filePath = resolved.filePath;
        const contentType = resolved.contentType;

        // Security headers for WebAssembly and Service Worker support
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1:*; img-src 'self' data: blob:;",
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cache-Control': 'no-cache'
        });

        // Dynamic overrides injection for jupyter-lite.json
        if (path.basename(filePath) === 'jupyter-lite.json') {
          try {
            const baseContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const userOverrides = typeof loadOverridesFn === 'function' ? loadOverridesFn(dataDir) : null;
            const mergedContent = mergeOverrides(baseContent, userOverrides);
            return res.end(JSON.stringify(mergedContent, null, 2));
          } catch (err) {
            if (typeof logFn === 'function') logFn('SERVER ERROR', `Failed to inject overrides: ${err.message}`);
          }
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (err) {
        if (typeof logFn === 'function') logFn('SERVER ERROR', `${err.message}`);
        res.writeHead(500);
        res.end(err.message);
      }
    });

    const tryListen = (portToTry) => {
      server.listen(portToTry, '127.0.0.1', () => {
        currentPort = server.address().port;
        if (typeof logFn === 'function') logFn('MAIN', `Local Server started on http://127.0.0.1:${currentPort}`);
        resolve({ server, port: currentPort });
      });
    };

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (typeof logFn === 'function') logFn('MAIN', `Port ${currentPort} is in use, trying next port...`);
        currentPort++;
        tryListen(currentPort);
      } else {
        reject(err);
      }
    });

    tryListen(currentPort);
  });
}

module.exports = {
  MIME_TYPES,
  DEFAULT_PORT,
  resolveServerPath,
  mergeOverrides,
  startLocalServer
};
