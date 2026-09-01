/**
 * Checks if a requested URL is allowed under local/offline security policy
 * @param {string} urlStr
 * @returns {boolean}
 */
function isAllowedUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    const isInternal = parsed.protocol === 'devtools:' || parsed.protocol === 'blob:' || parsed.protocol === 'data:';
    return isLocal || isInternal;
  } catch (e) {
    return false;
  }
}

/**
 * Applies the network filter to block external requests on an Electron session
 * @param {import('electron').Session} targetSession
 * @param {Function} [logFn]
 */
function applyNetworkFilter(targetSession, logFn) {
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    if (isAllowedUrl(details.url)) {
      callback({ cancel: false });
    } else {
      if (typeof logFn === 'function') {
        logFn('SECURITY BLOCKED', `外部通信を遮断しました: ${details.url}`);
      }
      callback({ cancel: true });
    }
  });
}

module.exports = {
  isAllowedUrl,
  applyNetworkFilter
};
