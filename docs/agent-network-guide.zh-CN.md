# Agent Network — 运维指南

> **英文版：** [`agent-network-guide.md`](./agent-network-guide.md)  
> **受众：** 使用 EnvoyMesh、想了解 **Agent Network**（代理网络）含义、如何加入以及 **Team jobs**（团队任务）如何运作的任何人。  
> **状态：** 当前产品行为（截至 2026-07）。线协议与实现细节见文末链接的设计文档。

---

## 1. 「Agent Network」指什么

**Agent Network** 是 EnvoyMesh 让**已建联（bonded）的人**各自在本地的 AI 代理协同工作的方式——**无需中央云或账号服务器**。

人们常把下面三层混在一起：

| 层级 | 是什么 | 在哪里配置 |
|------|--------|------------|
| **A. Bonds（信任关系）** | 所有者之间的加密信任（`direct` / `referred` / `public` / `blocked`） | 联系人、发现、Fleet 入网 |
| **B. Worker 成员资格（主动加入）** | 「我的代理可被招募参与 Team jobs」 | **设置 → Agent Network → Join Agent Network** |
| **C. Team jobs（协作任务）** | 把目标拆给多个代理，汇总成一份报告 | 导航 → **Team jobs** |

**重要：** Agent Network **不是**公共市场。网格上的陌生人无法招募你的代理。协作只发生在**已建联**的人之间，且对方必须**主动加入**。

无论是否加入，本地代理始终为你服务。加入只影响**已建联的对等节点**能否在 Team jobs 中向你的代理求助。

---

## 2. 界面里会看到的名称

| 界面标签 | 旧名 / 代码名 | 含义 |
|----------|---------------|------|
| **Agent Network**（设置页签） | 曾短暂叫「Devices & Fleet」 | 成员资格 + Fleet 入网 |
| **Join Agent Network** | Capability Provider（能力提供者） | 主动加入，以便对等节点招募你的代理 |
| **Team jobs** | 「Chains」/ 多代理链 | 面向所有者的协作视图 |
| **Team job defaults**（团队任务默认值） | Chain Defaults | 分配模式、竞价、停滞策略（在 **设置 → AI** 下） |
| **AI Engine**（AI 引擎） | 曾被误标为「Agent Network」 | *本机* Home Node 上跑哪种 AI（EnvoyAI / Ext Agent）——**与**加入 Agent Network **不是一回事** |

协议与源码仍使用 `task.chain.*`、`ChainsView`、`capability-provider` 等名称；工程师看代码没问题，Social 界面则用上表标签。

---

## 3. 成员资格模型（核心规则）

### 3.1 两个不同的问题

**「我加入 Agent Network 了吗？」**  
→ 是你**本节点**上的一项设置。开启时**不需要**已有建联。

**「Alice 的代理能参与我的 Team job 吗？」**  
→ 仅当**以下全部**成立：

1. 你与 Alice **已建联**（通常为 `direct` 或 `referred` 信任）。
2. Alice 在其节点上开启了 **Join Agent Network**。
3. 她的 **agent card**（代理名片）已到达你这边（符合信任层级时建联后自动拉取）。
4. 她的名片声明了有用能力（如 `task.execute` 或子任务所需能力）**以及**成员标签 `capability-provider`（能力提供者）。

若 Alice 从未加入，她的代理保持**私有**。即使你们是朋友，也不会把她当作 Worker。

### 3.2 信任层级（谁能协作）

| 信任 | 典型含义 | Agent Network / Team jobs |
|------|----------|---------------------------|
| **blocked** | 明确拒绝 | 不能协作 |
| **public** | 陌生人 / 未建为朋友 | 不作为 Team jobs Worker；不自动拉取 agent card |
| **referred** | 经介绍 / 有限信任 | 可在策略下参与；编排器侧链流量需 referred 或更高 |
| **direct** | 朋友 / Fleet 对等节点 | 完整 Worker 路径（竞价 / 直接分配） |

具体门控由 Bond Engine 与链入站处理器执行。产品层面的实用规则：**Team jobs = 已建联 + 已加入的对等节点。**

### 3.3 「Join Agent Network」在线上做了什么

开启 **Join Agent Network** 时：

1. 节点配置设为 `capabilityProviderEnabled: true`。
2. 你的 agent card（及相关广播）包含 `capability-provider` 能力。
3. 同步你名片的已建联对等节点可通过能力索引发现你。
4. 可选的 **Agent Network profile**（新鲜度、消费姿态、上下文窗口、特长）会被分享，并在他人发起 Team job 时用于**评分**。

关闭后，成员能力从名片中移除；对等节点不再把你当作可招募 Worker。与本机 AI 聊天不受影响。

