import type { LocalizedExtAgentGuide } from "./types.js";

export const zhExtAgentGuides: LocalizedExtAgentGuide[] = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    summary: "运行在本地的个人 AI 助手，通过内置通道连接 EnvoyMesh。",
    bestFor: "日常聊天与助手回复（推荐默认）。",
    defaultPort: 8010,
    installSteps: [
      "在本机安装 HomeClaw（须与 EnvoyMesh 家庭节点在同一台电脑上）。请按 HomeClaw 官方安装指南操作。",
      "在 HomeClaw 设置中启用 EnvoyMesh / mesh 通道，监听端口设为 8010（默认）。",
      "防火墙允许本地连接即可（仅 127.0.0.1）。",
    ],
    runSteps: [
      "启动 HomeClaw 并保持后台运行。",
      "HomeClaw 监听 http://127.0.0.1:8010/message — 无需在浏览器中打开。",
      "在 EnvoyMesh：设置 → AI → AI 引擎，选择 HomeClaw 为当前后端。约 30 秒内状态应显示为「运行中」。",
    ],
    verifySteps: [
      "表格中 HomeClaw 行的状态为「运行中」。",
      "外部智能体桥接徽章显示「可访问」。",
      "在本节点或 EnvoyGo 的 Ext Agent 聊天线程发送测试消息。",
    ],
    troubleshooting: [
      "状态为「已停止」？确认 HomeClaw 已运行且 EnvoyMesh 通道已在 8010 端口启用。",
      "仍不可访问？检查 8010 端口是否被占用，重启 HomeClaw 后点击「刷新状态」。",
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    summary: "另一种外部助手。EnvoyMesh 会自动启动本地连接辅助程序，无需打开终端。",
    bestFor: "与 HomeClaw 并存试用 Hermes。",
    defaultPort: 8020,
    installSteps: [
      "在本机安装 Hermes（与 EnvoyMesh 家庭节点同一台电脑）。",
      "无需编辑 bridge-config.json — EnvoyMesh 会自动将 Hermes 加入智能体列表。",
    ],
    runSteps: [
      "打开 设置 → AI → AI 引擎，如未开启请打开「外部智能体桥接」。",
      "在「当前后端」中选择 Hermes。EnvoyMesh 会自动启动连接辅助程序。",
      "点击「刷新状态」— 几秒内 Hermes 应显示「运行中」。",
    ],
    verifySteps: [
      "注册表中 Hermes 行显示「运行中」。",
      "向外部智能体聊天线程发送测试消息。",
      "若尚未安装 Hermes CLI，回复可能形如 [Hermes echo] 你的消息（桥接测试模式）。",
    ],
    troubleshooting: [
      "状态为「已停止」？重新选择 Hermes 并点击刷新状态，或重启家庭节点。",
      "回复一直是回声模式？确认 hermes 命令已在 PATH 中。",
      "端口被占用？关闭占用 8020 端口的程序后刷新状态。",
    ],
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    summary: "OpenHuman 是桌面 AI 应用。EnvoyMesh 通过本地辅助程序连接，协议与 HomeClaw 相同。",
    bestFor: "已在本机使用 OpenHuman 的用户。",
    defaultPort: 8021,
    installSteps: [
      "在本机安装并打开 OpenHuman 桌面应用。",
      "如需要，参考多智能体示例文件，在 bridge-config.json 中添加 OpenHuman（端口 8021）。",
      "完整集成需本地 RPC 辅助（进阶）。首次测试可使用内置回声辅助程序。",
    ],
    runSteps: [
      "打开终端并进入 EnvoyMesh 安装目录。",
      { code: "node tools/ext-agent-adapters/openhuman/server.mjs" },
      "保持窗口打开。辅助程序监听 8021 端口。",
      "在 设置 → AI → AI 引擎 中选择 OpenHuman。",
    ],
    verifySteps: [
      "OpenHuman 行显示「运行中」。",
      "回声测试模式回复 [OpenHuman echo] …，配置 OPENHUMAN_RPC_URL 后可使用真实 OpenHuman 聊天。",
    ],
    troubleshooting: [
      "OpenHuman 应用须与家庭节点在同一台电脑上保持运行。",
      "真实聊天（非回声）需设置 OPENHUMAN_RPC_URL 指向 OpenHuman 本地 JSON-RPC 辅助。",
    ],
  },
  {
    id: "pi",
    name: "Pi（编程）",
    summary: "Pi 是面向编程的助手。安装 Pi CLI 后 EnvoyMesh 可转发消息，也可使用简单回声测试。",
    bestFor: "仅用于编程帮助 — 不建议作为家庭聊天默认助手。",
    defaultPort: 8022,
    installSteps: [
      "从 pi-mono 项目安装 Pi CLI（面向开发者）。",
      "如需要，在 bridge-config.json 中添加 Pi（端口 8022）。",
    ],
    runSteps: [
      "未安装 Pi 时测试 — 在 EnvoyMesh 目录打开终端并运行：",
      { code: "PI_ECHO=1 node tools/ext-agent-adapters/pi/server.mjs" },
      { code: '$env:PI_ECHO="1"; node tools/ext-agent-adapters/pi/server.mjs' },
      "已安装 Pi：运行 node tools/ext-agent-adapters/pi/server.mjs（不设 PI_ECHO）并保持窗口打开。",
      "在 设置 → AI → AI 引擎 中选择 Pi（编程）为当前后端。",
    ],
    verifySteps: [
      "Pi 行显示「运行中」。",
      "回声模式回复 [Pi echo] …",
    ],
    troubleshooting: [
      "未安装 Pi 时可用 PI_ECHO=1 测试，或改用 HomeClaw/Hermes。",
    ],
  },
];
