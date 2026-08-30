---
type: Playbook
title: OSS配布における信頼性確保 & リリースガイド
description: 高額な商用コード署名証明書を購入せずに、信頼性を担保する3大アプローチ、CI自動化フロー、およびSmartScreen対応手順。
tags:
  - release
  - security
  - trust
  - packaging
  - github-actions
  - playbook
status: stable
generated:
  by: agent:antigravity
  at: '2026-08-30T03:00:00Z'
---

# OSS配布における信頼性確保 & リリースガイド

個人やコミュニティ主導のOSSプロジェクトでは、高額な商用EV/OVコード署名証明書を購入せずに、「ビルド来歴の透明性」「OSS向け無償署名/検証基盤」「パッケージマネージャー活用」によって信頼性を担保するのが現実的かつ標準的なアプローチです。

---

## 🛡️ OSS配布における信頼性確保の3大アプローチ

| アプローチ | 具体的な手法 | コスト / メリット |
| --- | --- | --- |
| **OSS向け無償コード署名** | **SignPath Foundation**（オープンソース支援プログラム）の審査を受け、無料の署名サービスをGitHub Actionsに統合する。 | **無料**。SmartScreenの警告を根本から解消・軽減できる。 |
| **ビルド来歴証明（Provenance）** | GitHub Actionsの **Artifact Attestations**（SLSA準拠）を利用し、リポジトリのCIから直接ビルドされた改ざんのないバイナリであることを署名・証明する。 | **無料**。CLIやGitHub上で誰でもソースコードとバイナリの一致を検証可能。 |
| **公式リポジトリ経由の配布** | **Windows Package Manager (`winget`)** や **Scoop** の公式マニフェストに登録する。 | **無料**。パッケージマネージャー側の自動検証を通ることで、ユーザーへの信頼性が向上する。 |

---

## 🚀 推奨されるGitHub Actions自動化フロー

### 1. タグトリガーによる自動ビルド & パッケージング
`v*.*.*` タグのプッシュをトリガーに、Windows環境のランナーで `electron-builder` を実行してインストーラー（NSIS）およびポータブル版（`.zip`）を生成します。

### 2. チェックサム自動生成とVirusTotal連携

```bash
# SHA-256 チェックサムの生成
sha256sum *.exe *.zip > SHA256SUMS.txt
```

CI内でVirusTotal APIを呼び出してスキャンを実行し、スキャン結果の公開URLをGitHub Releasesのリリースノートに自動挿入します。

### 3. GitHub Releases への公開

* インストーラー（`setup.exe`）
* ポータブル版（解凍するだけで動く `.zip`）
* `SHA256SUMS.txt`
* リリースノート（変更履歴、VirusTotalレポートURL、ハッシュ検証用PowerShellコマンド）

---

## ⚠️ SmartScreen・セキュリティ警告へのユーザー向け案内

未署名または新規署名のOSSバイナリでは、Windows SmartScreenによる「WindowsによってPCが保護されました」という青い警告画面が避けられない場合があります。これをトラブルではなく正常な仕様としてドキュメント化します。

* **README / ドキュメントへの記載**
* **初回起動方法**: 「詳細情報」をクリックし、「実行」を選択する手順を案内する。
* **整合性確認手順**: ユーザー自身がPowerShellでハッシュ値を検証できるコマンドを提示する。

```powershell
Get-FileHash .\electron-jupyter-sandbox-setup.exe -Algorithm SHA256
```

* **Microsoftへの誤検知報告（False Positive Submission）**
リリース直後、Microsoft Security Intelligence（開発者向け誤検知申請フォーム）からバイナリを送信することで、数日以内にWindows Defenderでの安全判定が反映されます。