---

## 4. Agent Network profile（评分）

在 **设置 → Agent Network** 中，加入后可填写**由所有者自证**的 profile：

| 字段 | 用途 |
|------|------|
| **Model freshness**（模型新鲜度，1–10） | 你所跑模型的新旧 / 能力感受 |
| **Spend posture**（消费姿态） | `subscription` / `metered` / `unknown` — 长任务更偏好 subscription |
| **Context window**（上下文窗口） | `128k` / `256k` / `512k` / `1M+` |
| **Strengths**（特长） | 如 research、coding、summarization 等标签 |

编排器寻找 Worker 时，EnvoyMesh 大致按以下优先级评分：

**能力匹配 ≫ 上下文窗口 ≫ 新鲜度 ≫ 消费姿态**

直接分配模式选得分最高的可用 Worker（无竞价界面）。竞争模式仍用竞价 / 成本，评分作辅助信号。

这些属性均为**自声明**。对等节点信任它们，是因为来自**已建联的所有者**——而非中央评级机构。

---

## 5. Team jobs（协作如何运作）

### 5.1 Team job 是什么

**Team job** 是你发起的多代理工作流：

1. 你陈述目标（如「研究 X，然后总结」）。
2. Home Node 上的代理**规划**子任务。
3. 子任务提供给**已建联且已加入**的 Worker。
4. Worker 在*各自*节点上本地运行（各自的模型、保险库、策略）。
5. 结果返回；你的编排器**合并**为一份报告。

在 **Team jobs** 导航项中查看进度（进行中列表 + 报告）。

### 5.2 点击「New team job」之前

你需要**至少一名**已建联联系人，且该联系人：

- 已开启 **Join Agent Network**，且  
- 对你可见的 agent card 是最新的。

单节点**无法**独自完成多代理 Team job。界面会阻止启动并说明原因（`no_workers` / 「Waiting for workers」）。

### 5.3 分配模式（设置 → AI → Team job defaults）

| 模式 | 行为 | 成本 / 竞价界面 |
|------|------|-----------------|
| **Direct assign**（直接分配，默认） | 选首个 / 最佳可用 Worker，立即分配 | 默认隐藏 |
| **Competitive bidding**（竞争性竞价） | 收集竞价、排序、分配 | 可选显示成本界面 |

个人 / 小团队多数情况应使用 **direct assign**。

### 5.4 端到端示意

```
你（所有者）              你的 Home Node                 已建联对等节点（已加入）
─────────────            ──────────────                 ─────────────────────
输入目标 ──►  规划子任务
             寻找 Worker（已建联 + capability-provider）
             直接分配或竞价  ───────────────►  代理执行子任务
             ◄────────────── 部分结果 / 最终结果
             合成报告
Team jobs 界面 ◄── 已发布报告
```

若使用 Relay，仅协助**连通**；不在 Relay 路径上运行 LLM，也不作为可信「大脑」读取 Team job 载荷。

---

## 6. 设置项地图

### 设置 → Agent Network

网络成员资格与扩大已建联 Fleet 的主要入口：

1. **Office LAN** — 同一 Wi-Fi 的快捷路径：Join + LAN Auto-Bond + 共享 token  
2. **Workers status** — 已建联 / 已 Join / 可见 Worker + **Refresh workers**  
3. **Join Agent Network** — Worker 主动加入 + profile 编辑  
4. **Bond Autonomy / Setup Sponsor Friend** — 安装器自动 hello 配对  
5. **Company Invites** — 可分享的 `envoy://invite?…` 链接  
6. **LAN Auto-Bond** — 同一 Wi-Fi + 共享 token（默认关；进阶用户）  
7. **Pairing Kiosk** — 一键铸造邀请（默认关）  
8. **Fleet Manifest** — 较大团队导入签名名单  

Fleet 路径建立的是 **bonds**。Bond 是基础；成员主动加入才让这些 bond 可用于 Team jobs。仅 LAN 建联而未 Join 时，对等节点受信任但不可招募——界面会给出温和提示。拨号提示显示直连私有 LAN 路径时，Assigner 会给该 Worker 更高软分（`sameLan`）。

运维手册：[`agent-network-fleet.md`](./agent-network-fleet.md)  
线级入网：[`fleet-onboarding.md`](./fleet-onboarding.md)  
无头配置 + 脚本：[`fleet-bootstrap.md`](./fleet-bootstrap.md)（`npm run fleet:apply`）

### 设置 → AI

- **AI Engine** — *本机* EnvoyAI 与 Ext Agent 的选择  
- **Team job defaults** — 直接分配 vs 竞争、停滞 / 再平衡策略  
- 以及 social proxy、文档采集等姿态  

