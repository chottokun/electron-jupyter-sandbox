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

  // レスポンスヘッダー調整（CORS 緩和、CORP 付与、CSP 動的適用）
  if (targetSession.webRequest.onHeadersReceived) {
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...(details.responseHeaders || {}) };

      if (isNetworkAllowed()) {
        // 外部通信許可時: COEP環境下での外部リクエスト破棄を防ぐため CORP と CORS を付与
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS, HEAD'];
        responseHeaders['Access-Control-Allow-Headers'] = ['*'];
        responseHeaders['Cross-Origin-Resource-Policy'] = ['cross-origin'];

        // CSP が存在する場合、connect-src / img-src に * を追加して fetch 遮断を解除
        for (const key of Object.keys(responseHeaders)) {
          if (key.toLowerCase() === 'content-security-policy') {
            responseHeaders[key] = responseHeaders[key].map(val => {
              let updated = val;
              if (updated.includes('connect-src')) {
                updated = updated.replace(/connect-src [^;]+/, "connect-src * 'self' blob: data: http://127.0.0.1:* ws://127.0.0.1:*");
              } else {
                updated = updated + "; connect-src * 'self' blob: data: http://127.0.0.1:* ws://127.0.0.1:*";
              }
              if (updated.includes('img-src')) {
                updated = updated.replace(/img-src [^;]+/, "img-src * 'self' data: blob:");
              }
              return updated;
            });
          }
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

