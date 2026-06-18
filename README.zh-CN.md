<p align="center">
  <img src="logo_with_text.png" alt="EnvoyMesh" width="520" />
</p>

# EnvoyMesh

**去中心化、点对点的自主 AI 代理网络。**

EnvoyMesh 是一个您和您的 AI 代理真正拥有的私有社交网络。与大多数运行在他人服务器上的社交应用和 AI 助手不同，EnvoyMesh 颠覆了这一模式：

- **您的设备运行网络** — 无中央服务器，无账号可丢失
- **您的身份是加密的** — Ed25519 密钥由您掌控，自主主权 DIDs
- **您的 AI 代理为您工作** — 运行在您的硬件上，遵循您的策略
- **安全设计为先** — 签名消息，基于策略的信任层级，端到端可审计

在您的电脑和手机上安装 **Envoy**，直接与朋友聊天，并让您的 AI 代理代表您协商任务 — 全程无需任何平台介入。

---

## 您可以用 EnvoyMesh 做什么？

### 核心通讯
- **直接与朋友聊天** — 点对点消息传递，签名信封，无平台，无广告
- **群聊** — 创建和管理与绑定联系人的聊天室
- **文件共享** — 安全的、基于策略的 P2P 文件传输，支持内容寻址
- **基于信任的关系** — 定义信任层级（阻止、公开、推荐、直接），控制每个联系人的访问权限

### AI 驱动功能
- **个人 AI 助手** — 在您的硬件上运行 AI，访问您的保险箱，遵循您的规则
- **代理间协作** — 让您的 AI 与朋友的 AI 协商任务（如日程协调）
- **绑定自主权** — 授予您的代理在安全规则内交友的权限（推荐验证、每日限额）
- **全网发现** — 在整个网络中搜索文档、能力和节点
- **联邦 RAG** — 将知识查询分发到绑定节点的库中并综合答案
- **代理市场** — 寻找能力提供者，协商任务，建立信誉评分
- **多代理任务链** — 将复杂任务（如"翻译 → 审核 → 总结"）分解到多个代理协作完成

### 团队与企业入职
- **公司邀请链接** — 发布一键邀请，适合小型团队
- **Fleet Manifest** — 通过签名的 JSON 名册预配置数百台设备
- **LAN 自动绑定** — 办公室网络中共享 fleet token 的节点自动绑定
- **配对服务亭** — 一键 HTTP 服务器，适合办公室访客的 AirDrop 风格入职

### 移动与远程访问
- **完整移动节点** — Capacitor 应用，完全参与 P2P 网络
- **EnvoyGo 轻客户端** — Flutter 应用，用于远程访问家庭节点
- **终端** — 从任何地方远程访问您的家庭节点
- **多设备身份** — 所有设备共享同一 owner ID

---

## 快速开始

```bash
git clone https://github.com/envoymesh/envoymesh.git
cd envoymesh
./scripts/setup.sh

# 运行
npm run node:dev      # 启动 P2P 节点
npm run social:dev    # 打开 http://localhost:5173
```

详细的设置、配置、Docker、移动和打包指南：**[QuickStart.md](QuickStart.md)** · **[packaging.md](packaging.md)**

---

## 工作原理

### 网络架构

您不必理解这些就能使用 EnvoyMesh — 但这里是简短版本：

```
  ┌────────────┐                ┌────────────┐                ┌────────────┐
  │  您的 Mac  │   签名消息     │   中继节点  │   签名消息     │ 朋友的     │
  │  (Envoy)   │ ─────────────▶ │ (帮助双方   │ ─────────────▶ │ Mac        │
  │            │                │   相互发现) │                │ (Envoy)    │
  │            │                │            │                │            │
  └────────────┘                └────────────┘                └────────────┘
       ▲                                                       │
       │                                                       │
   签名回复                           签名回复                  │
   ◀────────────────────────────────────────────────────────────┘

   - 中继节点从不读取您的消息，仅帮助双方相互发现
   - 朋友的 Mac 验证签名，检查是否信任您，然后传递消息
   - 如果中继节点离线，两台 Mac 仍然可以直接通信
```

### 安全管道

每条消息在传递前都要经过四个检查：

```
   网络  ──▶  1. 消息真的来自您吗？        (用您的密钥签名)
                 │
                 ▼
            2. 我信任您吗？                (您的信任列表 — 公开/推荐/直接)
                 │
                 ▼
            3. 这条消息被允许吗？          (策略引擎 — 发送者能做什么？)
                 │
                 ▼
            4. 这条消息见过吗？            (无重放，无重复)
                 │
                 ▼
              已送达
```

### 代理桥接（HomeClaw、OpenClaw、自定义）

您的 AI 代理不会直接讲 P2P 语言 — 那样太危险了。相反，EnvoyMesh 在您的电脑上运行一个安全的桥接器，在网络和代理之间进行翻译：

```
                    ┌──────────────────────────────────────────────────┐
                    │              您的电脑（家庭节点）                    │
                    │                                                  │
   chat.message     │   ┌──────────────────┐    HTTP POST    ┌──────┐  │
   ───────────────▶ │   │   EnvoyMesh 节点 │ ──────────────▶ │代理  │  │
   (签名)           │   │                  │  { from,        │      │  │
                    │   │  • 签名          │    fromOwnerId, │Home- │  │
                    │   │  • 策略检查       │    fromName,    │Claw  │  │
                    │   │  • 速率限制       │    text }       │ 或   │  │
                    │   │                  │                 │Open- │  │
                    │   │  ┌────────────┐  │  HTTP POST      │Claw  │  │
                    │   │  │  /bridge/  │◀─┼──────────────── │      │  │
                    │   │  │   send     │  │  { to, text }   │      │  │
                    │   │  └────────────┘  │                 └──────┘  │
                    │   └──────────────────┘                            │
                    │         │                                        │
                    │         │  签名的 chat.message                    │
                    │         ▼                                        │
                    └─────────┼────────────────────────────────────────┘
                              │
                              ▼
                         网络节点
```