AI Engine 是**本地引擎选择**，**不是**「Join Agent Network」。

引擎详解：[`agent-network-config.md`](./agent-network-config.md)（历史 Phase 32 标题；内容为 AI Engine 配置）。

### 导航 → Team jobs

- 进行中的任务、报告、取消 / 管理  
- 移动端（**EnvoyGo**，产品 thin client）以**只读**方式镜像 Home Node 上最近 / 进行中的任务  

协议设计：[`agent_network.md`](./agent_network.md)

---

## 7. 常见问题

### 只有已建联联系人才能在 Agent Network 里吗？

- **主动加入：** 任何人都可以在自己的节点上开启 Join Agent Network。  
- **协作：** 是的——只有**已建联**（符合信任层级）且**已加入**的联系人才会作为 Team jobs 的 Worker 出现。  
- Fleet 入网是为了**安全地建立**这些 bond——不是为了开放匿名 Worker 池。

### 加入后我的代理就公开了吗？

不会。加入后仅向**已经信任你的对等节点**通过 bond 同步的 agent card 广播「可被招募」；不会公开你的保险库，也不会让陌生人成为你的 Worker。

### 双方都要加入吗？

要在**两人之间**跑 Team job：你招募的 **Worker** 必须已加入。你的节点作编排器；Worker 需要 `capability-provider`。若无人加入，会出现「no workers」。

### 手机怎么办？

**EnvoyGo** 是产品移动端 thin client：配对 Home Node 后，可**只读**查看 Home 上发布的 Team job 报告。Fleet 邀请 / 名单等管理界面面向**桌面 Social**。

历史上 Phase 11 的 Capacitor 全节点实验（`apps/mobile/`）为**备份 / 旧路径**，不是当前产品移动端；新功能以 EnvoyGo 为准。

### 为什么把 Chains / Devices & Fleet 改名了？

「Chains」容易联想到区块链。「Devices & Fleet」像 MDM，又掩盖了成员资格含义。界面现称 **Team jobs** 与 **Agent Network**；代码里仍可能写 `chain`。

---

## 8. 安全概要

- **无中央账号服务器** — 身份为 Ed25519 / DID。  
- **Bond Engine** 按信任层级门控 intent。  
- **主动加入成员资格** — 默认私有。  
- **签名信封** — Worker 与编排器验证对等节点。  
- **Mandate / 预算** — Team jobs 携带所有者授权边界。  
- **Audit JSONL** — 协作可在本节点审计。  
- **Relay 保持「哑」** — 仅连通；Relay 路径上不跑 LLM。

---

## 9. 相关文档

| 文档 | 作用 |
|------|------|
| [agent-network-fleet.md](./agent-network-fleet.md) | 按日 Fleet 上线运维手册 |
| [agent-network-lan-scenarios.md](./agent-network-lan-scenarios.md) | **同一 LAN 三台机器** — 由简到繁的真实测试场景 |
| [fleet-onboarding.md](./fleet-onboarding.md) | Fleet 路径 schema 与威胁模型 |
| [agent_network.md](./agent_network.md) | Team jobs / chain 协议与运行时设计 |
| [agent-network-config.md](./agent-network-config.md) | AI Engine（EnvoyAI / Ext Agent）配置 — Phase 32 |
| [implementation-plan.md](./implementation-plan.md) | Phase 清单（32、35–36、40–43、47） |
| [agent-network-plan-assign.md](./agent-network-plan-assign.md) | Assigner plan+assign + merge（已交付） |
| [agent-network-iteration.md](./agent-network-iteration.md) | 多轮 Team job 迭代 A ∩ B（Phase 47，已交付） |

---

## 10. 快速上手清单

1. 同一办公室 Wi-Fi：两台机器均使用 **Office LAN → Enable office LAN team**（共享 token）。远程同事：通过邀请 / 名单建联后，各节点开启 **Join Agent Network**。  
2. 可选填写 **profile**（特长、新鲜度、上下文）。  
3. **Team job defaults** 保持 **direct assign**，除非需要竞价。  
4. 打开 **Team jobs → New team job**，输入目标，预览，启动。  
5. 合成完成后打开报告。  
6. 若 Worker 列表为空，在 Agent Network 页签点击 **Refresh workers**。

**同一 LAN 三台机器？** 见 [`agent-network-lan-scenarios.md`](./agent-network-lan-scenarios.md) 中的场景阶梯（建联 → 单次 Team job → 扇出 → 迭代 → 远程 Assigner → 停滞）。

---

## 相关：plan + assign 设计

