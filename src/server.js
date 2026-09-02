const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { logger } = require('./logger');
const { loadOverrides } = require('./settings');

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

  const normalizedRel = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.resolve(rootDir, '.' + (normalizedRel.startsWith('/') ? normalizedRel : '/' + normalizedRel));
  const relFromRoot = path.relative(rootDir, filePath);

  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
    return null;
  }
  return filePath;
}

function startLocalServer(rootDir, currentDataDir, preferredPort = DEFAULT_PORT, isExternalNetworkAllowed = null) {
  return new Promise((resolve, reject) => {
    let serverPort = 0;
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new url.URL(req.url, `http://127.0.0.1:${serverPort}`);
        const relativePath = decodeURIComponent(parsedUrl.pathname);

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
        const imgSrc = allowExternal
          ? "* 'self' data: blob:"
          : "'self' data: blob:";

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Security-Policy': `default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: http://127.0.0.1:* ws://127.0.0.1:*; connect-src ${connectSrc}; img-src ${imgSrc};`,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'no-cache'
        });



        if (path.basename(filePath) === 'jupyter-lite.json') {
          try {
            const baseContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const userOverrides = loadOverrides(currentDataDir);
            if (userOverrides) {
              baseContent['jupyter-config-data'] = baseContent['jupyter-config-data'] || {};
              baseContent['jupyter-config-data']['settingsOverrides'] = {
                ...(baseContent['jupyter-config-data']['settingsOverrides'] || {}),
                ...userOverrides
              };
            }
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
  startLocalServer
};