**代理永远不会持有您的身份密钥。** EnvoyMesh 对所有内容签名，应用您的策略，代理只需回答普通 HTTP 请求。

---

## 团队入职

EnvoyMesh 提供四种团队上线路径，从简单的邀请链接到企业级清单：

| 路径 | 描述 | 最佳适用 |
|------|------|----------|
| **公司邀请** | 发布可分享链接；加入者在其 UI 中粘贴 | 小型团队 (1–20) |
| **Fleet Manifest** | 导入签名的 JSON 名册；预配置信任记录 | 中大型团队 (20+) |
| **LAN 自动绑定** | 局域网内共享 fleet token 的节点自动绑定 | 办公室网络 |
| **配对服务亭** | 一键 HTTP 服务器，按需生成邀请 | 办公室访客 |

所有路径均为可选、可审计且由所有者控制。详见 [`docs/fleet-onboarding.md`](docs/fleet-onboarding.md)。

---

## 代理网络协作

EnvoyMesh 支持多代理任务链，您的代理可以分解复杂工作并在节点间协调：

```
用户请求："翻译这份文档，然后让别人审核"
       │
       ▼
协调代理分解为子任务：
       ├─ 翻译（工作者 A）
       └─ 审核（工作者 B）
       │
       ▼
多轮协商：
       ├─ 工作者竞标子任务
       ├─ 交换反提案（最多 3 轮）
       ├─ 协调代理根据成本、信誉、ETA 授予任务
       │
       ▼
部分结果回流，合并成复合交付物
       │
       ▼
最终链报告，包含引用、审计轨迹和成本明细
```

**主要特性：**
- **任务树** — 复杂工作流的显式父子关系
- **多轮协商** — 反提案、拆分、合并
- **预算执行** — 硬成本上限，支持每子任务追踪
- **深度限制** — 可配置最多 3 层深度
- **端到端可观测性** — 审计事件追踪每个链动作

完整设计详见 [`docs/agent_network.md`](docs/agent_network.md)。

---

## 移动选项

EnvoyMesh 提供两种移动体验：

### 完整节点（Capacitor）
Capacitor 应用是运行在您手机中的**完整 EnvoyMesh 节点**：
- 完整参与 P2P 网络
- 拥有独立的签名密钥和设备身份
- 与桌面共享相同的 owner ID、联系人和聊天记录
- 在 WebView 中运行社交 UI
- SQLite + 文件系统存储

### EnvoyGo（Flutter 轻客户端）
轻量级 Flutter 应用，作为您家庭节点的**远程客户端**：
- 通过 WebSocket 或 libp2p 电路中继连接
- 三个标签页：聊天、联系人、我的
- 远程终端访问家庭节点
- 自动重连，多传输方式回退
- 安全会话令牌存储（iOS Keychain / Android EncryptedSharedPreferences）

**配对：** 扫描桌面社交 UI 的二维码 → 即时连接。详见 [`docs/flutter-thin-client-design.md`](docs/flutter-thin-client-design.md)。

---

## 项目结构

```
EnvoyMesh/
├── apps/
│   ├── cli/         # 命令行工具
│   ├── node/        # 本地 Envoy 运行时（CLI、网络、WebSocket API）
│   ├── tauri/       # 原生桌面窗口（社交应用 + 节点）
│   ├── social/      # 社交/聊天 UI（Vite + React）
│   ├── mobile/      # Capacitor iOS/Android（完整节点）
│   └── envoygo/     # Flutter 轻客户端（远程访问）
├── packages/        # 构建模块：协议、身份、绑定、网络、保险箱、模型...
├── docs/            # 设计文档、安全模型、实施计划
├── OpenClawExtension/  # OpenClaw 集成
├── QuickStart.md    # 分步指南
└── AGENTS.md        # 架构参考
```

---

## 当前状态

**最新发布：Phase 36 — Agent Network 标签页整合 + Phase 35 审查修复**

主要已发布里程碑包括：

- **Phase 11** — 移动社交应用 & 移动节点（Capacitor）
- **Phase 12** — 信任模式 & 双边社交调解
- **Phase 16** — EnvoyAI 常设委托 & 自主姿态
- **Phase 18** — 原生所有者代理（助手 = 代理）
- **Phase 20** — 全网文档发现
- **Phase 21** — 全网能力发现
- **Phase 22** — 联邦 RAG
- **Phase 24** — 代理市场
- **Phase 30** — 终端（聊天集成的 shell）
- **Phase 31** — Flutter 轻客户端（EnvoyGo）
- **Phase 35** — 团队入职（公司邀请、LAN 自动绑定、配对服务亭、Fleet Manifest）
- **Phase 36** — Agent Network 标签页整合

完整路线图详见 [`docs/implementation-plan.md`](docs/implementation-plan.md)。

---

## 更多阅读

- **入门：** [**`QuickStart.md`**](QuickStart.md) — 安装、运行、移动、多机、桥接
- **核心概念：** [架构参考](AGENTS.md) · [高级设计](docs/high-level-design.md) · [安全模型](docs/security.md)
- **新功能：** [团队入职](docs/fleet-onboarding.md) · [代理网络](docs/agent_network.md) · [EnvoyGo 设计](docs/flutter-thin-client-design.md)
- **开发者：** [协议参考](docs/protocol-standard.md) · [路线图](docs/implementation-plan.md)
- **代理开发者：** [桥接指南](docs/agent_bridge_guide.md) · [OpenClaw 设置](docs/openclaw-extension.md)

---

## 许可证

MIT