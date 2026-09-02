const { isNetworkConfigurable, getSecurityMode } = require('./src/policy');
const { isExternalNetworkAllowed, setExternalNetworkAllowed } = require('./src/config');
const { isAllowedUrl, applyNetworkFilter } = require('./src/security');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-test-'));
const configPath = path.join(tmpDir, 'config.json');

console.log('=== 🛡️ 1. 完全隔離モード (STRICT) の検証 ===');
delete process.env.ALLOW_NETWORK_CONFIG;
setExternalNetworkAllowed(configPath, true); // 設定ファイルを意図的に true に改ざん

console.log('・セキュリティモード:', getSecurityMode());
console.log('・ネットワーク設定可否 (isNetworkConfigurable):', isNetworkConfigurable());
console.log('・外部通信許可判定 (isExternalNetworkAllowed):', isExternalNetworkAllowed(configPath));
// 期待値: config.json が true でも判定は false（多層防御）

console.log('\n=== ⚙️ 2. 設定可能モード (CONFIGURABLE) の検証 ===');
process.env.ALLOW_NETWORK_CONFIG = 'true';
console.log('・セキュリティモード:', getSecurityMode());

setExternalNetworkAllowed(configPath, false);
console.log('・トグル OFF 時の判定:', isExternalNetworkAllowed(configPath));

setExternalNetworkAllowed(configPath, true);
console.log('・トグル ON 時の判定:', isExternalNetworkAllowed(configPath));

// セッションフィルターのシミュレーション
const logs = [];
const mockSession = { webRequest: { onBeforeRequest: (cb) => { mockSession.handler = cb; } } };
applyNetworkFilter(mockSession, {
  logFunc: (cat, msg) => logs.push(`[${cat}] ${msg}`),
  isNetworkAllowed: () => isExternalNetworkAllowed(configPath)
});

let cancelState = null;
mockSession.handler({ url: 'https://pypi.org/simple' }, res => cancelState = res.cancel);
console.log('・外部通信要求 (ON時):', cancelState === false ? '✅ 許可 (Pass)' : '❌ 遮断 (Block)');

setExternalNetworkAllowed(configPath, false);
mockSession.handler({ url: 'https://pypi.org/simple' }, res => cancelState = res.cancel);
console.log('・外部通信要求 (OFF時):', cancelState === true ? '🛡️ 遮断 (Block)' : '❌ 許可 (Pass)');

console.log('\n=== 📄 出力されたセキュリティ監査ログ ===');
console.log(logs.join('\n'));

fs.rmSync(tmpDir, { recursive: true, force: true });
