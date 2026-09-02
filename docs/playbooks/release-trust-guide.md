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

### 2. ローカル Defender スキャン・チェックサム生成・VirusTotal 連携

1. **Microsoft Defender CLI スキャン**: Windows ランナー上の `MpCmdRun.exe` で成果物（`dist` ディレクトリ）を直接スキャンし、マルウェア混入を事前に防御します。
2. **SHA-256 チェックサム生成**: 各成果物のハッシュ値を計算して `SHA256SUMS.txt` を自動生成します。
3. **VirusTotal レポート URL の動的生成**: 成果物（約450MB〜500MB）をAPI経由で毎回アップロードする負荷・タイムアウト・レート制限を回避するため、計算したSHA256ハッシュに基づいた VirusTotal 照会リンク（`https://www.virustotal.com/gui/file/<hash>`）を生成し、リリースノートに自動挿入します。

### 3. GitHub Releases への公開

* インストーラー（`setup.exe`）
* ポータブル版（解凍するだけで動く `.zip`）
* `SHA256SUMS.txt`
* リリースノート（変更履歴、VirusTotalレポートURL、ハッシュ検証用PowerShellコマンド）

---

## 📋 メンテナー向けリリース時運用チェックリスト

未署名または新規署名のOSSバイナリでは、Windows SmartScreenによる警告画面が表示される場合があります。リリース時にはメンテナーが以下の運用手順を実施することを推奨します。

### 1. ユーザー向けガイドの確認・周知
* READMEやリリースノートに、初回起動手順（「詳細情報」→「実行」）およびPowerShellハッシュ検証手順（`Get-FileHash`）が記載されていることを確認します。

```powershell
Get-FileHash .\electron-jupyter-sandbox-setup.exe -Algorithm SHA256
```

### 2. VirusTotal への初期スキャン登録（推奨）
新規生成されたバイナリは VirusTotal 側に初回登録されるまで「Item not found」となります。リリース後、以下の手順で一度スキャンを実行しておくと、全ユーザーが即座に検査レポートを閲覧できるようになります。
1. [VirusTotal](https://www.virustotal.com/) にアクセスします。
2. リリースされたバイナリ（`setup.exe` や `.zip`）をアップロードしてスキャンを実行します。
3. 数分で各社アンチウイルスエンジン（70社以上）の解析が完了し、リリースノート記載のURLから恒久的に「Clean」レポートが参照可能になります。

### 3. Microsoftへの誤検知申請（False Positive Submission）手順
新規リリース直後、必要に応じて以下の手順で Microsoft にバイナリを送信し、安全判定を促進させます。
1. **申請フォームにアクセス**: [Microsoft Security Intelligence 誤検知申請ポータル](https://www.microsoft.com/en-us/wdsi/filesubmission) にアクセスします。
2. **ファイル送信**: 「Software Developer」を選択し、生成されたビルドバイナリ（`.exe`）を添付して送信します。
3. **反映の確認**: 数日以内に Windows Defender / SmartScreen での安全判定が更新されます。

