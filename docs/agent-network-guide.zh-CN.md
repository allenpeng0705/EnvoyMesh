# EnvoyMesh Agent Network 完整指南

**状态：** 已发布（Phase 40–47）
**受众：** 运维人员、开发者、希望理解 Agent Network 工作原理的用户
**相关文档：** [Agent Network 设计文档](./agent_network.md) · [Fleet 部署指南](./agent-network-fleet.md) · [LAN 测试场景](./agent-network-lan-scenarios.md) · [迭代设计](./agent-network-iteration.md)

---

## 目录

1. [什么是 Agent Network？](#1-什么是-agent-network)
2. [三层架构](#2-三层架构)
3. [核心规则：谁能参与 Team Job？](#3-核心规则谁能参与-team-job)
4. [配置步骤](#4-配置步骤)
5. [Worker 评分机制](#5-worker-评分机制)
6. [Team Job 工作流程](#6-team-job-工作流程)
7. [Fleet 局域网部署](#7-fleet-局域网部署)
8. [声明式 fleet.yaml 部署](#8-声明式-fleetyaml-部署)
9. [AI 引擎配置（EnvoyAI vs Ext Agent）](#9-ai-引擎配置envoyai-vs-ext-agent)
10. [常见问题排查](#10-常见问题排查)
11. [安全模型](#11-安全模型)

---

## 1. 什么是 Agent Network？

Agent Network 是 EnvoyMesh 让**已建联（bonded）的人**的本地 AI 代理协同工作的机制——**无需中央云服务器或账号系统**。

**核心价值：**
- 你的代理运行在**你的**硬件上，使用**你的**模型
- 协作只在**你信任的人**之间进行
- 所有消息都是 Ed25519 签名的，所有操作都有 JSONL 审计日志
- 中继节点（Relay）只负责连通性——不运行 LLM、不读取任务内容

**不是什么：**
- 不是公共市场——陌生人无法招募你的代理
- 不是云服务——没有中央账号
- 不是强制加入——默认私有，需要主动选择加入

---

## 2. 三层架构

Agent Network 分为三层，每层可独立配置：

| 层级 | 功能 | 配置位置 | 说明 |
|------|------|----------|------|
| **A. Bonds（信任关系）** | 人与人之间的加密信任 | 联系人、发现、Fleet 入网 | 信任层级：`direct`（直接）/ `referred`（介绍）/ `public`（公开）/ `blocked`（拉黑） |
| **B. Worker membership（加入网络）** | "我的代理可以被招募参与 Team Job" | **设置 → Agent Network → Join Agent Network** | 单个开关切换"私有代理"↔"可招募 Worker" |
| **C. Team jobs（团队任务）** | 将一个目标拆分给多个代理，汇总成一个报告 | 导航 → **Team jobs** | 代码中叫 `chain`；产品名叫 Team Job |

**UI 名称对照：**

| 产品名称 | 代码名称 | 说明 |
|----------|----------|------|
| Agent Network | — | 设置中的网络成员管理标签页 |
| Join Agent Network | capability-provider | Worker 选择加入的开关 |
| Team jobs | chain / multi-agent chain | 多代理协作任务 |
| Team job defaults | chain defaults | 任务默认参数（分配模式等） |

---

## 3. 核心规则：谁能参与 Team Job？

要回答"Alice 的代理能参与我的 Team Job 吗？"——**以下四个条件必须全部满足：**

1. ✅ 你和 Alice **已建联**（通常是 `direct` 或 `referred` 信任级别）
2. ✅ Alice 开启了 **Join Agent Network**
3. ✅ Alice 的 **Agent Card**（代理名片）已同步到你（建联时自动获取）
4. ✅ 她的名片声明了有用的能力（如 `task.execute`）**以及** `capability-provider` 成员标签

**如果 Alice 没有加入**——即使你们是朋友，她的代理仍然是**私有的**，不会被招募。

### 信任层级与协作权限

| 信任层级 | 协作权限 |
|----------|----------|
| `blocked` | ❌ 禁止一切协作 |
| `public`（陌生人） | ❌ 不作为 Team Job Worker；Agent Card 不会自动获取 |
| `referred`（介绍人） | ✅ 可以参与；编排器链路流量需要 `referred` 或更高级别 |
| `direct`（直接信任） | ✅ 完整 Worker 路径（竞价 / 直接分配） |

### "Join Agent Network" 开启后发生了什么？

1. 节点配置设为 `capabilityProviderEnabled: true`
2. Agent Card 广播 `capability-provider` 能力标签
3. 已建联的节点同步你的名片，并可通过能力索引发现你
4. 你可选的 Agent Network Profile（新鲜度、消费模式、上下文窗口、能力标签）会被分享用于**评分排序**

关闭后：能力标签移除；本地聊天功能不受影响。

---

## 4. 配置步骤

### 步骤 1：建联（Bond）

两台机器之间需要先建立信任关系：

| 方式 | 适用场景 | 操作 |
|------|----------|------|
| **Office LAN** | 同一 Wi-Fi | 设置 → Agent Network → Office LAN → Enable（共享 token） |
| **Company Invite** | 远程 | 分享 `envoy://invite?token=…` 链接 |
| **Fleet Manifest** | 20+ 台有名单 | 签名的成员名单导入 |
| **Pairing Kiosk** | 访客/临时 | 一键铸造邀请 |

### 步骤 2：加入 Agent Network

在**每台**机器上：**设置 → Agent Network → Join Agent Network**（开启）

### 步骤 3：填写 Profile（可选但推荐）

在 **设置 → Agent Network** 下，加入后可填写：

| 字段 | 用途 | 示例 |
|------|------|------|
| **Model freshness（1-10）** | 模型有多新/多强 | `9` |
| **Spend posture** | 消费模式 | `subscription` / `metered` / `unknown` |
| **Context window** | 上下文窗口大小 | `128k` / `256k` / `512k` / `1M+` |
| **Strengths（能力标签）** | 擅长的领域 | `coding`, `research`, `summarization` |

### 步骤 4：配置 Team Job 默认值

在 **设置 → AI → Team job defaults** 中：

- **分配模式**：`Direct assign`（默认，推荐）或 `Competitive bidding`（竞价）
- **迭代轮数**：`iterationMaxRounds = 1`（默认单轮）
- **成本 UI**：默认隐藏

### 步骤 5：发起 Team Job

打开 **Team jobs → New team job**，输入目标，预览，启动。

### 快速检查清单

```text
□ 两台机器已建联（联系人中互相可见）
□ 两台机器都开启了 Join Agent Network
□ 点击了 Refresh workers（Workers 状态显示 ≥1 个已加入的节点）
□ AI 引擎已配置（内置 OpenClaw 或外部 Agent）
□ Team Job 默认值设为 Direct assign
```

---

## 5. Worker 评分机制

当发起 Team Job 时，系统按**加权评分**选择最合适的 Worker。

### 评分权重

| 维度 | 权重 | 映射 |
|------|------|------|
| **能力匹配** | **0.30** | 精确匹配→1.0；能力标签→0.7；有 `task.execute`→0.45；其他→0.2 |
| **上下文窗口** | **0.20** | 128k→0.25, 256k→0.5, 512k→0.75, 1M+→1.0 |
| **新鲜度** | **0.15** | `(modelFreshness - 1) / 9`，范围 0–1 |
| **吞吐量** | **0.15** | tokens/sec，软上限约 200 tok/s；未定义→0.35 |
| **消费模式** | **0.10** | subscription→1.0, metered→0.55, unknown→0.35 |
| **同局域网** | **0.10** | 同 LAN→1.0, 否则→0.35 |

**分配规则：**
- 硬性前提：已加入 + 有执行能力（上游强制）
- 这些是**软性排序信号**——只影响选择顺序
- `assignWorkersToSteps` 保证有 Worker 可用时不会让任何步骤悬空
- 唯一 Worker 获得所有步骤；否则按分数最高分配

### 示例

目标包含 `coding` 步骤：
- Bob：strengths=`coding`，freshness=9，context=1M+ → 高分
- Carol：strengths=`summarization`，freshness=7，context=512k → 较低分
- 结果：coding 步骤分配给 **Bob**

---

## 6. Team Job 工作流程

### 基本流程

```
你输入目标（"研究X，然后总结"）
        ↓
你的 Home Node 代理【规划】子任务
        ↓
子任务分配给已建联 + 已加入的 Workers
        ↓
Workers 在【各自的】节点上运行
（他们的模型、保险库、策略）
        ↓
结果返回 → 你的 Orchestrator【合并】成一个报告
        ↓
你在 Team jobs 面板查看报告
```

### 分配模式

| 模式 | 行为 | 适用场景 | 成本 UI |
|------|------|----------|--------|
| **Direct assign**（默认） | 直接选最佳 Worker，立即分配 | 个人/小团队 | 默认隐藏 |
| **Competitive bidding** | 收集竞价，排序后分配 | 需要成本控制 | 可选显示 |

### 多轮迭代（Phase 47）

| 设置 | 行为 |
|------|------|
| `maxRounds=1`（默认） | 单轮——与之前完全一致（回归测试验证） |
| `maxRounds=2` | 草稿1 → 判断（继续/停止/问用户）→ 草稿2 → 最终发布 |

**关键规则：**
- 草稿**永不直接发布**——只有最终接受才发布一个报告
- `maxRounds=1` 的行为与单次任务**位级一致**（有回归测试）
- 判断模式：`always_stop`（总是停）、`llm`（AI 判断）、`owner`（用户决定）

### Plan + Assign 模式

Assigner（分配者）LLM 流程：
1. 构建名单感知的提示词（提示词硬规则：每个步骤必须有 `assignedPeerId`，不发明 ID）
2. 解析 JSON 响应为步骤列表
3. 通过评分 API 分配 Worker
4. 构建子任务（含 DFS 环检查）
5. 第 2+ 轮时携带上一轮草稿作为上下文

---

## 7. Fleet 局域网部署

### 场景：办公室多台电脑，同一 Wi-Fi

**这是最简单的部署路径——推荐。**

#### 操作步骤

1. **每台机器**打开 **设置 → Agent Network → Office LAN → Enable office LAN team**

   这一键操作同时：
   - ✅ 开启 **Join Agent Network**
   - ✅ 开启 **LAN Auto-Bond**（同 Wi-Fi 自动建联）
   - ✅ 生成/输入一个 **共享 fleet token**（最少 8 字符）
   - ✅ 提供 **Copy token** 按钮

2. **共享同一个 token**：在每台机器上粘贴相同的 token

3. 同一 Wi-Fi 下的节点会**自动以 `direct` 信任级别静默建联**

4. 点击 **Refresh workers** 确认 Worker 列表显示所有已加入的节点

#### ⚠️ 重要提醒

> **建联不等于可招募！** 单纯建联只让对方出现在联系人里；必须同时开启 **Join Agent Network** 才能成为可用的 Worker。LAN 建联 + 未加入 = 信任但不可招募。

### 路径选择

| 场景 | 推荐路径 | 信任建立方式 |
|------|----------|-------------|
| 1-5 台远程机器 | Company Invite | 一次性令牌 |
| 5-20 台大部分远程 | Company Invite + Bond Autonomy | 令牌 + 自动接受 |
| **全部在办公室 Wi-Fi** | **LAN Auto-Bond（推荐）** | 共享 token + mDNS |
| 20+ 台有名单 | Fleet Manifest | 运维签名的名单 |
| 访客/临时人员 | Pairing Kiosk | Kiosk 铸造邀请 |

### Bond Autonomy（自动接受）

Sponsor（发起者）节点可以配置自动接受 Hello 请求：
- **Sponsor proof token** — 自动接受携带匹配 `proofOfContext` 的 hello
- **每日上限** — `maxAutoBondsPerDay` 限制每日自动接受数量
- **安装器节点** — `setupSponsorFriendProofOfContext` 携带 token 发送 hello

**两个值必须完全一致**，否则自动 hello 被拒绝。

---

## 8. 声明式 fleet.yaml 部署

对于批量、可重复的部署，使用 YAML 配置文件 + 命令行工具。

### fleet.yaml 示例

```yaml
version: "0.1"
fleetId: acme-office

shared:
  membership:
    capabilityProviderEnabled: true    # 所有节点开启 Join
  lanAutoBond:
    enabled: true
    tokenRef: LAN_FLEET_TOKEN          # 从环境变量读取 token
  bondAutonomy:
    enabled: true
    sponsorProofTokenRef: SPONSOR_TOKEN
    maxAutoBondsPerDay: 50

nodes:
  - id: home
    role: sponsor                      # 发起者（只能有一个）
    rpc:
      wsUrl: "ws://127.0.0.1:3030/ws"

  - id: desk-alice
    role: member
    rpc:
      wsUrl: "ws://192.168.1.21:3030/ws"
    join:
      method: lan                      # 同 Wi-Fi + token
      trustLevel: direct

  - id: desk-bob
    role: member
    rpc:
      wsUrl: "ws://192.168.1.22:3030/ws"
    join:
      method: manifest                 # 签名名单导入
      trustLevel: direct
      manifestRole: member

  - id: remote-carol
    role: member
    rpc:
      wsUrl: "ws://127.0.0.1:5030/ws"
    join:
      method: invite                   # 邀请链接
      trustLevel: direct

apply:
  dryRun: false
  ensureOnlineTimeoutSec: 30
```

### 执行

```bash
# 复制示例文件
cp fleet.example.yaml fleet.yaml
# 编辑 wsUrls / identities

# 设置密钥（不要提交到代码库）
export LAN_FLEET_TOKEN="$(openssl rand -hex 16)"
export SPONSOR_TOKEN="$(openssl rand -hex 16)"   # 仅使用 bondAutonomy 时需要

# 先 dry-run 预览（不执行实际 RPC）
npm run fleet:apply -- --file fleet.yaml --dry-run

# 正式执行
npm run fleet:apply -- --file fleet.yaml
```

### 加入方式说明

| method | fleet-apply 做什么 |
|--------|-------------------|
| `lan` | 在节点上设置 `lanAutoBond*` 配置；依赖 mDNS + token 匹配自动建联 |
| `manifest` | Sponsor 调用 `createFleetManifest`；每个成员（含 Sponsor）调用 `importFleetManifest` |
| `invite` | Sponsor 调用 `createCompanyInvite`；成员调用 `redeemCompanyInvite`；URI 写入 JSON 文件 |
| `none` | 只打配置补丁 |

### 7 步执行流程

```
ensureOnline → patchNodeConfig → createOrImportManifest → mintInvites → redeemInvites → refreshAgentNetworkWorkers → verifyRoster
```

| 步骤 | 作用 |
|------|------|
| `ensureOnline` | `getProfile` 确认每个节点在线（超时 30 秒） |
| `patchNodeConfig` | 应用 Join / LAN / 自治 / 引导节点配置 |
| `createOrImportManifest` | 为 manifest 成员创建/导入签名名单 |
| `mintInvites` | 为 invite 成员铸造邀请 |
| `redeemInvites` | 成员兑换邀请 |
| `refreshAgentNetworkWorkers` | 刷新名片和能力索引 |
| `verifyRoster` | 打印建联 / 名片 / Worker 统计数据 |

可通过 `--steps patchNodeConfig,verifyRoster` 或 YAML 中 `apply.steps` 自定义步骤。

### 前提条件

- 每个列出的节点**已启动**且可通过 `rpc.wsUrl` 访问
- 有且仅有**一个** `role: sponsor` 节点
- 密钥通过环境变量（`tokenRef`）传入，不写在文件中
- `manifest` 方式需要成员身份信息完整，或设 `fetchIfMissing: true`（默认）

### 不做什么

- ❌ 不会跳过建联——信任仍然来自 manifest / invite / LAN
- ❌ 不会启动节点进程
- ❌ Sponsor 必须有 owner 私钥可用（用于签名 manifest）

---

## 9. AI 引擎配置（EnvoyAI vs Ext Agent）

> 注意：这是**单台机器上**的 AI 引擎选择（设置 → AI → AI Engine），**不是** Agent Network 的 Worker 加入。

### 两种 AI 引擎

| 引擎 | 运行位置 | 配置 |
|------|----------|------|
| **内置 OpenClaw（EnvoyAI）** | 进程内子进程；webhook `http://127.0.0.1:18789/webhook/envoymesh` | 默认开启（`openclawEnabled: true`） |
| **外部 Agent（Ext Agent）** | 独立进程，沙箱监听端口 3031 | 可选（`bridgeEnabled: false` 默认） |

### 模式组合

| openclawEnabled | bridgeEnabled | 模式 | 芯片标签 |
|-----------------|---------------|------|----------|
| true | true | `both` | 内置 + 外部 |
| true | false | `openclaw-only` | 仅内置 |
| false | true | `ext-only` | 仅外部 |
| false | false | `off` | 无 |

### 运行时行为

- 门控在**启动时**运行一次（`startOpenClaw()`）
- `_isOpenClawEnabled()` 每次调用都从 `node-config.json` 读取——**无内存缓存**
- 一旦网关子进程启动，运行状态不会改变直到**重启节点**
- **无运行时热切换 UI**——编辑 `node-config.json` 后重启

### 设置位置

**设置 → AI → AI Engine**：
- **内置 OpenClaw 块**：只读——显示 `enabled` 标志 + 运行状态（3 态徽章）+ webhook URL + PID
- **外部 Agent 块**：可写——`enabled` 复选框 + 编辑表单
- **派生模式芯片**：从持久化标志计算

---

## 10. 常见问题排查

| 症状 | 可能原因 | 解决方案 |
|------|----------|----------|
| 联系人里看不到对方 | 没建联 / token 不一致 / 不在同一 Wi-Fi | 确认 Office LAN token 一致；检查 mDNS 可达性 |
| 有联系人但没有 Worker | 对方没开 Join | 请对方开启 **Join Agent Network** |
| Team Job 提示无 Worker | 有建联但无人加入 | 请对方开启 Join；点 **Refresh workers** |
| 分配给了错误的 Worker | Profile 与预期不符 | 确认 Profile 填写正确；点 **Refresh workers** |
| 草稿后卡住不动 | 需要用户判断（Accept/Continue） | 在 Team Job 详情中点击 Accept 或 Continue |
| Auto-hello 被拒绝 | Sponsor token 不匹配 | 确认两端 token 字符串**完全一致** |
| 邀请链接无效 | URI 格式错误或已过期 | 重新铸造；确保格式 `envoy://invite?token=…` |
| LAN Auto-Bond 无反应 | token 不一致或不在同一 LAN | 验证 token 一致；检查 mDNS 可达性 |
| 远程 Assigner 未收到 handoff | Alice↔Carol mesh 不通 / Assigner peer id 错误 | 检查 mesh 连接性；确认 Assigner peer id |

### 分层诊断

```
没有联系人？        → 建联 / Office LAN token / Wi-Fi 层
有联系人但没 Worker？ → Join / Agent Card 同步层
Worker 分配错误？    → Profile / Refresh 层
分配后卡住？         → Worker 离线 / 防火墙层
草稿后卡住？         → Owner 判断层（点 Accept/Continue）
Handoff 未到达？     → Mesh 连接 / Assigner peer id 层
```

---

## 11. 安全模型

- **无中央账号服务器** — 身份基于 Ed25519 密钥 → DID
- **Bond Engine** 按信任层级门控每个意图
- **选择加入** — 默认私有，必须主动开启 Join
- **签名信封** — Worker 和 Orchestrator 都验证对端
- **Mandate / 预算** — Team Job 携带 owner 授权的范围
- **JSONL 审计** — 协作过程在你的节点上可检查
- **中继保持简单** — 只负责连通性；不运行 LLM，不读取任务内容
- Owner 密钥是所有 Fleet 路径的权威来源
- Token（邀请、fleet、kiosk 管理）是 bearer 密钥——通过带外渠道分发，撤销被泄露的

### Agent Network Profile 的信任模型

Profile 中的能力标签、新鲜度等是**自声明**的。对端信任它们因为来自已建联的 owner——不是来自中央评级机构。这是一个有意识的设计选择：保持去中心化，同时提供合理的排序信号。

---

## 相关文档

| 文档 | 内容 |
|------|------|
| [agent_network.md](./agent_network.md) | Agent Network 完整设计文档（Phase 40–47） |
| [agent-network-iteration.md](./agent-network-iteration.md) | 多轮迭代设计（Phase 47） |
| [agent-network-plan-assign.md](./agent-network-plan-assign.md) | Plan + Assign 实现说明 |
| [agent-network-fleet.md](./agent-network-fleet.md) | Fleet 部署指南（presets、systemd、验证） |
| [fleet-bootstrap.md](./fleet-bootstrap.md) | 声明式 fleet.yaml 文档 |
| [agent-network-lan-scenarios.md](./agent-network-lan-scenarios.md) | LAN 测试场景手册（9 个场景） |
| [agent-network-config.md](./agent-network-config.md) | AI 引擎配置（EnvoyAI vs Ext Agent） |
| [implementation-plan.md](./implementation-plan.md) | 实施计划（Phase 40–47） |
