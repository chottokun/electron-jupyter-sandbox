const { logger } = require('./logger');

/**
 * 内部URL（JupyterLiteアセット、ローカルホスト、内部プロトコル）か判定
 * 
 * @param {string} urlStr 
 * @param {string} scheme 
 * @returns {boolean}
 */
function isAllowedUrl(urlStr, scheme = 'jupyter') {
  try {
    const parsed = new URL(urlStr);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    const isInternal = parsed.protocol === `${scheme}:` || parsed.protocol === 'devtools:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:';
    return isInternal || isLocal;
  } catch (e) {
    return false;
  }
}

/**
 * セッションにネットワークアクセス制御フィルターを適用
 * 
 * @param {Object} targetSession - Electron session instance
 * @param {Function|Object} logFuncOrOptions - ログ関数 または オプションオブジェクト
 */
function applyNetworkFilter(targetSession, logFuncOrOptions = null) {
  let logHandler = (cat, msg) => logger.log(cat, msg);
  let isNetworkAllowed = () => false;

  if (typeof logFuncOrOptions === 'function') {
    logHandler = logFuncOrOptions;
  } else if (logFuncOrOptions && typeof logFuncOrOptions === 'object') {
    if (typeof logFuncOrOptions.logFunc === 'function') {
      logHandler = logFuncOrOptions.logFunc;
    }
    if (typeof logFuncOrOptions.isNetworkAllowed === 'function') {
      isNetworkAllowed = logFuncOrOptions.isNetworkAllowed;
    }
  }

  targetSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      // 内部通信は常に無条件で許可
      if (isAllowedUrl(details.url)) {
        callback({ cancel: false });
        return;
      }

      // 外部通信の場合：ポリシーおよび設定が許可しているか判定
      if (isNetworkAllowed()) {
        logHandler('SECURITY ALLOWED', `外部通信を許可しました: ${details.url}`);
        callback({ cancel: false });
      } else {
        logHandler('SECURITY BLOCKED', `外部通信を遮断しました: ${details.url}`);
        callback({ cancel: true });
      }
    } catch (e) {
      logHandler('SECURITY BLOCKED', `無効なURL要求を遮断しました: ${details.url}`);
      callback({ cancel: true });
    }
  });

  // レスポンスヘッダー調整（CORS 緩和および CSP 動的適用）
  if (targetSession.webRequest.onHeadersReceived) {
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...(details.responseHeaders || {}) };

      if (isNetworkAllowed()) {
        // 外部通信許可時: レンダラーおよび Pyodide からの fetch を通すため CORS を許可
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS, HEAD'];
        responseHeaders['Access-Control-Allow-Headers'] = ['*'];

        // CSP が存在する場合、connect-src に * を追加して fetch 遮断を解除
        const cspKey = Object.keys(responseHeaders).find(k => k.toLowerCase() === 'content-security-policy');
        if (cspKey && responseHeaders[cspKey]) {
          responseHeaders[cspKey] = responseHeaders[cspKey].map(val => {
            if (val.includes('connect-src')) {
              return val.replace(/connect-src [^;]+/, "connect-src * 'self' blob: data: http://127.0.0.1:* ws://127.0.0.1:*");
            }
            return val;
          });
        }
      }

      callback({ responseHeaders });
    });
  }
}


module.exports = {
  isAllowedUrl,
  applyNetworkFilter
};

