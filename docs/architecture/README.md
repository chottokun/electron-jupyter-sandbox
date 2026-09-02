# Architecture

## Concepts
* [完全隔離型デスクトップJupyter環境 アーキテクチャ概要](./system-overview.md) (`Architecture Overview`) - ElectronとWebAssembly (Pyodide) ベースのJupyterLiteによる完全隔離・完全オフライン実行環境のシステム全体設計。
* [セキュリティ＆ネットワークポリシー設計書](./security-network-policy.md) (`Security Architecture`) - ビルド時ポリシー、ランタイム多層防御、COEP credentialless、動的CSPによる外部通信制御仕様。
* [バージョン整合性マトリクス](./version-matrix.md) (`Reference Matrix`) - 本システムで動作検証済みの各コンポーネント（Node, Electron, JupyterLite, Pyodide）のバージョン一覧と選定ルール。

