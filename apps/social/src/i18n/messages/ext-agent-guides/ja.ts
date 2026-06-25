import type { LocalizedExtAgentGuide } from "./types.js";

export const jaExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "お使いのコンピューター上で動く個人 AI アシスタント。組み込みチャネルで EnvoyMesh に接続します。",
    bestFor: "日常のチャットとアシスタント応答（推奨デフォルト）。",
    defaultPort: 8010,
    installSteps: [
      "このコンピューター（EnvoyMesh ホームノードと同じマシン）に HomeClaw をインストールします。HomeClaw のインストールガイドに従ってください。",
      "HomeClaw 設定で EnvoyMesh / mesh チャネルを有効にし、待受ポートを 8010（デフォルト）に設定します。",
      "ファイアウォールでローカル接続（127.0.0.1 のみ）を許可します。",
    ],
    runSteps: [
      "HomeClaw を起動し、バックグラウンドで実行したままにします。",
      "HomeClaw は http://127.0.0.1:8010/message で待ち受けます — ブラウザで開く必要はありません。",
      "EnvoyMesh：設定 → AI → AI エンジンで HomeClaw をアクティブバックエンドに選択します。約 30 秒以内に状態が「実行中」になります。",
    ],
    verifySteps: [
      "表の HomeClaw 行の状態が「実行中」です。",
      "外部エージェントブリッジのバッジが「到達可能」を表示します。",
      "このノードまたは EnvoyGo の Ext Agent チャットでテストメッセージを送信します。",
    ],
    troubleshooting: [
      "状態が「停止」？ HomeClaw が実行中で、EnvoyMesh チャネルがポート 8010 で有効か確認してください。",
      "まだ到達不可？ ポート 8010 の競合を確認し、HomeClaw を再起動して「状態を更新」をクリックしてください。",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "代替の外部アシスタント。EnvoyMesh には Hermes（またはテストエコー）をブリッジに接続する小さなヘルパーが含まれます。",
    bestFor: "HomeClaw と併用して Hermes を試す、または開発・テスト。",
    defaultPort: 8020,
    installSteps: [
      "任意：本物の Hermes 応答が必要なら Hermes CLI またはアプリをインストールします（テストエコーのみでない場合）。",
      "このコンピューターに Node.js が必要です（EnvoyMesh デスクトップアプリに含まれます）。",
      "必要なら bridge-config.json に Hermes を追加 — EnvoyMesh インストールフォルダの bridge-config.multi-agent.example.json を参照。",
    ],
    runSteps: [
      "ターミナル（Mac/Linux）またはコマンドプロンプト / PowerShell（Windows）を開きます。",
      "EnvoyMesh インストールフォルダ（tools/ext-agent-adapters を含む）に移動します。",
      { code: "node tools/ext-agent-adapters/hermes/server.mjs" },
      "Hermes 使用中はそのウィンドウを開いたままにします。ポート 8020 で待ち受けます。",
      "設定 → AI → AI エンジンで Hermes をアクティブバックエンドに選択します。",
    ],
    verifySteps: [
      "登録表で Hermes 行が「実行中」と表示されます。",
      "テストエコーモード（Hermes CLI なし）では [Hermes echo] メッセージ形式で応答します。",
    ],
    troubleshooting: [
      "ポート使用中？ 他のヘルパーインスタンスを閉じるか、PORT=8021 node tools/ext-agent-adapters/hermes/server.mjs を実行し bridge-config.json を合わせて更新してください。",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman はデスクトップ AI アプリです。EnvoyMesh は HomeClaw と同じプロトコルのローカルヘルパー経由で接続します。",
    bestFor: "すでにこのコンピューターで OpenHuman を使っている方。",
    defaultPort: 8021,
    installSteps: [
      "このコンピューターに OpenHuman デスクトップアプリをインストールして開きます。",
      "必要ならマルチエージェント例ファイルを使い bridge-config.json に OpenHuman（ポート 8021）を追加します。",
      "完全統合にはローカル RPC ヘルパー（上級）が必要です。初回テストは同梱のエコーヘルパーが使えます。",
    ],
    runSteps: [
      "ターミナルを開き EnvoyMesh インストールフォルダに移動します。",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "ウィンドウを開いたままにします。ヘルパーはポート 8021 で待ち受けます。",
      "設定 → AI → AI エンジンで OpenHuman を選択します。",
    ],
    verifySteps: [
      "OpenHuman 行が「実行中」と表示されます。",
      "エコーテストモードは [OpenHuman echo] … で応答し、OPENHUMAN_RPC_URL 設定後に本番 OpenHuman チャットが可能です。",
    ],
    troubleshooting: [
      "OpenHuman アプリはホームノードと同じマシンで実行し続ける必要があります。",
      "本番チャット（エコー以外）には OPENHUMAN_RPC_URL を OpenHuman のローカル JSON-RPC ヘルパーに設定してください。",
    ],
  },
  {
    id: "pi",
    name: "Pi（コーディング）",
    summary: "Pi はコーディング向けアシスタントです。Pi CLI インストール時に EnvoyMesh がメッセージを転送、または簡単なエコーテストを使用します。",
    bestFor: "コーディング支援のみ — 家庭チャットのデフォルトには非推奨。",
    defaultPort: 8022,
    installSteps: [
      "pi-mono プロジェクトから Pi CLI をインストール（開発者向け）。",
      "必要なら bridge-config.json に Pi（ポート 8022）を追加。",
    ],
    runSteps: [
      "Pi 未インストール時のテスト — EnvoyMesh フォルダでターミナルを開き実行：",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "Pi インストール済み：node tools/ext-agent-adapters/pi/server.mjs を実行（PI_ECHO なし）しウィンドウを開いたままに。",
      "設定 → AI → AI エンジンで Pi（コーディング）をアクティブバックエンドに選択。",
    ],
    verifySteps: [
      "Pi 行が「実行中」と表示されます。",
      "エコーモードは [Pi echo] … で応答します。",
    ],
    troubleshooting: [
      "Pi がない場合は PI_ECHO=1 でテストするか、HomeClaw/Hermes を選んでください。",
    ],
  },
];
