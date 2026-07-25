# EnvoyMesh 指南

**版本：** 0.1.0
**版本：** 完整指南版
**修订日期：** 2026-07-25
**Languages:** [English](EnvoyMesh_GuideBook_0.1.0.md) · [简体中文](EnvoyMesh_GuideBook_0.1.0.zh-CN.md) ([HTML](EnvoyMesh_GuideBook_0.1.0.html) · [中文 HTML](EnvoyMesh_GuideBook_0.1.0.zh-CN.html))  
**受众：** 最终用户和潜在用户（第一部分至第十四部分）；website editors、support 团队和操作员（第 XV 部分和 Operator 标记的主题）
**目的：** EnvoyMesh 的完整最终用户指南 — 它是什么、如何 install 并在桌面上使用它和 EnvoyGo、identity 和信任如何工作，以及如何安全操作 networking、代理、中继和高级功能。

> **完整指南版本。** 本指南反映了修订日期的 EnvoyMesh 0.1.0 存储库ry 状态。它是为最终用户编写的，而不是作为 content 大纲存根。功能 status 可能因平台和 deployment 而异 - 在生产中依赖它之前，请验证 build（release notes、设置 labels 和附录 J）中的每个 Beta 或 Experimental 功能。

## 如何阅读本指南

- **第 I–XIV** 部分向最终用户和操作员解释该产品。
- **第 XV 部分** 适用于 website editors 和 content 操作员，对于最终用户来说是可选的。
- 任务生命周期名称（例如*已创建* / *任务计划* / *正在运行*）是 EnvoyMesh 状态，而不是产品 **Planned** / **Available** status label。
- 本指南中的 **Mobile** 表示 **EnvoyGo** （thin client 与主节点配对），除非有部分明确讨论旧版移动实验。

## 功能状态标签

- **Available** — 已实施并供当前使用。
- **Beta** — 已实施，但仍在接受验证或产品完善。
- **Experimental** — 可用于评估；行为或界面可能会改变。
- **兼容性预设** — EnvoyMesh 包括用于集成的 configuration，而部分集成由另一个项目维护。
- **Planned** — 设计或 document 编辑，但目前不作为完整的产品功能提供。
- **Parked** — intent 在没有承诺 release 日期的情况下被推迟。
- **Desktop** — 通过 EnvoyMesh 桌面应用程序或主节点可用。
- **Mobile** — 适用于 EnvoyGo，当前的 EnvoyMesh 移动产品（家庭配对 thin client）。
- **Operator** — 用于节点、中继或 fleet administrator。

## 本指南使用的产品术语

- **EnvoyAI / OpenClaw** 是 EnvoyMesh 中包含的更丰富的 bundled 代理集成。
- **HomeClaw** 和 **Hermes** 是内置的外部代理兼容性预设。
- **OpenHuman** 是内置兼容性预设，默认为 disabled。
- HomeClaw、Hermes 和 OpenHuman 的 Agent 端代码由各自的项目维护；EnvoyMesh 提供桥、预设、policy 边界ry 和网格工具。
- **Agent 网络** 意味着绑定人员 allow 与其选择加入的 local 代理进行协作。它不是 public 代理市场。
- **Team jobs** 是多代理协作的面向用户的名称。源代码和较旧的 documentation 可能将这些工作流程称为**链**。
- **EnvoyGo** 是当前的移动产品：与主 EnvoyMesh 节点配对的 thin client。早期的 Capacitor 移动树 (in-process full node) 是一个遗留实验，不是 primary 移动应用程序。运行 EnvoyGo itself 作为 full 网格节点已停放（附录 J.6）。

---

# 目录

## 第一部分 — 认识 EnvoyMesh

### 1. 欢迎来到 EnvoyMesh

#### 1.1 面向人类和AI智能体的私有网络

EnvoyMesh 通过私有网格而不是中央帐户服务连接人员和人工智能代理。每个参与者保留一个 local identity，选择可信联系人（绑定在四个用户选择之一table trust tier — blocked、public、referred 或 direct；`self` 是您自己的 owner 的隐式层，devices 和代理），并决定哪些代理、工具和信息可以跨越这些关系。

#### 1.2 设计上优先本地和点对点

主节点存储identity、policy、对话、任务和知识local。Peer 点对点传输 port 是 preferred，因此常规通信不依赖于托管 application data 库。

#### 1.3 无需中央账户

您创建 cryptographic 身份，而不是注册全局用户名和密码。公共中继可以帮助同行找到并相互联系，但它们不是帐户权限。

#### 1.4 您的身份、关系和数据属于您自己

所有者密钥建立控制，绑定记录关系，sensitivity label 保护数据。因此，备份很重要：丢失 owner 密钥的唯一 copy 可能意味着失去该 identity 的连续性。

#### 1.5 直接连接和可选中继

EnvoyMesh 首先尝试 direct 对等 path。当 NAT、防火墙或移动性阻止 path 时，可选中继会提供 rendezvous 和 forwarding，而不会成为应用程序大脑。

#### 1.6 个人智能体和外部智能体

EnvoyAI 是基于 bundled OpenClaw 的助手。单独的桥可以连接 HomeClaw、Hermes、OpenHuman 或自定义 HTTP 代理，而无需向外部进程提供原始 P2P 密钥。

#### 1.7 可信多智能体协作

Agent Network lets bonded owners opt their local agents into Team jobs. The requesting node plans work, eligible workers execute locally, and the orchestrator combines attributed results.

#### 1.8 开放协议和互操作性

本机签名的 EnvoyMesh envelope 仍然是内部协议。MCP 向兼容应用程序公开工具，而 A2A publish 代理在网络边缘发现 ry 和任务接口。

#### 1.9 主要功能一览

Available 区域包括消息、群组、音频、语音呼叫、文件、配置文件、个人 AI、知识和 RAG、外部代理桥、Team jobs、终端、Browser、中继、MCP 和 A2A。

#### 1.10 当前可用性和限制

某些功能仍然特定于平台或被推迟。特别是，video调用、广泛的匿名工作者recruitment、full-节点EnvoyGo操作、全球声誉、商业、Filecoin持久性和完整的分层中继图不是当前的一般特征。


### 2. 为什么选择 EnvoyMesh？

#### 2.1 无需中央平台的私密通信

EnvoyMesh 将消息传递视为已签名的对等流量，而不是托管数据库中的 row。您可以选择谁出现在您的联系人列表中，并且对话将保留在您控制的 device 内，除非您明确向外 share 进行。这与无需密钥即可更改条款、扫描 content 或冻结帐户的集中式信使不同。

#### 2.2 跨设备的自主身份

您的 owner identity 是 Ed25519 密钥对，而不是供应商注册的用户名。设备和代理源自具有签名证书和授权的 owner，因此您可以证明笔记本电脑、台式机和配对手机之间的连续性。丢失 owner 密钥的唯一 copy 可能会结束 identity 的历史 ry，因此 backup 和 recovery 规划从第一天起就很重要。

#### 2.3 由您掌控的AI助手

EnvoyAI 和外部代理在您的主节点上运行，并在保证金 policy、授权限制和可选的人工批准下运行。您可以决定代理可以使用哪些 models、工具和联系人，而不是 accept 供应商的默认自动化范围。远程模型提供程序 receive 仅在 semantic firewall 和 policy 检查后提示节点批准。

#### 2.4 可信知识共享

注释和文件位于 Vault 中，出现在 Library UI 中，并且可以是 shared 和 Bonds 引擎强制执行的 sensitivity labels。Bonded 联系人可以通过“knowledge.query”查询 ry 您的 public 或 friends 层材料，而 stranger 只能看到 public 子图并且受到速率限制。browsing 的发布使用第五部分中描述的单独的 web-content paths 和 visibility 规则。

#### 2.5 安全的任务委托

任务 delegation 使用 owner 签名的命令来限制成本、sensitivity、allow 操作和 expiry。代理人不能默默地超越这些界限；有风险的步骤可能需要在执行前得到明确的批准。这使得自主工作变得清晰，而不是在别人的服务器上运行的黑匣子。

#### 2.6 您选择的智能体之间的协作

Agent 网络是绑定的 owner 之间的选择性协作，而不是匿名的工人市场。Team jobs 让您的 local 代理计划工作并致电您已经信任的工作人员，并将归因结果返回给协调器。您可以控制哪些联系人的代理可以参与。

#### 2.7 本地模型、远程模型和外部智能体

EnvoyMeshsupports local 推理、configured remote 提供程序以及外部 HTTP 代理（例如 HomeClaw 或 Hermes）一次通过一个网桥。节点代表代理对网状流量进行签名，而无需移交 Ed25519 密钥。混合提供商以平衡 privacy、latency 和功能，而无需锁定一个供应商堆栈。

#### 2.8 可审计性而非隐形自动化

操作将 JSONL 审计事件附加到 correlation ID 将多步骤流程缝合在一起。您可以重新view 代理尝试了什么、policy allow 拒绝或拒绝什么，以及哪个同伴参与了。在诊断自动化或共享争议时，此 audit trail 补充了聊天历史ry。

#### 2.9 何时适合使用 EnvoyMesh

当您需要 cryptographic identity、显式 trust tier、local-first storage 以及 policy 下的代理工具时，EnvoyMesh 适合。它非常适合小型可信团体、具有网格覆盖范围的个人人工智能以及需要可验证消息传递和委派任务的团队。在扩展继电器或 Agent 网络 membership 之前，从一个主节点和一些绑定触点开始。

#### 2.10 何时其他解决方案更合适

具有轻松注册、庞大群组和供应商管理审核功能的全球消费者通讯工具可能比运行主节点更好地为您服务。同样，如果您只需要一个没有对等关系或 local 保管库的云聊天机器人，则托管助手会更简单。EnvoyMesh 奖励愿意拥有密钥、backup 和信任决策的操作员。

### 3. 您可以做什么

#### 3.1 与信任的人建立连接

验证联系人的 public 密钥 fingerprint 后，通过 introduction、QR 配对或中继辅助发现ry 添加联系人。Bond 记录 trust tier - blocked、public、referred 或 direct - 控制每个对等方可能 request 的内容。当关系发生变化时，您可以 upgrade 或 downgrade 进行信任，而无需迁移到新帐户。

#### 3.2 交换私密消息

使用协议强制执行的人对人角色 policy 发送签名 envelope 的一对一聊天。当 NAT block 是直连时，消息更喜欢 direct libp2p path 并回退到 circuit relay。与主节点配对后，读取 Social 或 EnvoyGo 中的收据和 delivery 行为 follow 和 settings。

#### 3.3 创建群组对话

创建组 thread，其中包含多个绑定联系人，并具有与 direct 聊天相同的 signature 和 policy 保证。Group membership 和命名是通过节点协调的 local-first 构造。使用家庭、项目或 research circle 组，其中 everyone 已经 share 建立明确的信任关系。

#### 3.4 发送语音消息和进行语音通话

当双方支持port功能和policy allow时，在聊天或start语音通话中录制简短的音频片段。媒体作为消息流过相同的网格 transport ，而不是通过单独的 proprietary 调用后端。质量和可用性取决于网络 path 以及是否可以通过 direct 或中继连接到达对等点。

#### 3.5 共享文件和资料照片

使用在接收方的 vault inbox folder 中签名的数据传输 vouch 与联系人共享文件。Profile photos 和 avatars follow 与其他 local 资产具有相同的 identity 和 storage 模型。收件人根据自己的 sensitivity 规则生成 index received 个文件。

#### 3.6 与您的个人AI智能体对话

从 Social 桌面或与正在运行的主节点配对时通过 EnvoyGo 与 EnvoyAI (bundled OpenClaw) 聊天。助理可以 search 您的保管库、向绑定联系人发送消息，并根据授权和批准调用 allow 工具。根据您对自动化的舒适度，在“设置”→“人工智能”中启用或 disable bundled 代理。

#### 3.7 连接 OpenClaw、HomeClaw、Hermes 或 OpenHuman

当您更喜欢外部 runtime 而不是 bundled EnvoyAI 时，可以通过设置 → AI → Ext Agent 连接 HomeClaw、Hermes、OpenHuman 或自定义 HTTP 代理。EnvoyMesh 将网格工具转换为外部代理的消息契约，而不暴露原始 libp2p 密钥。一次仅运行一个外部桥；在启用之前验证您信任 local endpoint。

#### 3.8 搜索本地和可信知识

从 Library 选项卡搜索您的保管库 locally，或要求 EnvoyAI 在保存时通过 RAG 管道 index 检索 chunk。联盟 search 可以查询 ry 绑定联系人的 syndicated 知识，上限为每个联系人 configure 的 sensitivity 上限。公共 note 通过 stranger 的速率限制“knowledge.query”参与更广泛的网格。

#### 3.9 发布和浏览网络内容

在主节点的 web content directory 提供的 envoy://` URL 下发布 Markdown、image 和 PDF。Bonded 联系人（以及当 visibility allow 时，更广泛的网格对等体）在与主页配对时打开 Social Browser 或 EnvoyGo Browser 中的页面。基于拉取的`library.read`按需获取字节；推送 notifications 以获取在 Phase 45E 到达的提要。

#### 3.10 将工作委托给另一个智能体

当您需要在签署的范围内进行专门工作时，请将任务授权发送给另一个 owner 的代理。协商 follow 是从提议到 accept、运行和结果的任务生命周期。对于任务标记为敏感的行动，仍然可以进行人工审批。

#### 3.11 在多个智能体上运行团队任务

当与 owner 和 allow 代理进行协作时，在选择加入的 Agent 网络成员之间运行 Team jobs（多代理链）。requesting 节点计划步骤，工作人员在自己的硬件上执行 locally，结果以 attribution 返回。这适用于 research 摘要、split 分析或协调 report，而不是匿名工作人员的公开 recruit。

#### 3.12 连接 MCP 和 A2A 应用

将选定的网格工具公开给 MCP 兼容的桌面应用程序，例如 Claude Desktop 或 publish 以及外部任务客户端的 A2A 代理卡。MCP 和 A2A 位于网络边缘；本机签名的 envelope 仍然是内部协议。仅当您了解哪些工具跨越了ry 边界后，才能连接figure 桥梁。

#### 3.13 远程使用终端

当您配对或在桌面上时，在 Social 或 EnvoyGo 中打开基于 browser 的终端，这些终端通过 WebSocket 连接到主节点上的 PTY session。远程 shell 访问继承了与其他家庭 RPC 功能相同的身份验证和配对模型。将终端暴露视为高权限，并将其限制为您控制的 device。

#### 3.14 运行私有或社区中继

针对社区中继运行您的 fleet 或 bootstrap 私人中继以进行临时测试。Relay 提供 rendezvous 和电路 forwarding — 它们不存储您的消息、运行 models 或充当帐户服务器。Operator 广告 listen 地址，并可能为更大的 deploy 节点提供 configure 分层中继图。

### 4. EnvoyMesh 如何工作

#### 4.1 系统概览（通俗易懂版）

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 470" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="760" height="80" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Clients</text><rect x="60" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Social Desktop</text><text x="140.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">React + WebSocket</text><rect x="260" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyGo</text><text x="340.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Flutter thin client</text><rect x="460" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Developer CLI</text><text x="540.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">node CLI</text><rect x="20" y="110" width="760" height="260" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="126" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Home Node Process (one per owner)</text><rect x="60" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Inbound Guard</text><text x="140.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">size · schema · sig · replay</text><rect x="260" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Bond Engine</text><text x="340.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">trust tier · policy</text><rect x="460" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Task Runtime</text><text x="540.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mandate · lifecycle</text><rect x="60" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Identity</text><text x="140.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 · DIDs · mandates</text><rect x="260" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault + Library</text><text x="340.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">files · RAG · knowledge</text><rect x="460" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Models</text><text x="540.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">router · semantic firewall</text><rect x="260" y="290" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="312.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">libp2p</text><text x="340.0" y="328.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">TCP · QUIC · mDNS · DHT</text><path d="M140,80 L140,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M340,80 L340,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M540,80 L540,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="20" y="390" width="760" height="60" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="406" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">External Services</text><rect x="60" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F3FF" stroke-width="1.2"/><text x="140.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#5d3ac7" font-weight="600" fill="#1e1d1b">Model Providers</text><text x="140.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">OpenAI · local · LiteLLM</text><rect x="260" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F5F4" stroke-width="1.2"/><text x="340.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#6d6a63" font-weight="600" fill="#1e1d1b">Relays</text><text x="340.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">connectivity only</text><rect x="460" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F5F4" stroke-width="1.2"/><text x="540.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#6d6a63" font-weight="600" fill="#1e1d1b">MCP / A2A</text><text x="540.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">bridges</text><path d="M340,360 L340,390" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 1 — Home-node system architecture: clients call JSON-RPC into one home node per owner; the home node owns identity, policy, storage, models, and networking; external services are optional and never hold owner keys.</figcaption></figure>


在较高级别上，您的主节点将 identity、policy、storage、models 和 libp2p networking 组合在一个进程中。Social 桌面和配对的 EnvoyGo 是在该节点上调用 JSON-RPC 的 thin client。在发生任何模型或库访问之前，入站流量会通过大小、signature、重播和绑定决策的防护。

#### 4.2 所有者、设备、智能体和对等节点

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="300" y="20" width="200" height="50" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="400.0" y="42.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="14" font-weight="600" fill="#1e1d1b">Owner Key</text><text x="400.0" y="58.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 · long-lived root</text><path d="M400,70 L200,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="300.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">Agent Mandate</text><path d="M400,70 L400,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">Agent Mandate</text><path d="M400,70 L600,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="500.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">Agent Mandate</text><rect x="100" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Device Certificate</text><text x="200.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">per machine / phone</text><rect x="300" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">signs</text><text x="400.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">per agent · bounded</text><rect x="500" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="600.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">(direct use)</text><text x="600.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">owner signs envelopes</text><path d="M200,170 L200,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="200.0" y="191.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">derives</text><path d="M400,170 L400,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="191.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">derives</text><rect x="100" y="220" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Device Identity</text><text x="200.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy:device:&lt;hash&gt;</text><rect x="300" y="220" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Agent Identity</text><text x="400.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy:agent:&lt;hash&gt;</text><path d="M200,270 L200,320" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="200.0" y="291.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">runtime</text><path d="M400,270 L400,320" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="291.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">runtime</text><rect x="100" y="320" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="342.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Peer ID</text><text x="200.0" y="358.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy_&lt;hash&gt; · signs</text><rect x="300" y="320" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="342.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Peer ID</text><text x="400.0" y="358.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy_&lt;hash&gt; · signs</text><rect x="470" y="200" width="260" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="478" y="216" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Properties</text><text x="490" y="230" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Owner key never leaves its device</text><text x="490" y="250" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Devices/agents can be revoked</text><text x="490" y="270" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Peer IDs may rotate</text><text x="490" y="290" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Peers verify owner linkage</text><text x="490" y="310" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Losing owner key = losing</text><text x="490" y="326" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">  that identity history</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 2 — Identity hierarchy: the owner key is the root; it signs device certificates and agent mandates, each deriving a device/agent identity and a runtime peer ID that signs envelope traffic.</figcaption></figure>


owner键是长寿人类root；devices receive owner 签名证书；代理 receive 要求将他们链接到 owner。运行时对等 ID 可以使用密钥签署各个 envelope 并可以签署 rotate，同时保留信任链接。了解此堆栈有助于您推理 backup、配对和代理授权。

#### 4.3 联系人、绑定和信任等级

Contact 映射到具有确定哪些 intent 和 sensitivity 级别是 allow 的层的债券记录。公共 stranger 可以 ping 或 request 债券；referred 联系人获得更广泛的 query 访问权限；direct 债券解锁 friends 层共享。策略评估是确定性的并记录下来以供审计。

#### 4.4 签名消息和可验证发送者

Every envelope 在 canonical JSON 之上携带 Ed25519 signature，因此收件人在执行 content 之前验证 sender identity。角色字段在 schema 级别强制实施人与人之间的聊天与代理之间的任务流量。被篡改或重播的消息无法通过 inbound 防护。

#### 4.5 个人智能体和外部智能体桥接

捆绑的 EnvoyAI 使用网格工具运行 in-process，而外部代理通过 HTTP 桥进行连接，该桥永远不会 receive 您的私有 signing 密钥。桥转发 allowed 工具调用并将响应转换为网格 envelope。选择一个 primary 代理表面以避免自动化冲突。

#### 4.6 本地知识、库和保险库

The Vault stores files on disk under path-safe rules; the Library is the UI and metadata layer for notes, imports, and published items; RAG indexes vault chunks for retrieval during chat. Sensitivity overrides live in `.envoy/sensitivity.json` per item, not per folder. Web content for browsing lives under a separate `web/` directory mapped to `envoy://` paths.

#### 4.7 任务、授权和审批

任务通过指定的生命周期状态进行，并带有定义授权 intent、成本上限和终止 policy 的任务。即使强制要求 allow 自动化，所有者也可以在执行特定操作之前要求获得批准。取消并检测 intent 保留长期运行的工作帐户table。

#### 4.8 智能体网络成员资格

Agent 网络 membership 是与 enable 代理进行合作的绑定联系人之间的相互选择。这不是列出匿名工人的 public 市场。选择符合条件的员工时，Team jobs 使用此 membership 图。

#### 4.9 直接网络和中继协助

Nodes 首先尝试 direct TCP 或 QUIC 连接，在 LAN 上使用 mDNS，并在 configured 时使用 DHT 发现 ry。当 NAT blocks direct paths 时，circuit relay v2 保留转发流而不 decrypting 应用程序 payloads。您选择 bootstrap 继电器；他们协助connectivity，而不是拥有您的identity。

#### 4.10 活动记录和端到端审计

Audit 和 journal JSONL 文件记录多跳流的 intent、outcome、latency 和 correlation ID。Operators 可以使用这些 ID 跟踪团队作业、知识查询ry 或同行之间的文件传输。日志 intent 会避免存储原始敏感的 payload，除非 debugging policy 需要。

### 5. 常见用例

#### 5.1 跨设备的私密个人AI

在桌面主节点上运行 EnvoyAI，并在远离主节点时从 Social locally 或 EnvoyGo 访问它。您的金库、models 和债券保留在您信任的计算机上，而手机充当 remote 控件。备份 owner 密钥和保管库数据，以便 device 丢失不会影响您的代理历史ry。

#### 5.2 家庭或朋友网络

通过 introduction 邀请家人或 friends，建立 direct 联系，并使用 group chat 加上文件共享，无需 shared 云帐户。每个参与者都保留自己的节点和数据；通过消息、vouchers 和 syndicated 知识 settings 进行明确的共享。当成员位于不同网络时，Relay 会有所帮助。

#### 5.3 可信研究和知识交流

Exchange research notes with public or friends sensitivity, query peers' syndicated libraries, and save attributed results back to your vault through MCP write-back.Federated RAG 尊重每个联系人的上限，因此您永远不会默默地泄露私人材料。当您需要持久的“envoy://”链接时，将完成的摘要发布为网格页面。

#### 5.4 小型团队智能体网络

在已经 shares direct 建立联系并协调一致任务的小团队中建立 Agent 网络。为 split research、代码 review assistance 或 draft report 分配 Team jobs，每个工作线程在 local 硬件上执行。Review audit trails 以查看哪个代理贡献了每个段。

#### 5.5 多智能体规划和报告生成

计划一个多步骤的 report，其中一名代理概述各个部分，工作人员从 local 金库收集证据，以及协调器 merge 的属性文本。Mandates 限制成本，并需要在 send 发送外部电子邮件或 pending credits 之前获得批准。结果会出现在聊天中，并可以保存为库 notes 以供以后引用。

#### 5.6 与可信网络联系人一起使用 OpenClaw

将 OpenClaw 保留为节点上的 EnvoyAI，同时使用网格工具向绑定联系人发送消息和 search syndicated 知识。OpenClaw 从不 receive 原始 libp2p 访问；它通过 registry 调用 `mesh.findKnowledge`、`mesh.sendMessage` 和相关工具。此模式适合需要 OpenClaw 技能且具有值得信赖的同行影响力的高级用户。

#### 5.7 将 HomeClaw 作为外部 EnvoyMesh 智能体

将 EnvoyMesh 指向 local HomeClaw HTTP endpoint，以便 HomeClaw 成为会话表面，同时节点处理 identity 和网格 I/O。HomeClaw 自己的 memory 和 plugin 留在其进程中；EnvoyMesh 对 outbound 操作强制执行绑定。仅在已运行并信任 HomeClaw 的计算机上启用预设。

#### 5.8 将 Hermes 作为外部 EnvoyMesh 智能体

当您更喜欢 Obsidian 风格的知识工具和网格消息传递时，请使用 Hermes。桥接器通过与其他外部代理相同的 policy 边界 ry 转发 Hermes 响应和工具结果。在设置 → AI 中使用 figure 默认 `http://127.0.0.1:8020/message` endpoint 或自定义 URL。

#### 5.9 将 OpenHuman 作为外部 EnvoyMesh 智能体

OpenHuman 可作为​​ disabled 默认兼容性预设，供尝试 runtime 的团队使用。当 enabled 时，它 follow 是相同的一次一桥规则，并且从不 receive signing 键。将其视为可选，直到您的组织验证 OpenHuman 的 local deployment 模型。

#### 5.10 通过 MCP 使用 EnvoyMesh 的 Claude Desktop

在 Claude Desktop 中将 EnvoyMesh 注册为 MCP 服务器，以向 Anthropic 的客户端公开网格 search、联系人和消息传递工具。MCP 跨越了桌面边界ry—review 您可以使用哪些工具enable 以及他们可以从您的保管库中读取哪些数据。主节点必须运行 MCP session 才能成功。

#### 5.11 委托任务的外部 A2A 客户端

从您的节点发布 A2A 代理卡，以便外部 A2A 客户端可以通过 JSON-RPC 代理发现功能并委派任务。主隧道和中继 path 让 remote 客户端到达主节点，而无需将原始 libp2p 暴露给外部 runtime。Mandate 和批准仍然适用于委派的工作。

#### 5.12 自托管中继集群

为需要私有 bootstrap 和 circuit relay 容量的家庭、实验室或组织部署一个或多个带有广告地址的中继二进制文件。Relay 保持精简：没有法学硕士，没有保险库，没有 payload 检查超越 transport forwarding。操作 fleet infrastructure 时监视中继审核快照。

### 6. 产品和协议比较

#### 6.1 EnvoyMesh 与集中式信使

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 740 358" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="160" height="40" fill="#645a3a"/><text x="100" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">Integration</text><rect x="180" y="10" width="240" height="40" fill="#645a3a"/><text x="300" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">Trust boundary</text><rect x="420" y="10" width="300" height="40" fill="#645a3a"/><text x="570" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">What it can reach</text><rect x="20" y="50" width="160" height="48" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1"/><text x="100" y="80" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">EnvoyAI / OpenClaw</text><rect x="180" y="50" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="80" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Bundled · in-process</text><rect x="420" y="50" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="80" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Full mesh tools · chat · tasks</text><rect x="20" y="98" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="128" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">HomeClaw</text><rect x="180" y="98" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="128" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP bridge · loopback</text><rect x="420" y="98" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="128" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools · chat (one URL)</text><rect x="20" y="146" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="176" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Hermes</text><rect x="180" y="146" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="176" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP bridge · loopback</text><rect x="420" y="146" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="176" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools · chat (one URL)</text><rect x="20" y="194" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="224" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">OpenHuman</text><rect x="180" y="194" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="224" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP bridge · loopback</text><rect x="420" y="194" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="224" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools · chat (one URL)</text><rect x="20" y="242" width="160" height="48" fill="#FEF3C7" stroke="#3d5a45" stroke-width="1"/><text x="100" y="272" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">MCP server</text><rect x="180" y="242" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="272" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">stdio · Claude Desktop</text><rect x="420" y="242" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="272" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools exposed outward</text><rect x="20" y="290" width="160" height="48" fill="#F5F3FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="320" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">A2A</text><rect x="180" y="290" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="320" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">JSON-RPC · relay</text><rect x="420" y="290" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="320" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Agent Card · task methods</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 18 — Integration-shape comparison: six external integration shapes side by side, each with its trust boundary and reachable surface. EnvoyAI is deepest; MCP/A2A are outward-facing.</figcaption></figure>


集中式信使针对无摩擦注册、电话号码 identity 和供应商运营的大规模审核进行了优化。EnvoyMesh 交易方便您操作 self - 主权密钥、显性债券和 local-first storage。选择具有大众影响力的信使；当信任边界和 auditability 更重要时，选择 EnvoyMesh。

#### 6.2 EnvoyMesh 与云AI助手

云 AI 助手通过帐户登录和供应商 policy 在供应商 infrastructure 上运行推理和 memory。EnvoyMesh 将 models、保险库和债券保留在您的节点上，同时可以选择调用 remote 提供商给您 configure。您可以获得网格覆盖范围和授权，而不是单一供应商的聊天历史孤岛。

#### 6.3 EnvoyMesh 与独立 OpenClaw

独立的 OpenClaw 擅长作为 local 助手，但缺乏本地签名的对等消息传递、债券 policy 和 federated 知识，除非扩展。EnvoyMesh bundles OpenClaw 作为 EnvoyAI 并用网格工具、任务和审核将其包装起来。在不集成的情况下运行两者会重复代理，除非您 disable 之一。

#### 6.4 EnvoyMesh 与外部智能体运行时

外部代理 runtimes（HomeClaw、Hermes、自定义 HTTP）专注于对话和 plugins；EnvoyMesh 提供 identity、transport 和 policy。桥接模式将 libp2p 键保留在节点上，而外部进程则处理您喜欢的 UX。双方都没有取代另一方——他们故意在 configured 时 compose 。

#### 6.5 EnvoyMesh 与 MCP

MCP 标准化了 AI 应用程序的工具发现ry；EnvoyMesh 实现一个 MCP 适配器，该适配器公开选定的网格功能。原生网格 intent 保持更丰富和签名；MCP 是桌面客户端的 interoperability 边缘。至少row启用MCP工具以限制保险库和接触暴露。

#### 6.6 EnvoyMesh 与 A2A

A2A 定义跨产品 delegation 的代理卡和任务接口；EnvoyMesh publish 通过中继或主隧道 path 进行卡和代理任务。本机 Team jobs 和命令管理网格内的信任；A2A 将范围扩展到外部协调器。两者都可以与不同的 policy 表面共存。

#### 6.7 EnvoyMesh 原生智能体网络与公共市场

公共代理市场针对匿名工人的ry 发现和商业排名进行优化。EnvoyMesh Agent 网络则相反：仅在选择加入 local 的绑定 owner 之间进行协作。原生设计中没有全球列表、声誉评分或支付方式。

#### 6.8 原生协议与互操作性桥接

签名的 Envoy envelope、授权和 bond tier 是网格内的本机协议。MCP 和 A2A 桥在外部生态系统的边缘进行转换，而不取代内部安全性 models。更喜欢本地流程进行保税同行工作；当外部客户端必须参与时使用桥接。

---

## 第二部分 — 安装和入门

### 7. 选择您的设置

#### 7.1 仅桌面

在 Mac 或 Windows 计算机上运行 EnvoyMesh 作为您的 primary 主节点。从当前的 release installer 或 source 中的 build 安装，在首次启动时创建 owner identity，并在需要网格 connectivity 时保持机器运行。此 path 适合任何在可信桌面上使用 start 且尚未进行移动访问的人。

#### 7.2 桌面配合 EnvoyGo 移动访问

在您的主节点正常运行后，在 iOS 或 Android 上添加 EnvoyGo。电话通过扫描 QR code 和 mirror 聊天、联系人、终端和选定的家庭功能进行配对 - 它不会取代桌面节点或自行按住 owner 键。当您外出使用移动设备时，请规划好家庭计算机可通过 LAN、中继或隧道保持可达性。

#### 7.3 桌面配合捆绑的 EnvoyAI 智能体

EnvoyAI (OpenClaw) ships with the desktop node and starts on port 18789 by default. It can search your Vault, message bonded contacts, and run local tools under your bond and approval settings. Toggle it in Settings → AI or set `openclawEnabled` in `node-config.json` if you prefer to start without the bundled assistant.

#### 7.4 桌面配合外部智能体

通过设置 → AI → Ext Agent 连接 HomeClaw、Hermes、OpenHuman 或自定义 HTTP 代理。一个节点一次运行一个外部网桥；EnvoyMesh 代表代理对网状流量进行签名，而不移交 Ed25519 密钥。仅在您信任外部进程及其 local endpoint 后才启用桥接。

#### 7.5 桌面配合本地或远程模型

根据您的 privacy 和成本 preferences，在设置 → AI 下配置 figure 模型提供商。本地 models 在您的硬件上保留推断；remote 提供商 send 在您的 configured 限制下批准了节点外的提示。从一个提供商开始，验证聊天中的响应，然后在批准行为符合您的预期后扩大自动化范围。

#### 7.6 个人中继或社区中继

Relays help peers discover each other and traverse NAT; they do not hold your account or read application payloads. Use the community relay for casual testing, or run your own relay with `npm run node:dev -- --profile ./data/relay --relay-server --listen /ip4/0.0.0.0/tcp/4001`. Normal nodes bootstrap with `--bootstrap "<relay-multiaddr>"` and `--relay`.

#### 7.7 小型团队和组织部署

为每个团队成员提供一个具有自己的 owner identity 的主节点，然后显式绑定联系人而不是共享一个登录名。Operators 可以在 fleet rollout 之前进行 deploy 私人中继、标准化 trust tiers 和 disable bundled 赞助联系人。记录 profile data paths，以便 backups 和 upgrades 在不同机器上保持一致。

#### 7.8 推荐的首次设置

在受信任的计算机上安装桌面应用程序，如果您需要个人助理，请填写 owner 和 device setup、enable EnvoyAI，并在添加联系人之前备份 identity 材料。将一个测试联系人与同一条 LAN、send 消息配对，然后选择性地添加 EnvoyGo。推迟 Team jobs、外部代理和 WAN 中继测试，直到基本聊天和 status 指标看起来正常。


### 8. 安装 EnvoyMesh

#### 8.1 系统要求

使用supported当前macOS或Windows桌面环境，并为应用程序提供足够的storage、local数据和可选模型或IPFS组件。源 build 需要 repository 的 Node.js 工具链和包依赖项；移动访问还需要一个正在运行的主节点。

#### 8.2 在 macOS 上安装

下载 macOS 磁盘 image，打开它，然后将 EnvoyMesh 移动到应用程序。首次启动时，macOS 可能需要确认，因为 release signing 和公证可以通过 build 进行 ry ；升级时保留您的数据directory。

#### 8.3 在 Windows 上安装

当您需要对等 connectivity 时，通过 local 防火墙提示运行 Windows installer 和 allow bundled 节点 runtime。Windows 包 intent 单独携带一个较小的 essential OpenClaw extension 设置来控制 installer 大小。

#### 8.4 在 iOS 上安装 EnvoyGo

通过可用的 iOS distribution channel 安装 EnvoyGo，然后将其与现有主节点配对。EnvoyGo 是 thin client：不要指望它在主节点不可用时替换桌面节点或保留独立网格 identity。

#### 8.5 在 Android 上安装 EnvoyGo

在 Android 上安装 EnvoyGo 并完成相同的主节点配对流程。通知和 background 行为取决于 Android permissions、battery optimization 和 FCM configuration。

#### 8.6 从源代码安装

From the repository root, install dependencies with `npm install`, run `npm run typecheck`, and run `npm test`. Start the node with `npm run node:dev`; consult `QuickStart.md` for platform prerequisites and optional components.

#### 8.7 验证安装

健康的 installation start 节点，打开 Social 接口，显示 identity 和连接 status，并且可以访问 local 服务。在 importing 数据或添加外部集成之前，使用内置 status 表面进行验证。

#### 8.8 应用数据位置

身份、信任、审计、任务、Vault 和 configuration 数据位于节点的应用程序数据位置，而不是 installation directory 中。使用附录 K 和当前的 release note 来定位特定于平台的 root。

#### 8.9 更新 EnvoyMesh

Back up identity and Vault data, stop active tasks, and install the newer package over the application. Review `CHANGELOG.md` for configuration or storage migrations before restarting.

#### 8.10 卸载而不丢失身份或数据

删除应用程序应与删除其数据 directory 分开处理。如果您打算重新install，请保留数据 root 和 identity backup；仅当您故意要删除 local identity 和记录时才使用 delete 它们。


### 9. 平台和包差异

#### 9.1 桌面和移动功能比较

Desktop Social 是 full 主节点体验：网格 identity、Vault、代理、Team jobs orchestration、Browser、终端和 settings。EnvoyGo mirror 是一个子集 — 聊天、联系人、语音呼叫、read-only 团队作业 status、终端和 Browser — 通过 JSON-RPC 到达配对的主节点。将移动设备视为 remote 控件，而不是第二个独立节点。

#### 9.2 macOS 打包

macOS release 作为磁盘 image 提供，带有 Tauri 包装的 Social UI 和嵌入式节点 runtime。OpenClaw extension 在 macOS 上比在 Windows 上更完整地 bundled，以减少后 install setup。检查 release notes 的公证情况以及 macOS 版本上的 Gatekeeper 行为。

#### 9.3 Windows 打包

Windows releases 使用 installer bundles 节点 runtime 和 slimmer OpenClaw extension 设置来控制下载大小。如果您需要 inbound 对等连接，请在出现提示时允许应用程序通过 Windows Firewall。Profile 数据位于 user app-data path 下，与 install folder 分开。

#### 9.4 macOS 上捆绑的 OpenClaw 扩展

macOS desktop builds include the fuller OpenClaw extension bundle used by EnvoyAI. Source installs copy extensions during `./scripts/setup.sh` or `npm run setup`. Rerun setup after upgrading OpenClaw-related dependencies if you develop from source.

#### 9.5 Windows 上的基本 OpenClaw 扩展选择

Windows installers 包括 curated essential extension 集，而不是 every 可选 channel。如果缺少某个功能，请与 release notes 中的 macOS bundle 列表或 source 中的 install 与 `.\scripts\setup.ps1` 进行比较。核心网格和聊天功能不需要额外的 extensions。

#### 9.6 完整和精简桌面捆绑包

一些 release 提供带可选组件的 full install 和 slimmer build，但不带 IPFS 或额外的 sidecar。当您需要开箱即用的可选 content 功能时，请选择 full；在受限磁盘或气隙实验室机器上选择 slim。无论 bundle flavor 如何，您的 identity 和 Vault 数据都是相同的。

#### 9.7 可选的 IPFS 侧车

IPFS 相关组件是 content 寻址实验的可选附件，聊天、债券或 Team jobs 不需要。仅当您的平台的 release notes document a superported sidecar 时才启用它们。如果您喜欢 minimal attack surface，请忽略它们。

#### 9.8 需要家庭节点的功能

Mesh identity、代理 runtime、Vault indexing、团队作业 orchestration、MCP/A2A 桥和 full 设置位于主节点上。EnvoyGo、browser dev UI 指向 remote 配置文件，而针对 `--profile` 的 CLI 都假设节点正在运行且可访问。如果没有主节点，移动 mirror 和 thin client 无法验证或 send 签名流量。

#### 9.9 作为 EnvoyGo 移动镜像可用的功能

EnvoyGo 公开聊天 thread、联系人、语音呼叫、终端连接、“envoy://”、content 的 Browser、推送 notification 和 read-only 我 → Agent 网络下的最近团队作业 status。AI引擎toggles和桥configuration出现read-only在移动设备上；在主节点上更改它们。手机上缓存数据是为了方便，而不是 authoritative identity storage。

#### 9.10 遗留移动实验和当前产品边界

`apps/mobile` 中的 Capacitor 应用程序是 in-process full 节点实验，而不是产品移动版 path。EnvoyGo 是与 home 配对的 superported thin client。作为独立的 full 网格节点运行 EnvoyGo 保持停止状态；对 primary 节点使用桌面或 source builds。


### 10. 创建您的身份

#### 10.1 您的 EnvoyMesh 身份代表什么

您的 identity 是 cryptographic，而不是云用户名。owner identity 控制指令和 device；每个 device 都有自己的键；您的代理 identity 根据 owner 签署的授权对网格进行操作。Peers 根据这些 ID 验证 signatures，而不是信任中央 directory。

#### 10.2 创建所有者身份

首次启动时，Social 会引导您生成存储在您的配置文件 directory 中的 owner 密钥对（例如 source 运行中的 `./data/default`）。此步骤每人进行一次；新机器上的后续 install import 或授权额外的 device 而不是创建第二个 owner。在粘合生产触点之前备份 owner 材料。

#### 10.3 创建您的第一个设备身份

The first desktop install creates a device identity authorized by your owner keys automatically. The device signs routine envelopes and holds local session state. Note the device ID in Profile or via `npm run cli -w @envoymesh/node -- profile --profile ./data/default` when diagnosing pairing.

#### 10.4 创建或激活您的智能体身份

EnvoyMesh derives an agent peer identity from your owner and agent keys, then records an owner-signed mandate linking the agent to you. EnvoyAI uses this identity when sending agent-role messages. External bridge agents receive a separate bridge identity persisted as `bridge-identity.json` when enabled.

#### 10.5 设置您的显示资料

打开 Social 中的 Profile 以设置姓名、avatar 以及其他联系人在绑定后看到的字段。Profile 数据已签名并locally 存储在您的个人资料directory 中。在共享配对码之前更新它，以便收件人认出您。

#### 10.6 了解您的 DID

您的 owner DID follow 的形式是从您的 public 密钥派生的 `envoy:owner:<hash>` 。设备和代理 ID 使用并行的“envoy:device:”和“envoy:agent:”前缀。一旦对等方交换了信任，就共享 owner ID 进行 stable 寻址；runtime 对等 ID 可以使用密钥 rotate，而 owner ID 则保持长期有效。

#### 10.7 保护您的加密密钥

私钥位于 profile data directory 中，并带有限制性文件 permissions。请勿将 copy 密钥文件用于聊天、电子邮件或 shared 驱动器 unencrypted。使用主节点计算机上的操作系统用户帐户保护作为第一层防御。

#### 10.8 备份身份和恢复数据

在 OS reinstall 或硬件 migration 之前复制整个配置文件 directory — 或 export backup 您的 release document__。`shared_vault/` 下的 Vault content 或 configured 保管库 path 应与应用程序 binary 分开备份。在您紧急需要之前，在非生产机器上测试 restore。

#### 10.9 添加另一个设备

通过扫描 QR code 或从主节点的 Pairing 队列批准配对 request 来配对第二个 device。owner 签署 device 证书，授权新的 device，同时共享相同的 owner ID。EnvoyGo 与瘦客户端流程配对 follow：电话 receive 和 session 到主节点，而不是在电话上复制 owner 键。

#### 10.10 撤销丢失或受损的设备

从受信任的剩余 device、revoke 丢失的 device 证书和 remove 其信任条目。如果外部代理在受感染的计算机上运行，​​请更改任何网桥机密。将 owner 密钥泄露视为灾难性的：revoke devices、rotate 桥接凭证，并仅在您确信密钥干净后重新绑定联系人。


### 11. 应用导览

#### 11.1 主页和节点状态

主 view 总结了节点 connectivity、discovery 模式和最近的 activity。使用它来确认节点正在 listening、中继可访问并且不存在 startup 警告。CLI 等效项包括“connectivity-status”和“relay-status”（用于更深层次的 diagnosis）。

#### 11.2 对话

Conversations 列出 direct 和 group chat threads 以及 delivery 指示符。在信任和 settings 上打开 thread 到 send 文本、音频、文件或代理消息 depending。搜索并固定行为 follow 当前 Social release；您的 local 个人资料存储中的未读状态 syncs。

#### 11.3 联系人和发现

Contacts 显示带有 trust tier 徽章的绑定同伴；发现 ry 表面功能或基于 tag 的查找，其中 policy allow。在您 accept 和 bond request 之前，陌生人仍然受到严格的速率限制。如果关系发生变化，请从联系详细信息表中阻止或 downgrade 信任。

#### 11.4 群组

从 Conversation 创建一个组，添加绑定联系人，并设置标题和 avatar。Group 消息使用与群组路由 metadata 聊天的 direct 相同的签名 envelope path。仅在群组中添加您计划在 sensitivity 级别信任的参与者。

#### 11.5 知识库和库

Library 是应用内知识库：创建 Markdown notes、import documents 和 toggle 每项 sensitivity。policy 引擎有四个等级：“public”、“friends”、“受信任”、“私有”，而 UI 则为您最常选择的等级提供更友好的 label。自动将 notes index 保存到 RAG 中。可选的 Obsidian 和 MCP plugin 是设置 → AI → Knowledge 基础下的 configured。

#### 11.6 浏览器

Browser 通过节点的 policy 边界 ry 加载允许的 envoy://` 网格 content。您会看到什么键规则和 sensitivity labels allow — 默认情况下不是开放的 web。用它来读取 published note 和来自绑定或 public 作者的网格页面。

#### 11.7 团队任务

Team jobs 出现在 Agent 网络为 enabled 的位置。您的代理协调选定的保税代理之间的工作；您在 Team jobs UI 中查看view 计划、预算和结果。在启用自动成本重新平衡策略之前，先从小目标开始。

#### 11.8 终端

Terminals attach to shell sessions on the home node via WebSocket, including from chat inline or the dedicated terminals view. Sessions require authentication through the node and respect your approval settings for agent command execution. Remote attach from EnvoyGo tunnels through the home JSON-RPC transport.

#### 11.9 审批和活动

Approvals queues sensitive agent or task actions awaiting your decision; Activity (audit) shows allow/deny outcomes with correlation IDs. Approve or reject from Social or CLI (`npm run cli -w @envoymesh/node -- approvals ...`). Use correlation IDs to stitch multi-step Team jobs or relay-assisted flows.

#### 11.10 资料

Profile edit 是您人类可见的 identity 并显示 owner、device 和代理标识符。这是 copy 配对信息并验证您所在的 device 的正确位置。更改会传播到下一个已签名的个人资料 update 和 receive 上的联系人。

#### 11.11 设置

Settings controls discovery profiles, AI engines, external agent bridges, knowledge plugins, notifications, and node behavior flags. Changes write to `node-config.json`, `bridge-config.json`, and related files in your profile directory. Restart or follow in-app prompts when a setting requires a node reload.

#### 11.12 连接和智能体状态指示器

标题徽章显示 WebSocket/Social connectivity、网格 reachability、EnvoyAI 网关运行状况以及 configured 时的外部网桥状态。黄色或红色状态意味着您应该在 send 处理敏感数据之前修复 connectivity。EnvoyGo 显示主 reachability 的并联连接指示器。


### 12. 连接您的第一个联系人

#### 12.1 配对和绑定的作用

Pairing exchanges enough information to identify and reach another owner; bonding records the trust relationship and policy tier. A packaged desktop build may also add the project sponsor contact from `bundled-sponsor-friend.json` on first launch; operators can disable that bundle before deployment.

#### 12.2 使用二维码配对

在一个 device 上打开“添加 Contact”，在另一个 device 上打开“显示我的代码”，然后使用内置扫描仪扫描 Social 或 EnvoyGo。确认显示的 owner ID 和 display name 与您亲自期望的相符。在将联系人视为可信联系人之前，请完成 bond request 流程。

#### 12.3 使用邀请链接配对

通过您信任的 channel（Signal、面对面的 AirDrop 等）从 Contact 和 share 生成邀请链接或 multiaddr payload。收件人打开 Social 中的链接以启动配对。像对待泄露的电话号码一样对待泄露的链接 —revoke 或忽略意外的 bond request。

#### 12.4 在本地网络上配对

在同一个 LAN 上，mDNS discovery 可能会列出没有 manual multiaddr 的附近节点。使用默认的 discovery 或 `--listen /ip4/0.0.0.0/tcp/0` 启动两个节点，然后从 discovery UI 中选择对等点。LAN 配对是在测试中继 path 之前验证 signing 和聊天的最快方法。

#### 12.5 验证身份信息

在 accept 连接键之前，比较 owner ID、display name 和可选的 proof 文本 out of band。签名的 envelope 证明了密钥的 possession，而不是您认识该人 - 您的 proof 步骤缩小了这一差距。拒绝与您的联系人所说的 send 不符的 request。

#### 12.6 选择适当的信任等级

EnvoyMesh trust tier 是 blocked、public (stranger)、referred 和 direct（朋友）。除非您已经拥有牢固的信任基础，否则请在 public 或 referred 开始结识新朋友。Direct 解锁更丰富的知识共享和代理协作；upgrade 只是故意的。

#### 12.7 接受绑定请求

传入的 bond request 与 sender 的 proof 消息一起出现在 Contact 或 notification 中。同意记录相互信任locally；reject 将他们留在 stranger 层。任何一方稍后都可以通过联系人 settings 更改级别或 block。

#### 12.8 发送第一条消息

打开新联系人 thread 和 send 一条简短的签名聊天消息。根据您的 release 观察已交付或已读取的指标。如果消息停止，请在重新send处理重复项之前检查connectivity status。

#### 12.9 确认直接或中继辅助送达

成功的 delivery 显示在 thread 中的肯定确认或审核“chat.message” allow row。Relay辅助的path使用从`relay.lookup`学习到的`/p2p-circle`地址；direct LAN paths 跳过中继跃点。使用“--include-p2p-trace”进行 CLI 审核有助于确认测试期间使用了哪个 path。

#### 12.10 配对故障排除

验证两个节点都在运行，防火墙 allow outbound TCP 以及配置文件 paths 在 UI 和 CLI 之间匹配。对于 WAN 测试，确认 bootstrap 中继 multiaddr 并运行 `connectivity-status`。Retry 在 restarts 之后使用新复制的 listening multiaddrs，因为动态 ports 发生了变化。

#### 12.11 捆绑的赞助联系人

A packaged desktop build (DMG / `.exe` / `.AppImage`) auto-bonds to the project's sponsor contact on first launch using the bundled `bundled-sponsor-friend.json`, so you start with one working contact out of the box. This is a convenience, not telemetry: no data leaves your node, and the bond is a normal local trust record you can edit or remove like any other contact. Operators preparing fleet images can disable the auto-bond by setting `{"enabled": false}` in the bundled file before packaging.


### 13. 连接 EnvoyGo

#### 13.1 EnvoyGo 如何与家庭节点配合工作

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 780 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:780px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="340" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">EnvoyGo (phone)</text><rect x="40" y="40" width="300" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="190.0" y="52.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Pairing tokens only</text><text x="190.0" y="68.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">no owner private keys</text><rect x="40" y="80" width="300" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="190.0" y="92.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">HomeRemote JSON-RPC</text><text x="190.0" y="108.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">read-only mirror</text><rect x="40" y="120" width="300" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="190.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Native WebRTC + CallKit</text><text x="190.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">voice calls (Phase 42I)</text><rect x="400" y="10" width="360" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="408" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Home Node (computer)</text><rect x="420" y="40" width="320" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="580.0" y="52.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Owner identity + keys</text><text x="580.0" y="68.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 root</text><rect x="420" y="80" width="320" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="580.0" y="92.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault + Library + Agent</text><text x="580.0" y="108.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">full mesh features</text><rect x="420" y="120" width="320" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="580.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Orchestration</text><text x="580.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Team jobs · approvals</text><path d="M360,55 L420,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">QR pair</text><path d="M420,75 L360,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">signed responses</text><text x="40" y="215" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Keys, vault, and agent runtime never leave the home node. The phone is a remote control.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 12 — EnvoyGo thin-client pairing: the phone holds only pairing tokens and calls the home node via JSON-RPC. Identity, vault, agent, and orchestration stay on the home node.</figcaption></figure>


EnvoyGo 连接到配对的主节点，并通过移动界面呈现选定的 Node 服务功能。主节点保留网格 identity、代理 runtime、Vault 和 orchestration 的责任。

#### 13.2 配对移动应用

安装EnvoyGo，点击与Home配对，然后扫描桌面节点上Social中显示的QR code（或输入配对payload您的release document）。如果 Pairing 队列中出现提示，请批准主节点上的 device。该应用程序将配对 token 存储在安全的 storage 中，而不是 owner private key 中。

#### 13.3 确认家庭连接

配对后，连接指示器应显示可到达家庭并加载您的聊天列表。如果 thread 保持为空，则拉动刷新或打开 Me → Node status。确保桌面节点在您期望的网络 path（LAN、中继隧道或 configured remote URL）上保持运行并可访问。

#### 13.4 使用聊天和联系人

聊天和人员选项卡 mirror 主节点 thread 以及具有移动布局的绑定联系人。发送消息通过 HomeRemote JSON-RPC 路由到主节点，主节点在网格上进行签名和传递。媒体和音频消息 follow 与 path 相同。

#### 13.5 使用远程终端

从 Terminal 开始，将一个由家庭 policy 编辑的 allow 附加到现有的 session 或 start 上。输入通过隧道终端协议传输；输出流通过回滚返回。在确认 transport encryption 和 home reachability 之前，请避免在不受信任的网络上执行敏感命令。

#### 13.6 查看团队任务

我 → Agent 网络显示 read-only 最近从主节点进行的团队作业 activity sync。您可以检查 status 和 report，但无法仅通过移动设备编排新作业 - 通过与代理进行桌面聊天来安排 start 作业。即使日志使用旧的内部术语，UI 也会显示 Team jobs。

#### 13.7 浏览网络内容

EnvoyGo Browser (Phase 45C) 通过配对主服务打开`envoy://` content。可用性取决于主节点是否可达以及 requested 作者或 content 是否被绑定 policy 允许。

#### 13.8 接收通知

当 APNs 或 FCM 为 configured 时，EnvoyGo 可以 receive 正常且与呼叫相关的 notifications。iOS backgrounded 调用使​​用 VoIP Push + CallKit (Phase 42I) 和操作系统 grants permission。交付ry 仍尽力而为，并受到平台 background 限制的影响。

#### 13.9 拨打和接听语音通话

Available 移动呼叫支持port 涵盖具有本机 WebRTC 和平台呼叫集成的一对一语音呼叫。iOS 发货 VoIP 推送 + CallKit（Phase 42I，于 2026 年 6 月 19 日发货），因此 background 的手机可以 receive 通话；real-device 验证仍然开放。视频通话尚不可用（请参阅§18.10 和附录 J.4）。当两个对等方都位于限制性 NAT 后面时，跨网络音频可能需要 TURN。

#### 13.10 撤销丢失的手机

从主节点，revoke EnvoyGo device 或 session 配对以及 rotate 任何暴露的 token。如果您稍后恢复手机并需要干净的 re-pair，请删除 EnvoyGo 中的节点 entry。对待丢失的未锁定手机，就像对待家里 API 丢失的 session 一样。

#### 13.11 当前移动限制

EnvoyGo 不运行 full 网格节点，编排 Team jobs、edit 所有设置，或替换主节点 Vault 创作。视频通话、full Browser 奇偶性和 background 可靠性 vary（由操作系统 permissions 提供）。请参阅 release notes，了解 build 上的确切功能 matrix。


### 14. 首日教程

#### 14.1 发送私密消息

Bond 联系人（第 12 章），打开其 thread，输入一条短信，然后 send。确认 delivery 指标 updates。如果失败，请打开 Home status 并在 retrying 之前验证网格 connectivity 一次。

#### 14.2 创建群组对话

从 Conversations 中，选择新建 Group，选择绑定联系人，为组命名，然后 send 一条问候消息。每个成员 receives 组 envelopes 由您的节点签名。如果您的 release 暴露了它，请稍后从 settings 组中调整 membership 。

#### 14.3 发送语音消息

在聊天中，点击 microphone 控件，录制一个简短的剪辑，然后点击 send。音频位于签名聊天 envelope 中，并为收件人播放 inline。当操作系统在桌面或 EnvoyGo 上提示时，授予 microphone permission 。

#### 14.4 进行语音通话

通过 direct 信任联系人，从 thread 标头进行 start 语音呼叫。在 device 接听来电；media 在网状信令之后流 peer-to-peer。如果连接在严格的 NAT、configure TURN 后面失败，则作为 release 的 documented。

#### 14.5 共享文件

根据 sensitivity 规则，在聊天中使用 attachment 控件或使用 Library/Vault 中的 share 控件。文件作为数据 intent 传输，并通过 policy 检查 path 和 trust tier。确认收件人看到 attachment 和 audit log 以及 allow outcome。

#### 14.6 向 EnvoyAI 提问

打开您的代理 thread 或主要助理 ry 点，并根据您的 Vault 或 public 知识提出一个可回答的事实问题。EnvoyAI 在节点网关上运行 locally，除非您以不同方式路由引擎。如果代理 request 批准敏感工具调用，则拒绝或细化。

#### 14.7 向您的库添加知识

打开Library→新建笔记，写入Markdown，设置sensitivity，然后保存。索引会在 RAG 期间自动运行。如果您 enabled plugin 并且想要外部 editing，则可以选择在 Obsidian 中打开保险库 folder。

#### 14.8 搜索您的保险库

Use Library search or ask EnvoyAI to search local knowledge with explicit scope. CLI users can run `npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "your terms"`. Results respect sensitivity labels and your role on the node.

#### 14.9 向绑定的智能体请求知识

向联系人的客服人员发送消息或 send 知识查询 ry，其中 UI 支持 port，并保持在 trust tier 范围内。公共层查询的速率限制为 stranger；direct 债券 allow 范围更丰富。预计会向其代理 identity 签署签名回复（attributable）。

#### 14.10 审批敏感操作

当代理或任务触发 policy 时，审批卡会在 Approval 秒内出现。在 allow 之前阅读 summary、correlation ID 和 request 操作。如果范围超出您对该 session 的预期范围，请拒绝。

#### 14.11 启动简单的团队任务

在与您的代理聊天时，描述一个小的多步骤目标，该目标可以委托给绑定同行的代理（例如总结然后翻译）。确认 Agent 网络 membership 双方均已开启。在外部共享之前，重新view 重新port 计划、预算上限和最终团队工作。

#### 14.12 连接外部智能体

在设置 → AI → Ext Agent 中，选择 HomeClaw、Hermes 或自定义，然后指向 local HTTP endpoint（默认情况下，HomeClaw 为“http://127.0.0.1:8010/message”）。启动外部进程，enable 桥接器，并向桥接代理对等点发送 send 测试聊天消息。在启用自动化之前，验证回调是否到达 configured listen port。


---

## 第三部分 — 人员、资料和对话

### 15. 联系人和绑定

#### 15.1 查看和搜索联系人

打开 Social 中的 **People** 或 EnvoyGo 至 browse 绑定的 owner 和 pending introduction 中的 Contact 选项卡。按 display name 或 owner ID 片段搜索；结果尊重您的 local 信任存储，因此 blocked 联系人保持隐藏状态，除非您明确显示它们。EnvoyGo 通过 HomeRemote 列出相同的联系人 JSON-RPC — 它不在手机上维护单独的联系人数据库。

#### 15.2 了解联系人身份

每个联系人都映射到由 Ed25519 密钥支持的 **owner identity** (`envoy:owner:…`)，而不是中央帐户句柄。运行时消息使用从密钥派生的对等 ID；在升级信任之前，将 owner ID 与任何带外 proof 进行比较。QR 配对（第 13 章）在相同的 owner 下添加 **device** 身份 - 它不会取代 owner 到 owner 键。

#### 15.3 联系人资料和照片

Profile 卡片显示 display name、description 和 photo 是债券 policy 内的联系人 publish。照片以签名的个人资料或文件 payloads 形式送达；referred 和 public 层看到的字段可能少于 direct friends。点击 photo 至 view full 尺寸；不要将 gallery thumbnail 视为自行验证的 identity proof。

#### 15.4 在线、离线和连接状态

存在反映了网格 reachability，而不是云“online”标志。联系人返回时可能会显示 offline，而中继辅助 delivery 则显示消息 queue。EnvoyGo 与 remote 同行 reachability 分开显示家庭 connectivity — 即使联系人不在，您的手机也可以 online 到家。

#### 15.5 直接、推荐、公开和阻止信任

EnvoyMesh 对联系人使用四个用户选择table 层 - **blocked**（全部 deny）、**public**（仅限 stranger — ping 和 narrow discovery）、**referred**（引入 — 有限的知识和批准）和 **direct**（朋友 - 更丰富的聊天、文件和代理工作流程，最多 friends sensitivity）。Tier 存储在您的节点上 locally；双方可以为对方设置不同的等级。

#### 15.6 更改联系人的信任等级

在 Social → **Trust**（或同等设置）中打开联系人，然后选择 blocked、public、referred 或 direct。新操作的降级将于 mediately 生效；已交付的 content 保留在 local history 中，直到您 delete 为止。记录您更改等级的原因 — 如果您稍后再次发生view 事件，请审核row 的帮助。

#### 15.7 推荐或介绍联系人

使用 **介绍** 或将 request 流程绑定到 vouch，为 referred 层级的人员提供 grant direct 信任您的self。介绍 carry 签署了 proof 文本，以便收件人可以验证 out of band。被推荐的联系人不能recruit 将您的代理转入Team jobs，除非您故意upgrade 他们。

#### 15.8 静音、阻止或移除联系人

**静音** 抑制 notification local 而不更改 bond tier。**阻止** 设置 blocked 信任并阻止新的 inbound intent。**删除** 会清除 local thread metadata 但不会从网络中删除它们的密钥 — 仅在您与 renewed 联系人感到舒适后才能重新添加。

#### 15.9 恢复连接

要在 block 或意外删除后重新连接，请将新的 bond request 或 introduction 与 updated proof 文本交换。如果您revoked他们的等级，他们必须accept一个新的request；stale thread 可能不会自动 resume。在恢复 direct 信任或共享文件之前再次验证 identity。

#### 15.10 联系人隐私和披露设置

Profile 和联系人 settings 控制您从其他人处获得的 publish 和 request 内容：显示字段、photo visibility 和 sensitivity label 上的 shared 知识。public 级 view 员工的默认值偏保守；direct 联系人会看到更丰富的个人资料切片。更改将在下一个签名的配置文件 update 上传播，而不是追溯至旧的 screen 镜头。


### 16. 私密消息

#### 16.1 开始对话

在 **人员** 中，打开 direct 联系人或在 **聊天** 下选择现有的 thread。新对话至少需要 public 层 reachability 和成功的联系或 introduction path。Group room 使用单独的创建流程（第 17 章）；在您 send 收到第一条消息之前，请勿假设 DM thread 存在于 every 联系人中。

#### 16.2 人与人消息

私人聊天使用“chat.message” intent 以及 **人类** sender 和 **人类** 接收者角色 - 客服人员无法模拟此 path。消息通过 libp2p direct 或中继辅助的 path 进行签名 envelope 传送。在 Social 或 EnvoyGo 中撰写；使用移动设备时，代表您的主节点标志和 sends。

#### 16.3 人与智能体消息

与 **@envoy** 或您的 configured 代理名称交谈通过支持代理的聊天流，而不是“chat.message”人与人之间的语义。Agent 回复可以调用授权和保证 policy 下的工具。将面向 owner 的指令与同行 DM 分开，这样您就不会意外地与联系人 thread 建立 share 私有上下文。

#### 16.4 回复和对话连续性

通过 thread metadata 和 audit log 中的 correlation ID 回复引用之前的消息。在-thread 中引用或回复以保留上下文；resending 相同的文本会创建重复的 envelope。当长 DM splits 跨越 sessions 时，搜索 (16.7) 有助于定位较早的回合。

#### 16.5 消息送达状态

当您的 build 公开它们时，传递 ry 指标会反映 local send 确认和 remote acceptance，而不是 read receipt，除非明确支持 port。失败的 send 显示 policy 或 connectivity 错误；阅读“chat.message” deny 与 transport timeout 的审核。当消息仍然是 pending 时，避免快速重复 send。

#### 16.6 离线行为和重试

当联系人为 offline 时，主节点 queue 签署协议和 policy allow 的消息，并在重新连接时重试 direct 或中继 path。大量积压订单可能不符合严格的 UI 顺序，但仍由 signature 检查 integrity。EnvoyGo offline 到 **home** 会阻止任何 send 直到隧道 restore。

#### 16.7 搜索对话历史

使用应用内 search 或 Vault 相邻对话 indexes where enabled 查找 keyword 或联系人的文本。结果来自主节点上 locally 存储的副本；移动 search 通过 JSON-RPC 查询主页。敏感 thread 仅在与该节点配对的 device 上保持可见。

#### 16.8 草稿辅助

草稿 assistance（当 enabled 时）建议通过具有语义防火墙限制的 configured 模型来完成，但 auto-send 则不然。在 sending 之前重新view 建议文本；与 thread 联系的代理协助的 draft 仍然遵守 bond tier 和 sensitivity。如果您只喜欢 manual 组合，请在“设置”中禁用 assistance。

#### 16.9 管理对话数据

例如来自主节点上 thread 菜单或配置文件维护工具的 port、archive 或 delete 对话数据。除非产品具有明确 requests remote 撤回功能，否则删除对您的商店而言是 local — 对于已交付的同行副本，不保证这样做。在批量 purge 之前备份（第 89 章）。

#### 16.10 消息隐私和安全

消息从协商的 libp2p 继承 transport encryption ；授权仍然取决于 signature 和债券 policy，而不是单独的 TLS。请勿在与 referred 或 public 联系人的聊天中透露 paste 秘密。通过 block 层重新port abuse 并保留审计 correlation ID（如果您 escalate）。


### 17. 群组对话

#### 17.1 创建群组

在 Social 中，选择 **新组**（或房间）并将其命名为 room。初始成员必须是您在当前信任下可以联系到的联系人，通常为 direct 或 referred depending（于 policy）。创建节点存储membership locally；新成员 receive 通过网格 delivery 签署了 invite。

#### 17.2 邀请成员

从您的绑定联系人列表中添加成员；如果没有 introduction path，则不能 invite blocked owners 或 strangers。每个 invite 都是一个带符号的 membership intent；pending 成员会出现直到 accept。大团体会增加 fan-out latency — 更喜欢集中精力的 room 进行时间敏感的协调。

#### 17.3 发送群组消息

Group 消息使用 room 范围内的聊天 intent 与人类 send 人；delivery 扇出到 online 成员，queue 扇出到 offline 成员，其中 port 已完成。@提及并回复 follow 与 room 上下文中的 DM 相同的 threading 规则。配对后，EnvoyGo group chat mirror 回家 thread。

#### 17.4 管理成员

拥有 admin 权限（根据您的 build）的所有者可以添加或 remove 成员并重命名 room。删除某人会停止向他们发送新邮件，但不会删除其节点上的 history 。故意轮换 admin — 受损的 admin device 可能会 invite 不需要的成员。

#### 17.5 离开群组

选择**离开群组**停止接收新消息；您过去的副本将保留在您的节点上，直到您 delete 为止。其他成员继续room。如果 membership 不是自动 restored，则重新加入需要新的 invite。

#### 17.6 群组信任边界

Group visibility 不会绕过每个成员的信任：referred 成员仍然无法访问 room 之外的 send 的仅 direct 文件 share。敏感 attachment 应使用显式 sensitivity label。请勿将 membership 组视为与 every 参与者共同的 direct friendship。

#### 17.7 群组送达和离线成员

离线成员重新连接时 receive queued room 消息；订购可能会在 catch-up 期间批量进行。如果许多成员都落后于仅中继的 path，则预期会延迟 delivery 指标。在假设 room 损坏之前，先检查一下 connectivity 。

#### 17.8 群组故障排除

如果消息停滞，请验证每个成员的 bond tier、家庭 reachability 和中继预订。Audit rows tagged 与 room correlation ID 显示 deny 与 timeout。分裂 troubleshooting：policy 否认需要信任改变；transport 失败需要 connectivity 工作（第 91 章）。


### 18. 音频和语音通话

#### 18.1 Record and send an audio message

在 DM 或组 thread 中按住 microphone 控件可录制简短的音频剪辑；附加 release 和 send。音频与其他 attachment 一样使用相同的签名文件/消息 path ，并由 inbound 防护强制执行大小上限。首选 referred 联系人使用文本，除非他们希望使用语音 note。

#### 18.2 Play and manage audio attachments

点击音频气泡即可播放；长按进行保存或 delete locally 所在地方supported。在 device 上播放解码；very 长剪辑可能会在 send 时间进行 reject 编辑。如果 attachment 累计，则在对话 settings 下管理 storage。

#### 18.3 Start a voice call

在 Social 或 EnvoyGo 上的绑定 direct thread 中通过呼叫按钮发起 **语音呼叫**。呼叫通过主节点信令在对等点之间协商 WebRTC 音频；video 在当前 build 中不可用。双方都需要 microphone permission 和可到达的网格或中继 path。

#### 18.4 Answer or decline a call

来电显示为应用内横幅，并且在 EnvoyGo 上，在 configured 时显示平台呼叫 UI。拒绝 send 签名的 reject；答案建立了 WebRTC session。如果 policy 正在工作，未知或 blocked 联系人不应到达通话 UI - 如果通话意外出现，请验证 trust tier。

#### 18.5 Call status and controls

通话控制包括mute、扬声器路由和挂断；status 显示连接、活动或失败的阶段。挂断的呼叫可能会重拨ry manually — 没有隐藏的自动重拨。如果您遇到 port 持续失败，请在审核中注意 correlation IDs。

#### 18.6 Background calls and mobile notifications

当push为configured时，EnvoyGo可以通过APNs/FCM调用notifications；background 行为取决于操作系统策略。让应用程序与家庭和 allow notification permission 配对，以获得可靠的响铃。Desktop Social 可以使用 local notification，无需移动推送。

#### 18.7 STUN and TURN connectivity

WebRTC 首先尝试 direct UDP，然后是 STUN，然后当两个对等方都位于对称 NAT 后面时，尝试 configured TURN。如果呼叫已连接但没有音频，请在“设置”中使用figure TURN。Relay libp2p path 汽车ry 信号发送—不能替代TURN media 继电器。

#### 18.8 Call privacy

每个产品 Voice call 至少需要 direct 或 referred 信任 policy；blocked 联系人无法发起呼叫。审核中出现呼叫 metadata；当 WebRTC 成功时，media 保持 peer-to-peer 状态。不要按计划进行 share screen 或 video—video 通话 (18.10)。

#### 18.9 Voice-call troubleshooting

如果呼叫无法连接，请检查 microphone permissions、TURN settings、bond tier 和 `connectivity-status`。单向音频通常意味着 NAT 或防火墙 blocking UDP。首先测试 LAN direct path，然后在打开广泛的防火墙规则之前中继辅助 WAN。

#### 18.10 Video calls — planned, not currently available

**Planned.** 现已提供一对一音频通话（§18.3）；video 调用在架构上是预期的，但未在当前 release 中提供。请参阅附录 J.4 了解路线图边界ary。


### 19. Files, Photos, and Profile Sharing

#### 19.1 Share a file

在 trust tier 的 DM 或群组 allow 中使用 attachment 或 **共享文件** 操作。文件 chunk 并通过 integrity 检查进行传输；direct friends 通常具有最广泛的限制。清楚地命名文件 - 收件人在 accepting 之前看到文件名。

#### 19.2 Accept or decline an incoming share

传入的 share 提示 accept 或在写入 Vault 或每个 sensitivity 的下载之前拒绝。拒绝的传输不会部分写入；accepted 文件位于 policy 范围的 storage 中。在移动设备上，acceptance 可能需要家庭 online 才能完成。

#### 19.3 Check transfer progress

进度条反映传输 voucher path 上确认的字节；进度停滞通常意味着 connectivity 中途损失。等待 retry 或取消并重新send 较小的文件。Audit 可以记录部分传输，而不在日志正文中存储不完整的秘密。

#### 19.4 Verify file integrity

当 build 暴露时，比较显示的 hash 或大小 metadata；signatures 证明 sender identity，而不是该文件是良性的。在打开之前扫描不熟悉的二进制文件 locally。如果完成后 hash 与 report 不匹配，则重新send。

#### 19.5 Share profile photos

将个人资料 photos 到 Profile → 加勒ry → publish 或 send 分享给联系人。已发布的 photo 服从 visibility 层；direct share 像其他 media 一样附加到 thread。EnvoyGo 显示通过主页获取的 photo — editing gallery 主要是桌面 Social 流程。

#### 19.6 Manage your profile gallery

在主节点上维护有序的 gallery 槽；在它们在下一个配置文件 sync 中传播之前重新排序或 remove image。删除 gallery image 会停止将来的提取，但不会停止联系人已保存的副本。如果您使用 public discovery，请为 referred view 人保留至少一个中立的 avatar。

#### 19.7 Choose visibility and sensitivity

使用与 Vault 约定匹配的 sensitivity 标记 shares（`public` / `friends` / `trusted` / `private`）。UI 为最常见的选择提供了更友好的 label；policy 引擎尊重所有四个等级。下层联系人在收到时不能 escalate sensitivity — bond engine 否认不兼容的 request。默认为 friends 或私有 document 并包含个人数据。

#### 19.8 Remove shared content

从 thread attachment 或 Vault path 中删除 local 份；remote 同行可以保留其 accept 版本的副本，除非您的 build 中存在撤回功能。Profile photo 删除 update 您在下一个 publish 签署的个人资料。对于事件，block 联系人和 revoke 信任（第 87 章）。

#### 19.9 Troubleshoot file transfers

对于卡住的传输，请验证 trust tier、文件大小限制、主目录 Vault 上的磁盘空间和中继 reachability。在 stable 网络上使用 Retry，使用较小的测试文件来隔离 policy 与 transport。在共享诊断之前收集审核 correlation ID（第 91 章）。


### 20. Profiles and Presence

#### 20.1 Edit your human profile

编辑 Social 中的 **Profile → Human** 以设置 display name、bio 和 published 字段。更改序列化到存储在主节点上的签名人类配置文件 payload 中。EnvoyGo 显示结果 read-only，除非您的 release 添加了移动 edit。

#### 20.2 Edit your agent profile

Agent 配置文件描述了向同行公开的功能（工具、团队工作角色、A2A 卡字段）。在 Profile → Agent 或 Agent 网络 settings 下编辑；owner 授权限制了代理可以宣传的内容。误导性的能力文本不会 grant 额外 permissions — 联系 policy 仍然会限制操作。

#### 20.3 Display names and descriptions

显示名称是装饰性的；授权使用 owner 和对等 ID。保持 description 简洁 - public 层 view 可能会看到缩短的字段。避免在 public bio 文本中嵌入机密或 recovery 代码。

#### 20.4 Profile photos and galleries

人员和代理配置文件可以各自包含ry photo 画廊，并具有层级感知visibility。上传到桌面Social；sync 传播到配置文件获取时的联系人。大的 image 可能会缩小以遵守大小限制。

#### 20.5 Identity details and DIDs

配置文件详细信息窗格显示相关的 owner DID、device ID，以及 verification 的 fingerprint 样式 hashes。在确认 identity 时分享这些 out of band — 不要仅信任聊天中未经请求的 ID。QR 配对编码 device 配对 payload，而不是 owner DID 替换。

#### 20.6 What bonded contacts can see

Direct 联系人会看到您的 policy publish 最丰富的个人资料切片；referred 联系人看到的字段减少了；如果暴露，public stranger 只能看到 public-sensitivity profile data。被阻止的联系人看不到您的任何新内容。在启用 discovery 功能之前重新view **Profile visibility** settings。

#### 20.7 Profile synchronization

Profile updates 推送已签名的 publish 事件；联系人在下次获取或 thread 打开时刷新。没有全局云配置文件 CDN — 同行在与您的节点通信时会了解更改。密钥轮换后，重新publish 配置文件，以便 fingerprint 匹配。

#### 20.8 Privacy defaults

初始 privacy 默认支持 minimal public 暴露：保守 photo visibility、friends 级别聊天 history 在家里，以及代理工具 disabled 直到强制执行。在加入 discovery 主题之前，Review 默认位于 install 之后。重置 path 位于“设置”→“隐私”（如果有）。


---

## Part IV — Your Personal AI

### 21. Meet EnvoyAI

#### 21.1 What EnvoyAI is

EnvoyAI 是主节点上面向 owner 的助手，由 bundled OpenClaw runtime 提供支持。您可以在聊天中通过 Social、EnvoyGo 或“@envoy”与其交谈；它计划通过 EnvoyMesh policy 进行回复并调用网格工具，而不是获取原始 libp2p 访问权限。将其视为留在安全边界内的大脑ry，而节点处理identity、债券和审计。

#### 21.2 OpenClaw as the bundled agent runtime

OpenClaw 作为节点 start 的子进程运行并进行监督。默认情况下，其网关 listen 在 port `18789` 上 (`http://127.0.0.1:18789/webhook/envoymesh`)。EnvoyMesh 传递每个助理回合 session 上下文（债券、兴趣和工具目录），并且 OpenClaw 拥有跨 session 的多回合推理和持久 memory。

#### 21.3 How EnvoyAI differs from the external-agent bridge

EnvoyAI 是 in-process，具有 full ToolRegistry 访问权限。外部代理桥（默认 port `3031`）是到 HomeClaw、Hermes、OpenHuman 或另一个进程中的自定义代理的可选 HTTP 管道。您可以运行两个引擎（“两个”模式）或单独运行其中一个；网桥代理永远不会 receive 您的 libp2p 密钥。

#### 21.4 What EnvoyAI can access

EnvoyAI 在 sensitivity label 内读取您的 local 金库和 Library，通过 knowledge.query` 查询绑定对等，并在 Knowledge Base settings allow 时使用聊天 RAG。它无法绕过 bond tiers：strangers 保持速率限制，并且私人材料需要 direct 信任或 owner 批准。在启用自动回复之前，请在设置 → AI → Knowledge 基本和每个联系人 preferences 下配置 figure 上限。

#### 21.5 Mesh tools available to EnvoyAI

在 startup 节点 export 上有一个到 OpenClaw 的工具目录 — 聊天 send、library 读取/发现、任务提议、发现 ry、批准、触发器、MCP 代理等。每个工具都声明了 sensitivity 上限以及执行前是否需要 owner 批准。EnvoyAI 按名称选择工具；EnvoyMesh 强制执行 policy 并为 every 调用编写审核 row 。

#### 21.6 Policy and approval controls

Bond 引擎决策、任务限制和批准 queue 位于 EnvoyAI 和网格之间。出站聊天、文件 share、云模型调用和高 sensitivity 库会为您的 review 读取 queue ，除非自治 policy 显式 allow 对其进行读取。在“设置”中翻转“autonomousKillSwitch”以暂停所有自主操作，并强制批准 every 代理本应默默完成的事情。

#### 21.7 Start, stop, and inspect the agent

打开设置 → AI → AI 引擎，查看 OpenClaw status：enabled 标志、运行状态、PID 以及网关失败时的最后一个错误。使用 **Restart OpenClaw** 进行干净的子进程回收，而无需重新start整个节点。关闭“openclawEnabled”会停止网关 immediately 并防止在下一个节点 start 上生成——当 debugging port 在“18789”上发生冲突时很有用。

#### 21.8 Current limitations

为了提高速度，聊天 draft 和轻量级自动回复仍然通过 EnvoyMesh 的本机 model router 进行路由；当网关关闭时，复杂的助手会转到 OpenClaw，并回退到本机。完整的 chat-history 注入 OpenClaw 上下文和一回合内的多轮工具循环仍然是部分的 - session memory 有效，但最近的 thread 文本可能并不总是附加。Terminal Agent 模式使用本机模型 directly，而不是 OpenClaw exec。


### 22. AI Engine Modes

#### 22.1 Built-in only

**仅限内置**（“仅限 openclaw”）是新 install 上的默认设置：“openclawEnabled”打开，“bridgeEnabled”关闭。EnvoyAI 处理助手聊天、工具执行和 session memory；`3031` 上没有外部 HTTP 代理 listens。当您需要一个 bundled runtime 并且不需要第二个代理进程时，请选择此选项。

#### 22.2 Built-in plus external agent

**Built-in plus external** (`both`) runs EnvoyAI and the bridge together. Mesh traffic from bonded contacts can reach the bridge agent while you still use OpenClaw for `@envoy` and Settings → AI workflows. Enable `bridgeEnabled`, pick an active external agent in `bridge-config.json`, and confirm both status chips in the header before relying on either path.

#### 22.3 External agent only

**仅外部代理**（仅外部）disables OpenClaw 网关（`openclawEnabled: false`），但保持网桥处于活动状态。所有桥接聊天和网格工具调用都通过外部代理的 HTTP endpoint；__学期_1__ 助理轮流不可用。当 HomeClaw 或 Hermes 是您的主要 ry 大脑并且您只需要 EnvoyMesh 来处理 connectivity 和 policy 时，请使用此选项。

#### 22.4 No AI

**无 AI**（“关闭”）会关闭两个引擎。该节点仍路由人工聊天和 policy，但不运行模型 draft、自动回复或代理工具。对于气隙节点、CI 装置或当您需要没有任何 LLM 曲面的网格 connectivity 时，请选择此选项。

#### 22.5 Choose the right mode

对于最简单的 path，从**仅内置**开始。当您已经运行 HomeClaw/Hermes 并需要其 plugins 或 memory 模型时，添加 **external**。仅当您故意需要两个代理时才使用**两者**，否则请选择一个大脑以避免重复回复。单独测试 connectivity 时，暂时切换到 **off** 而不是 uninstalling。

#### 22.6 Change the active external agent

External agents are defined in `bridge-config.json` under `extAgents`; set `activeExtAgentId` to the entry you want. Each definition includes display name, base URL, bearer token, and capability flags. After editing, restart the node or reload bridge config so the new destination binds to port `3031` (or your configured `bridgeListenPort`).

#### 22.7 Startup settings versus runtime settings

`openclawEnabled` and `bridgeEnabled` are persisted in `node-config.json` and take effect on node start—or immediately stop a running gateway when flipped off. Runtime status (`getOpenClawStatus`, `getBridgeStatus`) shows whether child processes are actually healthy, which can lag config during startup. Model provider mode, AI rules, and contact preferences also persist to `node-config.json` and apply on the next agent turn without restart.

#### 22.8 Diagnose agent availability

如果 EnvoyAI 显示 **Stopped**，请读取 OpenClaw status 面板上的 `lastError` — 常见原因是 port `18789` 正在使用、缺少 OpenClaw binary 或重复的看门狗 restart 失败。对于桥接器，验证环回 reachability、承载 token 匹配，并且恰好选择了一个活动代理。CLI 帮助程序包括 connectivity status；Social的标题徽章mirror与设置→AI→AI引擎的有效模式相同。


### 23. Models and Providers

#### 23.1 Model routing overview

EnvoyMesh 使用两层：**本机路由器** (`@envoymesh/models`) 提供聊天 draft、自动回复、终端辅助和团队作业规划；**OpenClaw** 使用其自己的 LLM 配置为 Assistant/`@envoy` 提供服务。本机路由遵循 semantic firewall （空提示 rejected、48K 字符上限、控制字符过滤器）。当 OpenClaw 不可用时，助理 request 会退回到您 configured 的本地提供商。

#### 23.2 Configure a local model

Set provider mode to **ollama** in Settings → AI → Model (or `node-config.json`). Point `endpoint` at `http://127.0.0.1:11434/v1` and set `modelName` to your pulled tag (for example `llama3.1`). Local calls skip cloud approval gates and keep prompts on your machine—ideal for drafts and sensitive vault context.

#### 23.3 Configure a remote provider

使用 **openai 兼容** 或 **anthropic 兼容** 模式以及供应商基础 URL 和 `apiKey`。将 `modelName` 设置为 remote 模型 ID。保留“requireApprovalForCloud: true”（默认），以便非 public 上下文在 request 离开节点之前触发批准项目。

#### 23.4 Configure LiteLLM

**litellm** 模式针对 LiteLLM 代理（通常为 `http://127.0.0.1:4000/v1`），该代理扇出到许多后端。将“modelName”设置为 LiteLLM 路由名称，并根据需要提供代理 API 键。当一个主节点应该切换 models 而无需 editing EnvoyMesh 配置时，这是一种灵活的选择。

#### 23.5 Choose a default model

选择一种用于聊天 drafts 和自动回复的本机模型；OpenClaw 在 OpenClaw settings 中单独管理自己的模型。如果您进行 split 配置，请为 draft 首选快速、廉价的模型，为 Assistant 首选更强大的模型（local 或代理）。在配置文件自述文件中记录您的选择，以便新计算机上的 restores 保持一致。

#### 23.6 Configure fallback behavior

当本机模式为 **disabled** 时，drafts 和辅助功能将返回错误而不是调用模型。当 OpenClaw 关闭时，Assistant 会自动降级到本机提供程序。对于 LiteLLM 或云 endpoint，验证 LiteLLM 内的回退路由 itself—EnvoyMesh 不会在一个 request 中链接多个本机提供程序。

#### 23.7 Context-window considerations

大型库 RAG 注入和长团队作业提示会快速消耗上下文。对于本机调用，semantic firewall 将提示大小限制为 48K 字符。当您看到截断的答案时，修剪 Knowledge 基础 `maxChunks` 或降低每个联系人的联合上限。OpenClaw session memory 是独立的 — ry 长助理 thread 可能需要 manual session 重置。

#### 23.8 Provider privacy

**模拟**模式从不调用外部网络——对于测试很有用。**ollama** 和 local LiteLLM 在 LAN 上保留字节。云模式 send 向 configured 供应商提示文本；与 sensitivity labels 和 `requireApprovalForCloud` 配对，以便私有 notes 在未经明确同意的情况下不会离开。OpenClaw 自己的模型调用 follow OpenClaw 配置，而不是本机路由器。

#### 23.9 Cost controls

Team jobs 和竞争性奖励模式跟踪任务支出；设置“maxCost”并在链默认值下重新平衡策略。对于聊天，首选 local models 进行大量自动回复，并预留云 models 以便偶尔轮流使用助理。启用 auto-send 规则后重新view 相关云调用的活动。

#### 23.10 Troubleshoot model calls

空或 rejected 提示通常意味着语义防火墙验证失败 - 检查控制字符或过长的长度。Ollama/LiteLLM 上的连接错误指向错误的“endpoint”或停止的服务。持续的云拒绝通常意味着批准是pending：在retrying之前打开Approvals。暂时将模式设置为 **mock** 以确认代理循环在没有外部依赖项的情况下运行。


### 24. Agent Style, Mode, and Contact Behavior

#### 24.1 Agent communication style

在“设置”→“人工智能”→“身份”下，选择“透明”（默认）、“不可见”或“防御性”演示。作为人工智能公开透明回复；不可见的 drafts 就像您键入它们一样（仍然在网络上以代理角色签名）；当您出现offline时，防御性充当守门人。可选的 `debugPrefixInMessageText` 仅在日志中添加前缀 - Social 将其隐藏在 UI 中。

#### 24.2 Agent operating modes

全局默认值位于 `aiSettings.defaultModeForNewContacts` 中：**manual**（仅 draft）、**助理**（建议 + 确认）或 **自动**（send 当 policy allows 时）。在线/offline 行为是单独控制的：`onlineAssistantEnabled` 在您处于活动状态时保持 suggestion ；`offlineAgentEnabled` 允许在节点认为您离开时自动回复。如果自动 presence 检测误读了您的日程安排，请将 `statusMode` 设置为 manual。

#### 24.3 Per-contact modes

每个联系人都可以使用“aiAccessLevel”覆盖全局默认值：**none**、**assistant_only** 或 **full**。该同伴的无 blocks AI 参与；Assistant_only allows drafts 和门控 sends；full enable 更丰富的自动化，包括规则触发器。从联系详细信息表或在代理协助的 setup 期间通过“mesh.set-contact-mode”设置这些内容。

#### 24.4 Per-contact disclosure rules

“knowledgeAccess”限制代理可以为联系人引用的保管库材料（“public”、“friends”、“受信任”或“私人”）。可选的 `syndicateMaxSensitivity` 会收紧您联合给该同行的 inbound 答案。`disclosure` settings（徽章、折叠对等代理联系）仅是 local UI — 它们不会更改线路 payload。在启用 auto-send 之前将 disclosure 与 trust tier 对齐。

#### 24.5 Social proxy behavior

**Social 代理**（需要 Trust 模式）让 EnvoyAI mediate 在签署的授权下进行介绍和常设社交工作流程。仅在启用“trustModeEnabled”且您拥有 configured 授权 ID 后才启用“socialProxyEnabled”。编排器遵循“autonomousKillSwitch”——当终止开关打开时，即使设置了功能标志，代理也会传递停止。

#### 24.6 Proactive check-ins

主动行为结合了人工智能规则、触发器和朋友自动驾驶仪（“friendAutopilotEnabled”）。规则匹配问候语、keyword 或联系人访问级别，并选择 draft、auto_send、gatekeep 或推迟操作。速率限制 (`autoReplyLimits`) 限制每个联系人每小时和每天的自动回复，因此在您离开时单个 thread 不会发送垃圾邮件。

#### 24.7 Pause or restrict automation

切换 **autonomousKillSwitch** 进行 immediate 全局暂停 - every 自主操作变为批准。从“设置”或“mesh.update-trigger”暂停单个触发器。将联系人降低为 **assistant_only** 或 **none** 以停止一种关系的 auto-send，而不完全禁用 EnvoyAI。

#### 24.8 Reset agent behavior

清除 AI 规则，将联系人 preferences 重置为默认值，并在“设置”→“AI”中关闭社交代理和自动驾驶标志。如果 session 音调飘过较长的 thread 秒，则重新start OpenClaw。对于硬重置，disable EnvoyAI，清除您不再需要的 pending 批准，重新enable，并在 **manual** 模式下使用单个粘合触点重新测试。


### 25. Sessions and Memory

#### 25.1 What a session is

EnvoyAI session 通过 stable `sessionId` 将您正在进行的 Google 助理对话绑定到 OpenClaw 的 memory 存储区。所有者提交 Social 的 EnvoyAI 聊天、`@envoy` 提及以及与终端相关的计划 share 此绑定，以便 follow-up 问题保持一致。会话是 local 到主节点，除非通过实时 RPC，否则不会复制到 EnvoyGo。

#### 25.2 Conversation context

每个 OpenClaw request 都包含 owner 兴趣、与 trust level 绑定的联系人姓名以及 exported 工具目录。本机聊天 drafts 通过 model router 使用 slimmer 上下文窗口。audit log 中的相关 ID 在工具调用之间缝合单轮 - 在复杂交换后重新viewing Activity 时使用它们。

#### 25.3 Short-term and long-term memory

OpenClaw 在活动 session 内保留短期 thread 状态，并通过其自己的 memory 子系统（包括 configured 时的 Memex 等可选的 MCP 桥）进行更长时间的调用。默认情况下，EnvoyMesh 不会复制保管库中的长期存储。将 OpenClaw 的工作区和 memory plugin 视为“助理记住的内容”的事实 source。

#### 25.4 Search memory

使用面向OpenClaw的工具或configured MCP search（Knowledge Base settings中默认为`memex_search`）来查询ry外部memory indexes。在 EnvoyMesh 内，`mesh.chat_rag_search` 检索 indexed 聊天和 library 片段以进行代理轮流。结果继承 sensitivity labels — 不向 public 联系人公开私有 RAG chunks。

#### 25.5 Session summaries

调用`mesh.session-summary`或通过`mesh.list-sessions`列出session来检查OpenClaw thread metadata，而无需打开网关UI。在将任务交给 Team jobs 或提交审核 note 之前，摘要会有所帮助。它们是操作员oriented view，而不是向联系人发送消息。

#### 25.6 Correct outdated memory

当 OpenClaw 陈述 stale 事实时，请在助手 thread 中将其写入 rect，并且如果使用 Memex 或类似工具，则在 source 卡中将 update 或 archive 写入 source 卡。调整提供 RAG 的 Library notes，以便下一个 `mesh.chat_rag_search` 返回当前文本。如果错误涉及 disclosure 范围，则每个联系人 preferences 也可能需要更新。

#### 25.7 Delete memory

通过 MCP 工具的 archive/delete path configured 在 Knowledge 基础 settings 中撤销外部 memory 条目。通过 starting 新的 session ID 清除 OpenClaw session 状态（restart 网关用于 full 擦除）。删除 local 聊天记录不会删除 OpenClaw memory，直到您也 delete 在那一侧。

#### 25.8 Retention and privacy

会话和 memory 数据位于您的配置文件 directory 和 OpenClaw 工作区 paths 下，文件模式为“0600”。在 OS migration 之前备份配置文件。云 memory plugins follow 他们的供应商保留 - disable 他们的气隙 deployments。

#### 25.9 Memory across devices

EnvoyGo 显示来自主节点的实时 Assistant 回复，但不托管 OpenClaw memory locally。所有持久调用都保留在运行网关的家用计算机上。Pairing 新手机不会 copy session history 除非您 restore 主页配置文件。

#### 25.10 Current chat-history integration boundaries

对 every OpenClaw 的完整最近聊天注入尚未完成——债券和利益可靠地附加；逐字 thread 回滚可能是部分的。本机自动回复仅使用当前消息文本。通过在提示中引用 Library note 或明确的摘要来规划 important 的连续性，直到聊天日志集成发布。


### 26. Tools

#### 26.1 What an agent tool is

工具是代理可以调用​​的命名的 schema 描述的操作 — send 聊天、query 知识、列表批准等。 EnvoyMesh 在 `ToolRegistry` 中注册工具，评估键 policy 和 sensitivity，然后执行或 queue 批准。Every 调用会生成一个带有工具名称、latency 和 correlation ID 的审核事件。

#### 26.2 Browse available mesh tools

在 Social 中，打开设置 → AI → 工具（或要求 EnvoyAI 列出工具）。当 MCP 代理为 enabled 时，CLI 和桥接客户端可以调用 `mesh.mcp.list_tools`。startup 目录 export 到 OpenClaw mirror 具有相同的名称 - 用于网格操作的“mesh.*”前缀，以及标准聊天/知识条目。

#### 26.3 Knowledge and Library tools

使用 `mesh.library_list`、`mesh.library_read`、`mesh.library_discover` 和 `mesh.chat_rag_search` 读取 local notes 和 query indexed content。`mesh.knowledge.query`（和任务变体）到达绑定对等方的 public 或允许的 indexes。每个工具的敏感度上限可防止私人保险库 path 渗漏到 stranger 。

#### 26.4 Contact and messaging tools

`chat.send` 和 mesh discovery/hello 工具可让代理查找联系人和 draft 消息。发送到重要的 sensitivity 通常会输入批准 queue 而不是传递 immediately。仅当节点上的 Trust 模式为 enabled 时，Trust 介绍工具 (`mesh.intro.*`) 才会出现。

#### 26.5 File-sharing tools

通过 `mesh.share_propose`、`mesh.library_request_share`、`mesh.transfer_status` 和 gallery 帮助程序共享流程。高于 policy 上限的原始文件传输需要 owner 批准和明确的同行 accept。在假设传输完成之前检查 `mesh.share_list_pending`。

#### 26.6 Task and Agent Network tools

`mesh.task.propose`、`mesh.task.await_result` 和 `mesh.capability_provider.start` 参与对等任务和 Team jobs。Agent 卡工具（`mesh.agent_card.request`、`mesh.list_agent_network_workers`）support 工人发现ry。当支出或出价规则触发时，竞争性奖励流可能会获得queue“chain_award”批准。

#### 26.7 Approval and escalation tools

`mesh.list-pending`、`mesh.approve`、`mesh.reject`、`mesh.reject-all` 和 `mesh.escalate` 让代理表面为您工作或在不确定时暂停。当信心低落或情绪消极时，宁愿升级，也不愿默默失败。代理不应批准自己的 queued 项目，除非 policy 明确 allows 自动解决。

#### 26.8 MCP tools

`mesh.mcp.list_tools` 和 `mesh.mcp.call_tool` 代理到 configured MCP HTTP 服务器（例如 Memex）。每个调用都会继承与本机工具相同的批准和审核 path。仅注册您信任的 MCP 服务器 - 它们通过节点的 local 网络访问来执行。

#### 26.9 Enable or disable access

通过关闭“trustModeEnabled”来禁用 Trust 介绍工具。暂停 Knowledge 基础 settings 中的 MCP 服务器。使用 `autonomousKillSwitch` block 执行自主工具链，而无需删除目录。桥代理 receive 通过 HTTP 桥过滤的网格工具列表，而不是 full registry。

#### 26.10 Review tool executions

打开“活动”并按工具或 correlation ID 进行筛选。每个 row 显示 allow/deny、remote 对等和 summary 文本。对于网桥流量，还请检查“mesh.list-external-agent-actions”。如果工具返回“queued”而不是“ok: true”，则交叉检查 pending 批准。


### 27. Triggers, Schedules, and Digests

#### 27.1 Create a trigger

触发器存在于节点触发器存储中并触发主动操作。从设置 → AI → 自动化或通过“mesh.add-trigger”创建基于时间（cron、间隔或一次性）、基于事件（消息 received、联系人 online/offline）或基于主题（keyword 匹配）的触发器。每个触发器声明一个操作类型（send 聊天、query 知识、send 摘要、通知 owner 或 follow up）以及每日火上限。

#### 27.2 Update or remove a trigger

使用“mesh.update-trigger”编辑条件或暂停触发器；delete 与 `mesh.remove-trigger`。暂停的触发器保留 history 但不触发。更改 cron 表达式后，在自动化面板中确认下一个计划时间，这样时区错误就不会令您感到惊讶。

#### 27.3 Schedule reminders and actions

时间触发 accept cron 字符串、ISO `at` 时间戳或用于重复检查的 `intervalMs`。该节点评估其周期性循环上的到期触发器并记录“trigger.fired”审计事件。来自触发器的聊天 send 仍然通过批准 policy — 高风险模板 queue 而不是 auto-send。

#### 27.4 Configure activity digests

摘要 settings（`mesh.set-digest-schedule`、`mesh.get-digest-config`）控制在您的个人资料 `digests/` directory 下写入的 **每日**、**每周** 或 **关闭** 摘要。切换部分：外部代理呼叫、discovery 查询、债券变更、主动操作和 pending 批准。当摘要准备就绪时，Social 会发出一个“digest:ready”事件，您可以从 Activity 打开该事件。

#### 27.5 Morning reports and discovery summaries

**Morning report** (`getMorningReport`) 对最近的 discovery 事件和信任存储信号进行排名 - 来自定期 activity 摘要的单独的按需 discovery 摘要。在评估新的 public 对等点时，从 Social discovery 面板或 CLI `morning-report` 运行它。它不会通过 self 来 send 网格消息。

#### 27.6 Follow-ups and proactive checks

后续操作会在您在触发器 metadata 中定义的延迟后重新打开联系 thread。主动签入将 offline 检测 (`offlineAgentEnabled`) 与规则和触发器结合起来，例如，当情绪为负面时推迟 draft。主动传递的升级出现在 Approval 中，具有“proactive_checkin”或“follow_up”操作类型。

#### 27.7 Quiet hours and notification preferences

每个域 **代理 visibility** （`instant`、`brief`、`silent`、`approval`）控制任务、介绍和 report 的推送噪音，而无需停止底层自动化。在夜间使用**沉默**并在专注blocks期间使用**批准**，这样只有需要批准的事件才会打扰您。这是 notification 响度，而不是单独的 cron 安静时间时钟 - 与真正的停电窗口的暂停触发器相结合。

#### 27.8 Review automation history

过滤“trigger.fired”、摘要生成和主动代理事件的活动。每个 entry 包括触发器名称、操作类型和 correlation ID。当计划失败时，与“mesh.list-triggers” status 字段（“firesToday”、“lastFiredAt”、“lastError”）进行比较。

#### 27.9 Stop an automation

点击 **autonomousKillSwitch** 以立即停止所有主动射击。单独 disable 触发器，关闭 `offlineAgentEnabled`，或将摘要频率设置为 **off**。通过在审批项目过期之前reject取消正在进行的主动聊天。


### 28. Approvals and Escalations

#### 28.1 Why EnvoyMesh asks for approval

Approvals 对超出 bond tier、sensitivity 上限或自主 policy 的操作执行 owner 同意：outbound 聊天 drafts、知识 shares、云模型调用、发现ry 转发、摘要和团队工作奖励。queue 是代理 intent 和网格执行之间的控制面 - pending 列表中的任何内容尚未发送。

#### 28.2 Review a pending action

在 Social 中打开 **Approvals** 或从 CLI 调用 `listPendingApprovals`。每个项目显示标题、draft content、操作类型、优先级和 request 时间戳。阅读 draft，就像逐字阅读 send 一样 — 批准后的 edit 不会自动执行，除非您 reject 并要求代理重新生成。

#### 28.3 Check the contact, data, and capability scope

检查上下文字段：联系人 owner ID、display name、sensitivity 级别、requested 功能以及链接的触发器名称（如果自动触发）。确认收件人与您的 intent 匹配，并且 sensitivity label 符合关系层级。如果客服人员 request 修改了 public 或 referred 联系人的私人数据，则拒绝。

#### 28.4 Approve an action

从 Approvals 面板或 CLI 批准命令批准；执行器运行底层工具或 send path 并将项目标记为已解决。批准的 send 作为正常签名的 envelope 传播。云模型批准 unblock 与项目关联的特定本机路由器调用。

#### 28.5 Reject one or all actions

使用可选的 note 拒绝，因此审核显示 owner intent。当您不信任批次时，`mesh.reject-all` 会清除 queue — 例如在错误configured 自动规则之后。拒绝不会对联系造成惩罚；只有 block 是 draft。

#### 28.6 Escalation reasons

当置信度低于 0.6、情绪为负面或 sensitivity 分数超过阈值时，项目 escalate 到 **escalated** status。通过 `mesh.escalate` 手动升级会标记棘手的 thread 以引起 owner 关注，即使 policy 可能 allow auto-send 也是如此。升级的项目在确认之前保持可见。

#### 28.7 Acknowledge an escalation

阅读上下文后，在 Approvals 或 `mesh.acknowledge-escalation` 中使用 **Acknowledge**，即使您 reject 底层操作也是如此。确认会清除紧急信号而不批准 draft。如果同伴应留在 manual 协助继续前进，则配对并更改联系模式。

#### 28.8 Expired approvals

待处理项目默认在 7 天后过期；如果没有新代理 request，则无法批准过期条目。节点定期 purges 过期 ID 并记录计数。如果您经常错过窗口，请将有风险的联系人切换到 manual 模式，并将 visibility 提高到**批准**。

#### 28.9 Agent Network award approvals

当工作人员出价需要 owner 签署支出或选择时，竞争性 Team jobs 可能会获得 queue **`chain_award`** 项目。在批准之前重新view投标价格、工作人员identity和授权预算。Direct 奖励模式跳过竞价，但仍然遵守命令“maxCost”。

#### 28.10 Avoid approval fatigue

以 **manual** 模式开始新的联系，enable auto-send 仅适用于受信任的对等方，并使用具有严格 sensitivity 上限的自主策略。更喜欢 **简短** 或 **批准** 代理 visibility，这样低价值的 activity 不会对您进行 ping 操作。Audit 每周：如果相同的规则产生噪音，则暂停触发器或 narrow 其 keyword。


---

## Part V — Knowledge, Library, and the Web

### 29. Knowledge System Overview

#### 29.1 Knowledge Base, Library, Vault, and RAG

Knowledge 基础是用户体验，Library 组织可发现的项目，Vault 存储 local 文件，RAG 检索代理提示的相关 chunk。这些层协同工作，但具有不同的安全和生命周期职责。

#### 29.2 Local-first storage

您的保管库文件和配置文件 metadata 首先位于主节点的磁盘上 - 通常位于配置文件的保管库 directory 下，其中包含 `notes/`、`documents/`、`inbox/` 和 `.envoy/` metadata。在 Social 桌面中进行普通 ry 阅读或 edit 操作不需要云 sync 服务。配对 EnvoyGo 通过 home RPC 读写；默认情况下，它不在手机上保存 full 保管库副本。

#### 29.3 Notes, files, and structured information

Markdown notes are created in the Library UI and stored under `vault/notes/` with optional subfolders you define. Imported PDFs, Word files, images, and plain text land in `documents/` or legacy vault paths and join the same index. Structured `.envoy/sensitivity.json` overrides track per-item visibility independent of folder layout.

#### 29.4 Visibility and sensitivity

每个项目都带有 sensitivity 层（public、friends、受信任或私有），当 plugin 为 enabled 时，由已发布的 toggle 和 Obsidian frontmatter 控制。Bonds 将同级 trust tier 映射到他们可以读取的最大 sensitivity 或 syndicated 响应中的 receive。更改 sensitivity re-indexes RAG visibility 而不移动磁盘上的文件。

#### 29.5 Search and retrieval

本地search扫描indexed保管库chunks；chat RAG 检索与引用的地面模型答案的最佳匹配。当 brow 唱 published web content 时，远程对等方使用“knowledge.query”表示自然语言 search，或使用“library.read”表示基于 path 的字节 retrieval。这些 path 有所不同： search 综合或排名文本；library 逐字读取服务文件。

#### 29.6 Trusted remote knowledge

Bond 联系人可能会在您为每个关系设定的上限内询问 ry syndicated 知识。public 层的陌生人只能通过速率限制的“knowledge.query”查询 ry public note 并查看剥离的维基链接图。当 policy allow 时，联合 RAG merges local 和 remote chunks，在响应中保留 source attribution。

#### 29.7 Provenance and hashes

内容 hashes fingerprint 保险库字节并出现在 discovery 匹配、Browser verification 和 IPFS export metadata 中。哈希值让收件人确认他们 received 未更改的文件，而无需单独信任文件名。发布 updates 可能会更改 stable path 处的字节；当 integrity 比友好标题更重要时验证 hash。

#### 29.8 Publishing and browsing

Phase 45 adds URL-addressable mesh pages under `envoy://owner/path` served from the home `web/` directory with per-entry visibility. Social Browser and paired EnvoyGo Browser render Markdown, images, and PDFs like a lightweight web client. Feeds and topic notifications (45E) alert followers when authors publish, but fetching remains pull-based via `library.read`.

#### 29.9 IPFS integration

通过 Helia 或 Kubo 集成选择的 Library 项目的可选 IPFS export publishes content 寻址副本。CID 补充了网格发现ry，但不会取代授权 browsing 的键控“library.read”。将 IPFS 视为 distribution 和 verification 辅助，而不是作为隐式 permission 来忽略 sensitivity label。

### 30. Create and Organize Knowledge

#### 30.1 Create a Markdown note

打开Social中的Library选项卡，选择新建笔记，并在edit或中输入Markdown；自动将土地保存在 `vault/notes/` 中。RAG 管道在保存时重新index，而不重新start 节点。从脚本或集成自动创建 note 时，请使用 `createNote` JSON-RPC。

#### 30.2 Edit and preview a note

在 edit 和 preview 模式之间切换，以在共享或 publishing 之前验证格式。Preview 使用与聊天渲染相同的清理 path ，以便您大致了解绑定读者将看到的内容。EnvoyMesh 不会默默地重写 note 主体，除非通过显式 plugin import 流。

#### 30.3 Organize folders

在`notes/`下为research、工作或个人类别创建子folder - UI mirrors库paths。每个 note 都保留敏感性，因此一个 folder 可以混合 public 教程和私人 draft。Obsidian 用户可以在外部组织相同的 directories，而 EnvoyMesh indexes 在刷新时会发生变化。

#### 30.4 Add files

将 PDF、DOCX、images 的文件拖入或导入到 documents/` 中，并将 indexer 至 ports 的文本格式设置为文本格式。较大的 import 可能需要一些时间才能在 RAG 内到达 chunk；如果 search 滞后，请检查 Library status。收到的对等文件到达“inbox/”，与编写的 note 分开处理。

#### 30.5 Choose public, friends, trusted, or private visibility

当 Obsidian plugin 为 enabled 时，切换在 Library 项中发布 edit 或或设置 Obsidian `published：true/false` frontmatter。公共项目加入 stranger-queryable 网格；friends 项目至少需要 referred bond tier；私人物品保留 local 且仅限代理。Review label 在默认为私有的批量 import 之前。

#### 30.6 Manage metadata

Titles, paths, tags, and sensitivity overrides form the metadata layer the Library displays and discovery matches against. `.envoy/sensitivity.json` persists overrides across restarts. Avoid hand-editing metadata files while the node is running unless you follow operator backup procedures.

#### 30.7 Use the Obsidian integration

在设置 → AI → Knowledge 基础 → 插件下启用 Obsidian plugin，然后将 Obsidian 指向您的保管库 directory 以获得丰富的 editing。plugin 解析 frontmatter，build 是一个 wiki 链接图，并从面向 stranger 的响应中删除私有链接。EnvoyMesh 从不写入 Obsidian 文件 directly — 所有突变都经过 Social 或 RPC。

#### 30.8 Import and export content

Export notes 用于 offline archives 或 import 在 migration 期间从其他工具进行降价批次。在 import 之后验证 sensitivity labels，因为外部工具可能无法理解 EnvoyMesh 层。在批量 delete 或 path 重写可能会孤立 index 条目之前保留文件系统 backup。

#### 30.9 Delete knowledge safely

使用 Library delete 操作或 `deleteNote` RPC 时，一起删除 removes 库文件和 index 条目。如果该项目在“envoy://”path处公开，则已发布的web清单条目可能需要单独的unpublish步骤。在删除 authoritative 原始文件之前，请确认没有绑定对等点依赖 syndicated 副本。

### 31. Search and RAG

#### 31.1 Search your local knowledge

在主节点上的 indexed 保管库 chunk 上使用 Library search 表示 keyword retrieval。结果显示与 path 匹配的摘录，因此您可以打开 source note 或 document。搜索尊重 sensitivity — 您不会在用于 stranger 的上下文中看到私有 chunk。

#### 31.2 Ask EnvoyAI to search

在聊天中询问 EnvoyAI 以查找信息；它会调用 RAG 工具，在应答之前检索保管库 chunk。当 configuration 中的 attribution 为 enabled 时，答案应引用 path 或标题。远程模型调用仍然通过 semantic firewall 并在 outbound 上下文上进行绑定检查。

#### 31.3 Understand chunks and matches

RAG splits documents 到 chunks 中用于嵌入和 retrieval；匹配项按照与您的队列ry 的相关性进行排名。块边界可能是 split 段落，因此当精度很重要时，请阅读 source 文件中的周围上下文。大 edit 后重新 index 会在保存时自动刷新 chunk 边界。

#### 31.4 Review source attribution

在聊天或知识回复中重新引用view，以确认哪个note或文件提供了每项声明。联合结果包括 remote owner 标识符，以便您知道文本是来自您的保管库还是来自同行的 syndicated library。当您想要持久的 local copy 时，请使用 MCP write-back 保存归因摘录。

#### 31.5 Chat RAG search

聊天 RAG 在助理轮流期间运行，将 retrieval 与模型生成结合在一个流程中。它与 manual Library search 不同，因为模型根据检索到的 chunk 合成答案。如果您更喜欢仅 search 交互而无需生成摘要，请禁用或 narrow 工具。

#### 31.6 Federated RAG across trusted contacts

联合 RAG 查询在信任 settings 下联合上限 configured 内选择加入的联系人库。私有 note 永远不会离开你的节点；friends 层材料需要两侧都有足够的 bond tier。来自多个同行的相互冲突的事实应该通过阅读原文来解决，而不是仅仅相信 merged 摘要。

#### 31.7 Handle conflicting results

当 local 和 remote chunk 不一致时，打开每个引用的 source 并比较 hash 或时间戳。模型可能会超过merge释义；将 RAG 输出视为证据映射，而不是权威。如果联系人的自动摘要始终具有误导性，请调整联合 settings。

#### 31.8 Save useful results

使用 MCP write-back 或 manual note 创建将有用的 query 结果存储在默认的 friends sensitivity 的保管库中。在 note 正文中包含 source peer 和 query 文本以供将来审核。避免保存 stranger 的私人泄漏尝试 - 在 publish 保存的摘要之前验证 sensitivity。

#### 31.9 Protect sensitive information

将凭证、医疗和法律材料保密sensitivity，除非您明确accept 更广泛地接触。公共网格查询速率限制 stranger 并从响应中剥离非 public wiki 链接。如果您将 friends 层 content 联合到 referred 联系人，则会定期进行 Audit 知识查询。

### 32. Trusted Knowledge Sharing

#### 32.1 Ask a bonded contact for knowledge

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 720 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="40" y="40" width="140" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="110.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Local Vault</text><text x="110.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">files · notes</text><rect x="220" y="40" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="290.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Chunk Index</text><text x="290.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">embeddings</text><rect x="400" y="40" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="470.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">RAG</text><text x="470.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">in chat prompt</text><path d="M180,60 L220,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M360,60 L400,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><polygon points="620,35.0 680.0,60 620,85.0 560.0,60" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="620" y="64" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Sensitivity gate</text><path d="M540,60 L560,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="560" y="130" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="630.0" y="147.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Bonded Peer</text><text x="630.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">syndicated library</text><path d="M620,85 L620,130" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="400" y="130" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="470.0" y="147.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Attributed result</text><text x="470.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">save to vault</text><path d="M560,150 L540,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 16 — Federated RAG: local Vault chunks feed RAG directly; the federated path queries bonded peers' libraries through a per-contact sensitivity ceiling gate, returning attributed results.</figcaption></figure>


当您需要汇总联系人的 syndicated library 或 search 时，请向绑定联系人的代理发送“knowledge.query” intent。remote 节点在应答之前应用其 bond tier、联合上限和模型路由。提出精确的问题并期待自然语言的答复，而不是原始文件转储。

#### 32.2 Public, referred, and direct access

具有严格速率限制的公共层 allows stranger 查询；referred 层解锁更广泛的 syndicated 访问权限；direct 层 allows friends-sensitivity 共享。每个层都映射到审计中记录的确定性债券 policy 决策。故意升级债券 —referred 访问所暴露的内容比单独的 public ping 还要多。

#### 32.3 Share a note or file

通过 send 聊天 attachment、数据传输 vouch 或使用适当的 visibility publish 共享 note 或文件。将 copy 字节的优惠券放入收件人收件箱；publishing 通过 discovery 暴露 metadata 或通过 `library.read` 暴露字节。选择与您想要点 copy 还是持续 browse 访问相匹配的机制。

#### 32.4 Propose a share

当您的工作流程需要明确的收件人 acceptance 时，通过任务或聊天流程建议 share。提案 carry sensitivity 提示，以便收件人在 indexing 之前知道他们正在porting 中的内容。取消停滞的提案以避免模棱两可的 half-shared 状态。

#### 32.5 Accept a share request

仅在验证 sender bond tier 并描述 sensitivity 后才接受 inbound share requests。Imported content 进入 vault inbox 或 library 列表，其中 attribution 到 remote owner。如果您打算进一步重新share 材料，请重新index 或调整sensitivity。

#### 32.6 Sensitivity enforcement

Bonds 引擎会拒绝 sender 的 trust tier 超过 allowed sensitivity 的 request，即使用户认为他们是 friends。联合最大 settings 限制自动查询期间离开节点的内容。如果您为 research 组调整联合，请使用第二个ry 联系人帐户进行测试。

#### 32.7 Contact-scoped discovery

Contact 范围内的 discovery 返回 published library metadata 给绑定的对等点，而不暴露私有 path。匹配项包括标题、hash 和可选 CID，而不是 full 文本，直到 follow 向上阅读或 query。在宽 searches 之前使用范围 discovery 以尊重关系边界。

#### 32.8 Network-wide document discovery

全网络 document discovery 在 DHT 上公布 public published 功能，以获取 stranger 会议能力和费率规则。它支持port查找public材料，而不是枚举私人保险库。Operators 应 monitor 审核来自 public 同行的异常 query 量。

#### 32.9 Rate limits and abuse protection

陌生人`knowledge.query`流量是有速率限制的（在默认的configuration中，大约每分钟几个查询，每小时几十个）。滥用保护补充了绑定拒绝，以减少对 public note 的扫描。通过 blocking public 层同级重新port 持久化 abuse。

#### 32.10 Prevent unintended disclosure

在将 note 提升到 public 或 friends 层之前，请仔细检查已发布的 toggle，尤其是在 Obsidian sync 之后。Web 清单 visibility 使用单独的 ACL 字段 - 包括仅限联系人页面的联系人选择器。对于未经授权的“library.read”尝试，反枚举会返回“not_found”，而不是确认隐藏的 path 是否存在。

### 33. Publish and Browse Mesh Content

#### 33.1 The `envoy://` address format

Mesh content URLs follow `envoy://envoy:owner:<id>/path/to/page` 使用永久 owner ID，而不是 display names。`@handle` 语法会解析，但会在 runtime 处进行 reject 编辑，直到将来的 registry 发布。Pairing URI (`envoy://contact?...`) 保持独特，不得与 content URL 混淆。

#### 33.2 Open a mesh page

从聊天链接、Browser 地址栏打开网格页面，或在 Social 桌面中提供 notification。配对的 EnvoyGo 通过主节点转发 `library.read`，因此 brow 离家出走需要 connectivity 到该节点。页面在适用的情况下使用经过净化的 HTML 呈现 Markdown、images 和 PDFs。

#### 33.3 Navigate history

Browser 后退、前进、重新加载和每 owner history 的行为与网格约束内的传统 web 客户端类似。大型 binary 尸体可能会在显示时以 chunk 和 hash verification 的形式到达。导航防护可防止重叠的运行中读取破坏 view 状态。

#### 33.4 Create bookmarks

将 Browser 中每 owner 经常访问的“envoy://”页面添加为书签；当您键入时，自动完成功能会建议最近的 path。书签将 local 保留在您的客户资料中，而不是通过中央服务器 sync 。例如，如果您重新build device，则port 会manual 加入书签。

#### 33.5 Browse an author

Browse an author's site by opening their owner root URL, which serves `index.md` when present under `web/`. Blog, profile, PhotoWall, and Bazaar templates organize paths by convention, not hard schema. Visibility still applies per file—seeing an index does not imply access to every subpath.

#### 33.6 Browse Bazaar content

Bazaar 和 feed view 在清单和主题订阅上聚合可发现的 public 或绑定的 content depending。主题 follow (Phase 45E) 有助于匹配兴趣，而无需 GossipSub 在线上推送扇出。Discovery 首先列出 metadata；打开 entry 会触发字节的“library.read”。

#### 33.7 Publish a page

Social 中的作者页面将 Markdown 或 media 放入 `~/EnvoyMesh/web/` （或等效配置文件）中，并使用 visibility 注册清单条目。在聊天中共享 URL 之前，选择 public、绑定或特定联系人 ACL。更新 content 在同一 path 处更改字节 - 当 update 重要时，通过提要通知 follow 人。

#### 33.8 Follow feeds and topics

当作者 publish 匹配材料时，请关注 receive 收件箱 notification 的提要和主题。通知链接到 Browser 和原始 `envoy://` URL。Unfollow 主题，您不再想避免 notification 噪音。

#### 33.9 Update published content

编辑 source 文件 local、碰撞清单，并在纠正 rect 拼写错误或替换 media 时重新publish。客户端在重新加载时验证“contentHash”以检测自上次访问以来的更改。没有内置版本 history URL — 如果需要回滚，请保留保管库 git 或快照。

#### 33.10 External HTTP gateway — planned

**Planned.** `envoy://` 网格-content path 现已推出；用于非网状网络的 public HTTP 网关 browsing 被前向引用为 Phase 45F，并且不是当前 release 的一部分。


### 34. IPFS and Content Verification

#### 34.1 Why EnvoyMesh uses content hashes

哈希值独立于文件名来识别 content，因此接收者可以在传输或 IPFS 获取后检测到篡改。EnvoyMesh 在discovery、Browser 和export 对话框中显示hash。在信任引用的文本或二进制文件之前，将 hash 不匹配视为硬停止。

#### 34.2 Export Library content to IPFS

当您想要在 immediate 网格拉动 path 之外进行 content 寻址共享时，Export 选择 Library 项目到 IPFS。Export 尊重 sensitivity — 不要将您不会 publish 的材料固定在同一 visibility 层。与混合受众共享时，将 CID 与网格 URL 一起记录。

#### 34.3 Helia integration

Helia 集成嵌入了一个轻量级 IPFS 节点 suitable，用于桌面主节点 export 或验证 CID。当您需要 in-process 固定而不需要单独的 Kubo 守护进程时，请使用 figure He​​lia。监视磁盘使用情况，因为固定的 block 会累积 local。

#### 34.4 Kubo integration

Kubo 集成针对已运行 Kubo 守护程序并希望 EnvoyMesh 与其 API 互操作的操作员。将 settings 指向您的 local Kubo endpoint 并在批量 export 作业之前验证 connectivity。Kubo 和 Helia 是替代方案 - 通常每个节点 enable 一个策略。

#### 34.5 Verify content through a gateway

公共网关帮助人们通过 HTTPS 为 verification 获取 IPFS CID，但网关不是授权层。在将 content 视为真实之前，将网关字节与预期的网格 hashes 进行比较。敏感材料不应依赖 public 网关进行访问控制。

#### 34.6 Pinning and availability

固定使 IPFS block 可访问；当没有对等方托管未固定的 CID 时，它们可能会消失。Mesh `library.read` 保留 authoritative，用于从 owner 主节点进行授权实时读取。使用固定来实现归档冗余，而不是替代保管库 backups。

#### 34.7 Privacy considerations

发布到 IPFS 或 public 网格层会将字节公开给任何获得 CID 或 URL 的人，无论友好的文件名如何。私人保管库材料不应出现在 export 和 unpublish 列表中。Review Phase 44 标记 research notes public 之前的 stranger-query 行为。

#### 34.8 Filecoin persistence — deferred

**推迟。** Helia 和 Kubo IPFS path 今天可用；设计了基于 Filecoin 的长期持久性，但不是当前 release 的一部分。参见附录 J.9。


### 35. Back Up and Restore Knowledge

#### 35.1 What to back up

备份 owner 密钥、保管库 directories、`.envoy/` metadata、web 清单、配置文件 JSON 状态，并审核合规性所需的 journal。如果没有底层 Vault 文件，仅 Library UI 状态是不够的。记录您的 backup 日程安排以及存储在 EnvoyMesh 外部的中继或模型凭证。

#### 35.2 Back up the Vault

在节点停止或停顿时复制整个保管库树，包括“notes/”、“documents/”、“inbox/”和“.envoy/”，以避免部分文件。在进行大型副本之前验证可用空间。Encrypt backup 处于静止状态（如果它们包含 friends 层或私有材料）。

#### 35.3 Back up Library metadata

Library metadata such as sensitivity overrides and published flags lives under `.envoy/sensitivity.json` and related stores—include these with vault backups. Published web manifests under the profile directory should backup with `web/` content. Missing metadata restores files but may wrong-foot visibility until repaired.

#### 35.4 Restore on the same node

将保管库和 profile data 恢复到同一配置文件 path 中，然后重新start 节点并运行 index 刷新（如果 search 看起来像 stale ）。如果您restored部分配置文件树，请确认债券和信托存储。在返回生产使用之前测试一个私有的和一个 public query。

#### 35.5 Move to another computer

迁移到新计算机需要 copying 配置文件、保管库和 owner 密钥材料，然后重新installing EnvoyMesh 和 re-pairing EnvoyGo device。如果网络布局发生更改，请更新继电器 bootstrap 或 port settings。如果旧硬件被丢弃，则撤销旧的 device 证书。

#### 35.6 Verify restored content

在 restore 之后，抽查 note hash，打开示例 `envoy://` 页面，并针对已知的 keyword 运行 Library search。一旦债券重新加载，对联系人的联合查询应该仍然有效。在删除旧机器的 backup 之前记录差异。

#### 35.7 Mobile data boundaries

EnvoyGo 不会替换手机上的主保管库，它仅缓存配对的 RPC session 获取的内容以供 UI 显示。Mobile backup 意味着备份您的手机配对的主节点，而不是仅从 EnvoyGo 获取 full 保管库 export。如果 session token 无效，请在 home restore 之后重新配对 QR code。

#### 35.8 Repair damaged local data safely

如果发生 index 损坏，请停止节点、从 backup 保管库中的 restore 和 allow 重新 index，而不是盲目删除未知文件。使用 audit logs 来识别哪些操作先于损坏。在 metadata 存储上运行 manual JSONL edit 之前执行 Contact 运算符 documentation。

---

## Part VI — External Agents

### 36. External Agent Overview

#### 36.1 What an external agent is

外部代理是一个单独运行的助手，receive 选择消息并通过 EnvoyMesh 的 local HTTP 桥调用 allow 网格工具。HomeClaw、Hermes 和 OpenHuman 使用 shared `envoymesh-message` 合约。

#### 36.2 Built-in EnvoyAI versus an external agent

EnvoyAI/OpenClaw 是 bundled，更深，并由主 runtime 管理。外部代理是与独立维护的代理端代码的兼容性集成，并且仅当您信任该进程时才应为 enabled。

#### 36.3 Why external agents use a bridge

该桥在普通 HTTP request 和签名网格操作之间进行转换。这会将 networking 密钥、绑定检查、能力限制和审计记录保留在 EnvoyMesh 内。

#### 36.4 Why external agents never receive raw P2P access

原始 libp2p 访问会让代理逃避 identity 和 policy 边界。该桥公开 intentional 操作，例如 send 消息、查找知识或执行批准的工具。

#### 36.5 External-agent identity

网桥代理有自己的网格对等点 identity，源自 owner 指令，与外部 runtime 的内部用户或 session ID 不同。Bond 桥接 identity 的对等消息；EnvoyMesh 代表其签署 outbound 回复。

#### 36.6 Available bridge tools

当 enabled 时，兼容代理可以在 port 3031 上调用“GET /bridge/list-tools”和“POST /bridge/execute-tool”。该目录反映了绑定 policy、授权和 owner 批准，而不是主节点上的 ry 工具。

#### 36.7 Sessions and action history

外部代理 sessions 和操作 history 显示在 review 的设置中。每个 inbound 网格消息和工具调用在审核 JSONL 中都是相关的，因此您可以跟踪桥转发到外部进程的内容。

#### 36.8 Permissions, approvals, and revocation

即使网桥转发 request，高风险网格操作仍可能需要 owner 批准。通过禁用桥、清除活动预设或使用外部代理轮换承载密钥 shared 来撤销访问权限。

#### 36.9 One active external-agent URL per bridge

网桥一次解析一个活动的外部代理 URL。您可以保留多个预设，但切换活动预设，而不是将相同的 inbound 事件 send 分配给多个助手并创建重复的回复。

#### 36.10 Choose an integration

选择一种集成 path：bundled EnvoyAI（port 18789 上的 OpenClaw）、HomeClaw (8010)、Hermes (8020)、OpenHuman (8021) 或自定义“envoymesh-message”适配器。每个网桥配置文件一次只有一个“agentUrl”处于活动状态。


### 37. The Safe Agent Bridge

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 600 210" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:600px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="40" width="140" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="90.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Mesh Peer</text><text x="90.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded contact</text><rect x="220" y="40" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="300.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyMesh Node</text><text x="300.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bridge :3031</text><rect x="440" y="40" width="140" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="510.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">External Agent</text><text x="510.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">HomeClaw / etc</text><path d="M160,55 L220,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">① chat.message (signed)</text><path d="M380,55 L440,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="410.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">② POST agentUrl</text><path d="M440,75 L380,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="410.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">③ POST /bridge/send</text><path d="M220,75 L160,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">④ chat.message (node signs)</text><rect x="20" y="130" width="560" height="60" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="146" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">The agent never holds Ed25519 keys or speaks libp2p directly</text><text x="40" y="170" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• to = inbound peer ID (not owner ID)    • Bearer secret gates /bridge/*    • messageId dedups retries</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 7 — External agent bridge: mesh traffic flows through the EnvoyMesh node, which signs on the agent's behalf. The agent receives plain HTTP and replies via /bridge/send.</figcaption></figure>


#### 37.1 Mesh-to-agent message flow

当绑定对等方向网桥代理发送消息时，EnvoyMesh 会验证签名的 envelope 并将压缩消息对象 POST 到 configured 代理 URL。该对象包括 sender 路由信息、显示上下文、文本和唯一消息标识符。

#### 37.2 Agent-to-mesh reply flow

外部代理通过将“{ to, text }”发布到 local 网桥上的“/bridge/send”（通常是 port `3031`）来回复。`to` 值是 inbound 网格对等 ID，而不是 owner ID；EnvoyMesh 标志和 send 是 outbound envelope。

#### 37.3 Bearer-token authentication

设置桥接秘密，以便 requests 使用“授权：承载 <秘密>”。使用长随机值，像凭证一样存储它，并在怀疑的 disclosure 之后使用 rotate 。

#### 37.4 Message identifiers and duplicate protection

inbound `messageId` 允许代理抑制重复的 web 挂钩传递。OpenClaw extension 还具有针对旧桥的简短 content-hash 回退，但集成应该更喜欢精确的消息 ID 重复数据删除。

#### 37.5 Correlation identifiers and synchronous replies

业主对代理人 synchronous 请求包括 correlation ID。匹配的 `/bridge/send` 解析 pending local request；未知的相关性 receive 是一个消失的响应，因此代理可以 retry 而不是默默地丢失答案。

#### 37.6 Async knowledge and discovery replies

Discovery 和知识响应可以在启动工具调用后到达。兼容的代理应该处理`mesh.async_reply`事件并将它们与用户正在进行的上下文相关联。

#### 37.7 List and execute mesh tools

`GET /bridge/list-tools` 返回 allowed 工具目录，`POST /bridge/execute-tool` 调用选定的操作。两者均需经过桥接验证、工具 schema、policy 和批准。

#### 37.8 Propose file sharing

代理可以通过 `/bridge/agent-share-proposal` 提议共享 Vault 项目；它无法获得不受限制的文件系统访问。owner 或 policy path 决定 share 是否继续。

#### 37.9 Localhost defaults and network exposure

默认情况下，网桥 listens 处于环回状态。请勿将 port `3031` directly 暴露给 LAN 或 Internet；如果需要 remote 访问ry，则在前面放置一个经过身份验证、受 TLS 保护的代理并限制其 source 网络。

#### 37.10 Audit external-agent activity

过滤 audit log 桥接 intent 和工具执行。查找 remote 对等 ID、correlation ID、allow/deny outcome 和 latency。当对外部代理代表您所做的事情提出争议时，这是 authoritative 记录。

#### 37.11 Revoke an external agent

在“设置”中禁用 **Ext Agent**，清除或更改网桥配置中的“agentUrl”，以及 rotate 承载密钥。停止外部进程，以便它无法继续使用 stale 凭据调用 port 3031。


### 38. OpenClaw and EnvoyAI

#### 38.1 OpenClaw’s role in EnvoyMesh

OpenClaw 提供 EnvoyAI 的 bundled 助手 runtime 并支持 port 规范的 EnvoyMesh channel extension。extension 处理 web 挂钩消息、回复路由、网格工具、synchronous 回复和登录界面。

#### 38.2 Bundled runtime and canonical EnvoyMesh extension

打包的 runtime 和 OpenClawExtension/` 使用 EnvoyMesh 进行维护，这使得此集成比通用兼容性预设更丰富。extension 也可以 install 进入另一个 OpenClaw 结帐。

#### 38.3 Automatic startup

主节点通常自动在网关 port `18789` 上 starts OpenClaw 。如果它是 startup configuration 中的 disabled，则在等待 EnvoyAI 响应之前，重新start 节点并重新start 节点。

#### 38.4 Install the extension in another OpenClaw environment

要在另一个签出中 install channel，运行 `./scripts/install-openclaw-extension.sh /path/to/openclaw --with-docs`、签出依赖项的 install 以及 configure 其 EnvoyMesh web 钩子和桥密钥。

#### 38.5 Configure the EnvoyMesh channel

In OpenClaw config, register the EnvoyMesh channel with webhook path `/webhook/envoymesh` on gateway port **18789** and set `bridgeUrl` to `http://127.0.0.1:3031/bridge/send`. Match the Bearer secret to `bridge-config.json` on the EnvoyMesh node.

#### 38.6 Send and receive mesh messages

Bonded 对等点与网桥代理对等点 ID 聊天；EnvoyMesh 将 JSON 发布到 `http://127.0.0.1:18789/webhook/envoymesh`。回复将转到“/bridge/send”，其中“to”设置为 sender 的网格对等 ID（“envoy_…”），而不是 owner DID。

#### 38.7 List and execute mesh tools

OpenClaw extension 公开 `envoymesh_list_mesh_tools` 和 `envoymesh_execute_mesh_tool`，它们代理到 3031 上的网桥。工具调用仍然通过主节点上的绑定检查和 semantic firewall 规则。

#### 38.8 Handle asynchronous mesh replies

Discovery 和知识响应可能会在 sync 时间到达。extension 处理发送到 web 钩子的 `mesh.async_reply` POST，并将它们显示为 in-channel 消息，以便模型可以继续对话。

#### 38.9 Use onboarding and setup surfaces

运行 `openclaw onboard` 或使用 bundled Social setup 流程来种子工作区、桥秘密和 channel 文档。在使用绑定联系人进行测试之前，请确认网关日志已注册 EnvoyMesh HTTP 路由。

#### 38.10 Manage extensions and ClawHub

通过 ClawHub 或符号链接安装可选的 OpenClaw extensions；EnvoyMesh channel 位于 `OpenClawExtension/` 中。macOS bundle 比 Windows 多 extension；需要时添加其他 manually。

#### 38.11 macOS bundled-extension selection

macOS DMG 包含更广泛的 OpenClaw extension 集，以提供集成体验。这会增加包大小，但会减少常见工作流程的 post-install setup 。

#### 38.12 Windows essential-extension bundle

Windows installer 打包 essential 有用的 OpenClaw extension 而不是 full macOS 集，从而将 bundle 保持在实际大小限制内。如果需要，可以单独添加额外的 extension install。

#### 38.13 Migrate from Hermes

使用 bundled migration extension 将 port Hermes 记忆、技能或凭证导入 OpenClaw，然后将 `agentUrl` 从 `8020/message` 指向 OpenClaw web 钩子。在切换生产流量之前，备份两个环境并验证 imported 机密。

#### 38.14 Troubleshoot OpenClaw

If chat fails: confirm gateway on 18789, bridge log shows 3031, webhook path matches, Bearer secrets align, and `to` on replies is a peer ID. Run `npm run smoke:openclaw-bridge` from the repo for a local round-trip check.


### 39. HomeClaw

#### 39.1 What the HomeClaw preset provides

HomeClaw 是默认的外部代理兼容性预设，通常是 `http://127.0.0.1:8010/message` 处的 receive 消息。EnvoyMesh 为桥 configuration 供电；HomeClaw 提供其代理 runtime 和 channel 实现。

#### 39.2 Compatibility-preset status

**兼容性预设。** EnvoyMesh 侧可用，但在生产使用之前验证兼容的 HomeClaw release 及其 `channels/envoymesh` suport。

#### 39.3 Start HomeClaw

启动 HomeClaw，使其 EnvoyMesh channel listen 在 **8010** 上（默认 `http://127.0.0.1:8010/message`）。验证进程是否绑定到环回，除非您故意在不同的主机上运行代理和节点。

#### 39.4 Select HomeClaw in Settings

在 **设置 → AI → Ext Agent**、enable 桥接器中并选择 HomeClaw 预设。EnvoyMesh 将 `agentUrl` 设置为 `http://127.0.0.1:8010/message`，并将 starts forwarding 绑定到 endpoint 的对等聊天。

#### 39.5 Configure the message URL

使用 local 默认 `http://127.0.0.1:8010/message` 除非 HomeClaw 在其他地方绑定 intent。只要两个进程在同一主机上运行，​​就将 endpoint 保持在环回状态。

#### 39.6 Configure the reply bridge

Configure HomeClaw 返回对 `http://127.0.0.1:3031/bridge/send` 的回复。双方使用相同的 Bearer Secret。

#### 39.7 Add a shared secret

在桥 settings 和 configure 中生成一个长随机秘密，与 HomeClaw 的 EnvoyMesh channel 中的值相同。inbound POST 到 8010 和 outbound POST 到 3031 都应该 send `授权：持有者 <秘密>`。

#### 39.8 Send and receive messages

当绑定联系人向您的网桥代理发送消息时，HomeClaw receives `{from, fromOwnerId, fromName, text, messageId}`。使用“{to, text}”回复 POST 到“http://127.0.0.1:3031/bridge/send”，其中“to”是 inbound“from”对等 ID。

#### 39.9 Use mesh tools

如果 HomeClaw 的 channel 实现工具代理，则它会在 3031 上调用列表/执行 endpoint。每个工具仍受 bond tier、任务范围和 EnvoyMesh 节点上的 owner 批准 queue 的约束。

#### 39.10 Permissions and knowledge access

Knowledge 和保管库读取流经网格工具，而不是 direct 文件系统访问。分别调整HomeClaw自己的permission；EnvoyMesh 在 every 工具调用上仍然强制执行 sensitivity 上限和联系范围。

#### 39.11 Agent-side channel ownership

`channels/envoymesh` 实现位于 HomeClaw repository 中。EnvoyMesh 仅 configure URL 和秘密；当线路行为发生变化时，在 HomeClaw 侧修补 upgrade 或修补 channel。

#### 39.12 Disconnect or revoke HomeClaw

在“设置”中禁用 Ext Agent，停止 HomeClaw 和 rotate 桥接密钥。清除“agentUrl”或切换到另一个预设，以便 queued 网格消息不会传递到已停止的进程。

#### 39.13 Troubleshoot HomeClaw

常见故障：HomeClaw 在 8010 上未 listening、秘密不匹配、错误回复“to”字段或桥接 disabled。检查节点日志中的“[bridge] HTTP on …3031”，并使用测试 payload 加上 Bearer 标头卷曲 8010/message。


### 40. Hermes

#### 40.1 What the Hermes preset provides

Hermes 是使用相同消息协定的内置兼容性预设，通常位于“http://127.0.0.1:8020/message”。它的知识-oriented runtime 在此存储库ry 之外维护。

#### 40.2 Compatibility-preset status

**兼容性预设。** EnvoyMesh 提供选择和桥接，但不保证 every Hermes 版本。在为联系人启用 release 和 configured 工具之前，请测试确切的 release 和 configured 工具。

#### 40.3 Start Hermes

在 **8020** (`http://127.0.0.1:8020/message`) 上启动 Hermes 及其 EnvoyMesh 适配器。确认您运行的 release 与 release note 中的兼容性预设期望匹配。

#### 40.4 Select Hermes in Settings

在 **设置 → AI → Ext Agent** 下选择 Hermes 预设。EnvoyMesh 将 `agentUrl` 指向 8020，并将 enable 指向 3031 上的网桥 listener 以获取返回流量。

#### 40.5 Configure message and reply URLs

将 inbound 消息设置为 `http://127.0.0.1:8020/message` 并将 configure Hermes 设置为通过 `http://127.0.0.1:3031/bridge/send` 进行回复。将两个 URL 保持在同一机器 setup 的环回上。

#### 40.6 Add a shared secret

将桥接密钥从 EnvoyMesh settings 复制到 Hermes 的 EnvoyMesh channel configuration 中。不匹配的承载 token 在 8020 和 3031 上都会产生 401 响应。

#### 40.7 Send and receive messages

Hermes receives 8020 上的标准网桥 payload。出站回复必须针对“from”中的 sender 对等 ID；owner DIDs 不会在网格上路由 correctly。

#### 40.8 Use knowledge and mesh tools

当在其适配器中实现时，Hermes 的知识-orient 工具映射到网格列表/执行调用。Vault 和discovery 结果可能会通过OpenClaw 使用的相同async 回复模式返回async。

#### 40.9 Permissions and approvals

Hermes 侧提示和 memory 位于 EnvoyMesh policy 之外。当工具超出授权成本、sensitivity 或联系范围时，Mesh 方面的批准仍然适用。

#### 40.10 Agent-side integration ownership

Hermes 维护自己的集成代码和 release 节奏。EnvoyMesh 仅提供预设 URL 和桥接安全边界 ry。

#### 40.11 Migrate from Hermes to OpenClaw

bundled OpenClaw migration extension 可以为port 提供ported Hermes configuration、记忆、技能或证书。在切换活动 runtime 之前，备份两个环境并重新view imported 机密。

#### 40.12 Disconnect or revoke Hermes

关闭 Hermes 预设、rotate 机密，并停止 Hermes 进程。如果您需要supported bundled path，请考虑迁移到带有migration extension 的OpenClaw。

#### 40.13 Troubleshoot Hermes

验证 8020 是否可达、机密匹配以及 Hermes 版本 suports `messageId` 重复数据删除。检查桥审核事件是否有被拒绝的工具调用与 transport 错误。


### 41. OpenHuman

#### 41.1 What the OpenHuman preset provides

OpenHuman 是使用 shared 适配器的内置兼容性预设，通常位于“http://127.0.0.1:8021/message”。其代理端 runtime 仍然是一个外部项目。

#### 41.2 Compatibility-preset status

**兼容性预设。** 独立验证 OpenHuman release、endpoint 行为和同意模型；EnvoyMesh 仅保护面向网格的桥边界ary。

#### 41.3 Why OpenHuman is disabled by default

默认情况下，OpenHuman 是 disabled，因此 installing EnvoyMesh 绝不会默默地 grant 对对话或工具进行未经验证的外部进程访问。仅在 configuration 之后启用它并信任 review。

#### 41.4 Start OpenHuman

在 **8021** (`http://127.0.0.1:8021/message`) 上启动 OpenHuman 及其适配器 listening。由于默认情况下 OpenHuman 为 disabled，因此请在重新viewing 同意模型后确认您 intent enabled。

#### 41.5 Enable and select OpenHuman

在桥 settings 中启用 OpenHuman 并选择其预设。EnvoyMesh 不会自动-start OpenHuman；外部进程和 Ext Agent toggle 都必须打开。

#### 41.6 Configure message and reply URLs

Configure `http://127.0.0.1:8021/message` for inbound mesh traffic and `http://127.0.0.1:3031/bridge/send` for replies. Document any non-default ports in both OpenHuman and `bridge-config.json`.

#### 41.7 Add a shared secret

在 EnvoyMesh 桥 settings 和 OpenHuman 的 channel 配置中设置 shared 承载密钥。将轮换视为凭证泄露响应：update 双方，然后再恢复流量。

#### 41.8 Send and receive messages

OpenHuman 像其他预设一样处理 inbound `{from, text, messageId, …}`。回复使用“from”中的对等 ID；应忽略重复的“messageId”值以吸收重试。

#### 41.9 Use mesh tools

工具访问仅限于桥通过 3031 上的列表/执行公开的内容。OpenHuman 无法通过调用 libp2p directly 来绕过绑定或授权检查。

#### 41.10 Consent, privacy, and approvals

Review OpenHuman 的同意提示和数据保留与 EnvoyMesh policy 分开。主节点上的所有者批准仍然会限制敏感的网格操作。

#### 41.11 Agent-side integration ownership

OpenHuman 提供自己的集成层；EnvoyMesh 不审查 ry 代理端行为。如果安全状况发生变化，请保留 OpenHuman updated 和 disable 预设。

#### 41.12 Disconnect or revoke OpenHuman

禁用预设、revoke 秘密，并停止 OpenHuman。清除分机 Agent 将聊天返回到 EnvoyAI 或其他选定的引擎，而不会暴露 8021。

#### 41.13 Troubleshoot OpenHuman

检查 OpenHuman 是否为 enabled、listen 在 8021 上，并使用匹配的承载身份验证。同意或批准拒绝可能看起来像是跨port失败——检查审核outcome。


### 42. Custom External Agents

#### 42.1 Use the `envoymesh-message` adapter

自定义代理无需使用 libp2p 即可实现“envoymesh-message”适配器。它 accept 是桥的 inbound JSON，通过 local 桥进行回复，并且可以仅列出或执行暴露给它的工具。

#### 42.2 Register a custom agent preset

使用适配器的“agentUrl”在桥 settings 中添加自定义预设（例如“http://127.0.0.1:9000/message”）。一个网桥配置文件指向一个活动的 URL。

#### 42.3 Implement the inbound message endpoint

实现 `POST /your/message` accepting `{from, fromOwnerId, fromName, text, messageId}` 和可选的承载身份验证。快速回复200；通过 3031 传递回复 asynchronously，而不是在 HTTP 响应正文中回显。

#### 42.4 Implement replies through `/bridge/send`

将“{to, text}”和可选的“correlationId”发布到“http://127.0.0.1:3031/bridge/send”。使用 `to` = inbound `from` 对等 ID。当“correlationId”与 pending owner request 匹配时，同步会询问解析。

#### 42.5 Authenticate requests

在 inbound 网格 web 钩子和 outbound 调用 3031 上验证“授权：承载者”。当秘密为 configured 时，拒绝未签名的 request。

#### 42.6 Handle duplicate messages

跟踪看到的“messageId”值并在 retry 窗口中删除重复项。当网桥重试片状 webhook delivery 时，这可以防止重复回复。

#### 42.7 List and call mesh tools

使用 JSON 参数调用“GET /bridge/list-tools”，然后调用“POST /bridge/execute-tool”。处理结构化错误和批准-pending 响应，而不会导致代理循环崩溃。

#### 42.8 Handle asynchronous results

订阅或轮询 async 网格结果（模仿 OpenClaw 时`mesh.async_reply` shape）。将后期发现ry 或知识响应与触发它们的用户回合相关联。

#### 42.9 Define capability and data boundaries

记录您的代理可能调用哪些网格工具以及它存储哪些 local 数据。切勿使用经批准的工具之外的 _ TERM_2__ 原始 _ TERM_0__ 密钥或保险库 _ TERM_3 。

#### 42.10 Test the integration

Run bonded peer chat tests, tool calls, and secret-rotation drills. Use `npm run smoke:openclaw-bridge` patterns as a reference for mock round-trips.

#### 42.11 Security checklist

仅环回绑定、强承载秘密、最低权限工具、审核 review、提示秘密轮换和 documented revoke path。如果没有 TLS 和网络 ACL，请勿将 3031 暴露给 LAN/WAN。

#### 42.12 Troubleshoot a custom agent

将网桥日志与适配器日志进行比较，了解 401/404/410 响应、错误的“to” ID 以及 schema 不匹配的情况。在涉及实时网格对等点之前使用curl 进行测试。


### 43. Manage External Agents

#### 43.1 Review the active agent

打开 **设置 → AI** 并确认哪个预设处于活动状态、其“agentUrl”、Ext Agent 是否为 enabled，以及桥 listen port（默认 3031）。捆绑的 EnvoyAI 使用 18789 与 Ext Agent 预设分开。

#### 43.2 Review external-agent sessions

Review external-agent session 列出活跃关联和最近的同行联系人。会话将网格 senders 绑定到主节点上的桥接 forwarding 状态。

#### 43.3 Review action history

操作 history 总结了工具执行和转发的消息。使用相同的相关性或消息 ID 对照审核 JSONL 交叉检查异常条目。

#### 43.4 Inspect available capabilities

通过设置或使用 auth 的“GET /bridge/list-tools”检查工具目录。当债券、授权或 owner 批准发生变化时，能力就会发生变化，而不是当外部代理重新start 时。

#### 43.5 Change the active preset

通过选择 HomeClaw、Hermes、OpenHuman、OpenClaw web 挂钩或自定义来切换预设。更改 `agentUrl` 或密钥后，重新start 或重新连接目标外部进程。

#### 43.6 Disable the bridge

关闭 **Ext Agent** 可停止与外部 URL 的 forwarding 网状聊天，同时保持 bundled EnvoyAI 可用。如果您需要硬停止，桥接 HTTP listener 可能会保留用于进行中回复 - rotate 秘密。

#### 43.7 Revoke an agent session

通过禁用桥、清除外部代理中的凭据以及轮换承载密钥来撤销 session，以便旧的 token 无法调用 3031。

#### 43.8 Rotate the shared secret

在 EnvoyMesh、update 外部代理配置中生成新的机密，然后重新start 两侧。在配置匹配之前，预计会出现简短的 401 错误。

#### 43.9 Respond to a compromised external agent

Immediately disable Ext Agent、rotate 秘密、block 受影响的同级（如果需要），以及用于渗透或工具 abuse 的 review audit log。将外部流程的妥协视为对桥接器 allow 要做的 every 事情的妥协。

#### 43.10 Collect diagnostics

收集网桥配置（编辑机密）、最近的审核摘录、网关/适配器日志以及对 3031 和您的“agentUrl”的“curl”探测结果。提交问题时包括 EnvoyMesh 和外部代理版本。


---

## Part VII — Agent Network and Team Jobs

### 44. Agent Network Overview

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 290" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="20" width="200" height="40" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="37.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Orchestrator</text><text x="380.0" y="53.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">home node + owner</text><rect x="40" y="120" width="160" height="50" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="120.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Worker A</text><text x="120.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded · opted-in</text><rect x="280" y="120" width="160" height="50" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="360.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Worker B</text><text x="360.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded · opted-in</text><rect x="520" y="120" width="160" height="50" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="600.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Worker C</text><text x="600.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded · opted-in</text><path d="M330,60 L120,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="225.0" y="86.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">task.chain.*</text><path d="M380,60 L360,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M430,60 L600,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M120,170 L330,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="225.0" y="111.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">partial/result</text><path d="M360,170 L380,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M600,170 L430,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="20" y="210" width="720" height="50" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="226" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Relays (lean) — connectivity only, no LLM, no payload reading</text><text x="40" y="270" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Bonded + opted-in = eligible. Strangers and non-opted-in peers are NOT recruiters.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 8 — Agent Network topology: the orchestrator recruits bonded, opted-in workers. Relays carry connectivity only. There is no public marketplace — strangers cannot recruit your agent.</figcaption></figure>


#### 44.1 What Agent Network means

Agent 网络是协作层，绑定的 owner 选择其 local 代理为 Team jobs 工作。它结合了identity、信任、能力发现ry、命令、orchestration、工件和审计。

#### 44.2 Bonded people and opted-in local agents

仅当 owner 绑定在 accept 可层级、remote owner enabled 加入 Agent 网络并且新代理卡宣传所需的 membership 和能力时，工人才有资格。

#### 44.3 Agent Network is not a public marketplace

不存在 public 市场，stranger 可以自由地 recruit 您的代理。广泛匿名 recruitment 故意超出当前产品边界ary。

#### 44.4 Your agent remains private by default

无论是否加入，local 代理在其 owner 期间都保持可用。成员身份会更改绑定对等方可以发现的内容和 request，并且可以向这些对等方披露 owner 证明的个人资料字段。

#### 44.5 Worker membership

**工作人员 membership** 是选择加入标志（**加入 Agent 网络**），在您的代理卡上宣传“能力提供者”。如果没有它，即使信任是 direct，绑定同伴也无法 recruit 您的代理Team jobs。

#### 44.6 Agent cards and capabilities

**Agent 卡**列出了功能、supported 任务类型、可选配置文件字段和 membership tag。协调员从绑定的同伴那里获取 index 卡来决定谁可以执行每个子任务。

#### 44.7 Team jobs

**Team jobs** （多代理链的 UI 名称） split 将 owner 目标分解为子任务，将它们分配给选择加入的工作人员，并将 merge 结果转化为一个 report。协议代码仍然使用`task.chain.*` intents。

#### 44.8 Intelligent home nodes and lean relays

**主节点**运行 LLM、保管库访问、orchestration 和工作执行。**Relays** 仅提供 connectivity 和发现 ry — 它们从不执行子任务或读取私有 payloads。

#### 44.9 Typical personal, family, and team topologies

个人 setup 经常将两台家用笔记本电脑配对；家庭可以添加孩子的节点；团队使用 fleet 清单或 LAN 入职。Every 拓扑仍然需要债券和工作人员在跨家庭 Team jobs 工作之前选择加入。

#### 44.10 Current scope and future directions

如今，Agent 网络涵盖了绑定的、选择加入的协作：owner enable 加入 Agent 网络，绑定的同行可以看到工作人员卡，而 requesting 节点则在这些受信任的工作人员之间协调 Team jobs。没有public市场，没有匿名工人recruitment，并且中继保持精简（仅connectivity）。前向 directions — 更广泛的发现ry、更丰富的声誉、多跳商务和完整的分层中继图 — 在附录 J.5–J.11 中被 document 编辑为 Planned、Parked 或延期；将它们视为 direction，而不是提交的 release 日期。


### 45. Join Agent Network

#### 45.1 Prerequisites

加入之前：运行主节点、owner identity、configured AI 引擎，如果您希望很快进行合作，则至少需要一个债券。单独加入并不会自动建立联系。

#### 45.2 Enable Join Agent Network

打开 **设置 → Agent 网络** 和 enable **加入 Agent 网络**。节点在其广告中设置能力提供者 membership ；它不会自动创建债券。

#### 45.3 What membership advertises

成员资格宣传“能力提供者”tag，如果是 configured，则宣传 Agent 网络配置文件。然后，Bonded 的同伴可以 index 该卡并考虑该工作人员执行兼容的子任务。

#### 45.4 Turn membership off

从您的卡中禁用“设置”中的 **加入 Agent 网络**到 remove `capability-provider`。正在进行的子任务可能会完成，但新的编排器应该在刷新后停止 recruit 操作。

#### 45.5 Confirm your worker is visible

在对等节点上，打开 **设置 → Agent 网络 → 工作人员 status** 并单击 **刷新工作人员**。当债券信托符合资格、您加入并且新卡 sync 已使用时，您的 entry 就会出现。

#### 45.6 Local agent behavior when not joined

未加入时，您的 local 代理仍会在您的节点上提供聊天、保管库和个人任务。仅保留 recruit 与绑定同伴的 Team jobs 的能力。

#### 45.7 Privacy implications

将 share 功能 tag 和可选配置文件字段与绑定对等点（而不是 public 互联网）连接。陌生人不能browse您的代理人；只有已经通过绑定 policy 的联系人才会看到 recruit 能力信号。

#### 45.8 Troubleshoot membership

如果 membership 似乎卡住了：toggle 关闭/打开，重新start 节点，确认代理卡 publish，并要求绑定节点刷新工作人员。检查审核是否有取卡或 index 错误。


### 46. Agent Network Profile

#### 46.1 Owner-attested worker profiles

该配置文件是用于软工作者排名的 owner 证明的 description，而不是集中验证的基准。它可能包括模型新鲜度、支出态势、上下文窗口、优势和吞吐量。

#### 46.2 Model freshness

**模型新鲜度** (1–10) 是 owner 证明的信号，表明您对 models 的感受如何。编排者将其用作能力匹配后的软决胜局，而不是作为经过验证的基准。

#### 46.3 Spend posture

**支出状况**（“订阅”、“计量”、“未知”）暗示长期工作是否可能达到提供商的限制。它会影响评分，但不会超越强制成本上限。

#### 46.4 Context window

**上下文窗口**（`128k`–`1M+`）帮助编排者为大型 document 子任务挑选工作人员。错误地指定窗口大小可能会导致分配不匹配或执行失败——请务必诚实。

#### 46.5 Strengths and skill tags

**优势和技能 tags**（research、编码、总结等）当多个工作人员 share 具有相同能力时，可以提高软排名。它们不具有您未在卡上宣传的 grant 功能。

#### 46.6 Throughput information

**吞吐量信息**（如果提供）有助于分配者估计并行容量。它是信息性的；停顿检测仍然依赖于心跳和协调器计时器。

#### 46.7 How candidate scoring works

候选人评分优先考虑能力匹配，然后使用背景、新鲜度、支出姿势、优势和相关信号。这些因素指导分配，但不会凌驾于保证金和授权policy之上。

#### 46.8 Profile trust and limitations

Profile 由您已通过债券（而非第三方评级）信任的 owner 进行 **self 声明**。将它们视为提示；通过重新port、审核和重复协作来验证outcome。

#### 46.9 Update or remove a profile

随时在 **设置 → Agent 网络** 下编辑个人资料字段。清除个人资料 remove 的软排名提示，但不 disable 加入；toggle membership 分别停止 recruit。


### 47. Agent Identity and Agent Cards

#### 47.1 Why agents have independent identities

Agent 具有从 owner + 代理密钥派生的 **独立对等 ID** (`envoy_agent_...`)，因此对等方可以验证代理在特定 owner 授权下的行为，与 device 密钥分开。

#### 47.2 Owner, device, agent, and peer relationships

**所有者**身份授权委托；**devices** 运行节点；**代理**执行任务；**对等 ID** 在 runtime 处签署 envelope。Team jobs 始终向代理对等方发送任务流量。

#### 47.3 Owner-authorized agent credentials

所有者签名的 **授权** 将代理 public 密钥链接到 owner DID。工作人员应在成本、sensitivity 和 expiry 范围内，reject 链接缺乏有效授权 signature 的提案。

#### 47.4 Agent public keys

每个代理在其卡上有一个 **public 钥匙**。收件人在 accepting `task.chain.*` 或 `task.result` payload 之前验证 envelope signature。

#### 47.5 Agent cards

Agent 卡描述了代理的 identity、能力、任务支持port、可选工作人员配置文件和 endpoint。本机卡通过签名的 EnvoyMesh 流移动；A2A 桥可以 publish 过滤后的外部表示。

#### 47.6 Capabilities and supported task types

**功能**是卡上的字符串 tags（`doc.translate`、`task.execute`、...）。**Supported 任务类型** 描述代理 accept 的线路 intent。子任务声明所需的能力；不匹配将工人排除在外。

#### 47.7 Membership tags

**当加入 Agent 网络为 enabled 时，成员资格 tags** 包括“能力提供者”。在向绑定联系人提供子任务之前，协调器会过滤此 tag。

#### 47.8 Fetch and refresh a bonded agent’s card

当债券形成（符合资格的等级）时，卡会自动获取并缓存约 24 小时。使用 **刷新工作人员** 或绑定事件在关键团队作业之前强制执行 update。

#### 47.9 Verify the agent’s owner

验证卡上的“ownerId”与您期望的绑定联系人相符。Mandate signature 必须链接到 owner；不匹配是 reject 工作的理由。

#### 47.10 Revoke an agent

通过 owner 授权撤销并删除或轮换主节点上的密钥来撤销代理。带有 stale 卡的 Peer 应该刷新；blocked 信任立即停止新任务。

#### 47.11 Multiple agents for one owner

一个 owner 可以使用不同的钥匙和卡运行**多个代理**。每个人都独立选择加入并宣传其能力；协调者将他们视为独立的工作人员。


### 48. Bonds and Worker Eligibility

#### 48.1 Bond trust levels

Trust 等级为 **blocked**、**public**、**referred** 和 **direct**。团队工作人员通常需要 referred 或 direct 信任；public stranger 不属于 recruit 可用工人。

#### 48.2 Why Team jobs require bonded contacts

Team jobs 跨纽带关系运作，因为员工可能会 receive 目标、数据背景和授权。默认情况下，Bond policy 会阻止未知的 public 对等方进入此工作流程。

#### 48.3 Public peers and strangers

**公共**同行不会自动获取为团队工作人员。在期待合作之前，先将 Bond 告知 referred 或 direct。

#### 48.4 Referred workers

**推荐**工人可以在更严格的policy下参与。Orchestrator侧链流量通常需要 referred 或更高；在 assigning 敏感子任务之前确认 bond tier。

#### 48.5 Direct workers

**Direct** 债券解锁 full 工人 path：direct 分配、投标和跨家庭移交受授权。这是平常的朋友/fleet configuration。

#### 48.6 Blocked workers

**被阻止的**对等方无法 send 或 receive 协作 intent。现有的任务应该会失败；取消涉及 blocked 工作人员的活动子任务。

#### 48.7 Capability requirements

每个子任务都指定一个**所需的能力**。工作人员必须宣传精​​确或软匹配的 tag 加上“能力提供者”membership 才有资格。

#### 48.8 Membership and card freshness

陈旧的卡可能会隐藏新功能或显示 revoked 代理。membership toggles、模型更改或绑定 updates 后刷新；编排者会跳过超出新鲜度阈值的工作人员。

#### 48.9 Worker eligibility checklist

确认：owner 已绑定；根据需要，信任为 referred 或 direct；加入 Agent 网络是 enabled；该卡是新鲜的；“能力提供者”存在；requested 能力匹配；并且双方都不是 blocked。

#### 48.10 Change or revoke trust

降低信任度或block联系联系人会立即停止新的recruitment。重新view激活Team jobs，用于授予该对等方的正在进行的子任务，并根据需要取消或重新分配。


### 49. Find and Onboard Workers

#### 49.1 Bond an existing contact

在 recruit 之前通过聊天介绍、QR 或 invite Bond 现有联系人。Team jobs 切勿用匿名发现ry 代替信任建立。

#### 49.2 Office-LAN onboarding

**Office LAN** 加入将相同 Wi-Fi 发现 ry 与 **设置 → Agent 网络**下的 shared token 相结合。它加速了同事在一个网络上的联系。

#### 49.3 LAN auto-bond

当 enabled 和 tokens 匹配时，**LAN 自动绑定** 将同一子网上的计算机配对。它创建的是信任，而不是 membership — 每个同级仍必须 enable 加入 Agent 网络才能成为工作人员。

#### 49.4 Company invitation links

**公司邀请链接**（`envoy://invite？…`）让队友以一定范围的信任加入您的 fleet。通过正常的安全 channel 分发链接；过期的链接将停止工作。

#### 49.5 Pairing kiosk

**Pairing 信息亭** 为活动或support 办公桌创建一键invite。除非您积极监督配对，否则请保持信息亭模式关闭 - 它通过设计减少摩擦。

#### 49.6 Fleet Manifest import

**舰队清单** import 应用已签名的同行名册和大型团队的信任提示。在 import 之前验证清单 signatures；清单创造了纽带，而不是员工自动选择加入。

#### 49.7 Refresh worker status

入职更改后，单击 Agent 网络选项卡上的 **刷新工作人员**。来自跨绑定联系人新获取的代理卡的功能 index update。

#### 49.8 Capability-based matching

分配者将子任务“requiredCapability”与工作卡 tag 进行匹配，然后应用软评分（上下文、新鲜度、优势、相同的 LAN 提示）。缺乏能力将工人完全排除在外。

#### 49.9 Probe a peer

**在授予昂贵的子任务之前探测对等点** send 是轻量级的 reachability 检查。从当前花名册中探测 remove 无法访问的工作人员失败。

#### 49.10 Diagnose zero eligible workers

如果没有工人符合资格，请刷新卡、验证债券、确认 membership、检查能力 tag 并探测 reachability。当只有 local 节点可用时，UI 不应 start 多代理作业。

#### 49.11 Broad anonymous worker discovery — not currently offered

**Plannedboundary.** 当前 Team jobs recruit 保税、选择加入的工人。不提供全网络匿名工作人员 search 和 public - 市场行为。


### 50. Team Jobs Fundamentals

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 580" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="10" width="200" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="22.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Owner goal</text><rect x="280" y="60" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="72.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Orchestrator plans + decomposes</text><rect x="280" y="110" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="122.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Build eligible worker roster</text><rect x="280" y="160" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="172.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Score candidates (capability ≫ context ≫ freshness)</text><polygon points="380,200.0 450.0,225 380,250.0 310.0,225" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="380" y="229" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Assign mode?</text><rect x="180" y="290" width="140" height="30" rx="6" fill="#3d5a45" stroke="12" stroke-width="1.2"/><text x="250.0" y="302.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Direct assign</text><text x="250.0" y="318.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#F0FDF4</text><rect x="440" y="290" width="140" height="30" rx="6" fill="#3d5a45" stroke="12" stroke-width="1.2"/><text x="510.0" y="302.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Competitive bid</text><text x="510.0" y="318.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#EFF6FF</text><rect x="180" y="340" width="400" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="352.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Negotiate / accept</text><rect x="180" y="390" width="400" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="402.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Workers execute locally</text><rect x="180" y="440" width="400" height="30" rx="6" fill="#645a3a" stroke="12" stroke-width="1.2"/><text x="380.0" y="452.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Multi-round iteration (optional)</text><text x="380.0" y="468.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#FEF3C7</text><rect x="180" y="490" width="400" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="502.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Merge attributed artifacts</text><rect x="280" y="540" width="200" height="30" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="552.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Synthesize final report</text><path d="M380,40 L380,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,90 L380,110" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,120 L380,130" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,160 L380,190" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,250 L250,290" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,250 L510,290" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M250,320 L250,340" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M510,320 L510,340" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,370 L380,390" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,420 L380,440" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,470 L380,490" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,520 L380,540" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 6 — Team job orchestration: the orchestrator plans, builds a roster, scores candidates, then branches to direct assign or competitive bidding. Workers execute locally; results merge into one attributed report.</figcaption></figure>


#### 50.1 What a Team job is

团队作业将一个 owner 目标转变为由多个合格代理执行的协调子任务。发起主节点拥有预算和 report 并且通常充当协调器。

#### 50.2 Team jobs and the older “chains” name

用户界面显示 **Team jobs**。协议 intent、RPC 名称、storage 和较旧的 document 可能使用 **链**；将其视为同一产品工作流程的实现名称。

#### 50.3 Required workers

有意义的多代理执行至少需要一名合格的 remote 工作人员。独立节点可以使用其个人代理，但 Team jobs UI block 或 report 没有工作人员，而不是假装分配工作。

#### 50.4 State a goal

在 **Team jobs → 新团队工作** 中输入明确的、有界限的目标或通过聊天进行晋升。好的目标规定了可交付成果、约束条件和sensitivity，以便规划者可以实际地定义compose。

#### 50.5 Preview the plan

**在 view 之前，计划**在花费 start 秒之前显示建议的子任务、功能和工作人员位置。如果分解看起来有问题，请在此处编辑或取消。

#### 50.6 Start from chat

当目标需要多个代理时，escalate 对话会从聊天变成团队工作。编排器继承的上下文受命令 sensitivity 限制。

#### 50.7 Start from the Team jobs view

**Team jobs** view 是桌面 Social 上的主要 ry 控制界面：start、monitor、批准、重新平衡和打开 report。EnvoyGo mirrors status read-only。

#### 50.8 Follow progress

监视生命周期状态（“发现”、“运行”、“部分”、“合成”等）和每个子任务 row。WebSocket `chain:iteration` 事件 update Phase 47 个多轮作业期间的迭代进度。

#### 50.9 Review a completed report

打开 published **链 report** 以获取归因部分、工作人员出处、成本 summary 和固定工件。选秀轮次 (Phase 47) 出现在最终 publish 之前的手风琴中。

#### 50.10 Cancel or retry a Team job

从 Team jobs UI sends `task.chain.cancel` 下游取消。Retry 可能需要新作业或协调器在故障模式下重新计划 depending；检查审核是否有最终原因。


### 51. Plan and Decompose Work

#### 51.1 The orchestrator’s role

协调者将 owner 的目标转化为计划，寻找工人，奖励子任务，跟踪执行情况，执行预算以及 policy 和 merge 的结果。Relay 仅有汽车 ry connectivity 并且永远不会承担此角色。

#### 51.2 Convert a goal into subtasks

协调器将目标分解为具有目标、所需能力、输入、截止日期和成本上限的子任务。法学硕士协助规划可能会提出步骤；owner preview 在发货前批准。

#### 51.3 Required capabilities

每个子任务声明一个**必需的能力** tag 匹配代理卡条目。如果没有选择加入的保税工人宣传这种能力，计划就会提前失败。

#### 51.4 Dependencies and ordering

依赖关系对子任务进行排序（例如综合之前的 research）。协调器尊重 DAG 边缘，并且在 prerequisites 完整或部分结果到达之前不会授予相关工作。

#### 51.5 Worker-count limits

**maxWorkers** 限制链上并发活动工作线程 session 的数量。已完成或取消的子任务有空闲槽位以供重新分配。

#### 51.6 Depth limits

默认链**深度为2**（协调器→工作人员）。深度 3 需要 owner 签名链授权上的“allowDepth3”；超过 3 的深度是 rejected。

#### 51.7 Deadlines and sensitivity

在view之前的计划中设置每个子任务的截止日期和sensitivity上限。即使协调器 request 高于 sensitivity，工作人员也会强制执行 local 债券并保管 policy。

#### 51.8 Preview and edit the plan

当 manual 模式可用时，在 preview 中编辑子任务目标、成本或能力 tag。自动 LLM 计划应在 start 之前针对高风险目标重新view。

#### 51.9 LLM-assisted planning

**LLM 辅助规划** 使用家庭模型在 enabled 时提出分解。失败会退回到 keyword/启发式模板或 block start 并带有明显的计划错误。

#### 51.10 Planning failures and fallback behavior

当计划失败时，检查是否有零个符合条件的工人、unsupported 功能、深度违规或模型错误。在 retrying 之前缩小目标范围或添加工作人员。


### 52. Find and Assign Agents

#### 52.1 Build the eligible worker roster

该名册列出了加入 Agent 网络的绑定联系人，并通过了当前计划的能力筛选器。当拨号提示显示 direct path 时，相同 LAN 的同行可能排名更高。

#### 52.2 Capability matching

**能力匹配**首先是硬过滤：没有tag，没有分配。软评分打破了剩余合格工人之间的联系。

#### 52.3 Context, freshness, spend, and strength scoring

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 310" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="20" width="200" height="30" rx="6" fill="#FEE2E2" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="32.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Capability match</text><text x="380.0" y="48.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">HARD GATE</text><rect x="280" y="70" width="200" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="380.0" y="82.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Context window</text><rect x="280" y="120" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Model freshness</text><rect x="280" y="170" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="182.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Spend posture</text><rect x="280" y="220" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="232.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Strengths / sameLan</text><rect x="280" y="270" width="200" height="30" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="282.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Final rank</text><path d="M380,50 L380,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,100 L380,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,150 L380,170" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,200 L380,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,250 L380,270" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="540" y="150" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Priority decreases downward.
Capability is a hard gate — failing it disqualifies the candidate regardless of soft signals.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 14 — Candidate scoring funnel: capability match is a hard gate; below it, soft factors (context, freshness, spend, strengths) contribute to the final rank.</figcaption></figure>


评分权衡**上下文窗口**、**新鲜度**、**消费姿势**和能力适合后的**优势**。Direct 分配选择得分最高的工人；竞价仍然以分数作为信号。

#### 52.4 Same-network considerations

处于同一 LAN 的工作人员可能反应更快并且排名更高（`sameLan` 软分数）。WAN path 在 connectivity 中使用中继，而不更改信任 requirements。

#### 52.5 Direct assign mode

Direct 分配是个人和小团队使用的默认设置。它选择合格的评分工人并奖励工作，而无需公开投标流程。

#### 52.6 Competitive bidding mode

当成本、时间或选择很重要时，竞争性投标会收集报价。它增加了协商和 owner 决策，因此仅当这些控制证明额外延迟合理时才使用 enable 。

#### 52.7 Assigner selection

**分配者选择** 选择哪个主节点计划并授予子任务——通常是您的。远程分配者移交将该角色委托给另一个具有更好工作人员 visibility 的绑定协调器。

#### 52.8 Remote assigner handoff

**远程分配者切换** 通过“task.chain.handoff”转移分配权限，同时在 configured 时保留任务范围和 Phase 47 个迭代旋钮。

#### 52.9 No-worker behavior

由于**没有符合资格的工人**，start 是 blocked（`no_workers`）。在对等点上启用加入、刷新卡或绑定其他联系人 - 单节点无法伪造多代理执行。

#### 52.10 Refresh and re-evaluate workers

刷新、债券更改或工作中途停顿后重新运行花名册build。当探测失败或出价过期时，Orchestrator 可能会交换工作人员。


### 53. Bids and Negotiation

#### 53.1 When bidding is used

出价仅用于竞争模式或 requests 明确提供的工作流程。Direct 分配避免了这种交换。

#### 53.2 Request bids

在**竞争性出价**模式下，编排器会在 accept 之前广播“task.chain.propose”并收集“task.chain.bid”响应。Direct allocate 会跳过此步骤。

#### 53.3 Review proposed cost and timing

将每个投标建议的**成本**和**预计到达时间**与子任务上限和链预算进行比较。未经 owner 批准，拒绝超出授权限制的投标。

#### 53.4 Review confidence and justification

Review 出价 **置信度** 和显示时的文字说明。低可信度的出价可能需要反提案或不同的工作人员。

#### 53.5 Compare candidates

并行候选人 comparison 强调成本、分数和能力契合度。当 manual 奖励模式为 enabled 时，所有者选择 accept。

#### 53.6 Counter-bids

**还价**通过“task.chain”协商 envelopes 调整成本、截止日期或范围。工人可以accept修改条款或退出。

#### 53.7 Accept or reject work

接受会发出“task.chain.accept”；rejecting 使子任务可供其他投标人或重新分配。记录审计决策，以备日后发生成本纠纷。

#### 53.8 Negotiation timeouts

协商计时器可防止无限期的停顿。过期的出价可释放子任务，以便重新报价或按团队作业默认值分配后备 direct。

#### 53.9 Human approval during negotiation

敏感或高成本 accept 可能会进入 **owner 批准** queue 。在工人 start 执行之前，在 Social 内解决批准问题。

#### 53.10 Audit negotiation decisions

Audit 记录捕获投标金额、accepted 同行、反提案历史ry 和批准outcome。Export 或按“chainId”过滤以追溯 review。


### 54. Budgets, Cost, and Rebalancing

#### 54.1 Set a Team job budget

在 start 处理作业或保存的配方时设置 **maxChainCostUsd** 和相关限制。协调器在整个执行过程中根据链预算账本跟踪支出。

#### 54.2 Cost ceilings

每个子任务都有一个**成本上限**；未经重新平衡或 owner 批准，工作人员不能出价或收取高于该价格的价格。

#### 54.3 Worker cost allocation

计划中跨子任务的初始分配 splits 链预算。手动再平衡移动资金；自动重新平衡在 configured 增量内进行调整。

#### 54.4 Manual rebalance

当分配或工作线程条件发生变化时，手动重新平衡会暂停 owner review。它以需要及时关注为代价来最大化控制。

#### 54.5 Automatic rebalance

自动重新平衡允许协调器在 configured 增量、上限和 retry 限制内进行调整。使用保守的限制并要求材料成本增加获得批准。

#### 54.6 Never-rebalance policy

永不重新平衡保留原始预算分配。停滞或资金不足的子任务可能会失败，而不是消耗额外的资金。

#### 54.7 Rebalance increments and limits

Configure **重新平衡增量** 大小和团队作业默认值中的最大自动重试次数。保守的增量减少了意外支出。

#### 54.8 High-cost approvals

跨越高成本阈值会触发对该任务的 **批准 requirements**。当支出高峰时，请注意 waiting-for-owner 状态。

#### 54.9 Export cost data

例如 enabled 时已完成的 report 或审核 CSV 中的 port 成本明细。包括每个工作人员 attribution 和重新平衡事件。

#### 54.10 Interpret final cost reports

最终成本 report 显示估计支出与实际支出、重新平衡历史ry 和未支出预算。与在 start 类似作业之前强制执行“maxChainCostUsd”进行比较。


### 55. Run and Monitor Work

#### 55.1 Worker acceptance

在accept之后，工作人员确认子任务并将其转换为**运行**。拒绝或 timeout 将子任务返回到协商或失败状态。

#### 55.2 Running states

链生命周期经历“发现→协商→运行→部分→综合→完成|失败”。UI 将这些映射到人类可读的团队作业 status。

#### 55.3 Heartbeats

工作人员 send 心跳，以便编排器可以区分进度和断开连接。缺少心跳提要停止检测，但不应将其视为恶意行为的 proof。

#### 55.4 Partial results

当更多输出到来时，工作人员会发出带有 intermediate 工件的 **`task.chain.partial`** 。Orchestrator 在每次终止 policy 时等待或 merges 部分。

#### 55.5 Stall detection

**失速检测**使用错过的心跳和 configured timeouts。每个停顿 policy 触发 retry、重新分配或 owner 提示。

#### 55.6 Retry and reassignment

**Retry** 重新提供子任务；**重新分配**取消停滞的工作槽位并授予 backup。在 assigning 替换之前释放工人容量。

#### 55.7 Waiting for owner input

当需要批准、迭代继续/停止或重新平衡决策时，作业会在 **waiting_for_owner** 中暂停。解决桌面Social—EnvoyGo显示状态但无法动作。

#### 55.8 Worker failure

工作线程 **失败** 标记子任务失败并带有原因代码。Orchestrator 可能会合成部分 report 或根据终止 policy 使链失败。

#### 55.9 Cancel a subtask or whole job

从 Team jobs 取消单个子任务或整个链。下游工人receive取消intent；审计记录谁发起终止。

#### 55.10 Audit progress

按“chainId”和 correlation ID 过滤审计以重建时间线：计划、出价、accept、部分、merge、迭代轮数、publish。


### 56. Multi-Round Iteration

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 620 360" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:620px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="20" width="200" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="32.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Plan + Assign</text><rect x="280" y="70" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="82.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Execute (workers)</text><rect x="280" y="120" width="200" height="30" rx="6" fill="#645a3a" stroke="12" stroke-width="1.2"/><text x="380.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Seal round N</text><text x="380.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#FEF3C7</text><rect x="280" y="170" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="182.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Synthesize draft_N</text><polygon points="380,210.0 460.0,240 380,270.0 300.0,240" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="380" y="244" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Judge</text><rect x="40" y="310" width="140" height="30" rx="6" fill="#3d5a45" stroke="11" stroke-width="1.2"/><text x="110.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Continue</text><text x="110.0" y="338.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#F0FDF4</text><path d="M310,255 L110,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="200" y="310" width="100" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="250.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Stop</text><path d="M360,270 L250,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="320" y="310" width="120" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Ask owner</text><path d="M400,270 L380,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="460" y="310" width="140" height="30" rx="6" fill="#645a3a" stroke="11" stroke-width="1.2"/><text x="530.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Extend (capped)</text><text x="530.0" y="338.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#FEF3C7</text><path d="M440,255 L530,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M110,340 L280,25" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="195.0" y="178.5" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">carry to N+1</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 10 — Multi-round iteration: within a round, plan → execute → seal → synthesize draft. The judge then continues, stops, asks the owner, or extends (capped). Summaries carry into the next round.</figcaption></figure>


#### 56.1 Why a Team job may need another round

有些目标受益于重新view第一个draft和request目标follow。多轮迭代添加了该循环，而无需 allowing 无限制的自主工作。

#### 56.2 Draft, judge, and replan

Phase 47 **seal → draft → judge → replan** closes a round, synthesizes a draft report, decides whether to continue, and optionally launches another planning pass with carried summaries.

#### 56.3 Extend work within a round

**在一轮内扩展** (Phase 47B) 当 local 启发式表明同一轮中的更多工作会有所帮助时，会在密封之前附加上限的额外步骤。

#### 56.4 Maximum rounds and extension limits

默认值保留单轮行为，除非 owner 或模板选择加入。最大轮数和每轮 extension 是限制成本和持续时间的硬上限。

#### 56.5 LLM judge mode

LLM 判断模式询问 configured 模型另一轮是否会改善结果。该决定仍然受到最大轮数、预算、截止日期和 policy 的限制。

#### 56.6 Always-stop mode

始终停止在当前密封回合后结束，给出预测 table 成本和 latency。

#### 56.7 Owner-decision mode

所有者决策模式在 draft 之后暂停，并询问 owner 是否停止、继续或延长特定工作。

#### 56.8 Carry summaries into the next round

摘要和“iterationState” blob carry 向前，因此下一轮不会盲目重复已完成的子任务。当 configured 时，远程分配器切换会保留此状态。

#### 56.9 Stop reasons

**停止原因**包括达到最大回合数、owner 停止、预算耗尽、法官始终停止或密封失败。它们出现在 report metadata 和审核中。

#### 56.10 Review iteration history

Team jobs 手风琴中的 Review 迭代 history：每 draft 轮，owner 继续/接受决策，以及最终 publish。EnvoyGo mirrors read-only。


### 57. Cross-Home and Cross-Orchestrator Handoff

#### 57.1 When to hand off orchestration

当另一个保税家庭有更好的工人 visibility 或应该拥有委托子链时，移交很有用。它不转移原owner的无限权限。

#### 57.2 Choose a remote assigner

选择具有“chain.orchestrate”的 **remote 分配者** 绑定对等点或更好的工作人员名册来进行委派分配。Trust 必须是 direct 或 policy-allow 才能进行切换。

#### 57.3 Delegate a sub-chain

**通过“task.chain.delegate”委托子链**，以便另一个编排器在您的授权限制下运行子树，而不是无限制的 owner 权限转移。

#### 57.4 Parent and child responsibilities

**父**协调器保留链owner船舶和预算；**子**分配器执行委托的子任务并向上游返回结果。

#### 57.5 Relay chain traffic

**Relay 链流量** 对 WAN 对等点使用电路 path。Relays 向前移动 envelopes，而不解释 payloads 或运行 models。

#### 57.6 Preserve iteration state

切换 payload 包括 Phase 47 **迭代旋钮**和可选的“iterationState”，因此 remote 分配器可以无缝地继续多轮作业。

#### 57.7 Arbitration records

**仲裁记录** 当出现跨主协调冲突时，使用 seq 和时间戳规则解决编排器之间的排序争议。

#### 57.8 Failure and recovery

切换失败时，父协调器应回收分配、使子树失败或按 policy 取消。检查审核是否有“移交”reject 原因。

#### 57.9 Trust requirements

交接需要兼容的 trust tier、有效的授权和相互的 reachability。被阻止或 public 对等方不能成为 remote 分配者。

#### 57.10 Audit a handoff

Audit 切换事件，带有 sender/receiver 协调器对等 ID、委托链 ID 和迭代状态校验和，以确保合规性 review。


### 58. Merge Results and Create Reports

#### 58.1 Collect worker results

编排器在 merge 或综合之前从每个获奖工人收集“task.result”和“task.chain.partial”payload。

#### 58.2 Text artifacts

**文本工件** 使用 attribution metadata 存储叙事工作者输出。Suitable 用于摘要和 research 部分。

#### 58.3 Structured artifacts

**结构化工件** 保存 JSON 或类型记录（tables，提取的字段）。验证者在收到时检查 shape。

#### 58.4 File artifacts

**文件工件** 按 ID 参考保管库项目或 chunked content。工作人员不会将原始文件系统 path 推送到网格中。

#### 58.5 Composite artifacts

复合工件 bundles 归因于工人的贡献和聚合方法。它保留了出处，如果所有文本都被扁平化为一个匿名答案，那么出处就会丢失。

#### 58.6 Weighted contributions

**加权贡献**让综合强调复合 report 中的更高置信度或 owner 优先工作人员部分。

#### 58.7 Merge strategies

**合并策略**（连接、汇总、投票、模板驱动）根据 report 类型进行选择。Phase 47 draft 轮可以在最后 publish 之前使用较轻的 merge。

#### 58.8 Worker attribution and provenance

Report 保留 **worker attribution** 和出处，以便读者知道哪个同行制作了每个部分，这对于问责制至关重要。

#### 58.9 Synthesize the final report

**在所有必需的子任务完成或部分 policy allow 的最大努力 merge 后合成最终的 report**。每轮迭代只有一个终端 publish。

#### 58.10 Pin and export a report

**将** important report 固定在 Team jobs 中以便快速访问；**export** 当 CSV 或文件 export 是 build 中的 enabled 时。

#### 58.11 Owner review

**所有者重新view** accepts draft 迭代（Phase 47）、rejects 不安全content 或requests 在最终publish 之前的另一轮。


### 59. Team Job Recipes and Defaults

#### 59.1 Save reusable job templates

使用默认预算、奖励模式、停顿/重新平衡/迭代策略和 sensitivity 保存**作业模板**。模板对于您的节点而言是 local，而不是市场。

#### 59.2 Choose award defaults

在 **设置 → AI → 团队作业默认值** 中选择 **direct 分配与竞价** 默认值。大多数个人团队应继续执行 direct 任务。

#### 59.3 Configure stall policy

Configure **按模板或全局拖延 policy**（timeouts，自动重新出价，通知 owner）。积极的 timeout 可以降低成本，但会增加重新分配的流失率。

#### 59.4 Configure rebalance policy

将 **重新平衡 policy** 设置为 manual、自动或从不。满足您对工作中自主预算调整的需求。

#### 59.5 Configure iteration defaults

Phase 47 **iteration defaults** (`iterationMaxRounds`, judge mode, extend caps) live in defaults or templates. Default `iterationMaxRounds=1` preserves single-round behavior.

#### 59.6 Configure cost visibility

**成本 visibility** toggles 工作人员和 owners 是否在竞争模式期间在 UI 中看到出价金额。隐藏成本 UI 不进行 remove 分类帐跟踪。

#### 59.7 Use a saved recipe

从**保存的食谱**开始到fill之前的政策和奖励模式。在提交支出之前编辑目标和 preview。

#### 59.8 Update or remove a recipe

当您的团队工作流程发生变化时更新食谱；delete 过时模板，以避免意外使用 stale 策略。

#### 59.9 Template marketplace — parked

**Parked.** 保存的食谱是 local 产品功能；用于交换模板的网状范围市场没有承诺的release。


### 60. Team Jobs on EnvoyGo

#### 60.1 View active Team jobs

EnvoyGo **Team jobs** 选项卡列出了在 JSON-RPC 上从主节点 mirror 处理的活动作业。手机连接时状态updates；offline view 可能会滞后。

#### 60.2 View recent jobs

**最近的作业**显示带有时间戳的已完成或失败的链。使用它可以在移动设备上重新打开 reports，而无需 starting 新工作。

#### 60.3 Open a job detail

点击作业以获取详细信息：生命周期状态、子任务 summary、迭代进度线以及指向 published report 的链接。更改 orchestration 的控件被隐藏。

#### 60.4 Read reports and artifacts

当 sync 编辑时，阅读 **report 和工件** inline。如果不是在手机上cached，大文件工件可能需要在桌面上打开。

#### 60.5 Understand read-only mobile behavior

EnvoyGo 呈现当前和最近的 Team jobs 的 read-only mirror。开始、奖励、重新平衡和 orchestration 控件仍保留在家庭/桌面体验中。

#### 60.6 Return to desktop for orchestration controls

对于 start、取消、重新平衡、出价 accept 或迭代继续/接受，切换到主节点上的 **桌面 Social**。EnvoyGo intent 忽略这些变异 RPC。

#### 60.7 Mobile notifications

**Mobile notifications**（当 enabled 时）作业完成警报或 owner 批准等待。点击打开 read-only 详细信息；根据桌面上的批准采取行动。

#### 60.8 Troubleshoot the EnvoyGo mobile mirror

如果 mirror 为空：确认 EnvoyGo 配对、主节点 reachability，并且该作业已在桌面上 start 处理。WebSocket 重新连接后重新加载。


### 61. Agent Network Trust and Safety

#### 61.1 Verify worker identity

验证工作人员 **对等 ID** 和卡 signatures 在 every `task.chain.*` 消息上与 envelopes 匹配。拒绝不匹配的密钥或过期的授权。

#### 61.2 Verify owner authorization

确认工作人员的 **owner 授权** 授权链能力并 sensitivity requested。卡上的所有者 DID 必须与绑定联系人匹配。

#### 61.3 Bond policy and capability gates

**Bond policy** 和功能门在编排器逻辑之前运行。即使 UI allow 进行了规划，被阻止的 intent 也永远不会达到工作线程执行的程度。

#### 61.4 Mandate limits

Every 工作人员 request 受已签署的授权的约束，该授权指定了目标、行动、同行范围、sensitivity、成本、expiry 和批准 requirements。工人应该 reject 在这些范围之外工作。

#### 61.5 Data-sensitivity boundaries

子任务声明 sensitivity；工作人员 downgrade 或 reject 超出每个保管库 policy 的数据限制。请勿将 friends 层 content 渗透到 public 层同行。

#### 61.6 Cost and deadline limits

Mandate **成本和截止日期**限制适用于协调器和工作节点。任务 runtime 负责取消过期或超出预算的工作。

#### 61.7 Approval requirements

`requiresApprovalFor` 中列出的操作暂停，直到 owner allow。观察链的外部代理无法绕过批准 queues。

#### 61.8 Runtime task guards

**任务 runtime 守卫**强制取消、collect-N 终止，并在飞行途中对工作人员强制执行 expiry。

#### 61.9 Vault and model isolation

工作人员在外交官 → Bond → 大脑 → Vault 隔离下运行 models 并访问 locally。远程协调器从不使用 receive 原始保管库文件系统 path。

#### 61.10 Block and revoke a worker

**阻止**信任以停止与对等方的所有协作。如果您的工作人员应该 reject 新的 inbound 链提案，则 **撤销** 代理对您的节点的授权。

#### 61.11 Respond to malicious or misconfigured agents

对于misconfigured代理，disable加入，rotate键，block对等体，并取消活动链。在重新启用之前收集审核证据。

#### 61.12 Review end-to-end audit trails

通过跨协调器和工作节点的“chainId”和“correlationId”缝合**审核JSONL**（每端记录其view）。没有中央服务器掌握踪迹。


### 62. Agent Network Connectivity

#### 62.1 Local-network discovery

**mDNS / LAN discovery** 帮助找到同一网络上的对等点以进行绑定和较低的 latency path。它不会取代 Team jobs 的债券建立。

#### 62.2 Direct peer connections

当拨号提示显示可到达的私有地址时，**Direct TCP/QUIC** 连接为 preferred。Same-LAN 工人在分配器中得分更高。

#### 62.3 Relay-assisted connections

当 NAT blocks direct 拨号时，**Relay 辅助**电路 paths 连接 WAN 对等点。对于超出 transport 中继的链 payloads，Relays 不会终止 TLS。

#### 62.4 Agent card synchronization

Agent 卡 sync 超过键触发的获取和功能 index update。陈旧的 sync 在刷新之前表现为缺失工作人员。

#### 62.5 Capability discovery

**功能发现ry** 查询从绑定对等点的卡构建的 index。仅显示具有匹配 tag 的选择加入的工作人员。

#### 62.6 Offline workers

**离线工作人员**探测和心跳失败；Orchestrator 将子任务标记为已停止，并可能根据 policy 重新分配。

#### 62.7 Reconnection and retry

当对等点返回时，libp2p 自动重新连接。网络变化后retry发现ry；如果 direct path 失败，则使用继电器 bootstrap。

#### 62.8 Multi-relay coordination

**多重中继** setup 使用社区或私有 bootstrap 对等方来表示 DHT 和 circuit relay。仅在节点 settings 中的测试操作符 configure bootstrap 中覆盖 `TEST_RELAY_ADDR`。

#### 62.9 NAT and firewall considerations

为 outbound 网状流量打开防火墙 ports；inbound direct 拨号可能需要 port 映射或中继回退。通过保留工作线路，团队工作的可靠性得到提高。

#### 62.10 Diagnose worker reachability

从 Agent 网络 settings 运行对等 **探针**，检查拨号提示并验证中继预留日志。当工作人员可到达但速度较慢时，比较 LAN 与 WAN path。


### 63. Agent Network Troubleshooting

#### 63.1 Join toggle does not take effect

如果 Join toggle 不粘，请重新 start 节点，检查配置中的 `capabilityProviderEnabled`，并确认没有 fleet 脚本覆盖 settings。重新enable并刷新对等点上的工作人员。

#### 63.2 Worker is not visible

隐形工作人员：验证 bond tier、remote 加入 enabled、能力 tag 存在，然后单击 **刷新工作人员**。公共级债券不会自动获取卡。

#### 63.3 Agent card is stale or missing

通过重新绑定或 manual 获取强制卡刷新；早于缓存 TTL 的卡可能会隐藏新功能。检查审核是否存在“agent.card.response”错误。

#### 63.4 No eligible workers

通过联系联系人、让他们加入、根据计划调整能力 tag 并刷新，修复**没有合格的员工**。UI 应该 block start 而不是单独运行多代理小说。

#### 63.5 Plan cannot be created

当 LLM 规划师失败、能力不匹配或深度/预算限制违反要求时，**无法创建计划**。简化目标或增加工作人员。

#### 63.6 Bid or negotiation does not complete

卡住**出价**：检查竞争模式timeouts，工作人员加入status，并绑定policy。当达到最大谈判轮数时，还价循环耗尽。

#### 63.7 Job is stalled

停滞的作业：检查心跳、停滞 policy、工作线程 offline 状态和 owner 批准等待。手动重新平衡或取消可能会 unblock。

#### 63.8 Worker returns no result

空**结果**通常意味着工人 reject 完成任务、撞到 sensitivity 墙或崩溃 locally。工作端审核显示 deny 与失败原因。

#### 63.9 Artifact cannot be opened

工件打开失败：验证 Orchestrator 节点上的保管库 path、sensitivity 批准，并且文件工件 ID 仍然存在。如果 chunked content 缺失，则重新sync library。

#### 63.10 Budget or approval blocks the job

预算或 **批准 blocks** 显示为“waiting_for_owner”。解决审批问题或提高桌面版的授权限制，然后resume。

#### 63.11 Handoff fails

当 remote 分配者无法访问、信任不足或迭代状态 rejected 时，**切换失败**。父级应该进行故障转移或取消子树；检查“task.chain.handoff”审核。

#### 63.12 Report is partial

当某些子任务失败时，**部分 reports** 可能会在尽力终止 policy 下 publish 。Review attribution 查看缺少哪些部分。

#### 63.13 Collect diagnostics

收集 **诊断**：链 ID、审计摘录、工作人员名册快照、bond tiers、卡时间戳以及来自协调器和工作节点的网络探测结果。


---

## Part VIII — Tasks, Mandates, and Artifacts

### 64. Task Fundamentals

#### 64.1 What an EnvoyMesh task is

EnvoyMesh 任务是代理之间经过签名、policy 检查的 request，具有目标、经过 request 处理的结果、约束、生命周期和属性table 工件。它比协调多个子任务的团队作业要长 narrower。

#### 64.2 Task objectives and requested results

陈述明确的**目标**和**requestedResult**，以便工作人员可以在accepting之前判断是否合适。模糊的目标会导致不必要的ry `task.negotiate`轮次或早期的`task.reject`；当涉及保管库 content 时，包括 sensitivity 提示。

#### 64.3 Create a task

在网格上，代理使用“task.mandate”然后“task.propose”打开任务。在 A2A 期间，`message/send` 触发生产执行器：Bonds 门 → home-owner 签名任务 → `task.propose` → `handleDaemonTaskInbound` (runtime Guard + journal)。

#### 64.4 Proposal and negotiation

`task.propose` offers concrete work under an accepted mandate; `task.negotiate` adjusts terms. Both are signed agent envelopes—the daemon inbound handler validates mandate bounds before advancing lifecycle state.

#### 64.5 Accept or reject work

工作人员回复“task.accept”或“task.reject”。接受需要 bond tier 并且仍然满足任务上限；rejection 应该考虑ry 审计员可以通过“correlationId”进行关联的原因。

#### 64.6 Follow task state

桥接时跟踪 Social、审计 JSONL 或 A2A `tasks/get` 的进度。当向外部客户端呈现 status 时，将内部十二状态生命周期映射到九个 A2A 状态。

#### 64.7 Heartbeats and partial results

在长时间运行期间发出“task.heartbeat”，以便协调器不会停止等待。部分 `task.result` payload 记录临时工件，同时强制执行 `collectCompletedResults` 和 expiry 规则。

#### 64.8 Completed and failed tasks

Terminal 成功需要处于“已完成”状态的已签名“task.result”；失败以 auditable 原因进入“失败”状态。A2A 轮询器在“tasks/get”之后看到映射的“已完成”/“失败”。

#### 64.9 Cancel a task

在网格上发送本机“task.cancel”或通过 A2A JSON-RPC 发送“tasks/cancel”。令牌的范围为 owner - 映射到一个 owner 的承载者无法取消另一个 owner 的跟踪任务。

#### 64.10 Task feedback

将完成后反馈附加到操作员 review 的任务记录中。反馈不会扩大授权权限或改变工件 content hashes 已经 published。


### 65. Task Lifecycle

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 340" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><circle cx="40" cy="180" r="10" fill="#3d5a45"/><rect x="70" y="160" width="120" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">created</text><rect x="230" y="160" width="120" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="290.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">planned</text><rect x="390" y="160" width="130" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="455.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">discovering</text><rect x="570" y="160" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="640.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">negotiating</text><path d="M50,180 L70,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M190,180 L230,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M350,180 L390,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M520,180 L570,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="570" y="60" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="640.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">waiting_for_peer</text><rect x="570" y="260" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="640.0" y="284.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">waiting_for_owner</text><path d="M640,160 L640,100" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M640,200 L640,260" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="390" y="60" width="130" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="455.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">running</text><path d="M570,80 L520,80" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="230" y="60" width="120" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="290.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">partial</text><path d="M390,80 L350,80" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="70" y="60" width="120" height="40" rx="20.0" fill="#F0FDF4" stroke="#5d3ac7" stroke-width="1.2"/><text x="130.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">completed</text><path d="M230,80 L190,80" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="230" y="260" width="120" height="40" rx="20.0" fill="#FEE2E2" stroke="#5d3ac7" stroke-width="1.2"/><text x="290.0" y="284.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">failed</text><rect x="70" y="260" width="120" height="40" rx="20.0" fill="#FEE2E2" stroke="#5d3ac7" stroke-width="1.2"/><text x="130.0" y="284.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">cancelled</text><path d="M640,280 L570,280" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M230,280 L190,280" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M280,200 L280,260" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 4 — Task lifecycle: 12 states with three terminal states (completed green, failed/cancelled red). Arrows show legal transitions; negotiation can branch to waiting states; partial results may continue to completion.</figcaption></figure>


#### 65.1 Created

已创建意味着任务记录已存在，但计划或同伴交互尚未开始。它是一个生命周期状态，而不是产品功能仅仅是计划好的声明。

#### 65.2 Task planned

任务计划意味着节点已经导出了执行方法，可以继续发现ry或提案。source schema 将此状态命名为“计划”。

#### 65.3 Discovering

协调器扫描任务联系范围内的绑定对等点和功能index 条目。当没有工作人员遇到 bond tier (`direct` / `referred`) 或 sensitivity requirements 时，Discovery 会停止——在指责网格或 tage 之前刷新代理卡。

#### 65.4 Negotiating

Active `task.negotiate` exchanges adjust deliverables, cost, or sensitivity. Either party rejects when a counter-offer exceeds mandate `maxCost`, `maxSensitivity`, or disallowed actions.

#### 65.5 Waiting for a peer

状态“waiting_for_peer”意味着还没有 remote 代理已 accept 。验证 remote 连接 toggle、bond tier 和拨号提示；如果心跳停止，则超时并重新分配每个编排器 policy。

#### 65.6 Waiting for the owner

`waiting_for_owner` follows `requiresApprovalFor` 点击或绑定 policy，要求 owner 同意。清除主节点上的 Social 批准 queue — A2A 客户端在此之前可能会看到“需要输入”。

#### 65.7 Running

模型、库读取和工具在 Worker 上的 Brain/Vault 隔离下执行。A2A 桥默认让任务保持“运行”状态，直到真正的网格“task.result”到达为止（除非“autoCompleteLocal”为烟雾的 enabled）。

#### 65.8 Partial

部分状态在工作继续时记录一个或多个工件。Mandate `closeOnFirstCompletedResult` 可能会在第一个 acceptable 工件落地后立即终止任务。

#### 65.9 Synthesizing

团队和多工作人员将 merge 子工件流到复合结果中。加权子引用通过综合步骤保留工人血统。

#### 65.10 Completed

已完成为最终：requested 工作成功结束fully，并记录了可用的结果和工件。

#### 65.11 Failed

失败是终端：执行结束但没有成功的结果。在 retrying 之前保留原因和 audit trail。

#### 65.12 Cancelled

在 owner、device、peer 或 policy path 停止任务后，取消为终止。A2A 用一个“l”拼写映射的外部状态“canceled”。


### 66. Mandates and Delegated Authority

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 720 310" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="290" y="150" width="180" height="60" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="177.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="14" font-weight="600" fill="#1e1d1b">Mandate</text><text x="380.0" y="193.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">owner-signed envelope</text><rect x="40" y="40" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Allowed actions</text><path d="M220,60 L290,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="40" y="110" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="127.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Disallowed actions</text><path d="M220,130 L290,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="40" y="180" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="197.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Contact scope</text><path d="M220,200 L290,200" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="40" y="250" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Sensitivity ceiling</text><path d="M220,270 L290,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="40" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Cost limits</text><path d="M530,60 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="110" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="127.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Expiration</text><path d="M530,130 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="180" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="197.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Approval requirements</text><path d="M530,200 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="250" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">First-result / collect-many</text><path d="M530,270 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 15 — Mandate anatomy: eight orthogonal dimensions bound what an agent may do. The owner signs the envelope; every dimension is independently enforceable.</figcaption></figure>


#### 66.1 Why agents need mandates

授权可以防止代理人将广泛的目标解释为无限的权力。它定义了一个可验证的 envelope，其中计划、工具使用、同行联系和 spending 都是 allow 的。

#### 66.2 Who issues a mandate

**Mandate 始终由 home-owner 签名。** 外部 A2A 持有者 token 标识 owner 上下文，但不签署授权 - 生产执行器使用 owner 的密钥。Agent 根据 owner 行事 - 通过授权 signature 验证委托凭证。

#### 66.3 Allowed and disallowed actions

`allowedActions` 和 `disallowedActions` 限制可以运行的 intent 和工具。任务 runtime 防护会拒绝即使在执行过程中也会调用 disallowed 操作的转换。

#### 66.4 Contact and peer scope

Mandates 可能会限制参与的对等 ID 或联系人列表。Bond 层 `self`、`direct` 和 `referred` 进一步限制了哪些人可以 receive `task.propose` — stranger 不能 accept 委派工作。

#### 66.5 Data-sensitivity ceiling

“maxSensitivity”限制了整个任务的存储库和知识暴露。即使 local 保证金 policy 通常会 allow 高于 sensitivity，工作人员归还的工件不得超过规定上限。

#### 66.6 Cost limits

“maxCost”限制授权支出。超过该限制将停止执行，除非 owner 发出新的授权或通过批准 queue 批准 extension。

#### 66.7 Expiration

`expiresAt` 由任务 runtime 守卫在 every inbound intent 上强制执行。到期后ry 提案、检测信号和结果在模型或库访问之前进行 reject 处理。

#### 66.8 First-result and collect-many policies

设置 `closeOnFirstCompletedResult` 在第一个成功的工作进程之后停止；当 fan-out 作业在综合之前需要 N 个完成时，请使用“collectCompletedResults”。

#### 66.9 Approval requirements

在“requiresApprovalFor”中列出敏感操作，以暂停直到 Social 中的 owner allow。桥接的 A2A 调用者会陷入“waiting_for_owner”状态或看到“需要输入”，直到批准清除。

#### 66.10 Agent-specific authorization

通过 owner 签名的代理凭证将授权绑定到 `envoy:agent:<hash>`。远程对等方在 accept 提案之前验证代理是否已获得规定的 owner 授权。

#### 66.11 Proof of intent

可选签署 proof-of-intent document 说明客服人员启动工作的原因。用于 audit trails — 它不会绕过 Bonds 检查或替换强制 signatures。

#### 66.12 Revoke or cancel authority

所有者 revoke 要求或 send `task.cancel` 停止进一步的工作。撤销会阻止同一任务 ID 下的新提案；已完成的工件和审核历史ry 保持不变。


### 67. Artifacts and Results

#### 67.1 Text artifacts

文本工件包含人类可读的输出，并且可能包括 media 类型。将其用于不需要结构化 schema 的摘要、解释和 report。

#### 67.2 File artifacts

文件工件指的是 Vault _ TERM_4 _ 和 _ TERM_3__ _ TERM_1__，具有可选名称、media 类型和大小。收件人应在信任下载的字节之前验证 hash。

#### 67.3 Structured artifacts

结构化工件携带 schema 引用和对象数据。它适用于机器可读结果、table、记录和 interoperability payload。

#### 67.4 Composite artifacts

复合工件包含加权、归因的子工件和聚合策略。Team jobs 使用它通过合并保留工人血统。

#### 67.5 Content hashes

文件和结构化工件 carry sha256 hashes。在信任下载的字节之前验证 hash — 尤其是在家庭网桥或中继代理上通过经过身份验证的“GET /vault/<path>?hash=...” 获取时。

#### 67.6 Display names and media types

设置用于 UI 渲染和 A2A 部分翻译的 `displayName` 和 `mediaType`。这些 label 有助于演示；他们从不替换文件 content 上的 hash verification。

#### 67.7 Worker provenance

工件记录生成代理对等 ID。复合 merge 保留加权子引用，以便团队作业 attribution 在综合中幸存下来。

#### 67.8 Store results in the Vault

文件工件引用执行节点上的保管库 paths。路径安全和 sensitivity 检查在写入之前运行；桥接文件部分公开网关 URI，而不是原始文件系统 paths。

#### 67.9 Share results

在绑定的“knowledge.query”边界内发布签名的“task.result”、envelope或share内的工件ID。请勿将 direct 保管库 path 交给授权 sensitivity 之外的跨层同事。

#### 67.10 Verify a result

在 delivery 时间检查任务 ID、工件 hashes、结果 envelope signature 和 bond tier。在对 content 执行操作之前，使用匹配的 `?hash=` 通过库 HTTP 重新获取文件字节。

#### 67.11 MCP content mapping

Phase 48 maps MCP TextContent, ImageContent, AudioContent, resource_link, and structuredContent into EnvoyMesh artifacts via `mesh.mcp.call_tool`. The MCP server adapter reverses the mapping when external clients call `mesh.*` tools.

#### 67.12 A2A Part mapping

文本、数据和文件部分通过“a2a-artifact-map.ts”转换为原生工件类型。文件部分通告从主网桥提供的 `<gateway>/vault/<encodedPath>?hash=…` URL（通过主隧道转发）。


---

## Part IX — MCP and A2A Interoperability

### 68. Interoperability Overview

#### 68.1 Native EnvoyMesh communication

本机 EnvoyMesh 通信使用签名的 envelope、owner 和代理身份、绑定 policy 和类型化的 intent。它保留 EnvoyMesh 节点之间的 preferred path 。

#### 68.2 Why bridges are needed

Claude Desktop、Cursor 和 A2A SDK 使用 MCP 或 JSON-RPC，而不是 libp2p envelope。选择加入桥 endpoint 将外部调用转换为签名的授权和工具注册ry 调用，而无需向客户端提供原始网格套接字。

#### 68.3 MCP for tools

MCP目标support专注于2025-06-18工具接口：stdio或带有`tools/list`和`tools/call`的Streamable HTTP。Resources、提示和 OAuth 是未来的范围。

#### 68.4 A2A for agent discovery and tasks

A2A 目标 superport follows v1.0.0 Agent 卡、统一部件、任务方法、轮询和流的概念。EnvoyMesh 将这些外部调用映射到其签名的任务系统中。

#### 68.5 Trust boundaries

桥梁位于外交官之上：对调用者进行身份验证，强制执行大小限制，然后委托给 Bond 和命令。桥 token 不得超出映射的 owner identity 的预期权限。

#### 68.6 Authentication

MCP 服务器适配器：`ENVOYMESH_BRIDGE_SECRET` 或 `--bridge-token` 与节点上的 `bridge.secret` 匹配。A2A JSON-RPC：来自`a2aBridge.bearerTokens[]`的`授权：Bearer`（中继：`ENVOYMESH_A2A_BEARER_TOKENS`为`token：envoy：owner：...`）。缺少身份验证失败关闭。

#### 68.7 Auditing

桥调用发出审核事件（“auditTag：“mcp-server””，A2A 方法名称）。当 debug 跨界 ry 流时，将外部 request ID 与 JSONL 中的内部任务 ID 相关联。

#### 68.8 Current compatibility scope

Phase 48 shipped: MCP consumer (`mesh.mcp.*` + `mcpConsumers` config), MCP server (`npx envoymesh mcp-server`), Agent Card at relay `/.well-known/agent-card.json`, JSON-RPC `message/send|stream`, `tasks/get|cancel`, and vault FileArtifact `GET /vault`. OAuth, MCP resources/prompts, and anonymous A2A remain future scope.


### 69. Use External MCP Servers

#### 69.1 What MCP consumer mode does

Lets the home agent call external MCP servers through `mesh.mcp.list_tools` and `mesh.mcp.call_tool`, backed by `@modelcontextprotocol/sdk` and entries in `node-config.json` → `mcpConsumers`.

#### 69.2 Add an MCP server

添加到 `mcpConsumers: [{ name, transport, command?, url?, bearerToken?, allowRemoteHttp?, env?}]`，重新加载配置，然后使用使用者“name”运行“mesh.mcp.list_tools”以确认 session start。

#### 69.3 Stdio transport

Stdio 启动 configured local 进程并通过标准输入和输出交换 MCP 消息。将命令视为 executable 代码：仅使用受信任的二进制文件和固定参数。

#### 69.4 Streamable HTTP transport

可流式 HTTP 连接到 MCP endpoint。EnvoyMesh 默认为安全 local 或 HTTPS 目标，并需要显式覆盖 remote 纯 HTTP。

#### 69.5 List external tools

调用 `mesh.mcp.list_tools` 命名 configured 消费者。返回 MCP 工具 schemas 用于座席规划；空或错误响应通常意味着进程退出、错误的 URL 或承载不匹配。

#### 69.6 Call an external tool

使用工具名称和 JSON 参数调用“mesh.mcp.call_tool”。MCP content block 映射到 EnvoyMesh 工件 suitable 用于任务结果和审核。

#### 69.7 Content and artifact mapping

文本、image、音频、resource 链接和结构化 MCP content 成为键入的工件。在 publish 到 public sensitivity 之上的绑定对等点之前检查映射输出。

#### 69.8 Timeouts and response limits

消费者 session 遵守 SDK timeout 和节点 payload 大小上限。过大的 MCP 响应在进入 semantic firewall 或保险库之前会经过 reject 处理。

#### 69.9 Remote-URL safety

远程 URL 验证可降低 SSRF 风险：更喜欢 HTTPS，避免私有 metadata 服务，将环回保留为默认值，并且 enable remote 纯 HTTP 仅适用于受控开发网络。

#### 69.10 Troubleshoot an MCP consumer

验证“command”与“url”、stdio 与 Streamable HTTP transport、“allowRemoteHttp”（用于开发纯 HTTP endpoints）和“bearerToken”。Audit JSONL 区分连接失败和 schema 验证错误。


### 70. Use EnvoyMesh as an MCP Server

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><text x="120" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#645a3a">MCP Consumer (§69)</text><rect x="40" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="120.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyMesh Agent</text><text x="120.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mesh.mcp.call_tool</text><path d="M200,60 L260,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="260" y="40" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="330.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">External MCP</text><text x="330.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">stdio / HTTP</text><text x="560" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#645a3a">MCP Server (§70)</text><rect x="440" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="520.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Claude Desktop</text><text x="520.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">external client</text><path d="M600,60 L660,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="660" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="720.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyMesh</text><text x="720.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoymesh mcp-server</text><text x="380" y="120" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Same node, two opposite directions. Consumer pulls external tools in; Server pushes mesh tools out.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 9 — MCP consumer vs server: the same EnvoyMesh node can consume external MCP tools (Direction A) or expose mesh tools to MCP clients like Claude Desktop (Direction B). Data direction reverses.</figcaption></figure>


#### 70.1 What MCP server mode exposes

stdio 适配器应答 MCP JSON-RPC (`initialize`、`tools/list`、`tools/call`) 并转发到主网桥 HTTP listener (默认 `http://127.0.0.1:3031`)，公开注册的 `mesh.*` 工具。

#### 70.2 Start `envoymesh mcp-server`

通过 EnvoyMesh CLI `mcp-server` 命令启动适配器（例如，针对 release 的打包或工作区 CLI 调用 documented）。它通过 stdio 进行通信，并将调用转发到 configured local 桥。

#### 70.3 Connect Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
"mcpServers": {
  "envoymesh": {
    "command": "npx",
    "args": ["envoymesh", "mcp-server"],
    "env": { "ENVOYMESH_BRIDGE_SECRET": "YOUR_SECRET" }
  }
}
```

重新start Claude Desktop;确认 **envoymesh** 出现在 MCP 服务器下。将“ENVOYMESH_BRIDGE_SECRET”与节点的“bridge.secret”匹配。

#### 70.4 List EnvoyMesh tools

要求 Claude 或光标列出 MCP 工具 - 您应该看到来自主工具注册表ry 的“mesh.*”条目。空列表通常意味着桥 listener 已关闭或桥秘密不匹配。

#### 70.5 Call a mesh tool

MCP `工具/调用`到达桥；该节点运行 Bond 检查并运行 local 工具处理程序。在调用金库或支出操作之前，从 read-only 工具（联系人、ping）开始。

#### 70.6 Bridge authentication

在节点上设置“bridge.secret”，并在“ENVOYMESH_BRIDGE_SECRET”中设置相同的值，或将“--bridge-token YOUR_SECRET”传递给适配器。未对齐的机密会在任何工具运行之前返回 401。

#### 70.7 Local and remote bridge URLs

默认值：`npx envoymesh mcp-server --bridge http://127.0.0.1:3031`。对于 LAN 主机，添加 `--bridge-allow-remote` 并将 `--bridge` 指向节点的网桥 URL — 避免在不受信任的网络上使用带有实时机密的纯 HTTP。

#### 70.8 Error handling and audit tags

适配器故障表现为 MCP 工具错误；成功调用会在节点上记录 `auditTag: "mcp-server"`。在审计摘要中区分桥 401（auth）和工具 deny（bond/mandate）。

#### 70.9 Current tools-only scope

当前服务器范围公开了工具。MCP resource 和提示不会自动翻译为 Vault 或 Library。

#### 70.10 OAuth and MCP resources — future work

**未来。** 承载身份验证是当前的；OAuth 2.1 和更广泛的 MCP resources/prompts SUport 被推迟到 deployment 需要时为止。

#### 70.11 Troubleshoot the MCP server

Run manually: `npx envoymesh mcp-server --bridge http://127.0.0.1:3031`. Confirm the node bridge listener is up, secrets match, and tools are enabled in node config. See `docs/phase-48-interop-smoke.md` for the full checklist.


### 71. A2A Agent Cards

#### 71.1 What an Agent Card is

A2A Agent 卡 JSON 描述名称、技能、功能、安全方案和 JSON-RPC 接口 URL。EnvoyMesh 在中继 public 之前通过 `toA2AAgentCard()` 翻译本机代理卡。

#### 71.2 Discover the well-known Agent Card

An A2A client fetches `/.well-known/agent-card.json` from the configured relay HTTP origin. Publication is opt-in through A2A bridge settings.

#### 71.3 Identity and provider fields

字段源自 EnvoyMesh 配置文件和代理网络 metadata—display name、提供商 URL、owner 链接提示。中继可以附加可选的 Ed25519 signature（`type: "envoymesh-ed25519"`），以便客户端可以检测篡改。

#### 71.4 Skills and capabilities

本地能力映射到 A2A 技能，其强度为 tag，来自能力 index。客户使用技能来发现ry契合度，而不是作为授权；持有者 tokens 和 Bonds 仍然控制任务执行。

#### 71.5 Supported interfaces

`supportedInterfaces[0].url` 的目标是 configured 网关上的 `/.well-known/a2a/jsonrpc`。首先取出卡，然后将 JSON-RPC 邮寄到 URL，其持有者 token 用于任务。

#### 71.6 Streaming capability

当`capability.streaming: true`和metadata包含`x-envoymesh-taskBridgeStatus: "available"`时，客户端可以为SSE任务update调用`message/stream`，而不是单独轮询`tasks/get`。

#### 71.7 Signed Agent Cards

中继可以使用其 Ed25519 控制 identity 对 Agent 卡进行签名，以便客户端可以检测到更改。消费者仍必须决定是否信任该签名者和endpoint。

#### 71.8 Relay publication

Enable with `--a2a-bridge` / `ENVOYMESH_A2A_BRIDGE=1` and set `--a2a-gateway-url` / `ENVOYMESH_A2A_GATEWAY_URL`. The card is served at `GET /.well-known/agent-card.json` on the relay HTTP port (commonly `:15432`).

#### 71.9 Privacy and field filtering

public 卡中可以省略敏感配置文件字段。将 published 卡视为发现 ry metadata — 任务授权仍然需要持有者 token、Bond 层和家庭 owner 签署的授权。

#### 71.10 Troubleshoot card discovery

Run `curl -sS https://relay:15432/.well-known/agent-card.json | jq .` — expect HTTP 200 when the bridge is enabled, 503 when disabled. Verify the gateway URL hostname matches the TLS certificate clients use.


### 72. A2A Tasks

#### 72.1 A2A JSON-RPC endpoint

public 中继公开 `POST /.well-known/a2a/jsonrpc`；主网桥使用环回`/a2a/jsonrpc` path。中继进行身份验证并转发，而不是执行模型 itself。

#### 72.2 Bearer-token authentication

承载 token 将外部调用者映射到 EnvoyMesh owner _ TERM_1__。保持 __ TERM_4__ 的唯一性，__ TERM_3 __ 的唯一性，并将它们绑定到最低限度的预期信任关系。

#### 72.3 Send a task with `message/send`

`message/send` 提供用户消息部分，而 receive 提供 A2A 任务。生产执行器应用绑定 policy，创建 owner 授权的任务，并通过本机任务 runtime 进行调度。

#### 72.4 Stream updates with `message/stream`

`message/stream` 为需要进度但无需轮询的客户端返回服务器发送的任务 updates。关闭废弃的流并观察网关 timeouts。

#### 72.5 Poll with `tasks/get`

`tasks/get` 检索当前持久的任务映射和状态。在 synchronous request 返回工作后或重新连接后使用它。

#### 72.6 Cancel with `tasks/cancel`

`tasks/cancel` request 对经过身份验证的 owner 任务进行本机取消。所有者范围可防止一个 token 控制另一个 owner 的任务。

#### 72.7 A2A-to-EnvoyMesh policy gates

生产执行器为层“self”、“direct”和“referred”调用 Bonds“evaluatePolicy”。Bond 拒绝返回 A2A 状态 **`需要身份验证`** - 不会为 blocked 或 public stranger 生成 home-owner 签名的授权。

#### 72.8 Production task execution

管道：承载身份验证→Bonds门→home-owner签名`task.mandate`+`task.propose`→`handleDaemonTaskInbound`（runtime保护+journal）→持久映射`tasks/get`和`tasks/cancel`。默认情况下，任务会一直运行，直到网格“task.result”到达。

#### 72.9 Relay-to-home forwarding

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 580 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:580px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="40" width="140" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="90.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">External A2A</text><text x="90.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">LangChain / etc</text><rect x="220" y="40" width="140" height="50" rx="6" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1.2"/><text x="290.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Relay</text><text x="290.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bearer lookup · lean</text><rect x="420" y="40" width="140" height="50" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="490.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Home Node</text><text x="490.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mandate · policy · executor</text><path d="M160,55 L220,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">① POST /.well-known/a2a/jsonrpc + Bearer</text><path d="M360,55 L420,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">② forward over home tunnel</text><path d="M420,75 L360,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">③ Task result + artifacts</text><path d="M220,75 L160,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">④ JSON-RPC response</text><rect x="20" y="130" width="540" height="50" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="146" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Relay never executes models, reads payloads, or stores tasks — it forwards only</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 11 — A2A relay-to-home forwarding: the relay authenticates the bearer token and forwards to the owner's home node, which owns the mandate, policy, model, and task storage. The relay stays lean.</figcaption></figure>


中继查找 _ TERM_3 _ _ TERM_2 _ 的归属地并通过归属隧道进行转发。它仍然保持精简：policy、任务、模型执行、任务 storage 和工件保留在主节点上。

#### 72.10 Error codes

JSON-RPC 错误 follow A2A 约定；Bonds 拒绝表面为任务状态“需要身份验证”。当隧道或节点 reject 进行调用时，Relay `forwardToHome` 保留来自主网桥的上游 HTTP status。

#### 72.11 Troubleshoot A2A tasks

确认承载 token 映射到预期的 owner，主隧道已准备好进行中继 forwarding，并且审核显示授权/建议 acceptance。使用返回的任务 id 轮询“tasks/get”；仅对 owner 的跟踪任务使用“任务/取消”。


### 73. A2A State, Artifact, and File Mapping

#### 73.1 EnvoyMesh-to-A2A task states

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:680px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><text x="140" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#645a3a">EnvoyMesh (12 states)</text><text x="540" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#645a3a">A2A (9 states)</text><rect x="60" y="50" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="59.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">created</text><rect x="60" y="76" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="85.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">planned</text><rect x="60" y="102" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="111.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">discovering</text><rect x="60" y="128" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="137.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">negotiating</text><rect x="60" y="154" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">waiting_for_peer</text><rect x="60" y="180" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="189.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">waiting_for_owner</text><rect x="60" y="206" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="215.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">running</text><rect x="60" y="232" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="241.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">partial</text><rect x="60" y="258" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">synthesizing</text><rect x="60" y="284" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="293.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">completed</text><rect x="60" y="310" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="319.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">failed</text><rect x="60" y="336" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="345.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">cancelled</text><rect x="460" y="50" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="59.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">submitted</text><rect x="460" y="76" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="85.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">working</text><rect x="460" y="102" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="111.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">input-required</text><rect x="460" y="128" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="137.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">completed</text><rect x="460" y="154" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">canceled</text><rect x="460" y="180" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="189.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">failed</text><rect x="460" y="206" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="215.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">rejected</text><rect x="460" y="232" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="241.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">auth-required</text><rect x="460" y="258" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">unknown</text><line x1="220" y1="62" x2="460" y2="62" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="88" x2="460" y2="62" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="114" x2="460" y2="88" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="140" x2="460" y2="88" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="166" x2="460" y2="88" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="192" x2="460" y2="114" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="218" x2="460" y2="114" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="244" x2="460" y2="140" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="296" x2="460" y2="166" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="322" x2="460" y2="192" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="348" x2="460" y2="218" stroke="#6d6a63" stroke-width="1" /></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 17 — EnvoyMesh-to-A2A state mapping: 12 internal states collapse to 9 A2A states. Many-to-one merges (e.g. waiting_for_peer + waiting_for_owner → input-required) are handled by a2a-state-map.ts.</figcaption></figure>


十二个内部生命周期状态通过“a2a-state-map.ts”折叠为九个 A2A 状态。当 building 轮询“tasks/get”或从“message/stream”呈现 SSE 事件的客户端 UX 时记录映射。

#### 73.2 Submitted, working, and input-required

新的 A2A 任务经常出现 **`已提交`**，然后在任务 acceptance 之后通过 `handleDaemonTaskInbound` 出现 **`工作`**。**`需要输入`** mirrors owner-批准停滞或缺少执行者无法推断的参数。

#### 73.3 Completed, failed, and canceled

Terminal A2A 状态与网格“已完成”、“失败”和“已取消”对齐（A2A 用一个“l”拼写 **“取消”）。当映射器找到本机结果时，工件会附加到已完成的 path 上。

#### 73.4 Rejected, auth-required, and unknown

**`rejected`** follows worker `task.reject` or executor refusal; **`auth-required`** signals Bonds failure for the bearer-mapped owner; **`unknown`** covers untracked or expired task IDs not in `a2a-bridge-tasks.json`.

#### 73.5 Text Parts

入站消息文本成为客观上下文，并可能映射到结果中的 TextArtifacts。出站文本工件成为桥接任务 payload 中的 A2A 文本部分。

#### 73.6 Data Parts

结构化 JSON 部分通过 schema 提示映射到结构化工件。在对外部代理的机器可读输出进行操作之前验证 schema 和 sensitivity。

#### 73.7 File Parts

文件部分 carry URI，例如 `<gateway>/vault/<encodedPath>?hash=...`。使用用于 JSON-RPC 的相同 A2A 承载进行获取 - 中继代理通过本地隧道将“GET /vault/*”发送到本地网桥。

#### 73.8 Composite results

复合 EnvoyMesh 工件扩展为多个 A2A 部分，其中映射器支持 port 子权重和 attribution metadata。

#### 73.9 Vault-backed file URLs

文件工件可以表示为经过验证的 Vault 支持的 URL。endpoint 验证 path 安全性，并可以在提供字节之前检查预期的 content hash。

#### 73.10 Hash validation and access control

Vault HTTP 根据 sha256（十六进制、base64url 或 `sha256:` 前缀）验证 path 安全性、A2A 承载身份验证和可选的 `?hash=`。哈希不匹配返回 403/404，而不会泄漏 path 是否存在。


---

## Part X — Networking and Relays

### 74. Peer-to-Peer Networking

#### 74.1 Local and internet connectivity

Node 可以发现 local 网络或 Inter 网络上的对等点并进行拨号。最终的 path 取决于广告地址、NAT、中继可用性和 transport 兼容性。

#### 74.2 TCP, QUIC, and WebSocket paths

EnvoyMesh 对 direct 对等链接使用 libp2p 而不是 TCP 和 QUIC，以及 WebSocket（其中中继或 NAT 需要 HTTP 友好的 transport）。当您离开 LAN 时，Social UI 和 EnvoyGo 通常会通过 WebSocket 到达主节点。Transport 选择仅影响 reachability；链接建立后，应用程序消息仍然需要签名 envelope 和绑定 policy。

#### 74.3 Local discovery

在同一网络上，节点可以通过 mDNS 找到彼此，而无需键入 multiaddrs。在添加 WAN bootstrap 对等点之前在一个 Wi-Fi 网段上测试两台计算机时，请使用 local discovery。访客网络、VPN split 隧道或 disabled 多播可以 block mDNS — 在 LAN 发现 ry 失败时回退到打印的 multiaddr 或中继签入。

#### 74.4 Distributed discovery

在 Internet 中，节点 publish 并通过 configured bootstrap 对等点和中继解析 rendezvous 记录（DHT 加上中继查找 intent）。WAN discovery 需要可访问的 bootstrap multiaddr 和兼容的 discovery 配置文件（例如 source 运行中的“wan-default”）。零个 bootstrap 对等点或“connectivity-status”中的空中继名册通常表示 bootstrap 或防火墙错误configuration，而不是缺少 identity。

#### 74.5 Direct connections

当双方都公开可到达的地址时，libp2p 更喜欢在任何中继跃点之前使用 direct 拨号。Direct path 减少 latency 并将中继运算符保留在有符号的 envelope 数据平面之外。在every节点重新start、copy之后，最新的“监听：”multiaddr—动态port使保存的地址无效。

#### 74.6 NAT and firewall behavior

家庭路由器和公司防火墙通常 block inbound TCP 除非您转发 port 或使用 circuit relay。诊断 WAN connectivity 时，允许两个对等方上的节点进程使用 outbound TCP。`--connectivity-strict` 当所有 bootstrap 探测失败时，intent 会在 startup 上失败；disable 它只是暂时用于 diagnosis，然后是 restore 严格模式。

#### 74.7 Connection upgrades

libp2p 协商应用层以下的标识、流复用器和可选的中继预留。成功的 transport upgrade 不信任 grant — 债券 policy 仍然适用于 every intent。当对等点连接但签名的 envelope 交换随后失败时，启用 `--p2p-debug` 或审核 `p2p.trace` rows。

#### 74.8 Signed envelope streams

应用程序流量作为 Ed25519 签名的“EnvoyEnvelope”记录在 libp2p 流上传输，而不是作为仅受 IP 信任的不透明字节。inbound 防护会在 bond engine 运行之前检查大小、schema、signature 和重播。没有有效 signature 的实时 TCP session 仍会在审核中生成 deny 或 reject outcome。

#### 74.9 Offline peers and retries

在中继注册和通告地址刷新之前，重新start、睡眠或漫游的 Peer 可能无法访问。客户 retry 发现 ry 和 updated multiaddrs；temporary offline status 与 blocked 键不同。在将失败视为信任问题之前，请确认接力名单的新鲜度和 remote 签到。

#### 74.10 Network diagnostics

Run `npm run cli -w @envoymesh/node -- connectivity-status --profile <path>` for bootstrap counts and relay hints; add `--rich` for a text snapshot. Export audit timelines with `--include-p2p-trace` when sharing connectivity evidence. Use the same absolute profile path for the node, CLI, and Social—a mismatched path makes diagnostics look empty even when traffic exists.


### 75. Relay Services

#### 75.1 Why a relay may be needed

当 NAT、防火墙或移动性阻止 direct libp2p 拨号时，Relay 会提供帮助。它们提供 rendezvous、查找、可选 WebSocket entry 和电路 forwarding — 不是帐户登录或消息 decryption 权限。首先是 Try direct path；当对等体无法获悉彼此的可达地址时，添加中继。

#### 75.2 What a relay can and cannot do

中继有助于 rendezvous、查找、WebSocket 访问和 forwarding。它不会运行用户 models、成为 identity 权限或 receive permission 来绕过签名的 envelope policy。

#### 75.3 Select a relay

为 connectivity metadata 选择您信任的中继：社区 bootstrap 预设、运营商运行的 fleet 节点或您 admin 姐妹的私人中继。记录其 bootstrap multiaddr 并验证它是否支持 port 是否符合 build 所需的中继协议（当前 release 上的签入、查找和电路预留）。避免在 debugging—stale 注册混淆查找结果时频繁切换继电器。

#### 75.4 Connect through a relay

使用 `--relay` 和 `--bootstrap "<relay-multiaddr>"` （或等效的设置 entry）启动节点，以便它签入并 publishes 电路地址。当 direct path 失败时，远程对等点拨打 `/p2p- Circuit/p2p/<your-peer-id>`。确认双方使用兼容的 bootstrap 列表和相同的主要协议版本。

#### 75.5 Relay check-in and lookup

签入节点用`relay.checkin`注册；搜索者通过“relay.lookup”解决它们，默认情况下无需学习私人家庭IP。Audit row 如 `relay.checkin.ok` 和 `relay.lookup.response` 确认注册正常。中继上的空名册通常意味着客户从未完成签到或使用了错误的个人资料path。

#### 75.6 Routing hints

Relays 可能会返回同级或 fleet 提示，因此客户端 try 在放弃之前会替换 bootstrap paths。提示会影响下一步拨打的位置，而不是影响谁可以send 哪个intent。将提示视为优化；键 policy 和 signature 仍会在 ry 应用程序消息之前关闭。

#### 75.7 Use multiple relays

当一台主机出现故障或地理位置较远时，配置 figure 多个 bootstrap 中继以实现冗余。多宿主客户端可以签入多个中继，同时保留一份有界中继簿locally。更多继电器改进 reachability 选项；他们不merge信任存储或身份。

#### 75.8 Privacy when using a relay

Relays 请参阅连接 metadata — 对等 ID、计时和 forwarding paths — 不是签名的 envelopes 内的 decrypted 应用程序 payloads。相应地选择中继运算符，尤其是对于敏感工作流程。端到端 intent 授权仍然取决于债券和授权，而不是隐藏来自您选择的中继的流量。

#### 75.9 Change or remove a relay

在设置或启动标志中更新 bootstrap multiaddrs，重新start 节点，并在从您的书中删除旧中继之前验证新的签入。Peer 缓存 stale 电路地址可能会失败，直到它们重新发现您为止。记录固定旧中继相关multiaddr 的联系人的更改。

#### 75.10 Relay troubleshooting

在中继配置文件上运行“relay-status”，在客户端上运行“connectivity-status”；比较名册总数、bootstrap 计数和最近的“p2p.trace”row。常见修复：correct `--bootstrap` multiaddr、打开 outbound TCP、对齐配置文件 paths 以及 recopy post-restart listen 地址。有关命令参考，请参阅快速入门 WAN troubleshooting 和附录 K。


### 76. Operate a Relay

#### 76.1 Operator requirements

**Operator.** 仅当您可以维护 stable 主机、public reachability、密钥材料、public HTTP/WebSocket 表面的 TLS、访问控制、monitoring、upgrades 和 abuse 响应时，才运行中继。

#### 76.2 Install the relay

使用 public TCP listener 从 stable 主机上的当前存储库 ry release 构建或 deploy `apps/relay`。包 installs 和 source 运行这两项工作；保持中继版本与客户端节点一致，以避免预留握手偏差。记录您将提供给 fleet 客户的 bootstrap multiaddr。

#### 76.3 Configure identity and listen addresses

为中继分配其自己的 libp2p 密钥材料并绑定到 `/ip4/0.0.0.0/tcp/<port>` （或您的运营商标准）。打印并 archive 生成 `/ip4/.../tcp/.../p2p/...` multiaddr for bootstrap configuration。将中继 identity 与您在其他地方使用的任何个人 EnvoyMesh owner 配置文件分开。

#### 76.4 Configure public mode

公共模式通告外部可访问的地址（当前 build 上的“--advertise-addr”），因此 circuit relay 保留可以跨 NAT 工作。如果没有它，中继可能会出现仅发现ry — 客户端连接进行查找但保留握手失败。将公布的地址与您实际公开的 DNS 或防火墙规则进行匹配。

#### 76.5 Configure WebSocket access

当 thin clients 或 browser Social 实例必须通过中继建立隧道时，启用中继 HTTP/WebSocket 表面。在生产主机名的边缘终止 TLS。即使用户 WebSocket path 打开，也限制来自 public Internet 的 administrative 路由。

#### 76.6 Configure administrator access

根据 deployment 模型的要求，使用操作员凭据、网络 ACL 或相互 TLS 保护中继 admin API 和指标。切勿在 public 接口上公开未经身份验证的 admin endpoint。当操作员离开时轮换凭证并审核访问权限更改。

#### 76.7 Publish DNS and TLS endpoints

将 stable DNS 名称映射到中继 listen 地址和 install 用于 HTTPS 的有效 TLS 证书和安全 WebSocket。客户端将这些名称嵌入 bootstrap 预设和配对流程中。保持证书 renewal 自动化 — 过期的 TLS 会默默地破坏移动和 browser 客户端。

#### 76.8 Monitor health, metrics, roster, and logs

跟踪进程运行状况、中继名册大小、查找 latency 以及中继审核快照和主机指标的错误率。当名册意外减少或签到失败激增时发出警报。在事件期间将中继端跟踪与客户端“connectivity-status”相关联。

#### 76.9 Upgrade and back up a relay

备份upgrade之前的中继密钥材料和configuration；当客户端流量较低时安排维护。在多中继 fleet 中一次前滚一个中继，以便 bootstrap 列表始终包含健康的对等点。在停用旧 binary 之前，在 upgrade 之后测试电路预留。

#### 76.10 Respond to abuse

泛滥查找、预留或 WebSocket endpoint 的速率限制或 block 对等 ID。升级时使用 correlation ID 保留审计证据。记录您为 fleet 客户提供的 abuse 联系和删除流程——中继车ry connectivity metadata，即使他们没有阅读 envelope payload。


### 77. Multi-Relay Fleets

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="40" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="100.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Leaf A</text><rect x="200" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="260.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Leaf B</text><rect x="360" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="420.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Leaf C</text><rect x="180" y="140" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="260.0" y="157.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Relay 1</text><text x="260.0" y="173.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">checkin · lookup</text><rect x="440" y="140" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="520.0" y="157.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Relay 2</text><text x="520.0" y="173.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">sibling hint</text><path d="M100,80 L220,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M260,80 L260,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M420,80 L500,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M260,80 L500,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="380.0" y="106.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">multi-home</text><path d="M340,160 L440,160" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="156.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">one-hop miss-forward</text><rect x="20" y="210" width="720" height="40" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="226" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Bounded relay book · sibling gossip · split-checkin avoided</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 13 — Multi-relay fleet: leaf nodes multi-home across relays; siblings exchange hints and one-hop miss-forward lookups. The bounded relay book prevents split-checkin failures.</figcaption></figure>


#### 77.1 Why use several relays

多个中继可改善地理覆盖范围、正常运行时间和 bootstrap 冗余。客户可以拥有多个 bootstrap 条目，同时保留有界的 local 中继簿。车队运营商标准化预设，因此最终用户不会被锁定到单个社区节点。

#### 77.2 Configure bootstrap presets

Bootstrap 预设 bundle 已知良好中继 multiaddrs（例如 source 运行中的 public-libp2p`），因此新节点 start 与 WAN 发现 ry enabled。Operators 可以为企业 fleets 提供私有预设。预设种子 connectivity — 他们不建立port 联系人或信任关系。

#### 77.3 Client multi-homing

一个节点可以签入多个中继并同时维护多个电路地址。当一个中继区域性能下降时，多归属可帮助漫游用户保持可达性。本地中继簿修剪保持 storage 有界；stale 条目在 configured 个新鲜度窗口后掉落。

#### 77.4 Bounded relay books

Each node stores a capped relay book (`relay-book.json` in the profile directory) rather than an unbounded global directory. Eviction policies favor recently verified relays. Operators should monitor whether legitimate relays are aged out too aggressively in long-idle deployments.

#### 77.5 Sibling hints

当发生 primary 缺失时，同级提示会告诉查找客户端有关同一 fleet 中的备用中继的信息。它们减少了部分 outages 期间的失败拨号。提示是可选的优化；客户端仍必须完成对所选目标的签入和查找。

#### 77.6 One-hop lookup forwarding

当中继不持有注册时，它可能会向同级转发一次查找，而不是 build full 分层图。这涵盖了当今许多没有祖先/父/子协调的 fleet 拓扑。深度多跳 forwarding 仍然受到限制——请参阅 77.10 了解延迟的分层工作。

#### 77.7 Fleet health and diagnostics

使用“relay-status”和中继审核快照比较 fleet 中继的名册计数、签到率和查找成功率。在 configuration 更改后，从代表性客户配置文件中运行实时 WAN 验证测试。对 Runbook 中的配置文件 path 进行标准化，以便 CLI 和 UI 诊断保持一致。

#### 77.8 Live WAN validation

Prove cross-network paths with two profiles on different networks bootstrapping to the same relay, then exercise ping, chat, or audit-verified intents. QuickStart's cross-network relay walkthrough and `npm run poc:discovery` smoke modes are reference flows. Record correlation IDs from both sides when filing connectivity bugs.

#### 77.9 Current coordination limits

今天的多中继支持port 涵盖了有界书籍、兄弟提示和一跳错过forwarding — 不是完整的分层中继图或全球中继市场。相应地规划 fleet 布局。77.10 中标记为 **延迟** 的功能是设计目标，而不是隐藏的 toggles。

#### 77.10 Full hierarchical relay graph — deferred

**推迟。** 当前的多中继协调支持 port 的有界书籍、同级提示和一跳错过 forwarding；完整的分层祖先/父/子图仍然是未来的工作。


---

## Part XI — Terminals, Browser, and Advanced Use

### 78. Terminals

#### 78.1 Open the Terminals view

从 Social 的导航中打开 Terminal，或从符合条件的聊天 thread 中打开 start 和 session。view 列出主节点上活动的 PTY session 并提供用于附加、调整大小或结束它们的控件。当与 home 配对时，EnvoyGo 通过其终端 screen 公开相同的功能。

#### 78.2 Create and manage a terminal session

创建 session 以在主桌面节点上生成 shell PTY ；当 UI 支持 port 时，您可以使用 tag session 的名称或 tag sessions，以便您可以找到长时间运行的工作。多个客户端可以在 policy 上附加读/写 depending。会话持续到关闭或节点 restarts — 将 important 输出保存到其他位置。

#### 78.3 Understand the home PTY

终端进程在主桌面节点上作为 PTY 运行。EnvoyGo 和 Social UI 是 session 的客户端，因此命令使用家庭用户的操作系统 permission 执行。

#### 78.4 Use terminal input and output

在终端窗格中键入命令；stdout 和 stderr 通过经过身份验证的 WebSocket 或 JSON-RPC 隧道流回。移动客户端中的大输出可能会被截断 - 对于大量日志，首选桌面 Social。复制/paste 行为follows 您的平台和browser 约束。

#### 78.5 Use agent-assisted terminal mode

当代理协助为 enabled 时，EnvoyAI 可能会根据您的对话上下文建议 shell 命令。Review every 在执行之前建议的命令 — 代理协助不会绕过您 configured 的批准。被拒绝的命令应该以明确的 outcome 出现在审核中。

#### 78.6 Access terminals from EnvoyGo

EnvoyGo 通过配对的 JSON-RPC transport 连接到主节点 PTY session；命令仍然在操作系统 permission 的桌面上执行。使用移动终端时，保持主节点处于唤醒状态并可通过中继或 LAN 进行访问。将电话访问视为对强大表面的 remote 控制。

#### 78.7 Security and approvals

Terminal 访问权限非常强大，可以更改文件、凭据或软件。限制配对、要求批准代理建议的命令、在执行前检查命令以及关闭废弃的 session。

#### 78.8 Close a session safely

在关闭终端选项卡之前，彻底退出长时间运行的程序（“exit”、“Ctrl+D”或特定于应用程序的停止命令）。突然断开连接可能会使 background 作业在主节点上运行。如果您shared session unintent，则撤销配对或更改批准。

#### 78.9 Troubleshoot terminals

如果附加失败，请确认主节点正在运行，WebSocket 或中继 path 运行正常，并且您的 session token 有效。检查审核是否需要身份验证或与终端 RPC 相关的 deny row。仅在关闭您不希望孤立的敏感 session 后重新start 节点。

#### 78.10 External terminal integrations

一些 release 通过同一个主 PTY 边界 ry 集成外部终端产品，而不是 grant 使用 libp2p 键。在“设置”中配置figure集成，并将其限制在受信任的网络中。外部工具继承主节点操作系统权限 - 请注意与 local shell 访问相同的注意事项。


### 79. Browser

#### 79.1 Open the Browser view

打开从 Social 或 EnvoyGo 到 browse 允许的网格 content 的 Browser。默认情况下，view 通过主节点的 policy 边界ry 解析 `envoy://` URL，而不是 public web。在移动设备上加载 content 之前，需要 Pairing 或 local 节点可用。

#### 79.2 Navigate `envoy://` content

`envoy://` URL 由作者和 path 标识网格托管的 content，而不是 public web 服务器。解析通过配对或 local 节点及其信任 policy。

#### 79.3 Browse authors and topics

Brow 由作者 DID、publish 编辑的主题，或满足您的纽带 policy 暴露。陌生人只能看到 public-sensitivity 材料；当作者对其进行 publish 编辑时，绑定联系人可能会看到 friends 级 note。空列表通常意味着 policy 拒绝，而不是损坏的 index — 检查 trust tier 和 sensitivity label。

#### 79.4 Use history and bookmarks

Browser history 和书签将 local 存储在您的个人资料中，以便快速返回到您已访问过的网格页面。清除 history 不会取消publish remote content。书签引用 `envoy://` paths；如果作者移动了 content、update 或 remove stale 条目。

#### 79.5 Publish from the Browser

发布会从 note 和您拥有的页面创建或 update 网格可见 content，并受 Library 中每个项目 sensitivity toggle 的约束。公共项目在速率限制内可通过“knowledge.query”进行查询ry；friends 级别的项目需要适当的债券。在 publish 敏感的 draft 之前先于 view sensitivity。

#### 79.6 Subscribe to feed updates

当新网格 content 出现且 policy allows delivery 时，订阅作者或主题以 receive feed updates。订阅遵守保证金和 sensitivity 规则 - 放弃保证金可能会默默地停止 updates。在 EnvoyGo 上推送 notification 取决于主节点 forwarding 和平台 permission settings。

#### 79.7 Use Browser on EnvoyGo

EnvoyGo 通过配对的主节点渲染 Browser，mirror 桌面 policy 在较小的 screen 上生成结果。保留主节点online；当 offline 时，cached 页面可能是 stale。只读 browsing 不能替代 Library editing — 尽可能在桌面上创建 note。

#### 79.8 Paired-mode requirements

Mobile Browser 需要完整的 EnvoyGo 与健康的家庭 JSON-RPC session 配对。如果没有配对，手机就没有保险库、债券存储或 signing 上下文来解析 envoy://` URL。如果 session token 过期或主要主节点 identity 更改后，请重新配对。

#### 79.9 Troubleshoot Browser content

当页面加载失败时，验证 URL 作者是否存在，sensitivity allow 是您的 trust tier，并且主节点可以到达 publishing 对等点。Audit 可能会显示用于提取的键 deny 或 schema reject — 而不是通用 HTTP 404 语义。在键 acceptance 或作者 republish 之后返回ry。


### 80. Advanced Settings

#### 80.1 Node settings

Node settings 涵盖个人资料 identity、display name、发现ry 个人资料、listen 地址以及家庭 runtime 的服务 port。更改通常需要 restart 才能生效。在 editing paths 或 ports 之前记下您的个人资料 directory path ，以便 CLI 和 Social 保持一致。

#### 80.2 Network and bootstrap settings

Configure bootstrap multiaddr、预设、严格的 connectivity 模式以及此处或通过等效启动标志公布的 listen 地址。Misconfigured bootstrap 列表是最常见的 WAN 故障模式。更改后，运行 `connectivity-status` 并检查 bootstrap 探测结果的审核。

#### 80.3 Relay settings

启用客户端中继模式，设置 bootstrap 中继，并从中继 settings 管理 local 中继簿。这些控件会影响其他人（而不是您信任的人）拨打您的电话的方式。在 rollout 期间，将中继更改与客户端和中继操作员配置文件上的“relay-status”配对。

#### 80.4 AI and model settings

AI settings 选择提供商、模型路由、semantic firewall 行为和 EnvoyAI/OpenClaw 网关集成。API 密钥和模型凭证位于配置文件 configuration 中 - 安全地备份它们，并且永远不要 paste 将它们放入 superport bundle 中。当气隙 policy 需要仅 local 推理时，禁用 remote models。

#### 80.5 External-agent settings

外部代理 settings configure HomeClaw、Hermes、OpenHuman 或自定义 HTTP 桥，包括 ports、承载密钥和 enabled 预设。桥接前向 policy 检查的工具 - 它们不 receive 原始 libp2p 键。妥协后轮换网桥机密，并针对审核 JSONL 重新view 操作 history。

#### 80.6 Agent Network settings

Agent 网络 settings 控制选择加入协作、工作人员 visibility、团队工作预算和 orchestration 限制。在代理商合作之前，双方必须选择加入并持有适当的债券。在启用自动支出重新平衡之前，从 manual 批准和小任务开始。

#### 80.7 Knowledge and storage settings

将保险库指向“shared_vault/”（source 运行中的默认值）或 configured path；enable Library plugin，例如 Knowledge 基础下的 Obsidian 或 MCP。灵敏度默认值和 indexing 选项位于此处。大型保管库移动需要在主节点上重新index 时间和磁盘空间。

#### 80.8 Call and TURN settings

Voice call settings 包括 STUN/TURN URL、凭证和 EnvoyGo 的平台特定推送主题。Misconfigured TURN 可防止跨严格 NAT 的调用。视频在当前 release 上仍然受到限制 - 在对用户进行 video 工作流程培训之前确认功能 status。

#### 80.9 Notification settings

Configure 在主节点上推送 notification 提供程序 (APNS/FCM)，并在 EnvoyGo 上提示 permission。Deliverry 取决于主节点 forwarding、中继 reachability 和 OS battery 策略。在为 every 聊天消息启用警报之前，使用低噪音 channel 进行测试。

#### 80.10 Logging and diagnostics

调整详细程度、p2p 跟踪捕获和来自 logging settings 的诊断 export 或 CLI 标志，例如 `--p2p-debug`。即使控制台 logging 安静，Audit JSONL 仍保留 authoritative allow/deny 轨迹。在共享日志之前编辑机密 — 请参阅附录 K。

#### 80.11 Experimental settings

Experimental toggles 门功能仍在接受验证；接口和默认值可能会在 release 之间发生变化。仅在非生产配置文件上启用它们，直到 release note 将它们标记为 **Available**。记录在重新port处理错误时您enabled了哪些toggle。

#### 80.12 Restore recommended defaults

恢复建议的默认值会重置有风险或非标准的 settings，同时保留 identity 密钥和保管库 content。在 connectivity 实验或失败的代理桥试验之后使用此选项，然后升级到 SUport。如果您自定义了许多字段，则首先是port 配置文件backup。


---

## Part XII — Privacy, Trust, and Security

### 81. Identity and Key Safety

#### 81.1 Owner identity

owner identity 是代表人类的长寿 root。它签署 device 证书、授权和其他授权，因此它的 private key 值得最强的 backup 和访问保护。

#### 81.2 Device identity

每个 device 都有自己的 identity，并由 owner 授权。这可以让您revoke一台丢失的机器，而无需改变人类的owner identity eve ry位置。

#### 81.3 Agent identity

代理具有不同的密钥和将其链接到 owner 的 owner 签名凭证。因此，Peers 可以验证哪个 owner 授权了代理，而无需将代理密钥视为 owner 密钥。

#### 81.4 Peer identity

对等 identity 是用于签名 envelope 和 networking 的 runtime sender identity。它不能与 owner、device 或代理 identity 互换，即使一个节点拥有其中多个。

#### 81.5 Ed25519 signatures in plain language

Ed25519 允许 send 用户使用 private key 创建紧凑的 signature，并让其他人使用 public 键对其进行验证。验证证明消息integrity和关键possession，而不是证明该人是值得信赖的。

#### 81.6 DID presentation

UI 和审计中的 DIDs (`envoy:owner:...`, `envoy:device:...`, `envoy:agent:...`) label 身份，无需替换密钥 verification。在教别人验证您时，将 DID 与 fingerprint 一起呈现。除非 signature 检查成功，否则匹配字符串不是 proof。

#### 81.7 Key storage

私钥保留在具有限制性文件模式的节点配置文件中（敏感 JSON 上为“0o600”）。EnvoyGo 将配对密钥存储在操作系统安全 storage 中，而不是 owner root 密钥中。如果没有 encryption，切勿将 copy private key 文件放入聊天、电子邮件或云驱动器中。

#### 81.8 Backup and recovery

在使用 restore 钻头测试的 encrypted media 上一起备份 owner 密钥材料、device 证书、信任存储和 Vault。丢失唯一的 owner 密钥 backup 可能需要新的 identity。将热 backup 与 offline 副本分开，以限制勒索软件的传播。

#### 81.9 Device certificates

设备证书是 owner 签名的 document，将 device public 密钥绑定到您的 owner identity。Pairing EnvoyGo 或添加笔记本电脑会生成新的证书链。当硬件丢失时立即撤销证书 - 请参阅第 88 章。

#### 81.10 Revocation

吊销记录会使 device 证书或授权失效，而无需轮换 owner 密钥。发布来自仍受信任的 device 的撤销，并在下次握手时审核对等 reject stale 凭据。所有者密钥泄露需要 identity migration，而不是单独的证书 revoke。


### 82. Bonds and Trust Policy

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="170" height="40" fill="#645a3a"/><text x="105" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">Trust Tier</text><rect x="190" y="10" width="170" height="40" fill="#645a3a"/><text x="275" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">Meaning</text><rect x="360" y="10" width="220" height="40" fill="#645a3a"/><text x="470" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">What it allows</text><rect x="580" y="10" width="160" height="40" fill="#645a3a"/><text x="660" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">Sensitivity ceiling</text><rect x="20" y="50" width="170" height="55" fill="#FEE2E2" stroke="#3d5a45" stroke-width="1"/><text x="105" y="82" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">blocked</text><rect x="190" y="50" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="82" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Deny all</text><rect x="360" y="50" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="82" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">—</text><rect x="580" y="50" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="82" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">—</text><rect x="20" y="105" width="170" height="55" fill="#F5F5F4" stroke="#3d5a45" stroke-width="1"/><text x="105" y="137" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">public</text><rect x="190" y="105" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="137" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Stranger</text><rect x="360" y="105" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="137" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">ping · narrow discovery</text><rect x="580" y="105" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="137" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">public</text><rect x="20" y="160" width="170" height="55" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="105" y="192" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">referred</text><rect x="190" y="160" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="192" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Introduced</text><rect x="360" y="160" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="192" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">knowledge · limited tasks</text><rect x="580" y="160" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="192" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">friends</text><rect x="20" y="215" width="170" height="55" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1"/><text x="105" y="247" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">direct</text><rect x="190" y="215" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="247" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Friend</text><rect x="360" y="215" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="247" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">full collaboration + Team jobs</text><rect x="580" y="215" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="247" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">friends · trusted</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 3 — Bond trust tiers: each tier caps what a contact may do and the maximum data sensitivity. Higher tiers unlock richer collaboration; blocked denies everything.</figcaption></figure>


#### 82.1 What a bond means

绑定记录另一个 owner 的 local trust tier 并驱动确定性 policy。身份回答“谁签名”；该债券回答“这种关系可以做什么”。

#### 82.2 Self trust

自身是 local owner 的最高信任上下文，可以在 local policy 内到达私有 sensitivity。

#### 82.3 Direct trust

Direct 代表有意信任的联系人，并允许最广泛的 remote 工作流程，通常高达 friends 级别 sensitivity，除非额外的 policy 对其进行限制。

#### 82.4 Referred trust

推荐代表通过 introduction 或受限入职建立的有限信任。Knowledge 和团队作业操作仍然受到更多限制，可能需要批准。

#### 82.5 Public trust

公共是 stranger/默认层。仅 narrow discovery、ping、introduction 和 public 知识行为符合资格；这对于团队工作 recruitment 来说是不够的。

#### 82.6 Blocked trust

无论所宣传的功能如何，“阻止”都会拒绝通信。将其用于 abuse、妥协或不应再到达节点的关系。

#### 82.7 Capability gates

功能将 intent 和工具操作映射到 allow、deny、挑战或批准 outcome。如果授权或 sensitivity 禁止，联系人可能已 direct 但仍被拒绝执行特定的保管库操作。检查审核 `deny` row 是否缺少功能名称。

#### 82.8 Sensitivity ceilings

每个 trust tier 限制知识和数据操作的最大 **sensitivity** (`public` / `friends` / `trusted` / `private`)。即使 intent 以其他方式 allow 处理，高于上限的请求也无法关闭。在与 referred 联系人共享之前降低 sensitivity。

#### 82.9 Challenges and approvals

陌生人层或高风险操作可能会返回 **挑战** 或 **批准** outcomes，而不是 immediate allow。人工批准落在主节点上的批准 queue 中。请勿通过重复 retry 相同的 payload 来绕过批准。

#### 82.10 Change or revoke trust

更改联系人 settings 中的 trust tier 或对 device 和授权发出签名撤销。降级在下一次 inbound 操作时生效；已经 shared 个文件保留在对等节点上，直到它们 delete local 复制为止。记录未来事件 review 的等级更改。


### 83. Signed Messages and Protocol Safety

#### 83.1 Signed messages

Every envelope 在 canonical JSON 上经过 Ed25519 签名，因此可检测到 table 篡改。未签名或错误签名的 payload 在 policy 运行之前无法通过 inbound 防护。签名证明了关键的 possession，而不是道德信任——与债券配对。

#### 83.2 Sender and recipient roles

角色（“人类”、“代理”、“系统”）按照 intent 强制执行 schema —“chat.message” 需要人对人，任务 intent 需要代理对代理。验证时角色不匹配 rejects。UI 选择必须与预期角色 path 匹配。

#### 83.3 Typed intents

意图通过 Zod 验证的 payload 键入（`chat.message`、`knowledge.query`、`task.propose`、...）。未知的 intent 无法关闭。Agent 和集成必须使用 correct intent 进行操作，而不是不透明的 blob。

#### 83.4 Message and correlation identifiers

`messageId` 标识一个 envelope；“correlationId”在跨同行的审计中缝合多步骤流程。共享诊断时包括 correlation IDs。重放重复数据删除使用 inbound 保护窗口内的消息 ID。

#### 83.5 Schema validation

入站 payload 在债券评估之前通过 schema 验证。格式错误的 JSON 或字段违规会返回结构化错误，而不会触及 Vault 或 models。客户端错误在审核中显示为验证失败，而不是静默删除。

#### 83.6 Signature verification

验证重新计算 canonical JSON 并根据 sender public 键检查 Ed25519 signatures，该键必须 hash 到 `senderPeerId`。policy 之前 verification 拒绝失败。为了方便起见，切勿使用disable verification。

#### 83.7 Replay protection

inbound 保护 reject 在重播窗口内重复“messageId”值以限制重播攻击。时钟偏差影响排序，但不影响 signature 有效性。重新start节点不会在session中期重置对等重播状态。

#### 83.8 Rate and size limits

在昂贵的工作之前，外交官对流强制执行速率和大小上限。过大的聊天或文件提前 payloads deny。来自一个对等点的突发流量可能会节流 — 回退而不是 split 形成许多小消息。

#### 83.9 Malformed message handling

格式错误的消息会通过审核摘要进行 reject 编辑；防护措施不会因错误输入而导致节点崩溃。来自对等方的持续格式错误的流量是 block 层的理由。捕获一个样本进行诊断，而无需在生产中启用详细的 payload logging。

#### 83.10 Protocol versioning

协议版本字段在握手期间控制不兼容的对等方。混合版本 fleet 应该每 release note 一起将 upgrade 继电器和节点连接在一起。版本不匹配表现为连接失败，而不是部分无提示地中断聊天。


### 84. Security Architecture

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 790 230" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:790px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="75.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Diplomat</text><text x="75.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">network boundary</text><rect x="150" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="205.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Inbound Guard</text><text x="205.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">size · schema · sig</text><rect x="280" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="335.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Bond Engine</text><text x="335.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">trust · policy</text><rect x="410" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="465.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Task Runtime</text><text x="465.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mandate · expiry</text><rect x="540" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="595.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Semantic FW</text><text x="595.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">prompt filter</text><rect x="670" y="40" width="100" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="720.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault</text><text x="720.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">path safety</text><path d="M130,70 L150,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M260,70 L280,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M390,70 L410,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M520,70 L540,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M650,70 L670,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="150" y="150" width="110" height="30" rx="6" fill="" stroke="#FEE2E2" stroke-width="1.2"/><text x="205.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#5d3ac7" font-weight="600" fill="#1e1d1b">DENY</text><text x="205.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">drop</text><path d="M205,100 L205,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="280" y="150" width="110" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="335.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">DENY / challenge</text><path d="M335,100 L335,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="410" y="150" width="110" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="465.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">DENY / approve</text><path d="M465,100 L465,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="540" y="150" width="110" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="595.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">REJECT prompt</text><path d="M595,100 L595,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="20" y="210" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Each layer fails closed. No single layer suffices — defense in depth.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 5 — Security pipeline: six ordered layers from network boundary to Vault. Each can deny, challenge, or require approval; the chain fails closed and no single layer is trusted alone.</figcaption></figure>


#### 84.1 Network boundary

Diplomat（网络边界ary）accepts字节和连接，但没有direct模型或文件系统权限。它仅解析、限制和转发经过验证的 request。

#### 84.2 Inbound guard

入站警卫检查大小、schema、signature 并在 bond engine 之前重播。它没有 Vault 或模型访问权限，只有 accept 或 reject。大多数用户可见的“消息失败”会在此处或键 deny 处跟踪 start。

#### 84.3 Bond policy engine

在特权工作继续进行之前，Bond 引擎将 trust tier、intent、能力和 sensitivity 转换为 allow、deny、挑战或批准决策。

#### 84.4 Task runtime guard

任务 runtime 守卫在代理工作期间强制执行任务 expiry、取消、collect-N 终止和操​​作列表。即使 allowed 债券也不能超过过期授权。当作业中途停滞时，重新执行view任务journal并进行审核。

#### 84.5 Semantic firewall

semantic firewall（模型边界ary的一部分，历史上称为大脑层）reject空的、过大的或包含控制字符的模型会在模型看到它们之前提示并规范化过多的换行符。

#### 84.6 Model boundary

model router receive 仅在债券和任务守卫之后批准上下文；外部代理永远不会通过桥接工具绕过它。提示在提供程序调用之前传递 semantic firewall。模型输出不会自动执行保管库写入。

#### 84.7 Vault isolation

Vault 强制 path 安全和显式操作。remote 对等方和外部代理 receive 都不能不受限制地访问文件系统。

#### 84.8 Path and file safety

Vault 操作根据 allow 列表解析 path；`../` 和不安全的符号链接 deny。远程对等点永远不会获得仲裁 ry 文件系统 paths - 只能获得显式保管库 intents。当 indexing 新的 Library folders 时，验证 local paths。

#### 84.9 SSRF protections

MCP 和桥接 URL 验证限制不安全的 remote 目标和普通 HTTP 默认值，从而减少集成探测内部服务的机会。

#### 84.10 External-agent isolation

桥和 MCP 适配器公开 curated 工具，而不是 shell 或 libp2p。令牌验证桥接 HTTP；规定每个工具调用的范围。外部代理的妥协由债券 + 授权来遏制，而不是 full node 访问。

#### 84.11 Relay trust boundary

中继是一种 connectivity 服务，而不是受信任的大脑。即使中继操作员是 reputable，端到端 signature 和主节点 policy 仍然是必要的ry。

#### 84.12 Defense in depth

安全堆栈外交官 → inbound 守卫 → bond engine → 任务守卫 → semantic firewall → 保险库 path 检查。单层是不够的——connectivity 成功并不意味着授权。设计集成时在每一跳默认假设 deny。


### 85. Privacy Controls

#### 85.1 Profile visibility

选择每个 trust tier 可以获取哪些配置文件字段 — public bio 与仅 friends photo 。发布过度开放的默认设置会让您发现ry主题。改变信任关系后重新访问。

#### 85.2 Contact disclosure

Contact 卡片仅显示 policy 和您的 disclosure settings 所允许的关系。介绍流程显示 minimal proof 文本，直到 upgrade。除非有意，否则请勿在签名的 proof 中嵌入第三方电话号码。

#### 85.3 Knowledge sensitivity

索引和查询 ry 知识与 sensitivity tags；referred 和 public 层无法读取 private-indexed chunk。在 Team jobs 中分享摘要之前重新tag。Mis-tagged content 是一个 privacy 错误，而不是 crypto 故障。

#### 85.4 Conversation retention

Conversation history 保留在您的主节点上，除非您 export 它。保留控制（如果提供）会修剪 local indexes，而不是已 accept 编辑的消息的 remote 对等副本。使保留率与 backup policy （第 89 章）保持一致。

#### 85.5 Agent memory

Agent memory 和 session 上下文位于受授权和 settings 管理的主节点存储中。清除代理 memory 不会 delete 对等聊天日志。范围授权限制了 history 工具可以检索的数量。

#### 85.6 Vault sharing

Vault 共享使用显式 intent 以及 sensitivity 和 path 安全性 — 没有隐藏的 folder sync 到 stranger。Team jobs 仅拉取强制的保管库切片。Audit 当代理“找不到”文件时，保险库检索会被拒绝。

#### 85.7 Model-provider privacy

云模型提供商 receive 通过 configured 适配器提示您 send - 重新view 他们的术语，并且对于敏感主题更喜欢 local models。语义防火墙可减少渗透模式，但不是 full DLP 套件。禁用分类工作流的云路由。

#### 85.8 Relay privacy

Relays 看到连接 metadata 和他们转发的 encrypted/signed 帧 - 他们不是纯文本聊天的可信读者。避免将机密放入中继可见的路由提示中。选择您可以接受的继电器是为了可用性，而不是为了保密性。

#### 85.9 Audit-log privacy

默认情况下，Audit JSONL 存储结构化摘要，而不是 full 消息正文。保护审计文件，例如密钥“0o600”和 encrypted backup。在外部共享日志之前编辑 tokens。

#### 85.10 Delete local data

**您的**节点中的本地 delete removes threads、保管库对象或配置文件字段；同行可以保留副本。使用 block 和 revoke 来表示正在进行的 abuse。如果在停用硬件之前存在操作系统support，则保护-delete media。


### 86. Audit and Activity History

#### 86.1 Why EnvoyMesh records activity

Audit 记录使 policy 和自动化重新view 成为可能。EnvoyMesh 记录结构化摘要和相关标识符，而不是将代理 activity 视为不透明的模型转录本。

#### 86.2 Audit-event fields

Audit 事件 carry `eventId`、`createdAt`、`type`、`intent`、`outcome`、`summary`、可选 `remotePeerId`、`correlationId` 和 `latencyMs`。在“设置”→“活动帮助”中了解“glossary”字段。摘要是人类可读的；关联多跳跟踪的 ID。

#### 86.3 Correlation across peers

将 shared `correlationId` 值用于 follow 跨绑定、中继转发和两侧工具调用的一个用户操作。CLI `audit --include-p2p-trace` 在 debugging WAN path 时扩展跟踪。仅通过经过验证的 channel 向联系人询问其一方的 ID。

#### 86.4 Policy allow and deny records

允许并 deny row 证明 policy 决定，其中包含 intent 名称和原因 — essential “为什么是 blocked？”纠纷。Approval 显示为单独的 outcome。Export 过滤了 superport 的审计切片，已编辑。

#### 86.5 Task and Team job records

团队作业生命周期事件附加到任务 journal 并通过状态转换进行审核（“发现”、“正在运行”、“已完成”等）。将作业 ID 与生成该作业的聊天 thread 相关联。失败的作业保留错误摘要，而没有原始模型记录。

#### 86.6 Tool and approval records

工具调用和人工批准 queue 条目记录任务操作、工具名称和 outcome。被拒绝的工具名称缺少功能。使用这些 row 来调整任务而不禁用审核。

#### 86.7 External-agent records

网桥和 MCP 流量 tag 外部代理 identity 与本机网格对等体分开。交叉检查承载身份验证失败与绑定拒绝。这些 row 中的外部妥协调查 start。

#### 86.8 Network diagnostics

网络诊断审核条目记录中继预留、拨号失败和 connectivity 快照 — 无消息明文。在 outag 期间与 `connectivity-status` CLI 配对。不要在生产中经常使用 enable 冗长的 libp2p logging 。

#### 86.9 Inspect an end-to-end flow

选择一条失败的消息或作业，note 其 correlation ID，并按时间顺序对家庭和同事（如果有）进行审核。确定失败是守卫、绑定、反式port 还是模型。在第一个明确的 deny 原因之后停止 - 避免随机设置更改。

#### 86.10 Retention, backup, and protection

Audit 记录 grow 无界，无需运算符轮换 — archive JSONL 到 encrypted backup media。将审计纳入灾难-__学期_7__ 演习中。限制对受 owner 信任的 device 的读取访问。


### 87. Respond to Security Incidents

#### 87.1 Lost device

来自受信任的 device、revoke 丢失的 device、rotate 其持有的任何网桥或中继 token，以及重新view 最近的 activity。如果丢失的 device 持有唯一的 owner 密钥 backup，recovery 可能需要创建一个新的 identity。

#### 87.2 Compromised owner key

将暴露的 owner private key 视为 root 妥协。断开受影响的节点的连接，保留证据、rotate 相关凭据、通知受信任的联系人，并迁移到新的 owner identity，因为旧密钥中的 signature 不再可信。

#### 87.3 Suspicious contact

降低对 public 或 block 的信任，保留审核和最近的 thread，并在恢复 direct 层之前验证 identity out of band。不要从可疑的 thread 执行文件打开或工具批准。通过block 和document 审核export 重新port 协调骚扰。

#### 87.4 Misbehaving agent

暂停或 revoke 代理任务，disable 桥接 token，并检查工具审核是否有意外的保险库或网格调用。重新启用之前 Narrow `allowedActions`。将重复的授权违规视为潜在的即时注入或受损的集成。

#### 87.5 Compromised external agent

轮换网桥承载 tokens、disable 外部代理的 MCP 注册，并重新view 自上次已知良好以来的所有工具调用。外部特工从未有过 libp2p — 收容范围为 token + 任务范围。仅在新的秘密和更严格的任务下重新enable。

#### 87.6 Malicious file or knowledge content

不要打开未知的attachments；隔离默认 Vault 打开 path 秒之外的下载。如果恶意 content 被摄取，则重新index 知识 source。如果您的节点因密钥泄露而转发了以您身份签名的恶意软件，则向联系人发出警告。

#### 87.7 Relay incident

如果中继运营商重新ports abuse 或outage、rotate 主隧道tokens 并验证Agent 卡URLs 仍然指向您的节点。Relays 无法 decrypt 聊天，但可能会中断可用性 - 在配置中设置第二个 ry bootstrap 中继。记录审计 review 的事件时间窗口。

#### 87.8 Revoke, block, and pause

对联系人使用 block 层，对 device 和客服人员使用 revoke，并从 Agent 网络 UI 暂停 Team jobs。命令：停止持续的伤害 (revoke/block)，然后调查审计，然后 restore 和更严格的 policy。暂停是可逆的；blocked 联系人需要经过深思熟虑的unblock。

#### 87.9 Preserve diagnostics

在清除日志或重新install之前复制相关审核JSONL段和correlation ID。从 shared bundle 中删除 tokens、private keys 和 recovery 短语。在文件名中存储包含事件日期的证据 encrypted。

#### 87.10 Report a vulnerability

通过 release notes 或 repository SECURITY policy 中列出的项目协调的 disclosure channel 重新port 安全缺陷。包括复制步骤和版本，而不是实时密钥。不要在没有 permission 的情况下针对生产同行测试漏洞利用。


---

## Part XIII — Manage Devices and Data

### 88. Device Management

#### 88.1 View devices

打开设置 → 设备以列出 owner 授权的计算机和 EnvoyGo 配对以及创建日期和最后 activity 提示。每个 entry 映射到 device 证书，而不是 owner root 密钥。在撤销 stale 硬件之前使用此 view。

#### 88.2 Add a desktop device

在新计算机上安装 Social/Tauri，restore 或从 owner 授权流程创建 device identity，并从现有受信任的 device 批准新证书。通过 backup restore（第 89 章）复制 profile data，而不是通过聊天手动传递 copy 关键文件。

#### 88.3 Pair EnvoyGo

在桌面Social上打开Pairing → 显示二维码；在 EnvoyGo 中点击“配对”并扫描“envoy://pair？...”。如果 queue 出现提示，请批准家庭中的 pending device。在停用旧手机配对之前，请确认通过 HomeRemote 加载聊天。

#### 88.4 Understand separate device identities

Devices can share one owner identity while retaining independent device keys and certificates. This supports targeted revocation and audit attribution.

#### 88.5 Review device activity

按 device ID 过滤审核和 device 列表，以查看哪台计算机发送了消息或调用了工具。出差令 revoke 后出现意外的 device ID。EnvoyGo 操作似乎归因于配对的手机 device，而不是桌面。

#### 88.6 Revoke a device

选择device → 撤销证书；节点 rejects 新 sessions immediately。旋转 device 所持有的桥接器或继电器 token。revoke 之后的物理访问仍然读取旧的 local 缓存 — shared PC 上的 encrypt 磁盘。

#### 88.7 Move to a new computer

在新主机上获取 full 配置文件 backup、install、restore 密钥和 Vault，然后为旧电脑获取 revoke 证书（如果旧电脑报废）。如果您的 public multiaddr 发生更改，请验证网格 listen 地址和 update 联系人。在退役之前发送测试 DM。

#### 88.8 Replace a lost phone

首先从桌面撤销丢失的 EnvoyGo 配对，然后将替换手机与新的 QR 配对。假设丢失手机的配对 token 在解锁后会受到影响。请勿在manually 之间克隆手机之间的配对文件。

#### 88.9 Device synchronization boundaries

EnvoyGo syncs 选择了 NodeService views — 不是 full 网格副本。Desktop 和移动设备可能会显示不同的设置深度。Conversation 在家里注明 authoritative；移动缓存将于 re-pair 清除。


### 89. Back Up and Restore

#### 89.1 Backup strategy

使用分层 backup：将 owner 和 device 凭据与可替换的应用程序二进制文件分开保护，并按测试的计划备份 configuration、信任、Vault content 和 important 记录。

#### 89.2 Identity keys

Export owner 和 device private key 仅进入 encrypted backup archives；切勿将明文密钥存储在云 sync folder 中。每年在一台隔离机器上测试 import。丢失 owner 密钥而没有 backup 则为 identity 丢失。

#### 89.3 Configuration

备份“node-config”、中继 token、模型提供程序 settings，并使用在第二个 ry 副本中编辑的机密来桥接机密。单独对非秘密配置模板进行版本控制。在 OS reinstall 之后的 starting 节点之前恢复配置。

#### 89.4 Contacts and trust

Include `trust-records.json` and peer directory in backup—losing trust store turns friends into strangers locally. Export before major migrations. Restored trust must match still-valid remote keys.

#### 89.5 Conversations and sessions

Conversation indexes 和 session 存储在配置文件 JSON/JSONL 中；用主页配置文件支持他们。Mobile 保存 minimal 缓存 — re-pair 从家里刷新。大的 media 可能存在于 89.6 中包含的 Vault path 中。

#### 89.6 Vault and Library

Vault 和 Library 文件需要文件系统级 backup 以及 indexes。块存储和 search index 重新build 缓慢 - 在节点停止时首选一致的快照。在 restore 之后验证随机文件 hash。

#### 89.7 Audit and task history

Archive `audit-events.jsonl`, `task-journal.jsonl`, and approval queues for compliance. Rotation policies prevent unbounded disk use. Restored audit on new hardware preserves historical correlation IDs.

#### 89.8 Restore and verify

恢复到干净的install，import密钥和数据，start节点offline进行验证，然后enable网络和send测试消息。将 owner DID 和 device 列表与灾前记录进行比较。撤销不应在 restore 之后返回的 device。

#### 89.9 Disaster-recovery checklist

维护一份打印的或 offline 清单：owner 钥匙 backup 位置、中继 bootstrap、要通知的可信联系人、device 的 revoke 订单以及最后验证的 restore 日期。每年进行 tabletop 锻炼。存储没有实时秘密的清单。


### 90. Updates and Migration

#### 90.1 Check the installed version

升级之前，请在 CLI 上检查 Social/Tauri 或 `envoy --version` 中的 **关于** 与 release note 。分别注意中继和移动应用程序版本 - 混合版本会导致握手意外。重新port处理错误时记录build hash。

#### 90.2 Update the desktop application

彻底退出应用程序，运行 installer 或 bundle update，重新启动，并确认 identity 已加载到 status 中。Desktop updates 仅替换二进制文件 - 配置文件 directory 仍然存在。如果 startup 失败，则回滚 binary，而不是通过删除配置文件。

#### 90.3 Update EnvoyGo

从应用程序商店更新 EnvoyGo 或旁加载 fleet 使用的 channel；re-pair 如果 release note 需要新配对 schema。在 update 后测试家庭连接和一次语音通话。将桌面主节点保持在兼容的 API 版本上。

#### 90.4 Update OpenClaw extensions

根据 release note 中的 bundled 兼容性 matrix 更新 OpenClaw/HomeClaw extension。在 extension update 之后重新start 桥接。不匹配显示为代理 status 中的网关错误，而不是网格故障。

#### 90.5 Update a relay

升级中继二进制文件并保留“--advertise-addr”；如果操作员在低流量期间重新start。社区中继用户取决于运营商计划 - 您控制的私有中继应该 follow 与节点版本相同。upgrade 之后验证预订。

#### 90.6 Configuration compatibility

阅读 migration notes 以获取重命名的配置键或 JSONL schema 碰撞。自动 migration 在 startup 运行；失败的 migration 会在原始文件旁边备份 `.bak` 文件。当节点运行时，请勿手动edit 迁移文件。

#### 90.7 Data migrations

大数据 migration 可能会在 upgrade 之后首次启动时重新index Vault 或重新build 信任views—allow 时间。监控 migration summary 事件的审核。保持migration前backup直到index稳定。

#### 90.8 Roll back safely

要回滚，install 以前的 binary 版本和 restore 配置文件 backup（如果新版本写入了不兼容的数据）。如果安全修复促使回滚，则撤销仅在新的 build 上发布的 token。切勿回滚 owner 键 - 仅回滚应用程序位。

#### 90.9 Review release notes

在单击 update 之前，请阅读 release note 以了解安全修复、破坏协议更改和实验标志。附录 J 列出了计划功能的成熟度 labels。将 upgrade 安排在 backup 之后，而不是旅行之前。


---

## Part XIV — Help and Troubleshooting

### 91. Troubleshooting Basics

#### 91.1 Check node status

从应用程序 status 表面开始：确认节点服务正在运行、identity 已加载、模型/代理状态符合预期，并且至少有一个网络 path 可用。

#### 91.2 Restart safely

Quit Social or the Tauri wrapper cleanly so the node can flush JSONL appenders. Restart the node process (or relaunch the desktop app) and wait until status shows identity loaded and mesh listening. If the profile was mid-write, check for `.tmp` files beside `trust-records.json` before deleting anything.

#### 91.3 Check connectivity

从 CLI 运行“connectivity-status --rich”并至少确认以下之一：mDNS 对等点、bootstrap 拨号或中继预留。将您的 bootstrap multiaddr 与联系人公布的地址进行比较。如果 direct 拨号失败但中继正常，请将其视为 NAT/防火墙 — 而不是绑定或 identity 问题。

#### 91.4 Check agent status

打开设置 → AI 并确认代理授权存在且未过期。对于 EnvoyAI，验证 OpenClaw 网关在其 configured port 上做出响应（默认为 18789）。外部代理应在 port 3031 显示桥梁健康状况；审核 rows tagged `bridge` 解释身份验证或 timeout 失败。

#### 91.5 Review recent activity

打开 Activity 或运行 `audit --limit 40 --include-p2p-trace` 并按故障时间排序。沿着 rows 的 `correlationId` 进行跟踪，绑定 deny，保护 reject，并转发转发，每个都会生成不同的摘要。在更改信任或网络 settings 之前，请记下 intent 名称（`chat.message`、`knowledge.query` 等）。

#### 91.6 Find logs

Operational history lives in your profile directory as JSONL: `audit-events.jsonl`, `task-journal.jsonl`, `approval-queue.jsonl`, and `discovery-events.jsonl`. Relay operators also get relay-manager snapshots in relay profile audit logs. Console output from `npm run node:dev` supplements but does not replace these files.

#### 91.7 Collect a diagnostic report

有用的诊断 bundle 包括版本、平台、带有秘密 removed 的相关 configuration、最近的日志、审核 correlation IDs、对等/中继 status 以及准确的复制步骤。

#### 91.8 Remove private data before sharing diagnostics

Before sharing logs, copy only the relevant time window and redact `owner-key*`, device keys, `bridge-config.json` bearer tokens, model API keys, and raw envelope payloads. Replace peer display names with labels if needed; keep correlation IDs intact so support can trace flows.

#### 91.9 Ask the community for help

收集版本、平台、配置文件 path、复制步骤以及使用 correlation ID 编辑的审核摘录。说明 status label 适用哪个功能（Available、Beta、Experimental）。社区 channel 在 0.1.0 的 release note 中宣布 - 避免在 public thread 中发布机密。


### 92. Installation and Startup Problems

#### 92.1 Installer will not run

确认下载的内容与 release note 中的 CPU architecture 和 macOS/Windows 版本匹配。在 macOS 上，如果 Gatekeeper block 是 DMG，请使用“系统设置”→“隐私和安全”→“无论如何打开”一次。在 Windows 上，取消 block installer 文件 property（如果 SmartScreen 隔离了该文件）。

#### 92.2 Operating system blocks the app

macOS：首次启动后在“隐私和安全”下批准该应用程序；经过公证的 builds 不应要求禁用 SIP。Windows：当提示 inbound 网格流量时，allow 通过 Defender/Firewall 应用程序。公司 MDM 可能会 block 未签名或未知的 publish 人 — request 例外，或 source 中的 install 与您自己的 signing。

#### 92.3 Application does not start

Launch from terminal with logging enabled (`npm run node:dev -- --profile <path>`) to capture startup exceptions. Verify the profile directory is writable and not on a sync folder that locks files (iCloud, OneDrive). A corrupt `trust-records.json` or missing owner key prevents UI load—restore from backup rather than deleting the profile.

#### 92.4 Node runtime does not start

Check Node.js version against `package.json` engines and rerun `npm install` from the repo root for source installs. Packaged desktop builds embed the runtime—reinstall if the bundled binary was quarantined. Look for port conflicts on WebSocket/API ports configured in node settings.

#### 92.5 OpenClaw runtime is unavailable

确认 OpenClaw 网关是 installed 和 listening（默认 18789）。在 upgrades 之后运行 `./scripts/setup.sh` 或 `.\scripts\setup.ps1` 以刷新 extensions。Windows slim bundles 可以省略可选的 extensions — 与 release notes 中的 macOS bundle 列表进行比较。

#### 92.6 Required extension is missing

列出网关 settings 中的 enabled OpenClaw extensions，并与第 9 章中的平台 bundle 进行比较。重新运行 setup 脚本，将 copy 缺少 extensions 放入预期的 paths 中。Mesh 聊天和联系不需要可选的 channel extension — 仅需要 enable 您的代理工作流程需要的内容。

#### 92.7 Firewall or antivirus warning

允许 outbound TCP/QUIC 到 bootstrap 节点和中继；inbound direct 拨号可能需要主节点上的防火墙规则。`%AppData%` 或 `~/.local/share/envoymesh` 上的防病毒挂钩可以 block JSONL 写入 — 添加配置文件 path 的排除项。记录您在 retrying WAN 发现 ry 之前打开的 port。

#### 92.8 Update fails

确保 updater 可以写入 install directory 和配置文件 path 旁边。在主要 upgrade 之前备份配置文件和保管库。如果 auto-update 失败，请在现有应用程序上下载新的 installer manually 和 install，而不删除用户数据。

#### 92.9 Reinstall without losing data

Uninstall 或仅替换应用程序 bundle — 切勿 delete 配置文件 directory 或 `shared_vault/`。在重新installing 之前，请在“设置”或附录 K 中记下您的绝对个人资料 path。reinstall 之后，将应用程序指向 encrypted backup 中的同一个 `--profile` path 或 restore。


### 93. Identity and Pairing Problems

#### 93.1 Identity creation fails

确保配置文件 directory 为空，或使用新的 `--profile` path 作为新的 owner。磁盘 full 或 permission 在关键写入时被拒绝在控制台中显示为 ENOENT/EACCES — 首先修复文件系统访问。不要同时针对同一配置文件运行两个节点。

#### 93.2 QR code cannot be scanned

增加 screen 亮度和 disable camera 宏模糊；QR 必须包含 full `envoy:// 对？` payload。如果邀请已过期，请重新生成 - token 是有时间限制的。对于 LAN 加入，请确认 device 和 share 位于同一网段，无需客户端隔离。

#### 93.3 Invitation is invalid

将扫描的 URI 与 sender 显示的内容进行比较 - 截断的副本会破坏 signature verification。检查时钟偏差；某些邀请格式嵌入 expiry 时间戳。要求sender从Contacts重新生成→邀请而不是forwarding拍摄screen镜头。

#### 93.4 Identity verification fails

将 sender 的 public 密钥 hash 验证为声明的对等 ID，并验证 envelope signature。如果 verification 在密钥轮换后失败，请确保传播吊销记录并双方刷新信任。Audit rows `格式错误或未签名的 envelope` 表示 transport 损坏或版本倾斜，不一定是恶意。

#### 93.5 Bond request is missing

Bond request 要求收件人为 online 或可通过中继到达“bond.request” delivery。公共层同行 receive 是一个挑战流程，而不是自动联系；完整推荐或 manual 批准。检查双方的活动是否有“bond.request”/“bond.challenge”intent。

#### 93.6 LAN onboarding fails

通过访客 Wi-Fi 或 VPN split 隧道确认 mDNS 不是 blocked。从主机节点打印 multiaddrs，如果 discovery 失败，则拨打 manually。主机上的 Firewall 必须 allow inbound 网格 port 才能进行 LAN 入职切换。

#### 93.7 EnvoyGo pairing fails

当桌面节点正在运行且 WebSocket 可访问时，EnvoyGo 必须扫描主节点 QR。Off-LAN 配对需要继电器/电路 path 到家乡 - 在“设置”→“设备”中验证家乡隧道和配对 token。如果旧手机保留损坏的 session，则撤销 stale device 证书。

#### 93.8 Recover missing identity data

将 owner-key.pem` 和 device 密钥从 encrypted backup 恢复到原始配置文件 path 中。切勿为相同的 owner ID 创建新密钥 - 同行将 reject 与 signature 不匹配。如果仅缺少保管库数据，则从 backup 重新index；没有 backup 的 identity 损失无法 cryptographic 恢复。


### 94. Messaging, Files, and Calls

#### 94.1 Contact appears offline

离线通常意味着没有活动的 libp2p 连接，不一定是 blocked 绑定。运行 connectivity 检查并确认联系人的节点正在运行。Relay 辅助的 path 可能落后于 direct；在假定永久 offline 之前等待一个心跳间隔。

#### 94.2 Message is not delivered

确认 bond tier allows `chat.message`（direct 或 referred 经批准）。检查审计 deny 与防护 reject 与中继转发失败。大的 payload 可能会达到 envelope 大小上限 — try 较小的消息或文件 chunk path。

#### 94.3 Group message is missing

验证所有成员 share 具有相同的 room ID 且 room sync 已完成（`chat.room.sync`）。旧 build 上的成员可能无法解码新的 room envelope 版本 - 对齐版本。检查丢失的消息是否是在您 offline 时发送的；来自主机对等方的 request room sync。

#### 94.4 File transfer fails

当“allowRawFiles”触发绑定 policy 时，原始文件共享可能需要 owner 批准。确认两个节点上的保管库 path 安全性和大小限制。如果传输在中途停止，请在重新连接后检查继电器电路稳定性 — resume，而不是重复 send。

#### 94.5 Audio message will not play

确认音频编解码器和容器与 Social/EnvoyGo 期望的 release 相匹配。下载在播放前完成 - 部分文件在某些​​客户端中无法静默解码。检查绑定 policy 没有从聊天 envelope 中删除 attachment。

#### 94.6 Voice call cannot connect

当 NAT blocks direct media 时，Voice calls 需要工作同伴 connectivity 加上 TURN/STUN。验证“设置”中的 TURN 凭据，以及 UDP 在限制性网络上不是 blocked。双方必须处于支持当前协议版本的 port 语音信令的 build 上。

#### 94.7 Background call notification is missing

在移动设备上，确认 notification permissions 并且 EnvoyGo background 刷新为 enabled。iOS 焦点模式和 Android battery 保存程序可以延迟推送，直到应用程序前台。来电信令仍然需要主节点 reachability — 如果远离 LAN，则检查中继 path。

#### 94.8 TURN configuration problems

验证 TURN 服务器 URL、用户名和凭证 expiry—stale 凭证产生 ICE 失败状态。在指责网状信令之前，使用已知良好的 public TURN 服务进行测试。记录失败是否是收集 timeout（防火墙）或中继分配 reject（不良信用）。

#### 94.9 Duplicate or delayed events

重复的消息通常表示重新连接重播 - 检查 inbound 保护重复数据删除以及是否有两个 device share 和一个 identity。继电器 paths 上的延迟事件在负载下是正常的；比较审计中的时间戳，而不是仅比较 UI 顺序。如果重复项仍然存在，请确保每个 device 证书只有一个有效的 session。


### 95. Agent, Model, and Tool Problems

#### 95.1 EnvoyAI does not respond

验证 OpenClaw 网关已启动，且 3031 accept 上的网桥为 configured 承载 token。在审核中检查 model router configuration 和 semantic firewall reject 离子。过期的代理授权会停止所有代理角色 intent，直到在桌面上出现 renew。

#### 95.2 Model provider fails

确认模型 settings 中所选提供商的 API 键和基本 URL。LiteLLM 或适配器错误在审计中出现，并带有提供程序名称和 HTTP status。Try local 模型或不同的提供商用于隔离网络与配额故障。

#### 95.3 Tool is missing

在主节点上打开工具 registry 并确认该工具已根据您的代理任务注册。MCP-imported 工具需要活动的 MCP 客户端 session；网格本机工具需要代理卡上的匹配功能。添加工具后重新start 代理runtime，以便重新加载registry。

#### 95.4 Tool call is denied

工具拒绝通常意味着强制“allowedActions”、bond tier 或缺少功能（“vault.retrieve”、“task.execute”等）。逐字阅读审核 deny 原因 — 它将债券 deny 与授权批准_必需区分开来。提高信任或批准桌面上的pending操作，而不是盲目地retrying。

#### 95.5 Approval is pending

在桌面上打开 Approval 并解析与任务的 correlation ID 匹配的项目。Approval 因任务而过期 - 如果 queue 看起来为空但任务仍在等待，请检查“expiresAt”。外部代理无法代表您批准；只有owner device 可以清除owner 提示。

#### 95.6 Trigger does not run

验证触发器计划、cron 表达式以及节点在发生时是否正在运行。触发器尊重任务范围 - disallowed 操作在审核中会默默失败，但并不总是在 UI toast 中失败。检查实验性 toggle 是否为您的 build 触发了触发功能。

#### 95.7 Digest is missing

Digests batch activity on a schedule—confirm digest generation is enabled and the agent had events in the window. Empty digests may mean no qualifying audit rows or semantic firewall dropped the summary prompt. Inspect `task-journal.jsonl` for failed digest tasks.

#### 95.8 Memory or session result is unexpected

会话 memory 是代理 runtime 的 local — 清除网桥缓存或旋转 session 会重置上下文。将模型返回的内容与Vault retrieval 引用进行比较；RAG 可能会拉出意外的 public 项目。如果 memory 看起来像另一用户的数据，请停止并验证配置文件 path — 切勿在 owner 之间验证 share 一个配置文件。

#### 95.9 External agent does not reply

从主节点主机 Ping 外部代理的消息 port (HomeClaw 8010、Hermes 8020、OpenHuman 8021)。确认桥接承载 token 在两侧匹配，并且代理进程日志显示 inbound `envoymesh-message` 流量。兼容性预设不保证外部 runtime 单独运行 — start 。


### 96. Knowledge and Browser Problems

#### 96.1 File cannot be added

Vault 强制 path 安全 - 非法 path 或 allowed roots reject 之外的符号链接添加。检查“shared_vault/”下的磁盘空间和文件 permissions。Very 大文件可能需要 chunking settings；观察审核是否有拒绝尺寸上限的情况。

#### 96.2 Search returns no result

确认该项目已indexed：运行library刷新并检查sensitivity labels与您的query范围匹配。本地 search 仅涵盖您的金库；remote 查询需要绑定允许的“knowledge.query”。如果“shared_vault”是 backup 的 restored，则重新build index，而无需重新indexing。

#### 96.3 Remote knowledge is denied

远程 deny 通常意味着 bond tier 上限 sensitivity—public 对等方只能看到 `public` 项目；knowledge.query 的 referred 上限为“public”；direct 上限为“friends”。公共知识查询有速率限制（默认 5 次/分钟）——等待窗口重置。检查审核“requested sensitivity超出”与“peer is blocked”。

#### 96.4 Shared content cannot be opened

Browser 和 Library 需要“library.read” permission 作为读者的 bond tier 和项目 visibility。如果 integrity 检查失败，请确认 content hash 匹配 - 不要打开不匹配的 blob。EnvoyGo mirrors Browser 到 home — 主节点必须是 online。

#### 96.5 Content hash does not match

重新下载或重新export 该项目；hash 不匹配意味着字节在传输过程中或在磁盘上发生更改。将 publisher metadata 中的 sha256 与 local 文件进行比较。如果 IPFS 引脚是 stale，则从原始 publisher 而不是 cached 网关获取。

#### 96.6 IPFS export fails

IPFS export 是可选的 — 如果您的 build 包含它，请确认 Helia/Kubo sidecar 正在运行。检查 sidecar 日志中是否存在与 IPFS 守护程序的连接错误。如果您只需要 local 库，则完全省略 IPFS storage — 网格共享不需要 export。

#### 96.7 `envoy://` page does not load

`envoy://` 页面通过主 Browser 路由解析 - 验证 URI 方案处理程序以及该项目是否经过 publish 处理。LAN 外的访问需要通过 EnvoyGo 或带有中继 path 的桌面到 reachability 家。损坏的 hashes 或丢失的保管库 paths 在家庭审核中显示为带有错误的空白页。

#### 96.8 Feed update is missing

Feed 通知需要 referred+ 保证金 inbound notification；publisher 必须发送了“feed.notify”。检查 bond tier 并且订阅源订阅在读取器节点上为 enabled。仅元数据通知不会推送 full content — 打开 Library/Browser 来获取项目。

#### 96.9 Restore damaged content

将文件从 backup 恢复到同一保管库 path 布局中；之后运行 re-index 。除非您了解保管库 chunking，否则不要手动处理 edit chunk 清单 - 更喜欢从 source 重新publishing。如果损坏很普遍，请隔离配置文件并扫描磁盘运行状况，然后再继续。


### 97. Network and Relay Problems

#### 97.1 Direct connection fails

从双方收集拨号提示，如果 UI 显示已断开连接，则尝试从 CLI 进行 manual 拨号。对称 NAT 经常 block direct TCP—configure 中继 bootstrap 并验证电路预留是否成功。如果识别握手失败，请比较 libp2p 版本。

#### 97.2 Local discovery fails

mDNS 需要在 LAN 上进行多播 — 访客网络和 VPN 经常 block 上。使用打印的 multiaddr 来表示实验室 setup。确认两个节点都通告相同的 discovery 配置文件（例如 local 与 wan-default）。

#### 97.3 Relay lookup fails

验证 bootstrap multiaddr 包含 `/p2p/<relay-id>` 并且中继 HTTP 签入成功。运行 `relay-status` 并检查审核是否有 `relay.lookup` 失败。如果社区中继关闭，则使用私有中继覆盖 - 不要完全 disable bootstrap 。

#### 97.4 Community relay is unavailable

默认 bootstrap 处的社区中继可能正忙或正在进行 deploy—retry 并进行退避。对于生产，请在 public 模式下使用“--advertise-addr”运行私有中继。电路预留失败通常意味着中继主机上的版本偏差，而不是客户端配置错误。

#### 97.5 Multiple relays disagree

Node 可能会签入具有不同路由提示的不同中继 - 在 fleet 中标准化 bootstrap 列表。在审核中比较中继管理器快照是否有冲突的父/子记录。首选一个组织接力作为 primary bootstrap 以减少 split view。

#### 97.6 Firewall or NAT restriction

映射 bootstrap 所需的 outbound port 和中继 TCP。入站direct 拨号需要port forwarding 或UPnP，其中supported；否则依赖circuit relay。记录公司代理规则 — libp2p 在没有显式隧道 setup 的情况下不会遍历 HTTP 代理。

#### 97.7 Peer remains offline

您用户界面上的 Peer offline 对于其他人来说可能仍然是 online — 如果可能，请通过第三个相互联系进行验证。检查上次查看的同行 directory 和最近的“system.ping”结果。较长的 offline 周期可能意味着睡眠、剖面 migration 或 revoked device 证书。

#### 97.8 Agent card cannot be fetched

Agent 卡通过绑定的 path 获取 - public 绑定不会自动获取工人卡。在绑定 upgrade 之后，从 Agent 网络 settings 强制刷新。Audit `agent.card.request` / `agent.card.response` 用于 deny 或 timeout；stale 卡隐藏功能。

#### 97.9 Collect network diagnostics

Bundle: app version, OS, profile path, bootstrap multiaddrs, `connectivity-status --rich` output, redacted `audit-events.jsonl` with correlation IDs, and relay reservation result. Include both peers' perspectives for connection issues. See Appendix K.5 for CLI commands.


### 98. Integration Problems

#### 98.1 OpenClaw extension is missing

将 installed OpenClaw extensions 与第 9 章平台 bundle 列表进行比较。克隆或 upgrade 后重新运行 setup 脚本。Windows essential 设置为 slimmer—install 缺少 extensions manually 或切换到 source/macOS bundle。

#### 98.2 HomeClaw cannot connect

Default HomeClaw message port is 8010—confirm process is listening on the home node host. Bridge bearer token in `bridge-config.json` must match HomeClaw's expected secret. HomeClaw runtime is externally maintained; verify its logs independently from EnvoyMesh audit.

#### 98.3 Hermes cannot connect

Hermes 默认为 port 8020 — 在家用计算机上的 local 主机上使用curl 或 netcat 进行测试。应用 Hermes 兼容性预设，然后在配置 edit 后重新start 桥接和 Hermes。如果网桥是容器化的，请检查防火墙环回规则。

#### 98.4 OpenHuman cannot connect

默认情况下，兼容性预设中 8021 上的 OpenHuman listens。确认 OpenHuman 的 envoymesh 适配器是 enabled 并使用与桌面设置相同的桥 URL。一旦桥接验证成功，将代理端错误视为外部 runtime 问题。

#### 98.5 Bridge authentication fails

401 响应通常意味着承载 token 丢失或不匹配。确认双方使用相同的密钥，标头使用“Bearer”，并且 URL 指向 correct 桥而不是 OpenClaw 网关。

#### 98.6 External tool call fails

检查桥接日志中的工具名称、授权操作以及失败调用的绑定决策。外部工具映射到网格功能 - 缺少“vault.retrieve”会拒绝知识工具。Retry 使用 minimal 工具调用来隔离 schema 与 policy 故障。

#### 98.7 MCP client cannot connect

MCP 客户端连接到主 MCP 适配器 — 确认 port、承载 token，并且当桥为 enabled 时，节点公开 MCP。stdio MCP 服务器需要 registry 配置中的 correct 命令 paths。客户端和服务器必须就您的 build 指定的协议版本达成一致。

#### 98.8 MCP server is rejected

被拒绝的 MCP 服务器通常在注册时无法通过功能或身份验证检查。验证服务器清单工具不需要为活动任务执行 disallowed 操作。检查审核是否存在命名 intent 的消息“缺少功能”。

#### 98.9 A2A Agent Card is unavailable

Fetch `/.well-known/agent-card.json` from the home or relay public base URL with a valid bearer when required. Relay forwarding needs an active home tunnel for the token owner. Card JSON must be signed and fresh—republish after capability changes.

#### 98.10 A2A task fails or is not found

从“tasks/send”响应中找到任务 ID，并使用相同的承载轮询“tasks/get”。通过第 73 章映射内部状态——“需要身份验证”意味着债券/授权拒绝，而不是 transport 失败。仅取消承载映射的 owner 拥有的任务；未知 id 表示已过期或从未在此节点上创建。


### 99. Frequently Asked Questions

#### 99.1 Does EnvoyMesh require an account?

不需要中央 EnvoyMesh 帐户。您创建 local cryptographic 身份，并且可以选择使用第三方模型提供商、中继、移动推送服务或拥有自己帐户的集成。

#### 99.2 Where is my data stored?

Everything 存在于**您的 device 上，主要是主节点配置文件 directory：Vault 文件、信任存储、对话 indexes、审计 JSONL 和 identity 密钥。EnvoyGo 在手机上保持配对 token 和 cached UI 状态，而不是 full Vault 的第二个 copy，除非某个功能显式缓存 media。Relays 转发流量；它们不是您的数据存储。

#### 99.3 Can a relay read my messages?

Relays 可以观察连接 metadata 并转发 encrypted/signed 应用程序流量，但它们无权模拟 sender 或绕过 home policy。避免将不必要的ry 敏感数据放置在routable metadata 中。

#### 99.4 Can I use EnvoyMesh without a relay?

是的，在与 mDNS 或 direct multiaddr 相同的 LAN 上，或者在没有中继预留的已知对等路由上。许多 WAN setup 在 NAT block direct 拨号时仍然使用 **继电器** 来发现 ry 和 circuit relay。Relay 协助 connectivity；它不会替换主节点 policy 或 signing。

#### 99.5 Can I use more than one device?

是的。一个 **owner identity** 可以通过 QR 配对授权多个 **device 证书** — 桌面 Social/Tauri、其他计算机和 EnvoyGo。每个 device 都有自己的审计和撤销密钥。Mobile 是回家的 thin client ；它不会复制 full 网格节点。

#### 99.6 Can I use my own model?

是的。在设置 → AI → 模型中配置 figure 提供商（LiteLLM 兼容 endpoint、local 运行程序或您信任的云 API）。semantic firewall 仍然过滤提示；债券和委托仍然限制工具的使用。提供商流量受该提供商的 privacy 条款的约束。

#### 99.7 Can I use an external agent?

是的，通过主节点上的 **Ext Agent 桥**（HomeClaw、Hermes 或 OpenHuman）和 MCP 适配器。外部代理调用网格工具（`mesh.findKnowledge`等） - 它们不使用 receive 原始 libp2p 套接字。为外部工具调用启用桥授权、范围授权和 review 审核。

#### 99.8 What happens when a contact is offline?

在 sender 的主节点上签署消息 queue，并在 path 打开时 retry — direct LAN、中继电路或稍后的 online presence。Deliverry 指标可能会滞后，直到 remote 节点确认。双方都不会丢失消息 integrity；实施的协议 ID 可以避免重复。

#### 99.9 Can strangers recruit my agent?

不需要。Team jobs 需要绑定联系人和选择加入的能力提供商。在当前产品中，公共 stranger 不是 recruit 可用的工作人员。

#### 99.10 Can I revoke an agent or device?

是的。**从受信任的桌面节点撤销丢失笔记本电脑或手机的 device 证书**；revoke 或 narrow **代理强制**停止自动化。被阻止的信任会停止新的联系操作。撤销是 local 并签名的——同行将在下一次经过验证的交互中学习。

#### 99.11 Is EnvoyMesh a replacement for MCP or A2A?

不会。EnvoyMesh 使用自己签名的本机协议，并提供 MCP 和 A2A 桥接器，以便其他生态系统可以使用选定的工具、发现ry 和任务。

#### 99.12 Which features are experimental or planned?

请参阅附录 J 了解 authoritative 列表。简而言之： Beta/Experimental 项已实现，但仍在验证中（接口可能会更改）；Planned 项目已设计，但未作为完整功能提供（特别是 video 调用和广泛的匿名工作者发现 ry）；Parked 项在没有承诺日期的情况下被 intent 单独推迟（EnvoyGo full-节点模式、全球声誉、多跳商务）；延迟项目已设计但尚未构建（Filecoin 持久性、full 分层中继图）；未来的项目将用于以后的互操作工作（MCP resources/prompts，OAuth 2.1）。在依赖任何非 Available 功能之前，请务必根据当前 release note 进行确认。


---

## Part XV — Website and Content System *(editors and operators)*

> 第 XV 部分是 web 站点和 editorial content 地图。最终用户可以跳过此部分；请改用第 I–XIV 部分和附录。

### 100. Website Information Architecture

#### 100.1 Homepage

以一句话价值主张（人员和代理的私有网格）、primary install CTA 和三个功能支柱（私人消息传递、个人 AI、Agent 网络）为主导。用例和下载链接；避免在首屏出现协议术语。

#### 100.2 Product overview

每个支柱一个段落链接到专用产品页面。附上 Available/Desktop/Mobile label 并将每个支柱链接到其指南内章节（消息传递 → 第 III 部分，个人 AI → 第 IV 部分，知识 → 第 V 部分，外部代理 → 第 VI 部分，Agent 网络 → 第 VII 部分）。

#### 100.3 Agent Network

框架是有约束力的选择加入合作——而不是“市场”。将 Agent 网络附加到 view 章节链接 (§44) 和加入流程 (§45)。指出 stranger 不能 recruit local 特工。

#### 100.4 External Agents

列出 OpenClaw (bundled)、HomeClaw、Hermes、OpenHuman 以及适用的兼容性预设 label；将每个链接到其指南章节（§38–§42）。声明每个网桥只有一个外部代理处于活动状态。

#### 100.5 Use cases

策划 6-8 个场景（跨 device 的个人 AI、家庭网格、可信 research、小团队 Agent 网络、Claude Desktop 通过 MCP、A2A delegation、self 托管中继）。每个链接都指向第 14 节中的匹配教程或第 5 节中的用例。

#### 100.6 How it works

普通语言 architecture diagram （owners → 债券 → 签名消息 → 可选中继）。链接到§4 和安全模型页面；将 Ed25519/libp2p 保留在可扩展的技术 note 中。

#### 100.7 Security and privacy

总结 Diplomat/Bond Engine/semantic firewall/Vault 边界，而不声称“牢不可破”的安全性。§84 和附录 H 检查表的链接；暴露与漏洞有关的porting联系。

#### 100.8 Downloads

每个平台的卡片（macOS、Windows、iOS、Android、source），带有已验证徽章和上次验证日期。链接至第 §8 install 步骤；表面 release notes 和附录 J status 边界。

#### 100.9 Guide

Entry 指向本指南：入门、Everyday 使用、外部 Agents、Agent 网络、故障排除。镜像此 document 的“建议的指南导航”尾部。

#### 100.10 Community and support

GitHub、讨论、路线图、release notes、support 联系方式。保持可操作性——在哪里提交错误，在哪里提出问题，在哪里阅读路线图。


### 101. Product Pages

#### 101.1 Private messaging

使用绑定门控 delivery 进行推介签名 peer-to-peer 消息传递。附加 Available + Desktop + Mobile labels；链接至第 16 条和第 17 条。请注意相关的 group chat 和音频消息。

#### 101.2 Personal AI

将 EnvoyAI/OpenClaw 推介为 owner policy 下的 bundled 助理。附上Available + Desktop label；链接至§21–§28。为喜欢不同 runtime 的用户交叉引用外部代理。

#### 101.3 Knowledge Base

推介 local-first note、Vault 文件、RAG 和 Obsidian 集成。附上Available + Desktop label；链接至§29–§35。请注意 sensitivity labels 和 federated RAG 作为区分符。

#### 101.4 Agent Network and Team jobs

与归因的 reports 进行推介联合多代理协作。附加 Available + Desktop label （EnvoyGo 是 read-only mirror）；链接至§44–§63。强调“不是市场”。

#### 101.5 External Agents

为OpenClaw/HomeClaw/Hermes/OpenHuman搭建安全桥。附加兼容性预设 labels；链接至§36–§43。陈述单活动网桥规则。

#### 101.6 Desktop and EnvoyGo

倾斜两个表面，一个 identity：桌面主节点 + EnvoyGo thin client。附上 Available + Desktop + Mobile labels；链接至第 8 条和第 13 条。明确 macOS/Windows bundle 差异 (§9.4/§9.5)。

#### 101.7 Voice and file sharing

推介语音通话（Phase 42I，在 iOS 上）和 content 寻址文件共享。附上 Available + Desktop + Mobile labels；链接至第 18 条和第 19 条。将 video 调用标记为 Planned。

#### 101.8 Terminals and Browser

将 remote 端子和 envoy://` 进行 row 音调。附加 Available + Desktop label (EnvoyGo mirrors);链接至第 78 条和第 79 条。Surface herdr/TmuxAI 作为外部集成。

#### 101.9 MCP and A2A

推介 MCP 工具桥接（消费者 + 服务器）和 A2A 代理卡/任务。根据需要附上 Experimental/Beta label；链接至§68–§73。请注意 OAuth/resources 作为未来范围。

#### 101.10 Relays and self-hosting

为 connectivity 和 self 托管的 fleet 操作推介可选继电器。附上Operator label；链接至§74–§77。展示社区中继和操作员 fleet 指南。


### 102. External Agent Website Pages

#### 102.1 External Agents overview

解释桥接模型（代理没有原始 P2P）。附上兼容性预设指南；链接至第 36 节和附录 C matrix。受众：选择代理runtime的集成商。

#### 102.2 OpenClaw / EnvoyAI

详细说明 bundled runtime、网关 port 18789、规范 extension、macOS/Windows bundle 差异。附上Available + Desktop label；链接至§38。

#### 102.3 HomeClaw

详细说明默认预设为 8010/message，外部维护 channel。附加兼容性预设 label；链接至第 39 条。说明 verification 责任。

#### 102.4 Hermes

详细说明8020/消息中的预设，知识-oriented runtime、migration path。附加兼容性预设 label；链接至§40。

#### 102.5 OpenHuman

详细预设在8021/message，默认为disabled，外部维护。附加兼容性预设 + Planned-用于生产 labels；链接至§41。

#### 102.6 Custom agent integrations

记录“envoymesh-message”适配器合约。附上Experimental label；链接至第 42 条和第 37 条中的桥线合同。受众：开发人员。

#### 102.7 Integration status matrix

将附录 C 渲染为 sortable table （代理 × 模式 × port × status × 最后验证）。保持唯一的 source 真理；every 其他页面链接在这里。

#### 102.8 Security boundary

解释为什么代理从不持有 Ed25519 密钥以及承载身份验证如何控制“/bridge/*”。链接至第 37 条和第 84.10 条；不要夸大其词——说“policy-checked”，而不是“secure”。

#### 102.9 Developer handoff links

Cross-link to `docs/agent_bridge_guide.md`, `docs/openclaw-agent-bridge-adr.md`, `OpenClawExtension/`, and the MCP/A2A design docs. Audience: engineers implementing an agent.


### 103. Agent Network Website Pages

#### 103.1 Agent Network overview

定义保税选择加入合作；附加 Available + Desktop label；链接至§44。强调“不是市场”和“中继保持精简”。

#### 103.2 Join Agent Network

逐步 enable 加入 + publish 个人资料；链接至第 45 条和第 46 条。附上设置 → Agent 网络选项卡的 screen 截图。

#### 103.3 Agent identity and cards

解释owner-授权代理凭证和Agent卡；链接至§47。将 A2A Agent 卡桥表面作为外表面。

#### 103.4 Bonded worker discovery

解释绑定 + 功能 index 上的卡自动获取；链接至第 48 条和第 49 条。请注意，广泛的匿名发现ry 是Planned，不是当前的。

#### 103.5 Team jobs

定义 Team jobs （产品名称）与链条（代号）；链接至第 50–§58 节。附上 Chains/Team jobs UI 的 screen 镜头。

#### 103.6 Planning and assignment

解释协调器计划 + direct-分配与竞争性投标；链接至§51–§53。将 LLM 计划者详细信息保存在可扩展的文件中。

#### 103.7 Bidding and budgets

解释任务、成本上限、再平衡政策；链接至第 53 条和第 54 条。表面 CSV export 和成本 visibility 控件。

#### 103.8 Multi-round collaboration

解释迭代（draft→判断→重新计划）；链接至§56。状态默认 `iterationMaxRounds=1`。

#### 103.9 Results and provenance

解释复合工件和工作人员 attribution；链接到 §58 和附录 G。强调扁平化匿名答案会失去出处。

#### 103.10 Trust and safety

总结债券门槛、授权限制、sensitivity 上限、批准；链接至§61 和附录 H.5/H.6 检查表。

#### 103.11 Network connectivity

解释LAN、direct、接力辅助path；链接至第 62 节和第 X 部分。表面 NAT/TURN 指导。

#### 103.12 Feature status and roadmap

将附录 J.4–J.11 呈现为 authoritative 边界ry 列表；将每个项目链接到其设计文档。明确标记 Planned/Parked/Deferred。


### 104. Reusable Content Template

#### 104.1 Page title

简洁、行动oriented，≤ 60 个字符。镜像用户 search 所代表的名词（例如“私人消息”、“加入 Agent 网络”），而不是内部术语。

#### 104.2 One-sentence summary

以读者可以做什么为主导，而不是功能是什么。“将签名的 peer-to-peer 消息发送给绑定联系人”胜过“使用 Ed25519 envelope 的消息子系统”。

#### 104.3 Availability labels

准确渲染标准 label：Available、Beta、Experimental、兼容性预设、Planned、Parked、Desktop、Mobile 和 Operator。一页可以包含ry多个label，例如Available + Desktop。

#### 104.4 What the feature does

最多两到三句话命名用户操作、边界ry（涉及谁/什么）以及结果。除非该页面面向开发人员，否则请避免使用协议名称。

#### 104.5 Why someone would use it

围绕真正的目标（privacy、控制、协作、成本）。如果有多个观众，每个观众一句话——单独的“针对个人”、“针对团队”、“针对运营商”。

#### 104.6 Before you begin

硬 prerequisites 的项目符号列表：正在运行的主节点、绑定触点、enabled toggle、configured 模型。将每个先决条件链接到其 setup 章节。

#### 104.7 Step-by-step instructions

编号步骤，每步骤一个操作，使用确切的 UI path（设置 → ...）或命令。屏幕截图或短代码 blocks，其中 path 不明显。保持每个步骤独立可检查。

#### 104.8 What happens behind the scenes

协议/crypto 详细信息的可选可扩展部分。使用它可以满足技术读者的需求，而无需强迫 everyone 通过 Ed25519/libp2p 行话。链接到设计文档，请勿重复。

#### 104.9 Privacy and safety notes

说明该功能强制执行的边界ry（签名、policy 门控、sensitivity 上限、需要批准）以及它不防范的内容。引用安全章节而不是重述它。

#### 104.10 Troubleshooting

三到五个症状→原因→修复线路。链接到匹配的第 §91–§98 章，了解更深入的 diagnosis。避免通用的“restart the app”建议，除非这确实是解决办法。

#### 104.11 Related topics

三到五个到相邻章节和下一个逻辑操作的交叉链接。帮助读者从“设置”到“使用”再到“故障排除”，而无需回溯到目录。

#### 104.12 Last verified version and date

Every 页面应记录检查其步骤和 status 的最后 EnvoyMesh 版本和日期。UI、协议、打包或安全更改后重新验证。


### 105. Editorial and Terminology Guide

#### 105.1 Write for end users first

向读者directly（“您”）讲话，以任务为主导，将协议内部推迟到可扩展的note。反映§1–§14 的语气。

#### 105.2 Progressive disclosure for technical details

首先提出面向用户的概念；链接到更深入的指南章节；为技术层保留代码标识符、schemas 和配置密钥。切勿强迫读者学习 Ed25519 到 send 消息。

#### 105.3 Product terms versus code names

首选当前产品术语，例如 _ TERM_1 __ 和 __ TERM_0__。仅当代码名称（例如链）帮助开发人员查找日志、__ TERM_2 __ 或协议引用时才提及代码名称。

#### 105.4 Feature-status language

准确使用§“功能 status labels”中的九个规范 label（Available、Beta、Experimental、兼容性预设、Planned、Parked、Desktop、Mobile、Operator）。切勿创造新的 status 单词；如果某项能力不适合，请用散文而不是新的 label 来限定。

#### 105.5 Platform labels

将 every 功能页面与平台 label（Desktop、Mobile、Operator）配对。如果某个功能仅在今天提供 Desktop，但计划了 Mobile mirror，请说“Desktop（Mobile mirror 已计划）”，而不是让平台含糊不清。

#### 105.6 Security claims and evidence

安全声明必须确定其边界ry 和证据。说“由 sender 密钥签名并由 inbound 警卫检查”，而不是“完全安全”。

#### 105.7 Integration maturity claims

将 HomeClaw、Hermes 和 OpenHuman 描述为兼容性预设，并声明它们的代理端 runtime 由外部维护。并不意味着与 bundled OpenClaw 集成同等成熟。

#### 105.8 Accessibility and inclusive language

使用简单的语言、diagram 的替代文本、足够的颜色对比度，并避免假定能力的措辞。在 web 网站页面中反映 WCAG-AA 对比。

#### 105.9 Screenshots, diagrams, and alt text

Every screenshot 需要描述操作的替代文本，而不是镶边。图表应为 SVG，文本为 label；保留 ASCII diagrams 作为代码 blocks 中的后备。

#### 105.10 Translation and localization

翻译散文；使用英文保留品牌名称（EnvoyMesh、OpenClaw 等）、代码标识符和 UI path。遵循中文editionlossary；将 locale updates 与 UI i18n 协调。

#### 105.11 Versioning and review cadence

Bump the guidebook version with each release; re-verify status labels against `docs/implementation-plan.md` and Appendix J. Record the last-verified date on every website page.


---

# Appendices

## Appendix A — Glossary

#### A.1 Agent

**代理**是由 owner 授权进行通信或执行有界任务的 AI identity。

#### A.2 Agent Card

**Agent 卡** 是一种签名功能 description，用于发现代理可以做什么以及是否加入 Agent 网络。

#### A.3 Agent Network

**Agent 网络** 是 owner 的 local 代理之间的绑定、选择性合作。

#### A.4 Artifact

**工件**是类型化的任务结果：文本、文件、结构化数据或复合 bundle。

#### A.5 Bond

**绑定** 是分配给另一个 owner 的 local 信任关系和层级。

#### A.6 Capability

**能力**是广告或授权的操作，例如任务执行或知识队列ry。

#### A.7 Contact

**联系人** 是在 local directory 和关系 UI 中表示的已知 owner 或代理。

#### A.8 Device

**device** 是 owner 授权的 installation，具有自己的密钥和证书。

#### A.9 DID

**DID** 是从 cryptographic identity 派生的去中心化标识符表示形式。EnvoyMesh owner/device/agent DID 使用`envoy:owner:` / `envoy:device:` / `envoy:agent:` 前缀（参见§10.6）。

#### A.10 EnvoyAI

**EnvoyAI** 是 EnvoyMesh 的 bundled 个人代理体验，由 OpenClaw 提供支持。

#### A.11 EnvoyGo

**EnvoyGo** 是与主节点配对的当前 iOS/Android thin client。

#### A.12 External agent

**外部代理**是通过 local HTTP 桥连接的单独维护的 runtime。

#### A.13 Library

**Library** 组织了 local search、共享、publishing 和 browsing 的知识项目。

#### A.14 Mandate

**授权** 是绑定代理任务的 owner 签名授权。

#### A.15 Owner

**owner** 是长期人类 identity 和 root 授权密钥。

#### A.16 Peer

**对等点**是签署并传输 port envelope 的 runtime 网络 identity。

#### A.17 Relay

**中继**协助reachability、查找和forwarding，而无需成为应用程序权限。

#### A.18 Task

**任务**是委派工作和键入结果的签名生命周期。

#### A.19 Team job

**团队作业** 协调多个代理子任务并 merge 其归因结果。

#### A.20 Vault

**Vault** 对于私有文件和知识来说是 path 安全的 local storage 和 index 。


## Appendix B — Feature and Platform Matrix

#### B.1 macOS

**macOS** — Tauri 桌面 bundle 具有嵌入式节点；fuller OpenClaw extensions；DMG/经过公证的install。主节点运行所有网格功能；EnvoyGo 与 mirror 配对。Profile 在 Tauri 应用程序数据区域下（附录 K.1）。

#### B.2 Windows

**Windows** — 设置了 slimmer OpenClaw essential 的安装程序；配置文件位于 `%AppData%` / `%USERPROFILE%\.envoymesh\` 中。出现提示时允许对 inbound 对等点启用防火墙。

#### B.3 EnvoyGo on iOS

**EnvoyGo iOS** — Flutter thin client；二维码配对到家；聊天、通话、终端、Browser mirror；没有独立的网格节点。

#### B.4 EnvoyGo on Android

**EnvoyGo Android** — 与 iOS 相同的 mirror 范围；当 off-LAN 时，主节点必须通过 WebSocket/relay 保持可访问。

#### B.5 Home-node-only features

**仅限主节点** — 身份、Vault、代理、团队 orchestration、MCP/A2A 桥、full 设置。authoritative signing 和 policy 是必需的。

#### B.6 EnvoyGo mobile read-only mirrors

**EnvoyGo mirrors** — 大量阅读的 remote UI；手机上的 AI 引擎和桥配置 read-only；在桌面上更改。

#### B.7 Operator features

**Operator** — Relay deployment、bootstrap 列表、`--advertise-addr`、fleet 清单 CLI；不是最终用户 Social 功能。

#### B.8 Available, Beta, Experimental, Planned, and Parked features

**状态 labels** — Available、Beta、Experimental、Planned、Parked，按前面事项推迟；附录 J 是关于营销 copy 的规范。

## Appendix C — External Agent Matrix

#### C.1 EnvoyAI / OpenClaw

**EnvoyAI / OpenClaw** — 捆绑个人代理；网关默认18789；桥3031；EnvoyMesh - 在桌面上维护 extension。

#### C.2 HomeClaw

**HomeClaw** — 兼容性预设；外部runtime；消息port 8010；通过网桥配置进行承载身份验证。

#### C.3 Hermes

**Hermes** — 兼容性预设；外部runtime；__学期_2__ 8020；单独验证适配器日志。

#### C.4 OpenHuman

**OpenHuman** — 兼容性预设；外部runtime；__学期_2__ 8021；网格外部的人机循环工作流程。

#### C.5 Custom `envoymesh-message` agents

**自定义 envoymesh-message** — HTTP 消息适配器；您维护代理流程；匹配桥 token 和 JSON schema。

#### C.6 MCP-compatible applications

**MCP 应用程序** — 客户端连接到主 MCP 适配器；工具映射到注册ry；持票人授权；还没有 OAuth resources (J.11)。

#### C.7 A2A-compatible agents

**A2A agents** — Public card at `/.well-known/agent-card.json`; JSON-RPC tasks; relay home-tunnel forwarding when enabled.

#### C.8 Runtime ownership and verification status

**验证** — 记录每次集成的最后测试版本/日期；兼容性预设 ≠ 与 EnvoyAI 同等成熟度。

## Appendix D — Agent Network Quick Reference

#### D.1 Membership checklist

**会员清单：** owner 授权有效 → 加入 toggle → 签署 Agent 卡 published → 能力 tag 匹配计划 → direct 与协调者的联系。

#### D.2 Worker eligibility checklist

**工人资格：** 绑定 direct 联系人 → remote 加入 enabled → 卡列出所需能力 → 探测成功 → 不是 blocked 层。

#### D.3 Team job state reference

**团队工作状态：**跟踪协调器状态机（第64章）；终端：完成/失败/取消；停顿触发重新平衡 policy。

#### D.4 Award modes

**奖励模式：**竞争性与单项分配每项工作settings；竞争性等待投标前授予。

#### D.5 Budget and rebalance policies

**预算/重新平衡：**规定“maxCost”和工作预算上限；当worker offline 或stall timeout 触发时重新平衡。

#### D.6 Iteration modes

**迭代模式：** 单轮与多轮协作；owner 批准可能会在各轮之间暂停。

#### D.7 Artifact types

**工件类型：** 文本、文件、结构化、复合 — 在 merge 之前验证 hash 和 sensitivity（附录 G）。

#### D.8 Troubleshooting decision tree

**决策树：**债券？→ 卡新鲜吗？→ 能力匹配？→ 授权可以吗？→ 审计相关性 → 然后网络/探测。

## Appendix E — Trust-Level Reference

#### E.1 Self

**自己**是您自己的 owner、device 和 local 授权代理人的 bond tier。`evaluatePolicy` 返回 `{ action: "allow", maxSensitivity: "private" }` — 最高上限。Mandates 和能力检查仍然适用；self 层不会绕过 inbound 防护或 semantic firewall。

#### E.2 Direct

**Direct**（friends 层）是具有明确信任的相互纽带。政策 allows intents 受 `limitSensitivity(requested, "friends")` —friends 层知识和 Library 阅读继续；当 requested sensitivity 超过 friends 时，可信/私人项目需要 owner 批准。聊天、任务和 Agent 网络工作人员在 direct 债券中发现 ry 是默认协作 path。

#### E.3 Referred

**引用** 是 introduction 支持的信任 — 强于 public，弱于 direct。`knowledge.query` 上限为 **public** sensitivity；`library.read` 上限为 **friends** visibility。`feed.notify`、介绍 intents、`system.ping` 和 `bond.request` 在 public sensitivity 处进行了 allow 处理；大多数其他 intent 返回 **`approval_required`** （`referred 同行需要批准`）。

#### E.4 Public

**公共**是stranger/非绑定层。允许：`system.ping`、`social.intro.sync`、public `knowledge.query`、public `library.read`，对 public 知识有速率限制（默认 5 个查询/分钟）。`bond.request` 和 `social.intro.propose` 返回 **`挑战`**（推荐或 manual 批准）。所有其他 intent 都是 **`deny`** （`public 对等方不能使用此 intent`）。

#### E.5 Blocked

**被阻止的**对等点是难以拒绝的：`evaluatePolicy` 对于 every intent 返回 `{ action: "deny", Reason: "peer is blocked" }`。将 block 用于 abuse 或 revoked 关系；unblock 需要明确的信任恢复。被阻止的 status 是 local — 无论 remote reachability 如何，您的节点都不会 send 或 accept 应用程序流量。

#### E.6 Typical permissions

**按层划分的典型 permissions**（在任务和能力门之前）：

| Tier | Chat / tasks | Knowledge query max | Library read max | Agent card fetch |
|------|--------------|---------------------|------------------|------------------|
| Self | Yes (local) | private | private | N/A |
| Direct | Yes | friends | friends | Yes (bonded) |
| Referred | Approval usually | public | friends | After approval |
| Public | Deny | public (rate-limited) | public | Challenge/deny |
| Blocked | Deny | Deny | Deny | Deny |

无论层级如何，原始文件共享 (`allowRawFiles`) 始终返回 **`approval_required`**。

#### E.7 Knowledge-sensitivity limits

**Knowledge-sensitivity 限制** 使用有序排名：public < friends < 可信 < 私有。Bond 等级设置上限；requesting 更高的 sensitivity 产生 **`approval_required`**（`requested sensitivity 超过 <tier>`）。处理程序中的项目 visibility 根据 policy 中的“maxSensitivity”进行检查，而不是单独检查 bond tier。

#### E.8 Agent Network eligibility

**Agent 网络资格** 需要 direct（或更高）保证金才能用于工人发现ry 和取卡；public 债券不会自动获取代理卡。工作人员必须选择加入 (`capabilityProviderEnabled`) 并在签名的 Agent 卡上宣传匹配功能 tag。Team jobs 仍然独立于 bond tier 执行任务范围、预算和每次操作批准。

## Appendix F — Task-State Reference

#### F.1 EnvoyMesh states

**EnvoyMesh 状态：** `创建 → 计划 → 发现 → 谈判 → waiting_for_peer |waiting_for_owner → 运行 → 部分 → 已完成 |失败 |取消`（第 65 章）。

**典型的转变：** `创建→计划`（协调器accepts目标）；`计划→发现|谈判`（工人search或投标交换）；`谈判 → waiting_for_owner`（需要批准）；`运行→部分`（临时结果，更多工作pending）；`部分→完成`（最终merge）；任何非终止状态→“已取消”（owner/peer/policy取消）。“已完成”、“失败”和“已取消”是终端。

#### F.2 Valid state transitions

**有效的转换：**沿着生命周期前进；“部分”可能先于最终成功；reject/根据授权取消 intent 的谈判或运行。

#### F.3 Terminal states

**Terminal 状态：** “已完成”、“失败”、“已取消”——除审核外没有其他任务 intent；collect-N 任务可能会在首次完成后提前结束。

#### F.4 A2A state equivalents

**A2A 等效项：** 12 个内部状态通过 `a2a-state-map.ts`（第 73 章）映射到 9 个 A2A 状态 - 用于客户端用户体验的 document 映射。

#### F.5 Cancellation behavior

**取消：** owner 或任务负责人 sends `task.cancel`；飞行中的工作应该心跳直到确认；A2A 客户端使用“tasks/cancel”来跟踪 id。

## Appendix G — Artifact and Content Mapping

#### G.1 Text artifacts

**文本工件** — UTF-8 摘要和聊天摘录；映射到 A2A 文本部分；在模型摄取之前应用 semantic firewall。

#### G.2 File artifacts

**文件工件** — Vault 支持的 path，带有可选的 `?hash=` verification；尺寸和 path 在服务时强制执行安全。

#### G.3 Structured artifacts

**结构化工件** — 带有 schema 提示的 JSON；自动化之前进行验证；映射到 MCP/A2A 数据部分。

#### G.4 Composite artifacts

**复合工件** — 具有 attribution 权重的子工件捆绑；桥接时扩展到多个零件。

#### G.5 MCP content mapping

**MCP 映射** — 工具结果变为 content blocks；保留 correlation IDs 用于审核缝合。

#### G.6 A2A Part mapping

**A2A 部件映射** — 文本/数据/文件部件 ↔ 本机工件类型（第 73 章）；hash - 在获取之前检查文件部分 URI。

## Appendix H — Privacy and Security Checklists

#### H.1 First-time setup

**首次 setup:** 创建 owner 密钥 → backup `owner-key.pem` → 第一个 device 证书 → 设置显示配置文件 → 使用低 sensitivity 测试 ping。

#### H.2 Add a contact

**添加联系人：** 验证带外 identity → 扫描 full QR → 完成绑定/挑战 → referred 处的 start，除非需要相互 direct 信任。

#### H.3 Add a device

**添加device：** owner签名的device证书→记录device ID→配对EnvoyGo或第二个ry桌面→revoke立即丢失device。

#### H.4 Connect an external agent

**外部代理：**生成桥承载→兼容性预设→测试local主机port→minimal工具调用→在广泛授权之前重新view审核。

#### H.5 Join Agent Network

**加入Agent网络：** direct债券→enable加入→publish卡→刷新工人→在团队工作之前试用单工人任务。

#### H.6 Start a Team job

**开始团队工作：**设定任务范围→合格的员工可见→计划获得批准→预算/截止日期现实→monitor心跳。

#### H.7 Operate a relay

**操作中继：** `--advertise-addr` for WAN → bootstrap multiaddr documented → monitor 中继管理器审核 → 中继主机上没有 LLM/vault。

#### H.8 Respond to a lost device

**丢失 device:** revoke device 证书 immediately → rotate 桥 tokens（如果暴露）→ 重新view 审核丢失后的流量 → re-pair 来自 backup owner 密钥（仅在受信任的硬件上）。

## Appendix I — Quick Reference Cards

#### I.1 Pair a contact

**配对联系：** Contacts → 邀请 → 显示二维码 → 其他扫描 → 完成绑定流程 → 在信任 UI 中确认 direct/referred 层。

#### I.2 Pair EnvoyGo

**配对EnvoyGo：**主页设置→设备→显示配对二维码→扫描EnvoyGo→验证手机上已连接的WebSocket。

#### I.3 Change trust

**改变信任：**公开联系 → trust tier → 确认 policy 影响（附录 E）→ 批准降低是否需要重新绑定。

#### I.4 Add knowledge

**添加知识：** Library → 添加 → 选择保险库安全的 path → 设置 sensitivity label → 如果 search 错过，则重新index。

#### I.5 Approve an action

**批准操作：** Desktop Approvals queue → 读取任务上下文 → 允许/拒绝 → 任务 resumes 或根据 policy 取消。

#### I.6 Connect an external agent

**连接外部代理：** 设置 → 外部代理 → 预设 → paste 承载到代理配置 → 测试消息往返。

#### I.7 Join Agent Network

**加入 Agent 网络：** 设置 → Agent 网络 → 加入 → 验证卡 published → 刷新对等节点上的工作人员。

#### I.8 Start a Team job

**开始团队工作：** Agent 网络 → 新工作 → 选择工作人员 → 设置任务 → 启动 → 在工作面板中观察状态。

#### I.9 Cancel a task

**取消任务：**打开任务→取消→确认任务allows取消→审核记录终端取消状态。

#### I.10 Revoke a device

**撤销 device：** 设置 → 设备 → 撤销 → 确认 revoked → device 应用程序上的 remove 配对。

#### I.11 Collect diagnostics

**收集诊断信息：** 附录 K bundle 检查表 → 编辑机密 → 附加 correlation IDs → CLI connectivity-status。

## Appendix J — Status and Roadmap Boundaries

#### J.1 Available features

**Available (0.1.0)** — 用于当前在supported 平台上使用：

- 签名消息、群组、音频消息、语音通话、文件/配置文件共享（第 11-14 章）
- 通过 EnvoyAI/OpenClaw 和外部代理桥的个人人工智能（第六部分）
- Vault、Library、知识问答ry、Browser/`envoy://` publishing（第五部分）
- Agent 网络、Team jobs、授权、批准（第七部分）
- Terminals、中继、MCP 收费桥、_ TERM_1__ 代理卡 + __ TERM_2__ 任务（第 VIII-IX、X 部分）
- 每第 9 章 Desktop Social (macOS/Windows) 和 EnvoyGo thin client (iOS/Android)

在生产 rollout 之前，在 release note 秒内确认准确的包装。

#### J.2 Beta and experimental features

**Beta / Experimental** — 已实施但仍在接受验证；接口可能会改变：

- 设置 (§80.11) 中的 Experimental toggles — enable 仅适用于非生产配置文件
- MCP stdio 实时服务器和扩展互操作烟雾 paths（Phase 48 个文档）
- A2A 主隧道 forwarding 和工件映射边缘情况（第九部分）
- IPFS/Helia sidecars 时 bundled — 可选 content 实验，不是核心聊天
- 负载下的多继电器协调——可以工作，但可能需要操作员调整

Report 与 **Beta** 或 **Experimental** label 相关的问题以及经过编辑的审核摘录。

#### J.3 Platform-specific features

**特定于平台的边界：**

- **macOS 桌面** — fuller OpenClaw extension bundle；Tauri 公证 path （第 9.2–9.4 章）
- **Windows 桌面** — slimmer extension 集；用户 AppData 配置文件 paths (9.3, 9.5)
- **EnvoyGo iOS/Android** — 仅 thin client：聊天、通话、终端、Browser mirror、read-only 团队 status；无 local 保险库、代理 runtime 或 MCP/A2A 服务器（9.1、9.9）
- **仅限主节点** — 网格 identity、Vault indexing、团队 orchestration、桥 endpoints、full 设置 (9.8)
- **Operator** — 中继 binary、fleet 清单、bootstrap 调整（X 部分，附录 K）

请勿从移动 mirror 推断桌面可用性，反之亦然。

#### J.4 Planned video calling

**Planned.** Voice calling 可用；video 调用仍然是架构上预期的，但不是当前的用户功能。

#### J.5 Planned broad or anonymous discovery

**Planned 边界ry.** Contact- 和能力范围的发现ry 存在，但开放匿名工作者recruitment 和市场行为不是当前的Agent 网络功能。

#### J.6 Parked: EnvoyGo as a full mesh node (EnvoyGo remains a thin client)

**Parked.** EnvoyGo 仍然是家庭配对 thin client。作为独立的 full 网格节点运行它没有提交的 release。

#### J.7 Parked global reputation

**Parked.** 存在本地反馈和声誉信号，但 federated 全球声誉分类帐被 intent 离子推迟。

#### J.8 Parked multi-hop commerce

**Parked.** 多跳商务、支付和收据工作流程超出了当前协作产品的范围。

#### J.9 Deferred Filecoin persistence

**推迟。** Helia 和 Kubo IPFS path 可用，但基于 Filecoin 的长期持久性不属于当前 release 的一部分。

#### J.10 Deferred hierarchical relay graph

**推迟。** 存在多中继同级协调；full 分层中继图不完整。

#### J.11 Future MCP resources and OAuth

**未来。** MCP 目前专注于工具和承载身份验证的桥。Resource、提示和 OAuth 2.1 仍然是未来 interoperability 的工作。

#### J.12 Other roadmap references

**其他路线图参考**（documented direction，不是当前的一般功能）：

- 视频通话 (J.4) — 今天仅支持语音
- 广泛/匿名工作者 recruitment (J.5)
- EnvoyGo 作为 full 网格节点（J.6—停放；thin client 保留产品 path）
- 全球声誉账本 (J.7)、多跳商务 (J.8)
- Filecoin 持久性 (J.9)、full 分层中继图 (J.10)
- MCP resources/提示/OAuth 2.1 (J.11)

See `docs/implementation-plan.md` for phase numbers; design docs alone do not imply shipment.

## Appendix K — Support Reference

#### K.1 Application data locations

EnvoyMesh keeps state outside the application install directory. **Source / developer runs** default to `./data/default` for the profile (identity, trust, tasks, approvals, bridge config) and `./shared_vault/` for Library content. **Packaged desktop builds** use OS-specific user data paths (for example `~/.local/share/envoymesh/` on Linux, `%AppData%` or `%USERPROFILE%\.envoymesh\` on Windows, and the Tauri app data area on macOS—confirm the exact path in release notes for your installer). The vault may appear as `shared_vault/` beside the profile or under a `vault/` subdirectory depending on platform packaging. Always back up the whole profile directory **and** the vault together before migration. Include only the relevant subtree in support bundles; remove `owner-key*`, device keys, `bridge-config.json` secrets, model API keys, and unrelated personal files.

#### K.2 Default ports

常见默认值包括外部代理网桥 `3031`、OpenClaw 网关 `18789`、中继 HTTP `15432` 和 HomeClaw/Hermes/OpenHuman 消息 ports `8010`/`8020`/`8021`。确认 configuration 因为操作员可能会覆盖 every 值。

#### K.3 Public endpoints

Public A2A routes include `/.well-known/agent-card.json` and `/.well-known/a2a/jsonrpc` when the relay bridge is enabled. Keep home-only bridge and administrative endpoints private.

#### K.4 Log locations

Primary operational history is append-only **JSONL** in the profile directory, not a separate syslog tree. Key files include `audit-events.jsonl` (allow/deny outcomes and connectivity traces), `task-journal.jsonl`, `approval-queue.jsonl`, `discovery-events.jsonl`, and `share-events.jsonl`, plus JSON state such as `trust-records.json` and `peer-directory.json`. Relay operators also generate relay-manager snapshot rows inside relay profile audit logs. Console output from `npm run node:dev` or the desktop wrapper is supplementary—prefer redacted audit excerpts with correlation IDs when opening support tickets. Strip bearer tokens, envelope payloads, and key material before sharing any log file.

#### K.5 Diagnostic commands

从 repository root （将 `--profile` 调整为您的绝对配置文件 path）：

```bash
npm run typecheck                    # TypeScript build check
npm test                             # Unit tests
npm run test:orchestrator -- dev     # Fast dev loop (~35s, no E2E)
npm run test:orchestrator -- full    # Full gate incl. libp2p E2E + smoke (~10 min)
npm run node:dev -- --profile ./data/default
npm run cli -w @envoymesh/node -- --help
npm run cli -w @envoymesh/node -- connectivity-status --profile ./data/default --rich
npm run cli -w @envoymesh/node -- relay-status --profile ./data/default
npm run cli -w @envoymesh/node -- audit --profile ./data/default --limit 40 --include-p2p-trace
```

See `QuickStart.md` for setup scripts, cross-network relay walkthroughs, and the end-to-end verification checklist. Global `envoymesh doctor` is available after `npm i -g .` from the repo root.

#### K.6 Common error themes

EnvoyMesh 在审计摘要、CLI 输出和桥接响应中按 **主题** 显示故障，而不是单个打印的错误代码手册。常见模式：

- **`auth-required`** — 持有者或 session 授权失败（token 缺失/无效，或 trust tier 对于 requested A2A/MCP/task 操作来说太弱）。在 retrying 之前修复配对 token、桥秘密或键级别。
- **Bond deny** — `evaluatePolicy` 返回 deny （例如 `peer 是 blocked`、`public 同级不能使用此 intent`、过期授权、disallowed 操作或高于授权的 sensitivity）。检查 trust tier 和任务范围；提高信任需要明确的人类批准，而不是 connectivity 调整。
- **架构/保护 reject** — inbound 保护 rejected 格式错误、过大、重播或未签名 envelope（`格式错误或未签名 envelope`、`envelope 超出最大大小`、`重播消息`）。通常表示版本偏差、损坏的 payload 或攻击流量，而不是中继路由问题。

当中继代理任务 endpoint 上缺少授权标头时，A2A JSON-RPC 也可能返回“-32001”和“auth-required:”消息。捕获审计 row 的 `summary` 和 `correlationId`，而不是在提交问题时发明数字代码。

#### K.7 Support and community links

**In-repo documentation:** start with `QuickStart.md`, `README.md`, `docs/implementation-plan.md`, and the scenario/design docs referenced from QuickStart (for example `docs/UserStory.md`, `docs/scenarios.md`).

**源存储库ry：** https://github.com/allenpeng0705/EnvoyMesh — 当该存储库ry 是您的 distribution channel 时，请使用 GitHub Issues 进行错误 report 和功能讨论。此 release 中没有单独的商业支持port portal documented；企业经营者应维护内部操作手册。

**Before opening an issue:** reproduce on a current build, note platform (macOS/Windows/EnvoyGo), profile path, feature status label (**Beta** / **Experimental**), and redacted `audit-events.jsonl` excerpts with correlation IDs. Placeholder community chat/forum links are not bundled with 0.1.0—watch release notes for official channels as they are announced.


---

> **针对 web 站点 edit 的信息 architecture 提案。** 下面的两个列表不是最终用户章节。它们是 public web 网站的建议导航框架，源自指南结构。编辑者应将它们视为start点并适应实际网站信息architecture。

## Proposed Primary Website Navigation

- **产品**
- **Agent 网络**
- **外部 Agents**
- **用例**
- **它是如何运作的**
- **安全**
- **下载**
- **指导**
- **社区**

## Proposed Guide Navigation

- 入门
- Conversations 和分享
- 个人人工智能
- Knowledge 和 Library
- 外部Agents
- Agent 网络和团队工作
- 任务和工件
- MCP 和 A2A
- 网络和Relays
- 隐私和安全
- 设置和数据
- 故障排除
- 常问问题
