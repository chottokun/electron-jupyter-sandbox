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
}

module.exports = {
  isAllowedUrl,
  applyNetworkFilter
};