详见 [`agent-network-plan-assign.md`](./agent-network-plan-assign.md)：Assigner LLM 的 plan+assign 流程、软能力匹配、吞吐量评分、merge 作为最终结果、远程 `assignerPeerId` 交接，以及 MCP roster/probe 工具。

多轮 refinement（草稿 → 评判 → replan /  capped extend）已在 **Phase 47 交付** — 见 [`agent-network-iteration.md`](./agent-network-iteration.md)。默认保持当前单次 Team jobs（`iterationMaxRounds=1`）；可在设置 / 启动对话框中开启。远程 Assigner 交接携带迭代参数（+ 可选 wire blob）；Assigner UI 会收到 `chain:iteration` 进度事件。

---

## 11. 扩展：Fleet 局域网部署

办公室多台电脑、同一 Wi-Fi 时，**Office LAN** 是最简单的路径（详见 [`agent-network-fleet.md`](./agent-network-fleet.md)）。

### 操作步骤

1. **每台机器**：**设置 → Agent Network → Office LAN → Enable office LAN team**  
   一键同时：开启 **Join Agent Network**、**LAN Auto-Bond**、设置共享 fleet token（至少 8 字符），并提供 **Copy token**。
2. **每台机器粘贴相同 token**。
3. 同一 Wi-Fi 下的节点会以 `direct` 信任**静默建联**。
4. 点击 **Refresh workers**，确认 Worker 列表包含所有已加入节点。

> **建联 ≠ 可招募。** 仅建联会让对方出现在联系人中；须同时 **Join Agent Network** 才能成为 Worker。LAN 建联但未 Join = 受信任但不可招募（界面会提示）。

### 路径选择（摘要）

| 场景 | 推荐路径 | 信任建立 |
|------|----------|----------|
| 1–5 台远程 | Company Invite | 一次性 token |
| 5–20 台多数远程 | Company Invite + Bond Autonomy | token + 自动接受 |
| **全在同一办公室 Wi-Fi** | **LAN Auto-Bond（推荐）** | 共享 token + mDNS |
| 20+ 台有名单 | Fleet Manifest | 运维签名名单 |
| 访客 / 临时 | Pairing Kiosk | Kiosk 铸造邀请 |

**Bond Autonomy：** Sponsor 节点可配置自动接受 Hello（`proofOfContext` 匹配 sponsor proof token、`maxAutoBondsPerDay` 等）。两端 token **必须完全一致**，否则 auto-hello 会被拒。

---

## 12. 扩展：声明式 `fleet.yaml` 部署

批量、可重复部署时使用 YAML + CLI（完整说明：[`fleet-bootstrap.md`](./fleet-bootstrap.md)）。

### 示例与执行

```yaml
version: "0.1"
fleetId: acme-office
shared:
  membership:
    capabilityProviderEnabled: true
  lanAutoBond:
    enabled: true
    tokenRef: LAN_FLEET_TOKEN
nodes:
  - id: home
    role: sponsor
    rpc:
      wsUrl: "ws://127.0.0.1:3030/ws"
  - id: desk-alice
    role: member
    rpc:
      wsUrl: "ws://192.168.1.21:3030/ws"
    join:
      method: lan
      trustLevel: direct
apply:
  dryRun: false
  ensureOnlineTimeoutSec: 30
```

```bash
cp fleet.example.yaml fleet.yaml
# 编辑 wsUrl / 身份等

export LAN_FLEET_TOKEN="$(openssl rand -hex 16)"

npm run fleet:apply -- --file fleet.yaml --dry-run
npm run fleet:apply -- --file fleet.yaml
```

### 加入方式

| method | `fleet:apply` 行为 |
|--------|-------------------|
| `lan` | 设置 `lanAutoBond*`；依赖 mDNS + token 自动建联 |
| `manifest` | Sponsor `createFleetManifest`；成员 `importFleetManifest` |
| `invite` | Sponsor `createCompanyInvite`；成员 `redeemCompanyInvite` |
| `none` | 仅打配置补丁 |

典型流程：`ensureOnline` → `patchNodeConfig` → `createOrImportManifest` / `mintInvites` / `redeemInvites` → `refreshAgentNetworkWorkers` → `verifyRoster`。可用 `--steps` 或 YAML 中 `apply.steps` 裁剪。

### 前提与限制

- 各节点**已启动**且 `rpc.wsUrl` 可达；**有且仅有一个** `role: sponsor`。  
- token 经环境变量（`tokenRef`）传入，勿写入仓库。  
- **不会**启动节点进程；**不会**跳过建联——信任仍来自 manifest / invite / LAN。  
- Sponsor 需有 owner 私钥（用于签名 manifest）。
