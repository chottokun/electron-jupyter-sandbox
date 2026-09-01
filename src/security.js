const { logger } = require('./logger');

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

function applyNetworkFilter(targetSession, logFunc = null) {
  const logHandler = logFunc || ((cat, msg) => logger.log(cat, msg));

  targetSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      if (isAllowedUrl(details.url)) {
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
