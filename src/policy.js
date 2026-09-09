/**
 * セキュリティポリシー管理モジュール
 * 
 * ビルド時または環境変数によるセキュリティポリシー（完全隔離版 vs 設定可能版）を制御します。
 */

const SECURITY_MODES = {
  STRICT: 'STRICT',         // 完全隔離モード（ネットワーク切り替え不可・常時強制遮断）
  CONFIGURABLE: 'CONFIGURABLE' // 設定可能モード（ユーザーによるオン/オフ切り替え許可）
};

/**
 * ネットワーク接続の切り替えが許可されているビルドか判定
 * 1. 開発時・実行時環境変数 ALLOW_NETWORK_CONFIG
 * 2. ビルド時に埋め込まれた policy.json
 * 
 * @returns {boolean}
 */
function isNetworkConfigurable() {
  if (process.env.ALLOW_NETWORK_CONFIG === 'true') {
    return true;
  }
  try {
    const policy = require('./policy.json');
    return policy.configurable === true;
  } catch (e) {
    return false;
  }
}


/**
 * 現在のセキュリティモード名を取得
 * @returns {string} 'STRICT' | 'CONFIGURABLE'
 */
function getSecurityMode() {
  return isNetworkConfigurable() ? SECURITY_MODES.CONFIGURABLE : SECURITY_MODES.STRICT;
}

module.exports = {
  SECURITY_MODES,
  isNetworkConfigurable,
  getSecurityMode
};
