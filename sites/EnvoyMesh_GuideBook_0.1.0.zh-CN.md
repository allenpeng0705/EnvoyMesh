# EnvoyMesh 指南

**版本：** 0.1.0  
**版本类型：** 完整指南版  
**修订日期：** 2026-07-25  
**语言：** [English](EnvoyMesh_GuideBook_0.1.0.md) · [简体中文](EnvoyMesh_GuideBook_0.1.0.zh-CN.md) ([HTML](EnvoyMesh_GuideBook_0.1.0.html) · [中文 HTML](EnvoyMesh_GuideBook_0.1.0.zh-CN.html))  
**受众：** 最终用户和潜在用户（第一部分至第十四部分）；网站编辑、支持团队和操作员（第十五部分和标记为 Operator 的主题）  
**目的：** EnvoyMesh 的完整最终用户指南 — 它是什么、如何在桌面和 EnvoyGo 上安装和使用它、身份和信任如何工作，以及如何安全地操作网络、智能体、中继和高级功能。

> **完整指南版本。** 本指南反映了修订日期时 EnvoyMesh 0.1.0 存储库的状态。它是为最终用户编写的，而不是作为内容大纲存根。功能状态可能因平台和部署而异 — 在生产环境中依赖它之前，请验证您构建中的每个 Beta 或实验性功能（发行说明、设置标签和附录 J）。

## 如何阅读本指南

- **第一至第十四部分** 向最终用户和操作员解释产品。
- **第十五部分** 适用于网站编辑和内容操作员，对于最终用户来说是可选的。
- 任务生命周期名称（例如*已创建* / *任务计划* / *运行中*）是 EnvoyMesh 状态，而不是产品 **Planned**（计划中）/ **Available**（可用）状态标签。
- 本指南中的 **Mobile**（移动）表示 **EnvoyGo**（与主节点配对的瘦客户端），除非有部分明确讨论旧版移动实验。

## 功能状态标签

- **Available**（可用）— 已实施并供当前使用。
- **Beta**（测试版）— 已实施，但仍在接受验证或产品完善。
- **Experimental**（实验性）— 可用于评估；行为或界面可能会改变。
- **Compatibility preset**（兼容性预设）— EnvoyMesh 包含集成的配置，而部分集成由另一个项目维护。
- **Planned**（计划中）— 已设计或记录，但目前不作为完整的产品功能提供。
- **Parked**（搁置）— 有意推迟，没有承诺的发布日期。
- **Desktop**（桌面）— 通过 EnvoyMesh 桌面应用程序或主节点可用。
- **Mobile**（移动）— 适用于 EnvoyGo，当前的 EnvoyMesh 移动产品（家庭配对瘦客户端）。
- **Operator**（操作员）— 用于节点、中继或集群管理员。

## 本指南使用的产品术语

- **EnvoyAI / OpenClaw** 是 EnvoyMesh 中包含的更丰富的捆绑智能体集成。
- **HomeClaw** 和 **Hermes** 是内置的外部智能体兼容性预设。
- **OpenHuman** 是内置兼容性预设，默认为禁用。
- HomeClaw、Hermes 和 OpenHuman 的智能体端代码由各自的项目维护；EnvoyMesh 提供桥接、预设、策略边界和网格工具。
- **Agent Network**（智能体网络）意味着绑定联系人允许其选择加入的本地智能体进行协作。它不是公共智能体市场。
- **Team jobs**（团队任务）是多智能体协作的面向用户的名称。源代码和较旧的文档可能将这些工作流程称为**链**。
- **EnvoyGo** 是当前的移动产品：与主 EnvoyMesh 节点配对的瘦客户端。早期的 Capacitor 移动树（进程内全节点）是遗留实验，不是主要的移动应用程序。作为全网格节点运行 EnvoyGo 本身已搁置（附录 J.6）。

---

# 目录

## 第一部分 — 认识 EnvoyMesh

### 1. 欢迎来到 EnvoyMesh

#### 1.1 面向人类和 AI 智能体的私有网络

EnvoyMesh 通过私有网格而不是中央账户服务连接人员和人工智能智能体。每个参与者保留一个本地身份，选择可信联系人（绑定在四个用户可选的信任等级之一 — 阻止、公共、推荐或直接；`self` 是您自己所有者、设备和智能体的隐式等级），并决定哪些智能体、工具和信息可以跨越这些关系。

#### 1.2 设计上优先本地和点对点

主节点本地存储身份、策略、对话、任务和知识。优先使用点对点传输，因此常规通信不依赖于托管应用程序数据库。

#### 1.3 无需中央账户

您创建加密身份，而不是注册全局用户名和密码。公共中继可以帮助对等节点找到并相互联系，但它们不是账户权限机构。

#### 1.4 您的身份、关系和数据属于您自己

所有者密钥建立控制权，绑定记录关系，敏感标签保护数据。因此备份很重要：丢失所有者密钥的唯一副本可能意味着失去该身份的连续性。

#### 1.5 直接连接和可选中继

EnvoyMesh 首先尝试直接对等节点路径。当 NAT、防火墙或移动网络阻止该路径时，可选中继提供会合和转发功能，而不会成为应用程序大脑。

#### 1.6 个人智能体和外部智能体

EnvoyAI 是基于捆绑的 OpenClaw 的助手。单独的桥可以连接 HomeClaw、Hermes、OpenHuman 或自定义 HTTP 智能体，而无需向外部进程提供原始 P2P 密钥。

#### 1.7 可信多智能体协作

智能体网络允许绑定的所有者将其本地智能体选择加入团队任务。请求节点计划工作，合格的工作者在本地执行，协调器组合带有归属的结果。

#### 1.8 开放协议和互操作性

本地签名的 EnvoyMesh 信封仍然是内部协议。MCP 向兼容应用程序公开工具，而 A2A 在网络边缘发布智能体发现和任务接口。

#### 1.9 主要功能一览

可用领域包括消息传递、群组、音频、语音通话、文件、资料、个人 AI、知识和 RAG、外部智能体桥、团队任务、终端、浏览器、中继、MCP 和 A2A。

#### 1.10 当前可用性和限制

某些功能仍然特定于平台或被推迟。特别是，视频通话、广泛的匿名工作者招募、全节点 EnvoyGo 操作、全球声誉、商业、Filecoin 持久性和完整的分层中继图不是当前的通用功能。


### 2. 为什么选择 EnvoyMesh？

#### 2.1 无需中央平台的私密通信

EnvoyMesh 将消息传递视为已签名的对等节点流量，而不是托管数据库中的行。您可以选择谁出现在您的联系人列表中，对话保留在您控制的设备内，除非您明确向外分享。这与无需密钥即可更改条款、扫描内容或冻结账户的集中式信使不同。

#### 2.2 跨设备的自主身份

您的所有者身份是 Ed25519 密钥对，而不是供应商注册的用户名。设备和智能体源自具有签名证书和授权的所有者，因此您可以证明笔记本电脑、台式机和配对手机之间的连续性。丢失所有者密钥的唯一副本可能会结束该身份的历史，因此备份和恢复规划从第一天起就很重要。

#### 2.3 由您掌控的 AI 助手

EnvoyAI 和外部智能体在您的主节点上运行，并受绑定策略、授权限制和可选的人工批准约束。您可以决定智能体可以使用哪些模型、工具和联系人，而不是接受供应商的默认自动化范围。远程模型提供商仅接收节点在语义防火墙和策略检查后批准的提示内容。

#### 2.4 可信知识共享

笔记和文件位于保险库中，出现在库界面中，并可以使用绑定引擎强制执行的敏感标签进行共享。绑定联系人可以通过 `knowledge.query` 查询您的公开或朋友等级材料，而陌生人只能看到公共子图并受到速率限制。发布供浏览使用单独的网络内容路径和可见性规则，详见第五部分。

#### 2.5 安全的任务委托

任务委托使用所有者签名的授权来限制成本、敏感性、允许的操作和到期时间。智能体不能静默地超出这些界限；有风险的步骤可能需要在执行前得到明确批准。这使自主工作变得清晰可见，而不是在别人的服务器上运行的黑匣子。

#### 2.6 您选择的智能体之间的协作

智能体网络是绑定所有者之间的选择性协作，而不是匿名工作者市场。团队任务让您的本地智能体计划工作并调用您已经信任的工作者，带有归属的结果返回给协调器。您可以控制哪些联系人的智能体可以参与。

#### 2.7 本地模型、远程模型和外部智能体

EnvoyMesh 支持本地推理、配置的远程提供商以及外部 HTTP 智能体（例如 HomeClaw 或 Hermes），一次通过一个桥接。节点代表智能体对网格流量进行签名，而不移交 Ed25519 密钥。混合使用不同提供商可以平衡隐私、延迟和功能，而无需锁定单一供应商堆栈。

#### 2.8 可审计性而非隐形自动化

操作将 JSONL 审计事件附加到关联 ID，将多步骤流程缝合在一起。您可以查看智能体尝试了什么、策略允许或拒绝了什么，以及哪个对等节点参与了。在诊断自动化或共享争议时，此审计轨迹补充了聊天历史。

#### 2.9 何时适合使用 EnvoyMesh

当您需要加密身份、明确的信任等级、本地优先存储以及策略下的智能体工具时，EnvoyMesh 很适合。它非常适合小型可信团体、具有网格覆盖范围的个人人工智能以及需要可验证消息传递和委派任务的团队。在扩展中继或智能体网络成员资格之前，从一个主节点和一些绑定联系人开始。

#### 2.10 何时其他解决方案更合适

具有轻松注册、庞大群组和供应商管理审核功能的全球消费者通讯工具可能比运行主节点更好地为您服务。同样，如果您只需要一个没有对等关系或本地保险库的云聊天机器人，则托管助手会更简单。EnvoyMesh 奖励愿意拥有密钥、备份和信任决策的操作员。

### 3. 您可以做什么

#### 3.1 与信任的人建立连接

验证联系人的公钥指纹后，通过介绍、二维码配对或中继辅助发现添加联系人。绑定记录信任等级 — 阻止(blocked)、公共(public)、推荐(referred) 或 直接(direct) — 控制每个对等方可以请求的内容。当关系发生变化时，您可以升级或降级信任，而无需迁移到新账户。

#### 3.2 交换私密消息

使用协议强制执行的人对人角色策略发送签名信封的一对一聊天。消息优先使用直接 libp2p 路径，当 NAT 阻止直连时回退到电路中继。与主节点配对后，阅读回执和送达行为遵循 Social 或 EnvoyGo 中的设置。

#### 3.3 创建群组对话

创建包含多个绑定联系人的群组线程，具有与直接聊天相同的签名和策略保证。群组成员身份和命名是通过节点协调的本地优先构造。使用家庭、项目或研究圈群组，其中每个人都已经建立了明确的信任关系。

#### 3.4 发送语音消息和进行语音通话

当双方支持该功能且策略允许时，在聊天中录制简短的音频片段或开始语音通话。媒体通过与消息相同的网格传输流式传输，而不是通过单独的专有通话后端。质量和可用性取决于网络路径以及对等节点是否可以通过直接或中继连接到达。

#### 3.5 共享文件和资料照片

使用签名的数据传输凭证与联系人共享文件，这些凭证会落在收件方的保险库收件箱文件夹中。资料照片和头像遵循与其他本地资产相同的身份和存储模型。收件人根据自己的敏感性规则对收到的文件进行索引。

#### 3.6 与您的个人 AI 智能体对话

从 Social 桌面或与正在运行的主节点配对时通过 EnvoyGo 与 EnvoyAI（捆绑的 OpenClaw）聊天。助手可以搜索您的保险库、向绑定联系人发送消息，并根据授权和批准调用允许的工具。根据您对自动化的舒适度，在"设置"→"人工智能"中启用或禁用捆绑智能体。

#### 3.7 连接 OpenClaw、HomeClaw、Hermes 或 OpenHuman

当您更喜欢外部运行时而不是捆绑的 EnvoyAI 时，通过"设置"→"AI"→"外部智能体"连接 HomeClaw、Hermes、OpenHuman 或自定义 HTTP 智能体。EnvoyMesh 将网格工具转换为外部智能体的消息契约，而不暴露原始 libp2p 密钥。一次仅运行一个外部桥；在启用之前验证您信任本地端点。

#### 3.8 搜索本地和可信知识

从库选项卡本地搜索您的保险库，或要求 EnvoyAI 通过保存时索引的 RAG 管道检索片段。联合搜索可以查询绑定联系人的联合知识，上限为您为每个联系人配置的敏感性上限。公共笔记通过速率限制的 `knowledge.query` 参与更广泛的网格供陌生人查询。

#### 3.9 发布和浏览网格内容

在主节点的网络内容目录提供的 `envoy://` URL 下发布 Markdown、图片和 PDF。绑定联系人（以及当可见性允许时，更广泛的网格对等节点）在与主页配对时在 Social 浏览器或 EnvoyGo 浏览器中打开页面。基于拉取的 `library.read` 按需获取字节；提要的推送通知在第 45E 阶段到达。

#### 3.10 将工作委托给另一个智能体

当您需要在签名范围内进行专门工作时，向另一个所有者的智能体发送任务授权。协商遵循从提议到接受、运行和结果的任务生命周期。对于授权标记为敏感的行动，仍然可以进行人工审批。

#### 3.11 在多个智能体上运行团队任务

当绑定所有者允许其智能体协作时，在选择加入的智能体网络成员之间运行团队任务（多智能体链）。请求节点计划步骤，工作者在自己的硬件上本地执行，结果以归属返回。这适用于研究摘要、拆分分析或协调报告，而不是公开招募匿名工作者。

#### 3.12 连接 MCP 和 A2A 应用

将选定的网格工具公开给 MCP 兼容的桌面应用程序（例如 Claude Desktop），或为外部任务客户端发布 A2A 智能体卡。MCP 和 A2A 位于网络边缘；本地签名的信封仍然是内部协议。仅当您了解哪些工具跨越边界后，才配置桥接。

#### 3.13 远程使用终端

当您配对或在桌面上时，在 Social 或 EnvoyGo 中打开基于浏览器的终端，这些终端通过 WebSocket 连接到主节点上的 PTY 会话。远程 shell 访问继承了与其他家庭 RPC 功能相同的身份验证和配对模型。将终端暴露视为高权限，并将其限制为您控制的设备。

#### 3.14 运行私有或社区中继

为您的集群运行私有中继，或针对社区中继进行引导以进行临时测试。中继提供会合和电路转发 — 它们不存储您的消息、运行模型或充当账户服务器。操作员广告监听地址，并可能为更大的部署配置分层中继图。

### 4. EnvoyMesh 如何工作

#### 4.1 系统概览（通俗易懂版）

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 470" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="760" height="80" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Clients</text><rect x="60" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Social Desktop</text><text x="140.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">React + WebSocket</text><rect x="260" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyGo</text><text x="340.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Flutter thin client</text><rect x="460" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Developer CLI</text><text x="540.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">node CLI</text><rect x="20" y="110" width="760" height="260" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="126" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Home Node Process (one per owner)</text><rect x="60" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Inbound Guard</text><text x="140.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">size · schema · sig · replay</text><rect x="260" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Bond Engine</text><text x="340.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">trust tier · policy</text><rect x="460" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Task Runtime</text><text x="540.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mandate · lifecycle</text><rect x="60" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Identity</text><text x="140.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 · DIDs · mandates</text><rect x="260" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault + Library</text><text x="340.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">files · RAG · knowledge</text><rect x="460" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Models</text><text x="540.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">router · semantic firewall</text><rect x="260" y="290" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="312.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">libp2p</text><text x="340.0" y="328.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">TCP · QUIC · mDNS · DHT</text><path d="M140,80 L140,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M340,80 L340,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M540,80 L540,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="20" y="390" width="760" height="60" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="406" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">External Services</text><rect x="60" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F3FF" stroke-width="1.2"/><text x="140.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#5d3ac7" font-weight="600" fill="#1e1d1b">Model Providers</text><text x="140.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">OpenAI · local · LiteLLM</text><rect x="260" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F5F4" stroke-width="1.2"/><text x="340.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#6d6a63" font-weight="600" fill="#1e1d1b">Relays</text><text x="340.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">connectivity only</text><rect x="460" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F5F4" stroke-width="1.2"/><text x="540.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#6d6a63" font-weight="600" fill="#1e1d1b">MCP / A2A</text><text x="540.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">bridges</text><path d="M340,360 L340,390" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 1 — Home-node system architecture: clients call JSON-RPC into one home node per owner; the home node owns identity, policy, storage, models, and networking; external services are optional and never hold owner keys.</figcaption></figure>


在较高级别上，您的主节点将身份、策略、存储、模型和 libp2p 网络组合在一个进程中。Social 桌面和配对的 EnvoyGo 是在该节点上调用 JSON-RPC 的瘦客户端。在发生任何模型或库访问之前，入站流量会通过大小、签名、重播和绑定决策的防护。

#### 4.2 所有者、设备、智能体和对等节点

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="300" y="20" width="200" height="50" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="400.0" y="42.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="14" font-weight="600" fill="#1e1d1b">Owner Key</text><text x="400.0" y="58.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 · long-lived root</text><path d="M400,70 L200,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="300.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">Agent Mandate</text><path d="M400,70 L400,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">Agent Mandate</text><path d="M400,70 L600,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="500.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">Agent Mandate</text><rect x="100" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Device Certificate</text><text x="200.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">per machine / phone</text><rect x="300" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">signs</text><text x="400.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">per agent · bounded</text><rect x="500" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="600.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">(direct use)</text><text x="600.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">owner signs envelopes</text><path d="M200,170 L200,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="200.0" y="191.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">derives</text><path d="M400,170 L400,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="191.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">derives</text><rect x="100" y="220" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Device Identity</text><text x="200.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy:device:&lt;hash&gt;</text><rect x="300" y="220" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Agent Identity</text><text x="400.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy:agent:&lt;hash&gt;</text><path d="M200,270 L200,320" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="200.0" y="291.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">runtime</text><path d="M400,270 L400,320" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="291.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">runtime</text><rect x="100" y="320" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="342.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Peer ID</text><text x="200.0" y="358.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy_&lt;hash&gt; · signs</text><rect x="300" y="320" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="342.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Peer ID</text><text x="400.0" y="358.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy_&lt;hash&gt; · signs</text><rect x="470" y="200" width="260" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="478" y="216" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Properties</text><text x="490" y="230" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Owner key never leaves its device</text><text x="490" y="250" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Devices/agents can be revoked</text><text x="490" y="270" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Peer IDs may rotate</text><text x="490" y="290" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Peers verify owner linkage</text><text x="490" y="310" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• Losing owner key = losing</text><text x="490" y="326" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">  that identity history</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 2 — Identity hierarchy: the owner key is the root; it signs device certificates and agent mandates, each deriving a device/agent identity and a runtime peer ID that signs envelope traffic.</figcaption></figure>


所有者密钥是长寿的人类根；设备接收所有者签名的证书；智能体接收将它们链接到该所有者的授权。运行时对等 ID 对各个信封进行签名，并可以随密钥轮换，同时保留信任链接。理解此堆栈有助于您推理备份、配对和智能体授权。

#### 4.3 联系人、绑定和信任等级

联系人映射到具有确定哪些意图和敏感级别是允许的等级的绑定记录。公共陌生人可以 ping 或请求绑定；推荐联系人获得更广泛的查询访问权限；直接绑定解锁朋友等级的共享。策略评估是确定性的并记录下来以供审计。

#### 4.4 签名消息和可验证发送者

每个信封在规范 JSON 之上携带 Ed25519 签名，因此收件人在执行内容之前验证发送者身份。角色字段在架构级别强制实施人与人之间的聊天与智能体之间的任务流量。被篡改或重播的消息无法通过入站防护。

#### 4.5 个人智能体和外部智能体桥接

捆绑的 EnvoyAI 使用网格工具在进程内运行，而外部智能体通过 HTTP 桥连接，该桥永远不会接收您的私有签名密钥。桥转发允许的工具调用并将响应转换为网格信封。选择一个主要智能体表面以避免自动化冲突。

#### 4.6 本地知识、库和保险库

保险库在路径安全规则下将文件存储在磁盘上；库是笔记、导入和发布项目的界面和元数据层；RAG 为聊天期间的检索建立保险库片段索引。敏感覆盖存储在每个项目的 `.envoy/sensitivity.json` 中，而不是每个文件夹。用于浏览的网络内容位于映射到 `envoy://` 路径的单独 `web/` 目录下。

#### 4.7 任务、授权和审批

任务通过命名的生命周期状态进行，授权定义了授权意图、成本上限和终止策略。所有者可以在特定操作之前要求批准，即使授权允许自动化也是如此。取消和心跳意图使长期运行的工作保持可问责。

#### 4.8 智能体网络成员资格

智能体网络成员资格是绑定联系人之间的相互选择加入，他们启用其智能体进行协作。它不是列出匿名工作者的公共市场。团队任务在选择合格工作者时使用此成员资格图。

#### 4.9 直接网络和中继协助

节点首先尝试直接 TCP 或 QUIC 连接，在局域网 (LAN) 上使用 mDNS，并在配置时使用 DHT 发现。当 NAT 阻止直接路径时，电路中继 v2 保留转发流而不解密应用程序负载。您选择引导中继；他们协助连接，而不是拥有您的身份。

#### 4.10 活动记录和端到端审计

审计和日志 JSONL 文件记录多跳流的意图、结果、延迟和关联 ID。操作员可以使用这些 ID 跟踪团队任务、知识查询或对等节点之间的文件传输。日志故意避免存储原始敏感负载，除非调试策略需要。

### 5. 常见用例

#### 5.1 跨设备的私密个人 AI

在桌面主节点上运行 EnvoyAI，并从 Social 本地或在远离家庭时通过 EnvoyGo 访问它。您的保险库、模型和绑定保留在您信任的计算机上，而手机充当遥控器。备份所有者密钥和保险库数据，以便设备丢失不会影响您的智能体历史。

#### 5.2 家庭或朋友网络

通过介绍邀请家人或朋友，建立直接绑定，并使用群组聊天加上文件共享，无需共享云账户。每个参与者都保留自己的节点和数据；共享是通过消息、凭证和联合知识设置明确进行的。当成员位于不同网络时，中继会有所帮助。

#### 5.3 可信研究和知识交流

以公开或朋友敏感度交换研究笔记，查询对等节点的联合库，并通过 MCP 写回将带有归属的结果保存回您的保险库。联合 RAG 尊重每个联系人的上限，因此您永远不会默默地泄露私人材料。当您需要持久的 `envoy://` 链接时，将完成的摘要发布为网格页面。

#### 5.4 小型团队智能体网络

在已经共享直接绑定和一致授权的小型团队中启用智能体网络。为拆分研究、代码审查协助或草稿报告分配团队任务，每个工作者在本地硬件上执行。查看审计轨迹以查看哪个智能体贡献了每个部分。

#### 5.5 多智能体规划和报告生成

计划一个多步骤的报告，其中一名智能体概述各个部分，工作者从本地保险库收集证据，协调器合并带有归属的文本。授权限制成本，并需要在发送外部电子邮件或消费积分之前获得批准。结果出现在聊天中，并可以保存为库笔记以供以后引用。

#### 5.6 与可信网格联系人一起使用 OpenClaw

将 OpenClaw 保留为节点上的 EnvoyAI，同时使用网格工具向绑定联系人发送消息和搜索联合知识。OpenClaw 从不接收原始 libp2p 访问；它通过注册表调用 `mesh.findKnowledge`、`mesh.sendMessage` 和相关工具。此模式适合需要 OpenClaw 技能且具有值得信赖的对等节点影响力的高级用户。

#### 5.7 将 HomeClaw 作为外部 EnvoyMesh 智能体

将 EnvoyMesh 指向本地 HomeClaw HTTP 端点，以便 HomeClaw 成为会话表面，同时节点处理身份和网格 I/O。HomeClaw 自己的内存和插件留在其进程中；EnvoyMesh 对出站操作强制执行绑定。仅在已运行并信任 HomeClaw 的计算机上启用预设。

#### 5.8 将 Hermes 作为外部 EnvoyMesh 智能体

当您更喜欢 Obsidian 风格的知识工具和网格消息传递时，请使用 Hermes。桥接器通过与其他外部智能体相同的策略边界转发 Hermes 响应和工具结果。在"设置"→"AI"中使用默认 `http://127.0.0.1:8020/message` 端点或自定义 URL。

#### 5.9 将 OpenHuman 作为外部 EnvoyMesh 智能体

OpenHuman 可作为默认禁用的兼容性预设，供尝试该运行时的团队使用。启用时，它遵循相同的一次一桥规则，并且从不接收签名密钥。在您的组织验证 OpenHuman 的本地部署模型之前，将其视为可选功能。

#### 5.10 通过 MCP 使用 EnvoyMesh 的 Claude Desktop

在 Claude Desktop 中将 EnvoyMesh 注册为 MCP 服务器，以向 Anthropic 的客户端公开网格搜索、联系人和消息传递工具。MCP 跨越了桌面边界 — 查看您可以启用哪些工具以及它们可以从您的保险库中读取哪些数据。主节点必须运行才能成功进行 MCP 会话。

#### 5.11 委托任务的外部 A2A 客户端

从您的节点发布 A2A 智能体卡，以便外部 A2A 客户端可以通过 JSON-RPC 代理发现功能并委派任务。家庭隧道和中继路径让远程客户端到达主节点，而无需向外部运行时暴露原始 libp2p。授权和批准仍然适用于委派的工作。

#### 5.12 自托管中继集群

为需要私有引导和电路中继容量的家庭、实验室或组织部署一个或多个带有广告地址的中继二进制文件。中继保持精简：没有大型语言模型，没有保险库，没有超越传输转发的负载检查。操作集群基础设施时监视中继审计快照。

### 6. 产品和协议比较

#### 6.1 EnvoyMesh 与集中式信使

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 740 358" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="160" height="40" fill="#645a3a"/><text x="100" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">Integration</text><rect x="180" y="10" width="240" height="40" fill="#645a3a"/><text x="300" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">Trust boundary</text><rect x="420" y="10" width="300" height="40" fill="#645a3a"/><text x="570" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">What it can reach</text><rect x="20" y="50" width="160" height="48" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1"/><text x="100" y="80" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">EnvoyAI / OpenClaw</text><rect x="180" y="50" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="80" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Bundled · in-process</text><rect x="420" y="50" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="80" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Full mesh tools · chat · tasks</text><rect x="20" y="98" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="128" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">HomeClaw</text><rect x="180" y="98" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="128" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP bridge · loopback</text><rect x="420" y="98" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="128" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools · chat (one URL)</text><rect x="20" y="146" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="176" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Hermes</text><rect x="180" y="146" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="176" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP bridge · loopback</text><rect x="420" y="146" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="176" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools · chat (one URL)</text><rect x="20" y="194" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="224" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">OpenHuman</text><rect x="180" y="194" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="224" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP bridge · loopback</text><rect x="420" y="194" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="224" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools · chat (one URL)</text><rect x="20" y="242" width="160" height="48" fill="#FEF3C7" stroke="#3d5a45" stroke-width="1"/><text x="100" y="272" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">MCP server</text><rect x="180" y="242" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="272" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">stdio · Claude Desktop</text><rect x="420" y="242" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="272" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Mesh tools exposed outward</text><rect x="20" y="290" width="160" height="48" fill="#F5F3FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="320" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">A2A</text><rect x="180" y="290" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="320" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">JSON-RPC · relay</text><rect x="420" y="290" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="320" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Agent Card · task methods</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 18 — Integration-shape comparison: six external integration shapes side by side, each with its trust boundary and reachable surface. EnvoyAI is deepest; MCP/A2A are outward-facing.</figcaption></figure>


集中式信使针对无摩擦注册、电话号码身份和供应商运营的大规模审核进行了优化。EnvoyMesh 用自主主权密钥、明确绑定和您自己操作的本地优先存储来换取这种便利性。选择信使以获得大众影响力；当信任边界和可审计性更重要时，选择 EnvoyMesh。

#### 6.2 EnvoyMesh 与云 AI 助手

云 AI 助手在供应商基础设施上使用账户登录和供应商策略运行推理和内存。EnvoyMesh 将模型、保险库和绑定保留在您的节点上，同时可以选择调用您配置的远程提供商。您获得网格覆盖范围和授权，而不是单一供应商的聊天历史孤岛。

#### 6.3 EnvoyMesh 与独立 OpenClaw

独立的 OpenClaw 擅长作为本地助手，但缺乏本地签名的对等消息传递、绑定策略和联合知识，除非扩展。EnvoyMesh 将 OpenClaw 捆绑为 EnvoyAI 并用网格工具、授权和审计将其包装起来。在不集成的情况下运行两者会重复智能体，除非您禁用其中一个。

#### 6.4 EnvoyMesh 与外部智能体运行时

外部智能体运行时（HomeClaw、Hermes、自定义 HTTP）专注于对话和插件；EnvoyMesh 提供身份、传输和策略。桥接模式将 libp2p 密钥保留在节点上，而外部进程处理您喜欢的用户体验。双方都没有取代另一方 — 他们在有意配置时组合使用。

#### 6.5 EnvoyMesh 与 MCP

MCP 标准化了 AI 应用程序的工具发现机制；EnvoyMesh 实现了一个 MCP 适配器，该适配器公开选定的网格功能。原生网格意图保持更丰富的内容和签名；MCP 是桌面客户端的互操作性边缘。建议只启用必要的 MCP 工具以限制保险库和联系人信息的暴露。

#### 6.6 EnvoyMesh 与 A2A

A2A 定义了跨产品委派的智能体卡和任务接口；EnvoyMesh 通过中继或家庭隧道路径发布卡片和代理任务。本机团队任务和授权管理网格内的信任关系；A2A 将范围扩展到外部协调器。两者可以在不同的策略层面共存。

#### 6.7 EnvoyMesh 原生智能体网络与公共市场

公共智能体市场针对匿名工作者的发现和商业排名进行优化。EnvoyMesh 智能体网络则相反：仅在本地选择加入的绑定所有者之间进行协作。原生设计中没有全球列表、声誉评分或支付方式。

#### 6.8 原生协议与互操作性桥接

签名的 Envoy 信封、授权和绑定等级是网格内的原生协议。MCP 和 A2A 桥在外部生态系统的边缘进行转换，而不取代内部安全模型。对于绑定对等节点的工作，更喜欢本地流程；当外部客户端必须参与时使用桥接。

---

## 第二部分 — 安装和入门

### 7. 选择您的设置

#### 7.1 仅桌面

在 Mac 或 Windows 计算机上运行 EnvoyMesh 作为您的主要主节点。从当前发布安装程序或源代码构建安装，在首次启动时创建所有者身份，并在需要网格连接时保持机器运行。此路径适合任何在受信任桌面上开始且尚未进行移动访问的人。

#### 7.2 桌面配合 EnvoyGo 移动访问

在您的主节点正常运行后，在 iOS 或 Android 上添加 EnvoyGo。手机通过扫描二维码进行配对，并镜像聊天、联系人、终端和选定的家庭功能 — 它不会取代桌面节点或自行持有所有者密钥。当您外出使用移动设备时，请规划家庭计算机可通过局域网 (LAN)、中继或隧道保持可达性。

#### 7.3 桌面配合捆绑的 EnvoyAI 智能体

EnvoyAI（OpenClaw）随桌面节点一起提供，默认在端口 18789 上启动。它可以搜索您的保险库、向绑定联系人发送消息，并在您的绑定和批准设置下运行本地工具。如果您希望在启动时不使用捆绑助手，可以在"设置"→"人工智能"中切换它，或在 `node-config.json` 中设置 `openclawEnabled`。

#### 7.4 桌面配合外部智能体

通过"设置"→"人工智能"→"外部智能体"连接 HomeClaw、Hermes、OpenHuman 或自定义 HTTP 智能体。一个节点一次运行一个外部桥；EnvoyMesh 代表智能体对网格流量进行签名，而不移交 Ed25519 密钥。仅在信任外部进程及其本地端点后才启用桥接。

#### 7.5 桌面配合本地或远程模型

根据您的隐私和成本偏好，在"设置"→"人工智能"下配置模型提供商。本地模型将推理保留在您的硬件上；远程提供商根据您配置的限制将批准的提示发送到节点外。从一个提供商开始，在聊天中验证响应，然后在批准行为符合您的预期后扩大自动化范围。

#### 7.6 个人中继或社区中继

中继帮助对等节点发现彼此并穿越 NAT；它们不持有您的账户或读取应用程序负载。使用社区中继进行临时测试，或使用 `npm run node:dev -- --profile ./data/relay --relay-server --listen /ip4/0.0.0.0/tcp/4001` 运行自己的中继。普通节点使用 `--bootstrap "<relay-multiaddr>"` 和 `--relay` 进行引导。

#### 7.7 小型团队和组织部署

为每个团队成员提供一个具有自己所有者身份的主节点，然后显式绑定联系人，而不是共享一个登录名。操作员可以部署私有中继、标准化信任等级，并在车队部署前禁用捆绑的赞助商联系人。记录配置文件数据路径，以便备份和升级在机器之间保持一致。

#### 7.8 推荐的首次设置

在受信任的计算机上安装桌面应用程序，完成所有者和设备设置，如果需要个人助手则启用 EnvoyAI，并在添加联系人之前备份身份材料。在同一 LAN 上配对一个测试联系人，发送一条消息，然后可选地添加 EnvoyGo。在基本聊天和状态指示器看起来正常之前，推迟团队任务、外部智能体和 WAN 中继测试。


### 8. 安装 EnvoyMesh

#### 8.1 系统要求

使用支持的当前 macOS 或 Windows 桌面环境，有足够的存储空间用于应用程序、本地数据以及可选的模型或 IPFS 组件。源代码构建需要存储库的 Node.js 工具链和包依赖项；移动访问还需要运行中的主节点。

#### 8.2 在 macOS 上安装

下载 macOS 磁盘映像，打开它，并将 EnvoyMesh 移动到应用程序文件夹。首次启动时，macOS 可能需要确认，因为发布签名和公证因构建而异；升级时保留您的数据目录。

#### 8.3 在 Windows 上安装

运行 Windows 安装程序，并在需要对等连接时允许捆绑的节点运行时通过本地防火墙提示。Windows 包有意携带较小的基本 OpenClaw 扩展集以控制安装程序大小。

#### 8.4 在 iOS 上安装 EnvoyGo

通过可用的 iOS 分发渠道安装 EnvoyGo，然后将其配对到现有的主节点。EnvoyGo 是一个瘦客户端：不要期望它取代桌面节点或在主节点不可用时保留独立的网格身份。

#### 8.5 在 Android 上安装 EnvoyGo

在 Android 上安装 EnvoyGo 并完成相同的主节点配对流程。通知和后台行为取决于 Android 权限、电池优化和 FCM 配置。

#### 8.6 从源代码安装

从存储库根目录，使用 `npm install` 安装依赖项，运行 `npm run typecheck`，然后运行 `npm test`。使用 `npm run node:dev` 启动节点；有关平台先决条件和可选组件，请参阅 `QuickStart.md`。

#### 8.7 验证安装

健康的安装会启动节点、打开社交界面、显示身份和连接状态，并能访问本地服务。在导入数据或添加外部集成之前，使用内置状态界面进行验证。

#### 8.8 应用数据位置

身份、信任、审计、任务、保险库和配置数据存储在节点的应用程序数据位置，而不是安装目录中。使用附录 K 和当前发布说明找到特定于平台的根目录。

#### 8.9 更新 EnvoyMesh

备份身份和保险库数据，停止活动任务，并在应用程序上安装较新版本。重新启动前查看 `CHANGELOG.md` 了解配置或存储迁移。

#### 8.10 卸载而不丢失身份或数据

删除应用程序应与删除其数据目录分开处理。如果打算重新安装，请保留数据根目录和身份备份；只有在故意要擦除本地身份和记录时才删除它们。


### 9. 平台和包差异

#### 9.1 桌面和移动功能比较

桌面社交是完整的主节点体验：网格身份、保险库、智能体、团队任务编排、浏览器、终端和设置。EnvoyGo 通过 JSON-RPC 镜像到配对的主节点的一个子集 — 聊天、联系人、语音通话、只读团队任务状态、终端和浏览器。将移动设备视为遥控器，而不是第二个独立节点。

#### 9.2 macOS 打包

macOS 版本以磁盘映像形式发布，包含 Tauri 包装的社交界面和嵌入式节点运行时。OpenClaw 扩展在 macOS 上比在 Windows 上捆绑得更完整，以减少安装后的配置工作。检查发布说明了解您的 macOS 版本上的公证和 Gatekeeper 行为。

#### 9.3 Windows 打包

Windows 版本使用安装程序，该安装程序捆绑了节点运行时和精简的 OpenClaw 扩展集以控制下载大小。如果需要入站对等连接，请在提示时允许应用程序通过 Windows 防火墙。配置文件数据存储在您的用户应用程序数据路径下，与安装文件夹分离。

#### 9.4 macOS 上捆绑的 OpenClaw 扩展

macOS 桌面构建包含 EnvoyAI 使用的更完整的 OpenClaw 扩展包。源代码安装在 `./scripts/setup.sh` 或 `npm run setup` 期间复制扩展。如果从源代码开发，升级 OpenClaw 相关依赖后重新运行设置。

#### 9.5 Windows 上的基本 OpenClaw 扩展选择

Windows 安装程序包含精选的基本扩展集，而不是每个可选通道。如果缺少某个功能，请与发布说明中的 macOS 捆绑列表进行比较，或使用 `.\scripts\setup.ps1` 从源代码安装。核心网格和聊天功能不需要额外扩展。

#### 9.6 完整和精简的桌面捆绑包

某些版本提供包含可选组件的完整安装程序和不包含 IPFS 或额外附带组件的精简版本。当您希望开箱即用可选内容功能时选择完整版本；在磁盘受限或离线实验室机器上选择精简版本。无论捆绑包风格如何，您的身份和保险库数据都是相同的。

#### 9.7 可选 IPFS 附带组件

IPFS 相关组件是内容寻址实验的可选附加组件，不是聊天、绑定或团队任务所必需的。仅当发布说明记录了您平台支持的附带组件时才启用它们。如果您希望最小化攻击面，可以省略它们。

#### 9.8 需要主节点的功能

网格身份、智能体运行时、保险库索引、团队任务编排、MCP/A2A 桥和完整设置都在主节点上。EnvoyGo、指向远程配置文件的浏览器开发 UI 和针对 `--profile` 的 CLI 都假定该节点正在运行且可达。没有主节点，移动镜像和瘦客户端无法进行身份验证或发送签名流量。

#### 9.9 作为 EnvoyGo 移动镜像可用的功能

EnvoyGo 公开聊天线程、联系人、语音通话、终端连接、用于 `envoy://` 内容的浏览器、推送通知，以及"我"→"智能体网络"下的只读最近团队任务状态。AI 引擎切换和桥配置在移动设备上显示为只读；在主节点上更改它们。手机上的缓存数据是为了方便，不是权威的身份存储。

#### 9.10 遗留移动实验和当前产品边界

`apps/mobile` 中的 Capacitor 应用程序是进程内全节点实验，不是产品移动路径。EnvoyGo 是支持的配对到家庭的瘦客户端。将 EnvoyGo 作为独立的完整网格节点运行仍被搁置；使用桌面或源代码构建作为主节点。


### 10. 创建您的身份

#### 10.1 您的 EnvoyMesh 身份代表什么

您的身份是加密的，不是云用户名。所有者身份控制授权和设备；每个设备都有自己的密钥；您的智能体身份在所有者签名的授权下在网格上行动。对等节点根据这些 ID 验证签名，而不是信任中央目录。

#### 10.2 创建所有者身份

首次启动时，社交界面引导您生成存储在配置文件目录中的所有者密钥对（例如源代码运行中的 `./data/default`）。此步骤每人执行一次；新机器上的后续安装导入或授权额外设备，而不是创建第二个所有者。在绑定生产联系人之前备份所有者材料。

#### 10.3 创建您的第一个设备身份

第一次桌面安装会自动创建一个由您的所有者密钥授权的设备身份。设备对日常信封进行签名并保存本地会话状态。诊断配对时，在个人资料中或通过 `npm run cli -w @envoymesh/node -- profile --profile ./data/default` 记下设备 ID。

#### 10.4 创建或激活您的智能体身份

EnvoyMesh 从您的所有者和智能体密钥派生智能体对等身份，然后记录将智能体链接到您的所有者签名授权。EnvoyAI 在发送智能体角色消息时使用此身份。外部桥智能体在启用时接收一个单独的桥身份，持久化为 `bridge-identity.json`。

#### 10.5 设置您的显示个人资料

在社交界面中打开个人资料，设置绑定后其他联系人看到的姓名、头像和字段。个人资料数据已签名并本地存储在您的个人资料目录中。在分享配对码之前更新它，以便收件人能够识别您。

#### 10.6 了解您的 DID

您的所有者 DID 遵循从您的公钥派生的 `envoy:owner:<hash>` 格式。设备和智能体 ID 使用并行的 `envoy:device:` 和 `envoy:agent:` 前缀。一旦对等节点交换了信任，共享所有者 ID 以进行稳定寻址；运行时对等 ID 可以随密钥轮换，而所有者 ID 保持长期不变。

#### 10.7 保护您的加密密钥

私钥存储在配置文件数据目录中，具有限制性文件权限。不要将密钥文件未加密地复制到聊天、电子邮件或共享驱动器。使用主节点机器上的操作系统用户账户保护作为第一层防御。

#### 10.8 备份身份和恢复数据

在操作系统重新安装或硬件迁移之前，复制整个配置文件目录 — 或导出您的版本记录的备份。`shared_vault/` 下的保险库内容或您配置的保险库路径应与应用程序二进制文件分开备份。在紧急需要之前，在非生产机器上测试恢复。

#### 10.9 添加另一个设备

通过扫描二维码或从主节点的配对队列中批准配对请求来配对第二个设备。所有者签署设备证书授权新设备，同时共享相同的所有者 ID。EnvoyGo 配对遵循瘦客户端流程：手机接收主节点的会话，而不是在手机上复制所有者密钥。

#### 10.10 撤销丢失或泄露的设备

从受信任的剩余设备中，撤销丢失的设备证书并删除其信任条目。如果外部智能体在受损机器上运行，请更改任何桥接密钥。将所有者密钥泄露视为灾难性事件：撤销设备、轮换桥接凭证，并仅在确信密钥干净后重新绑定联系人。


### 11. 应用程序导览

#### 11.1 主页和节点状态

主页视图总结了节点连接性、发现模式和最近活动。使用它确认节点正在监听、中继可达，并且没有启动警告。CLI 等效项包括 `connectivity-status` 和 `relay-status` 用于更深层次的诊断。

#### 11.2 对话

对话列表显示带有送达指示器的一对一和群组聊天线程。打开一个线程可以发送文本、音频、文件或智能体消息，具体取决于信任和设置。搜索和固定行为遵循当前的社交版本；未读状态从您的本地配置文件存储同步。

#### 11.3 联系人和发现

联系人显示带有信任等级徽章的绑定对等节点；发现功能在策略允许的情况下显示基于能力或标签的查找。陌生人在您接受绑定请求之前受到严格的速率限制。如果关系发生变化，从联系人详情表中阻止或降级信任。

#### 11.4 群组

从对话创建群组，添加绑定联系人，并设置标题和头像。群消息使用与一对一聊天相同的签名信封路径，并带有群组路由元数据。只添加您在计划在群组中分享的敏感度级别上信任的参与者。

#### 11.5 知识库和库

库是应用内知识库：创建 Markdown 笔记、导入文档，并切换每个项目的敏感度。策略引擎遵循四个等级 — `public(公开)`、`friends(朋友)`、`trusted(可信)`、`private(私有)` — 而 UI 为您最常选择的等级显示更友好的标签。保存的笔记会自动索引到 RAG 中。可选的 Obsidian 和 MCP 插件在"设置"→"人工智能"→"知识库"下配置。

#### 11.6 浏览器

浏览器通过节点的策略边界加载允许的 `envoy://` 网格内容。您看到的是绑定规则和敏感度标签允许的内容 — 默认情况下不是开放网络。使用它来阅读绑定或公共作者发布的笔记和网格页面。

#### 11.7 团队任务

团队任务在智能体网络启用的地方显示。您的智能体跨选择加入的绑定智能体编排工作；您在团队任务 UI 中查看计划、预算和结果。在启用自动成本重新平衡策略之前，从较小的目标开始。

#### 11.8 终端

终端通过 WebSocket 连接到主节点上的 shell 会话，包括从内联聊天或专用终端视图。会话需要通过节点进行身份验证，并尊重您对智能体命令执行的批准设置。从 EnvoyGo 的远程连接通过家庭 JSON-RPC 传输隧道传输。

#### 11.9 审批和活动

审批队列等待您决策的敏感智能体或任务操作；活动（审计）显示带有关联 ID 的允许/拒绝结果。从社交界面或 CLI（`npm run cli -w @envoymesh/node -- approvals ...`）批准或拒绝。使用关联 ID 来连接多步骤团队任务或中继辅助流。

#### 11.10 个人资料

个人资料编辑您对人类可见的身份，并显示所有者、设备和智能体标识符。这是复制配对信息和验证您使用的是哪个设备的正确位置。更改会在联系人收到的下一个签名个人资料更新时传播给他们。

#### 11.11 设置

设置控制发现配置文件、AI 引擎、外部智能体桥、知识插件、通知和节点行为标志。更改写入您配置文件目录中的 `node-config.json`、`bridge-config.json` 和相关文件。当设置需要节点重新加载时，重新启动或遵循应用内提示。

#### 11.12 连接和智能体状态指示器

头部徽章显示 WebSocket/社交连接、网格可达性、EnvoyAI 网关健康状况，以及配置时的外部桥状态。黄色或红色状态意味着您应该在发送敏感数据之前修复连接性。EnvoyGo 显示一个并行的连接指示器用于家庭可达性。


### 12. 连接您的第一个联系人

#### 12.1 配对和绑定的作用

配对交换足够的信息来识别和联系另一个所有者；绑定记录信任关系和策略等级。打包的桌面构建还可能在首次启动时从 `bundled-sponsor-friend.json` 添加项目赞助商联系人；操作员可以在部署前禁用该捆绑包。

#### 12.2 使用二维码配对

在一台设备上打开添加联系人，在另一台设备上显示我的代码，然后使用社交界面或 EnvoyGo 中的内置扫描仪扫描。确认显示的所有者 ID 和显示名称与您当面预期的相符。在将联系人视为可信之前完成绑定请求流程。

#### 12.3 使用邀请链接配对

从联系人生成邀请链接或多地址有效负载，并通过您信任的渠道（Signal、当面 AirDrop 等）分享。收件人在社交界面中打开链接以启动配对。将泄露的链接视为泄露的电话号码 — 撤销或忽略意外的绑定请求。

#### 12.4 在本地网络上配对

在同一个 LAN 上，mDNS 发现可能列出附近的节点而无需手动多地址。使用默认发现或 `--listen /ip4/0.0.0.0/tcp/0` 启动两个节点，然后从发现 UI 中选择对等节点。LAN 配对是在测试中继路径之前验证签名和聊天的最快方式。

#### 12.5 验证身份信息

在接受绑定之前，离线比较所有者 ID、显示名称和可选的证明文本。签名的信封证明拥有密钥，而不是您认识该人 — 您的证明步骤弥合了这一差距。拒绝与您的联系人所说的不匹配的请求。

#### 12.6 选择适当的信任级别

EnvoyMesh 信任等级分为 阻止(blocked)、公共(public)（陌生人）、推荐(referred) 和 直接(direct)（朋友）。除非您已经有强大的信任基础，否则将新认识的人从 公共(public) 或 推荐(referred) 开始。直接信任解锁更丰富的知识共享和智能体协作；仅在故意时升级。

#### 12.7 接受绑定请求

入站绑定请求出现在联系人或通知中，带有发送者的证明消息。接受以在本地记录相互信任；拒绝将他们留在陌生人等级。任何一方以后都可以从联系人设置中更改等级或阻止。

#### 12.8 发送第一条消息

打开新的联系人线程并发送一条简短的签名聊天消息。根据您的版本，观察送达或已读指示器。如果消息停滞，在重新发送重复消息之前检查连接状态。

#### 12.9 确认直接或中继辅助送达

成功送达在线程中显示肯定确认或审计 `chat.message` 允许行。中继辅助路径使用从 `relay.lookup` 学到的 `/p2p-circuit` 地址；直接 LAN 路径跳过中继跃点。使用 `--include-p2p-trace` 的 CLI 审计有助于在测试期间确认使用了哪种路径。

#### 12.10 排查配对问题

验证两个节点都在运行、防火墙允许出站 TCP，并且配置文件路径在 UI 和 CLI 之间匹配。对于 WAN 测试，确认引导中继多地址并运行 `connectivity-status`。重启后使用新复制的监听多地址重试，因为动态端口会更改。

#### 12.11 捆绑的赞助商联系人

打包的桌面构建（DMG / `.exe` / `.AppImage`）在首次启动时使用捆绑的 `bundled-sponsor-friend.json` 自动绑定到项目的赞助商联系人，因此您开箱即用就有一个可工作的联系人。这是一个便利功能，不是遥测：没有数据离开您的节点，并且绑定是一个正常的本地信任记录，您可以像任何其他联系人一样编辑或删除。准备车队映像的操作员可以在打包前在捆绑文件中设置 `{"enabled": false}` 来禁用自动绑定。


### 13. 连接 EnvoyGo

#### 13.1 EnvoyGo 如何与主节点配合使用

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 780 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:780px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="340" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">EnvoyGo (phone)</text><rect x="40" y="40" width="300" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="190.0" y="52.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Pairing tokens only</text><text x="190.0" y="68.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">no owner private keys</text><rect x="40" y="80" width="300" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="190.0" y="92.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">HomeRemote JSON-RPC</text><text x="190.0" y="108.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">read-only mirror</text><rect x="40" y="120" width="300" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="190.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Native WebRTC + CallKit</text><text x="190.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">voice calls (Phase 42I)</text><rect x="400" y="10" width="360" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="408" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Home Node (computer)</text><rect x="420" y="40" width="320" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="580.0" y="52.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Owner identity + keys</text><text x="580.0" y="68.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 root</text><rect x="420" y="80" width="320" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="580.0" y="92.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault + Library + Agent</text><text x="580.0" y="108.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">full mesh features</text><rect x="420" y="120" width="320" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="580.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Orchestration</text><text x="580.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Team jobs · approvals</text><path d="M360,55 L420,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">QR pair</text><path d="M420,75 L360,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">signed responses</text><text x="40" y="215" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Keys, vault, and agent runtime never leave the home node. The phone is a remote control.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">Figure 12 — EnvoyGo thin-client pairing: the phone holds only pairing tokens and calls the home node via JSON-RPC. Identity, vault, agent, and orchestration stay on the home node.</figcaption></figure>


EnvoyGo 连接到配对的主节点，并通过移动界面呈现选定的 NodeService 功能。主节点保留网格身份、智能体运行时、保险库和编排职责。

#### 13.2 配对移动应用

安装 EnvoyGo，点击"与家庭配对"，扫描桌面节点上社交界面显示的二维码（或输入您版本记录的配对有效负载）。如果在配对队列中提示，请在主节点上批准设备。应用程序将配对令牌存储在安全存储中，而不是所有者私钥。

#### 13.3 确认家庭连接

配对后，连接指示器应显示家庭可达并加载您的聊天列表。如果线程保持为空，请下拉刷新或打开"我"→"节点状态"。确保桌面节点在您预期的网络路径上保持运行且可达（LAN、中继隧道或配置的远程 URL）。

#### 13.4 使用聊天和联系人

聊天和人物标签以移动布局镜像主节点线程和绑定联系人。发送消息通过 HomeRemote JSON-RPC 路由到主节点，主节点在网格上签名并传递。媒体和音频消息遵循相同的路径。

#### 13.5 使用远程终端

从终端连接到现有会话或启动一个家庭策略允许的会话。输入通过隧道终端协议传输；输出流式传输回来并带有滚动回溯。在确认传输加密和家庭可达性之前，避免在不受信任的网络上执行敏感命令。

#### 13.6 查看团队任务

"我"→"智能体网络"显示从主节点同步的只读最近团队任务活动。您可以检查状态和报告，但无法仅从移动设备编排新任务 — 从桌面聊天与您的智能体一起启动任务。即使日志使用较旧的内部术语，UI 仍显示"团队任务"。

#### 13.7 浏览网格内容

EnvoyGo 浏览器（第 45C 阶段）通过配对的家庭服务打开 `envoy://` 内容。可用性取决于主节点是否可达以及请求的作者或内容是否被绑定策略允许。

#### 13.8 接收通知

当配置了 APNs 或 FCM 时，EnvoyGo 可以接收普通和与通话相关的通知。iOS 后台通话使用 VoIP 推送 + CallKit（第 42I 阶段），操作系统授予权限。送达仍是尽力而为，受平台后台限制影响。

#### 13.9 拨打和接听语音通话

可用的移动通话支持包括使用原生 WebRTC 和平台通话集成的一对一语音通话。iOS 提供 VoIP 推送 + CallKit（第 42I 阶段，2026-06-19 发布），因此后台手机可以接收通话；真实设备验证仍在进行中。视频通话尚未可用（参见 §18.10 和附录 J.4）。当两个对等节点都位于限制性 NAT 后面时，跨网络音频可能需要 TURN。

#### 13.10 撤销丢失的手机

从主节点撤销 EnvoyGo 设备或会话配对，并轮换任何暴露的令牌。如果您稍后找回手机并需要干净的重新配对，请在 EnvoyGo 中删除节点条目。将丢失的解锁手机视为丢失的家庭 API 会话。

#### 13.11 当前移动限制

EnvoyGo 不运行完整的网格节点、编排团队任务、编辑所有设置或取代主节点保险库创作。视频通话、完整浏览器功能和后台可靠性因操作系统权限而异。请参阅发布说明了解您构建的确切功能矩阵。


### 14. 首日教程

#### 14.1 发送私人消息

绑定一个联系人（第 12 章），打开他们的线程，输入一条简短消息并发送。确认送达指示器更新。如果失败，打开主页状态并在重试一次之前验证网格连接性。

#### 14.2 创建群组对话

从对话中，选择"新建群组"，选择绑定联系人，命名群组，并发送一条问候消息。每个成员都会收到由您的节点签名的群组信封。如果您的版本暴露了群组设置，以后可以从群组设置中调整成员身份。

#### 14.3 发送语音消息

在聊天中，点击麦克风控件，录制一段简短的音频片段并发送。音频在签名聊天信封内传输，并在收件人端内联播放。在桌面或 EnvoyGo 上操作系统提示时授予麦克风权限。

#### 14.4 发起语音通话

与直接信任的联系人一起，从线程头部发起语音通话。在他们的设备上接听来电；媒体在网格信令后点对点传输。如果在严格 NAT 后面连接失败，请根据您版本的文档配置 TURN。

#### 14.5 分享文件

使用聊天中的附件控件或根据敏感度规则从库/保险库分享。文件作为数据意图传输，对路径和信任等级进行策略检查。确认收件人看到附件且审计日志记录了允许结果。

#### 14.6 向 EnvoyAI 提问

打开您的智能体线程或主助手入口点，并提出一个可从您的保险库或公共知识中回答的事实性问题。EnvoyAI 在节点网关上本地运行，除非您以不同方式路由引擎。如果智能体请求批准敏感工具调用，请拒绝或改进。

#### 14.7 向您的库添加知识

打开库 → 新建笔记，编写 Markdown，设置敏感度，然后保存。索引自动运行以进行 RAG。如果您启用了插件并想要外部编辑，可以选择在 Obsidian 中打开保险库文件夹。

#### 14.8 搜索您的保险库

使用库搜索或要求 EnvoyAI 搜索具有明确范围的本地知识。CLI 用户可以运行 `npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "您的关键词"`. 结果尊重敏感度标签和您在节点上的角色。

#### 14.9 向绑定的智能体请求知识

向联系人的智能体发送消息，或在 UI 支持的地方发送知识查询，保持在他们的信任等级内。公共等级查询对陌生人进行速率限制；直接绑定允许更丰富的范围。预期签名的响应可归因于他们的智能体身份。

#### 14.10 批准敏感操作

当智能体或任务触发策略时，审批卡片会出现在审批中。在允许之前阅读摘要、关联 ID 和请求的操作。如果范围超过您为此会话的预期，请拒绝。

#### 14.11 启动简单的团队任务

在与您的智能体聊天时，描述一个可以委托给绑定对等节点的智能体的小型多步骤目标（例如先总结然后翻译）。确认双方的智能体网络成员资格已开启。在外部分享之前查看计划、预算上限和最终团队任务报告。

#### 14.12 连接外部智能体

在"设置"→"AI"→"外部智能体"中，选择 HomeClaw、Hermes 或自定义，并指向本地 HTTP 端点（HomeClaw 默认值为 `http://127.0.0.1:8010/message`）。启动外部进程，启用桥接，并向桥接智能体对等节点发送测试聊天消息。在启用自动化之前验证回调是否到达配置的监听端口。


---

## 第三部分 — 人员、个人资料和对话

### 15. 联系人和绑定

#### 15.1 查看和搜索联系人

在社交界面中打开**人物**或在 EnvoyGo 中打开"联系人"标签，浏览绑定的所有者和待处理的介绍。按显示名称或所有者 ID 片段搜索；结果尊重您的本地信任存储，因此被阻止的联系人除非您明确显示否则保持隐藏。EnvoyGo 通过 HomeRemote JSON-RPC 列出相同的联系人 — 它不在手机上维护单独的联系人数据库。

#### 15.2 了解联系人身份

每个联系人映射到由 Ed25519 密钥支持的**所有者身份**（`envoy:owner:…`），而不是中央账户句柄。运行时消息使用从密钥派生的对等 ID；在升级信任之前比较所有者 ID 和任何离线证明。二维码配对（第 13 章）在同一所有者下添加**设备**身份 — 它不会取代所有者到所有者的绑定。

#### 15.3 联系人个人资料和照片

个人资料卡片显示联系人在绑定策略内发布的显示名称、描述和照片。照片作为签名的个人资料或文件有效负载到达；推荐和公共等级可能比直接朋友看到更少的字段。点击照片查看全尺寸；不要将图库缩略图本身视为经过验证的身份证明。

#### 15.4 在线、离线和连接状态

在线状态反映网格可达性，而不是云端的"在线"标志。联系人可能显示离线，同时消息排队等待他们返回时的中继辅助送达。EnvoyGo 分别显示家庭连接性和远程对等节点可达性 — 即使联系人不在线，您的手机也可以连接到家庭。

#### 15.5 直接、推荐、公共和阻止信任

EnvoyMesh 为联系人使用四个用户可选等级 — **阻止(blocked)**（拒绝所有）、**公共(public)**（陌生人 — 仅 ping 和窄范围发现）、**推荐(referred)**（介绍 — 有限知识和审批）和 **直接(direct)**（朋友 — 更丰富的聊天、文件和智能体工作流，最高达朋友敏感度）。等级存储在您的节点本地；双方可以为彼此设置不同的等级。

#### 15.6 更改联系人的信任级别

在社交界面中打开联系人 → **信任**（或等效设置），然后选择 阻止(blocked)、公共(public)、推荐(referred) 或 直接(direct)。降级立即对新操作生效；已送达的内容保留在本地历史中直到您删除它。记录您更改等级的原因 — 如果您以后审查事件，审计行会有所帮助。

#### 15.7 推荐或介绍联系人

使用**介绍**或绑定请求流程为某人担保推荐等级，而无需自己授予直接信任。介绍携带签名的证明文本，以便收件人可以离线验证。推荐联系人在您故意升级之前无法招募您的智能体参与团队任务。

#### 15.8 静音、阻止或删除联系人

**静音**本地抑制通知而不更改绑定等级。**阻止**设置阻止信任并停止新的入站意图。**删除**清除本地线程元数据但不会从网络中删除他们的密钥 — 仅在您对重新联系感到满意后重新添加。

#### 15.9 恢复连接

在阻止或意外删除后重新连接，交换新的绑定请求或带有更新证明文本的介绍。如果您撤销了他们的等级，他们必须接受新请求；陈旧的线程可能不会自动恢复。在恢复直接信任或共享文件之前再次验证身份。

#### 15.10 联系人隐私和披露设置

个人资料和联系人设置控制您发布的内容以及您向他人请求的内容：显示字段、照片可见性以及共享知识上的敏感度标签。默认设置对公共等级查看者偏向保守；直接联系人看到更丰富的个人资料片段。更改在下一次签名个人资料更新时传播，不会追溯到旧的截图。


### 16. 私人消息传递

#### 16.1 开始对话

从**人物**中打开直接联系人，或在**聊天**下选择现有线程。新对话至少需要公共等级可达性和成功的绑定或介绍路径。群组房间使用单独的创建流程（第 17 章）；不要假设每个联系人都存在 DM 线程，直到您发送第一条消息。

#### 16.2 人与人之间的消息

私人聊天使用 `chat.message` 意图，带有**人类**发送者和**人类**收件人角色 — 智能体无法冒充此路径。消息是通过 libp2p 直接或中继辅助路径传递的签名信封。在社交界面或 EnvoyGo 中撰写；使用移动设备时，主节点代表您签名并发送。

#### 16.3 人与智能体之间的消息

与 **@envoy** 或您配置的智能体名称对话会通过智能体兼容的聊天流程路由，而不是 `chat.message` 人与人语义。智能体回复可能根据授权和绑定策略调用工具。将面向所有者的指令与对等节点 DM 分开，以免意外与联系人线程共享私人上下文。

#### 16.4 回复和对话连续性

回复通过线程元数据和审计日志中的关联 ID 引用先前的消息。在线程中引用或回复以保留上下文；重新发送相同文本会创建重复信封。搜索（16.7）在长 DM 跨会话拆分时帮助定位早期回合。

#### 16.5 消息送达状态

当您的版本暴露送达指示器时，它们反映本地发送确认和远程接受 — 除非明确支持，否则不是已读回执。发送失败显示策略或连接错误；读取审计以了解 `chat.message` 拒绝与传输超时。在消息仍待处理时避免快速重复发送。

#### 16.6 离线行为和重试

当联系人离线时，主节点在协议和策略允许的情况下对签名消息进行排队，并在重新连接时通过直接或中继路径重试。大量积压可能不会严格按照 UI 顺序到达，但仍通过签名进行完整性检查。EnvoyGo 离线到**家庭**会阻止任何发送，直到隧道恢复。

#### 16.7 搜索对话历史

在启用的地方使用应用内搜索或保险库相邻的对话索引，按关键词或联系人查找文本。结果来自主节点上本地存储的副本；移动搜索通过 JSON-RPC 查询家庭。敏感线程仅在配对到该节点的设备上可见。

#### 16.8 草稿协助

草稿协助（启用时）通过您配置的模型建议完成内容，带有语义防火墙限制 — 不会自动发送。发送前查看建议文本；联系人线程中的智能体协助草稿仍遵守绑定等级和敏感度。如果您更喜欢仅手动撰写，请在设置中禁用协助。

#### 16.9 管理对话数据

从主节点上的线程菜单或个人资料维护工具导出、归档或删除对话数据。删除仅针对您的存储，除非产品功能明确请求远程撤回 — 对于已送达的对等节点副本，这不能保证。批量清除前备份（第 89 章）。

#### 16.10 消息隐私和安全

消息从协商的 libp2p 继承传输加密；授权仍取决于签名和绑定策略，而不仅仅是 TLS。不要将机密粘贴到与推荐或公共联系人的聊天中。通过阻止等级报告滥用，并在升级时保留审计关联 ID。


### 17. 群组对话

#### 17.1 创建群组

在社交界面中，选择**新建群组**（或房间）并命名房间。初始成员必须是您在当前信任下可以联系到的联系人 — 通常是直接或推荐，具体取决于策略。创建节点在本地存储成员资格；新成员通过网格送达接收签名邀请。

#### 17.2 邀请成员

从您的绑定联系人列表添加成员；您不能邀请被阻止的所有者或没有介绍路径的陌生人。每个邀请都是一个签名的成员资格意图；待处理成员在接受之前显示。大型群组会增加扇出延迟 — 对于时间敏感的协调，更喜欢聚焦的房间。

#### 17.3 发送群消息

群消息使用带有人类发送者的房间范围聊天意图；送达会扇出到在线成员，并在支持的情况下为离线成员排队。@提及和回复在房间上下文中遵循与 DM 相同的线程规则。EnvoyGo 群聊在配对后镜像家庭线程。

#### 17.4 管理成员资格

具有管理员权限的所有者（取决于您的版本）可以添加或删除成员并重命名房间。删除某人会停止向他们的新送达，但不会删除他们节点上的历史记录。故意轮换管理员 — 被入侵的管理员设备可以邀请不受欢迎的成员。

#### 17.5 离开群组

选择**离开群组**停止接收新消息；您的历史副本保留在您的节点上直到您删除它们。其他成员继续房间。如果成员资格未自动恢复，重新加入需要新的邀请。

#### 17.6 群组信任边界

群组可见性不会绕过每个成员的信任：推荐成员仍然无法访问您在房间外发送的仅直接文件共享。敏感附件应使用明确的敏感度标签。不要将群组成员资格视为与每个参与者的相互直接友谊。

#### 17.7 群组送达和离线成员

离线成员在重新连接时接收排队的房间消息；排序可能在追赶期间批量处理。如果许多成员在仅中继路径后面，预计送达指示器会延迟。在假设房间出现问题之前检查家庭连接性。

#### 17.8 群组故障排除

如果消息停滞，验证每个成员的绑定等级、家庭可达性和中继预留。带有房间关联 ID 标记的审计行显示拒绝与超时。拆分故障排除：策略拒绝需要信任更改；传输故障需要连接性工作（第 91 章）。


### 18. 音频和语音通话

#### 18.1 录制和发送语音消息

在 DM 或群组线程中按住麦克风控件录制一段简短的音频片段；松开以附加并发送。音频通过与其他附件相同的签名文件/消息路径传输，入站防护强制执行大小限制。对于推荐联系人，除非他们期望语音笔记，否则优先使用文本。

#### 18.2 播放和管理音频附件

点击音频气泡播放；在支持的地方长按保存或本地删除。播放在设备上解码；很长的片段可能在发送时被拒绝。如果附件累积，请在对话设置下管理存储。

#### 18.3 发起语音通话

从社交界面或 EnvoyGo 上绑定的直接线程中的通话按钮发起**语音通话**。通话通过主节点信令协商对等节点之间的 WebRTC 音频；当前版本不支持视频。双方都需要麦克风权限和可达的网格或中继路径。

#### 18.4 接听或拒绝通话

来电以内置横幅形式出现，在 EnvoyGo 上配置时显示平台通话 UI。拒绝发送签名拒绝；接听建立 WebRTC 会话。如果策略正常工作，未知或被阻止的联系人不应到达通话 UI — 如果通话意外出现，验证信任等级。

#### 18.5 通话状态和控制

通话中控制包括静音、扬声器路由和挂断；状态显示连接中、活动或失败阶段。掉线的通话可以手动重试 — 没有隐藏的自动重拨。如果报告持续失败，请在审计中记录关联 ID。

#### 18.6 后台通话和移动通知

当配置推送时，EnvoyGo 可以通过 APNs/FCM 接收通话通知；后台行为取决于操作系统策略。保持应用程序配对到家庭并允许通知权限以确保可靠响铃。桌面社交界面可能使用本地通知而无需移动推送。

#### 18.7 STUN 和 TURN 连接

当两个对等节点都位于对称 NAT 后面时，WebRTC 首先尝试直接 UDP，然后是 STUN，然后是配置的 TURN。如果通话连接但没有音频，请在设置中配置 TURN。中继 libp2p 路径承载信令 — 不是 TURN 媒体中继的替代品。

#### 18.8 通话隐私

根据产品策略，语音通话至少需要直接或推荐信任；被阻止的联系人无法发起通话。通话元数据出现在审计中；当 WebRTC 成功时，媒体保持点对点。不要共享屏幕或视频 — 视频通话仍在计划中（18.10）。

#### 18.9 语音通话故障排除

如果通话无法连接，检查麦克风权限、TURN 设置、绑定等级和 `connectivity-status`。单向音频通常意味着 NAT 或防火墙阻止 UDP。首先测试 LAN 直接路径，然后测试中继辅助 WAN，然后再打开广泛的防火墙规则。

#### 18.10 视频通话 — 计划中，当前不可用

**计划中。** 一对一音频通话现已可用（§18.3）；视频通话在架构上已预期但未在当前版本中发布。有关路线图边界，请参阅附录 J.4。


### 19. 文件、照片和个人资料分享

#### 19.1 分享文件

使用 DM 或群组中信任等级允许的附件或**分享文件**操作。文件分块并传输，带有完整性检查；直接朋友通常具有最广泛的限制。清楚地命名文件 — 收件人在接受前会看到文件名。

#### 19.2 接受或拒绝传入的分享

传入分享在根据敏感度写入保险库或下载之前提示接受或拒绝。拒绝的传输不会部分写入；接受的文件进入策略范围的存储。在移动设备上，接受可能需要家庭在线才能完成。

#### 19.3 检查传输进度

进度条反映传输凭证路径上确认的字节数；停滞的进度通常意味着中途连接丢失。等待重试或取消并重新发送更小的文件。审计可能记录部分传输而不在日志正文中存储不完整的机密。

#### 19.4 验证文件完整性

当您的版本暴露显示的哈希或大小元数据时进行比较；签名证明发送者身份，而不是文件是良性的。在打开之前本地扫描不熟悉的二进制文件。如果完成后报告哈希不匹配，请重新发送。

#### 19.5 分享个人资料照片

通过个人资料 → 图库 → 发布或发送给联系人分享个人资料照片。发布的照片遵守可见性等级；直接分享像其他媒体一样附加到线程。EnvoyGo 显示通过家庭获取的照片 — 编辑图库主要是桌面社交流程。

#### 19.6 管理您的个人资料图库

在主节点上维护有序的图库槽位；在下次个人资料同步传播之前重新排序或删除图像。删除图库图像会停止未来的获取，但不会删除联系人已保存的副本。如果您使用公共发现，请为推荐查看者保留至少一个中性头像。

#### 19.7 选择可见性和敏感度

使用与保险库约定匹配的敏感度标记分享（`public(公开)` / `friends(朋友)` / `trusted(可信)` / `private(私有)`）。UI 为最常见的选择显示更友好的标签；策略引擎遵循所有四个等级。降级的联系人在接收时无法提升敏感度 — 绑定引擎拒绝不兼容的请求。对于包含个人数据的文档，默认为朋友或私有。

#### 19.8 删除共享内容

从线程附件或保险库路径删除本地副本；远程对等节点可能保留他们接受的副本，除非您的版本中有撤回功能。个人资料照片删除会在下次发布时更新您的签名个人资料。对于事件，请阻止联系人并撤销信任（第 87 章）。

#### 19.9 排除文件传输故障

对于卡住的传输，验证信任等级、文件大小限制、家庭保险库上的磁盘空间和中继可达性。在稳定网络上使用较小的测试文件重试以隔离策略与传输。在共享诊断之前收集审计关联 ID（第 91 章）。


### 20. 个人资料和在线状态

#### 20.1 编辑您的人类个人资料

在社交界面中编辑**个人资料 → 人类**以设置显示名称、简介和发布字段。更改序列化为签名的人类个人资料有效负载并存储在主节点上。EnvoyGo 以只读方式显示结果，除非您的版本添加了移动编辑功能。

#### 20.2 编辑您的智能体个人资料

智能体个人资料描述暴露给对等节点的功能（工具、团队任务角色、A2A 卡片字段）。在个人资料 → 智能体或智能体网络设置下编辑；所有者授权限制智能体可以宣传的内容。误导性的功能文本不会授予额外权限 — 绑定策略仍然限制操作。

#### 20.3 显示名称和描述

显示名称是装饰性的；授权使用所有者和对等 ID。保持描述简洁 — 公共等级查看者可能看到缩短的字段。避免在公共简介文本中嵌入机密或恢复代码。

#### 20.4 个人资料照片和图库

人类和智能体个人资料都可以携带具有等级感知可见性的照片图库。在桌面社交界面上上传；同步在个人资料获取时传播给联系人。大图像可能会缩小以遵守大小限制。

#### 20.5 身份详情和 DID

个人资料详情面板显示所有者 DID、相关的设备 ID 以及用于验证的指纹样式哈希。在确认身份时离线共享这些 — 不要仅信任聊天中未经请求的 ID。二维码配对编码设备配对有效负载，而不是所有者 DID 替换。

#### 20.6 绑定联系人可以看到什么

直接联系人看到您的策略发布的最丰富的个人资料片段；推荐联系人看到减少的字段；公共陌生人仅看到公共敏感度个人资料数据（如果暴露）。被阻止的联系人看不到您的任何新内容。在启用发现功能之前查看**个人资料可见性**设置。

#### 20.7 个人资料同步

个人资料更新在签名发布事件时推送；联系人在下次获取或打开线程时刷新。没有全局云个人资料 CDN — 对等节点在与您的节点通信时了解更改。密钥轮换后，重新发布个人资料以便指纹匹配。

#### 20.8 隐私默认值

初始隐私默认值倾向于最小的公共曝光：保守的照片可见性、家庭上的朋友级别聊天历史，以及智能体工具在授权之前禁用。在加入发现主题之前，安装后查看默认值。重置路径在"设置"→"隐私"中（如果可用）。


---

## 第四部分 — 您的个人 AI

### 21. 认识 EnvoyAI

#### 21.1 EnvoyAI 是什么

EnvoyAI 是您主节点上面向所有者的助手，由捆绑的 OpenClaw 运行时提供支持。您可以从社交界面、EnvoyGo 或聊天中的 `@envoy` 与它对话；它通过 EnvoyMesh 策略计划回复并调用网格工具，而不是获得原始 libp2p 访问。可以将其视为留在安全边界内的大脑，而节点处理身份、绑定和审计。

#### 21.2 作为捆绑智能体运行时的 OpenClaw

OpenClaw 作为节点启动和监督的子进程运行。其网关默认在端口 `18789` 上监听（`http://127.0.0.1:18789/webhook/envoymesh`）。EnvoyMesh 将每个助手回合的会话上下文 — 绑定、兴趣和工具目录 — 传递给 OpenClaw，OpenClaw 拥有会话间的多回合推理和持久记忆。

#### 21.3 EnvoyAI 与外部智能体桥的区别

EnvoyAI 在进程内运行，拥有完整的 ToolRegistry 访问权限。外部智能体桥（默认端口 `3031`）是通往 HomeClaw、Hermes、OpenHuman 或另一个进程中的自定义智能体的可选 HTTP 管道。您可以同时运行两个引擎（`both` 模式）或单独运行任何一个；桥智能体永远不会收到您的 libp2p 密钥。

#### 21.4 EnvoyAI 可以访问什么

EnvoyAI 在敏感度标签内读取您的本地保险库和库，通过 `knowledge.query` 查询绑定的对等节点，并在知识库设置允许时使用聊天 RAG。它无法绕过绑定等级：陌生人保持速率限制，私有材料需要直接信任或所有者批准。在启用自动回复之前，在"设置"→"AI"→"知识库"和每个联系人偏好下配置上限。

#### 21.5 EnvoyAI 可用的网格工具

启动时，节点向 OpenClaw 导出工具目录 — 聊天发送、库读取/发现、任务提议、发现、审批、触发器、MCP 代理等。每个工具声明敏感度上限以及执行前是否需要所有者批准。EnvoyAI 按名称选择工具；EnvoyMesh 强制执行策略并为每个调用写入审计行。

#### 21.6 策略和审批控制

绑定引擎决策、授权限制和审批队列位于 EnvoyAI 和网格之间。出站聊天、文件共享、云模型调用和高敏感度保险库读取除非自主策略明确允许，否则会排队等待您的审查。在设置中切换 `autonomousKillSwitch` 以暂停所有自主操作并强制批准智能体原本会静默执行的所有操作。

#### 21.7 启动、停止和检查智能体

打开"设置"→"AI"→"AI 引擎"查看 OpenClaw 状态：启用标志、运行状态、PID 以及网关失败时的最后错误。使用**重启 OpenClaw**进行干净的子进程回收，而无需重启整个节点。关闭 `openclawEnabled` 会立即停止网关并阻止在下一次节点启动时生成 — 在调试 `18789` 上的端口冲突时很有用。

#### 21.8 当前限制

聊天草稿和轻量级自动回复仍通过 EnvoyMesh 的原生模型路由器路由以提高速度；复杂的助手回合转到 OpenClaw，当网关关闭时回退到原生。将完整聊天历史注入 OpenClaw 上下文以及一回合内的多轮工具循环仍然部分完成 — 会话内存有效，但最近的线程文本可能不总是附加的。终端智能体模式直接使用原生模型，而不是 OpenClaw 执行。


### 22. AI 引擎模式

#### 22.1 仅内置

**仅内置**（`openclaw-only`）是新安装的默认设置：`openclawEnabled` 开启，`bridgeEnabled` 关闭。EnvoyAI 处理助手聊天、工具执行和会话内存；没有外部 HTTP 智能体在 `3031` 上监听。当您想要一个捆绑运行时且没有第二个智能体进程时选择此选项。

#### 22.2 内置加外部智能体

**内置加外部**（`both`）同时运行 EnvoyAI 和桥接。绑定联系人的网格流量可以到达桥接智能体，同时您仍使用 OpenClaw 进行 `@envoy` 和"设置"→"AI"工作流。启用 `bridgeEnabled`，在 `bridge-config.json` 中选择一个活动的外部智能体，并在依赖任一路径之前确认头部中的两个状态芯片。

#### 22.3 仅外部智能体

**仅外部智能体**（`ext-only`）禁用 OpenClaw 网关（`openclawEnabled: false`）但保持桥接活动。所有桥接聊天和网格工具调用通过您的外部智能体的 HTTP 端点；EnvoyAI 助手回合不可用。当 HomeClaw 或 Hermes 是您的主要智能体且您只需要 EnvoyMesh 提供连接性和策略时使用此选项。

#### 22.4 无 AI

**无 AI**（`off`）关闭两个引擎。节点仍路由人类聊天和策略，但不运行任何模型草稿、自动回复或智能体工具。对于气隙节点、CI 测试设备或仅需要网格连接而不需要任何大语言模型表面的情况，请选择此选项。

#### 22.5 选择正确的模式

从**仅内置**开始，这是最简单的路径。当您已经运行 HomeClaw/Hermes 并希望使用其插件或记忆模型时，添加**外部**模式。仅在您有意需要两个智能体时使用**两者**模式；否则选择一个主要智能体以避免重复回复。单独测试连接性时，暂时切换到**关闭**模式而不是卸载。

#### 22.6 更改活动的外部智能体

外部智能体在 `bridge-config.json` 的 `extAgents` 下定义；设置 `activeExtAgentId` 为您想要的条目。每个定义包括显示名称、基础 URL、Bearer token 和能力标志。编辑后，重启节点或重新加载桥接配置，使新的目标绑定到端口 `3031`（或您配置的 `bridgeListenPort`）。

#### 22.7 启动设置与运行时设置

`openclawEnabled` 和 `bridgeEnabled` 持久化在 `node-config.json` 中，并在节点启动时生效——或在关闭时立即停止运行中的网关。运行时状态（`getOpenClawStatus`、`getBridgeStatus`）显示子进程是否实际健康，这在启动期间可能滞后于配置。模型提供商模式、AI 规则和联系人偏好也持久化到 `node-config.json`，并在下一个智能体回合应用，无需重启。

#### 22.8 诊断智能体可用性

如果 EnvoyAI 显示**已停止**，读取 OpenClaw 状态面板上的 `lastError`——常见原因是端口 `18789` 被占用、缺少 OpenClaw 二进制文件或看门狗反复重启失败。对于桥接，验证回环可达性、Bearer token 是否匹配以及是否恰好选择了一个活动智能体。CLI 帮助包括连接状态；Social 的头部徽章反映与"设置"→"人工智能"→"AI 引擎"相同的有效模式。


### 23. 模型和提供商

#### 23.1 模型路由概述

EnvoyMesh 使用两层：**原生路由器**（`@envoymesh/models`）服务聊天草稿、自动回复、终端辅助和团队任务规划；**OpenClaw** 使用自己的 LLM 配置服务助手/`@envoy` 回合。原生路由遵守语义防火墙（空提示被拒绝，48K 字符上限，控制字符过滤器）。当 OpenClaw 不可用时，助手请求自动回退到您配置的原生提供商。

#### 23.2 配置本地模型

在"设置"→"人工智能"→"模型"（或 `node-config.json`）中将提供商模式设置为 **ollama**。将 `endpoint` 指向 `http://127.0.0.1:11434/v1`，并将 `modelName` 设置为您拉取的标签（例如 `llama3.1`）。本地调用跳过云端批准门控，将提示保持在您的机器上——非常适合草稿和敏感保险库上下文。

#### 23.3 配置远程提供商

使用 **openai-compatible** 或 **anthropic-compatible** 模式，配合供应商基础 URL 和 `apiKey`。将 `modelName` 设置为远程模型 ID。保持 `requireApprovalForCloud: true`（默认值），以便非公开上下文在请求离开节点之前触发批准项。

#### 23.4 配置 LiteLLM

**litellm** 模式指向 LiteLLM 代理（通常是 `http://127.0.0.1:4000/v1`），它扇出到多个后端。将 `modelName` 设置为 LiteLLM 路由名称，并在需要时提供代理 API 密钥。当一个主节点需要在不编辑 EnvoyMesh 配置的情况下切换模型时，这是灵活的选择。

#### 23.5 选择默认模型

为聊天草稿和自动回复选择一个原生模型；OpenClaw 在 OpenClaw 设置中单独管理自己的模型。对于草稿，首选快速、廉价的模型；如果您拆分配置，对于助手，首选更强的模型（本地或代理）。在配置文件的 README 中记录您的选择，以便在新机器上恢复时保持一致。

#### 23.6 配置回退行为

当原生模式为**禁用**时，草稿和辅助功能返回错误而不是调用模型。当 OpenClaw 关闭时，助手回合自动降级到原生提供商。对于 LiteLLM 或云端端点，在 LiteLLM 内部验证回退路由——EnvoyMesh 不会在一个请求中链接多个原生提供商。

#### 23.7 上下文窗口考虑

大型保险库 RAG 注入和长团队任务提示会快速消耗上下文。语义防火墙将原生调用的提示大小限制在 48K 字符。当您看到截断的答案时，减少知识库 `maxChunks` 或降低每联系人联合上限。OpenClaw 会话记忆是独立的——非常长的助手线程可能需要手动会话重置。

#### 23.8 提供商隐私

**mock** 模式从不调用外部网络——对测试很有用。**ollama** 和本地 LiteLLM 将数据保留在局域网内。云端模式将提示文本发送到配置的供应商；配合敏感度标签和 `requireApprovalForCloud` 使用，以便私人笔记在没有明确同意的情况下不会离开。OpenClaw 自己的模型调用遵循 OpenClaw 配置，而不是原生路由器。

#### 23.9 成本控制

团队任务和竞争性奖励模式在授权中跟踪支出；在链式默认值下设置 `maxCost` 和重新平衡策略。对于聊天，对高容量自动回复使用本地模型，为偶尔的助手回合保留云端模型。启用自动发送规则后，审查活动中的相关云端调用。

#### 23.10 排查模型调用问题

空或被拒绝的提示通常意味着语义防火墙验证失败——检查控制字符或过长的长度。Ollama/LiteLLM 上的连接错误指向错误的 `endpoint` 或已停止的服务。持续的云端拒绝通常意味着批准待处理：在重试之前打开批准队列。暂时将模式设置为 **mock** 以确认智能体循环在没有外部依赖的情况下运行。


### 24. 智能体风格、模式和联系人行为

#### 24.1 智能体通信风格

在"设置"→"人工智能"→"身份"下，选择**透明**（默认）、**隐形**或**防御性**呈现方式。透明模式作为 AI 公开回复；隐形模式好像是您自己输入的（仍在网络上用智能体角色签名）；防御性模式在您离线时充当守门人。可选的 `debugPrefixInMessageText` 仅在日志中添加前缀——Social 在 UI 中隐藏它。

#### 24.2 智能体操作模式

全局默认值存储在 `aiSettings.defaultModeForNewContacts` 中：**手动**（仅草稿）、**助手**（建议 + 确认）或**自动**（策略允许时发送）。在线/离线行为单独控制：`onlineAssistantEnabled` 在您活跃时保持建议；`offlineAgentEnabled` 允许节点认为您离开时自动回复。如果自动状态检测误读了您的日程安排，请将 `statusMode` 设置为手动。

#### 24.3 每联系人模式

每个联系人可以用 `aiAccessLevel` 覆盖全局默认值：**none(无)**、**assistant_only(仅助手)** 或 **full(完全)**。None 阻止该对等节点的 AI 参与；assistant_only 允许草稿和门控发送；full 启用更丰富的自动化，包括规则触发。从联系人详情表或通过智能体辅助设置期间的 `mesh.set-contact-mode` 设置这些。

#### 24.4 每联系人披露规则

`knowledgeAccess` 限制智能体可以为联系人引用的保险库材料（`public(公开)`、`friends(朋友)`、`trusted(可信)` 或 `private(私有)`）。可选的 `syndicationMaxSensitivity` 收紧您联合给该对等节点的入站答案。`disclosure` 设置（徽章、将对等智能体折叠到联系人）仅在本地 UI 中生效——它们不会更改网络有效负载。在启用自动发送之前，使披露与信任等级保持一致。

#### 24.5 社交代理行为

**社交代理**（需要信任模式）允许 EnvoyAI 在签名授权下调解介绍和标准社交工作流。仅在 `trustModeEnabled` 开启且您已配置授权 ID 后才启用 `socialProxyEnabled`。编排器尊重 `autonomousKillSwitch`——当终止开关开启时，即使功能标志已设置，代理传递也会停止。

#### 24.6 主动签到

主动行为结合了 AI 规则、触发器和朋友自动驾驶（`friendAutopilotEnabled`）。规则匹配问候语、关键词或联系人访问级别，并选择草稿、自动发送、守门或延迟操作。速率限制（`autoReplyLimits`）限制每联系人每小时和每天的自动回复，以便单个线程在您离开时不会发送垃圾邮件。

#### 24.7 暂停或限制自动化

切换**autonomousKillSwitch**以立即全局暂停——每个自主操作都变为批准项。从"设置"或 `mesh.update-trigger` 暂停单个触发器。将联系人降级到**assistant_only**或**none**以停止一个关系的自动发送，而不完全禁用 EnvoyAI。

#### 24.8 重置智能体行为

清除 AI 规则，将联系人偏好重置为默认值，并在"设置"→"人工智能"中关闭社交代理和自动驾驶标志。如果会话语气在长线程中漂移，请重启 OpenClaw。对于硬重置，禁用 EnvoyAI，清除您不再需要的待处理批准，重新启用，并以**手动**模式与单个绑定联系人重新测试。


### 25. 会话和记忆

#### 25.1 什么是会话

EnvoyAI 会话通过稳定的 `sessionId` 将您正在进行的助手对话绑定到 OpenClaw 的记忆存储。Social 的 EnvoyAI 聊天中的所有者回合、`@envoy` 提及和终端相关计划共享此绑定，以便后续问题保持连贯。会话是主节点本地的——除了通过实时 RPC 外，不会复制到 EnvoyGo。

#### 25.2 对话上下文

每个 OpenClaw 请求携带所有者兴趣、带有信任等级的绑定联系人名称以及导出的工具目录。原生聊天草稿通过模型路由器使用更精简的上下文窗口。审计日志中的关联 ID 将单个回合跨工具调用缝合在一起——在复杂交换后审查活动时使用它们。

#### 25.3 短期和长期记忆

OpenClaw 在活动会话内保留短期线程状态，并通过自己的记忆子系统（包括配置的可选 MCP 桥如 Memex）实现更长时间的回忆。EnvoyMesh 默认不在保险库中复制该长期存储。将 OpenClaw 的工作区和记忆插件视为"助手记得什么"的权威来源。

#### 25.4 搜索记忆

使用面向 OpenClaw 的工具或配置的 MCP 搜索（在知识库设置中默认 `memex_search`）查询外部记忆索引。在 EnvoyMesh 内部，`mesh.chat_rag_search` 为智能体回合检索索引的聊天和库片段。结果继承敏感度标签——不要向公共联系人暴露私有 RAG 块。

#### 25.5 会话摘要

调用 `mesh.session-summary` 或通过 `mesh.list-sessions` 列出会话，以在不打开网关 UI 的情况下检查 OpenClaw 线程元数据。摘要在将任务交给团队任务或归档审计笔记之前很有帮助。它们是面向操作员的视图，不是发送给联系人的网络消息。

#### 25.6 纠正过时的记忆

当 OpenClaw 陈述过时事实时，在助手线程中纠正它，如果使用 Memex 或类似工具，更新或归档源卡片。调整提供给 RAG 的库笔记，以便下一次 `mesh.chat_rag_search` 返回当前文本。如果错误涉及披露范围，每联系人偏好也可能需要更新。

#### 25.7 删除记忆

通过在知识库设置中配置的 MCP 工具的归档/删除路径撤销外部记忆条目。通过启动新的会话 ID（重启网关以完全清除）清除 OpenClaw 会话状态。删除本地聊天日志不会擦除 OpenClaw 记忆，直到您也在那边删除。

#### 25.8 保留和隐私

会话和记忆数据存储在您的配置文件目录和 OpenClaw 工作区路径下，文件模式为 `0600`。在操作系统迁移之前备份配置文件。云端记忆插件遵循其供应商的保留策略——对于气隙部署，禁用它们。

#### 25.9 跨设备记忆

EnvoyGo 显示来自主节点的实时助手回复，但不在本地托管 OpenClaw 记忆。所有持久回忆都保留在网关运行的主机器上。配对新手机不会复制会话历史，除非您恢复主配置文件。

#### 25.10 当前聊天历史集成边界

并非每个 OpenClaw 回合都完整注入最近的完整聊天记录——绑定和兴趣可靠附加；逐字线程回滚可能不完整。原生自动回复仅使用当前消息文本。在聊天日志集成发布之前，通过在提示中引用库笔记或显式摘要来规划重要的连续性。


### 26. 工具

#### 26.1 什么是智能体工具

工具是智能体可以调用的命名、模式描述的操作——发送聊天、查询知识、列出批准等。EnvoyMesh 在 `ToolRegistry` 中注册工具，评估绑定策略和敏感度，然后执行或排队等待批准。每次调用都会产生带有工具名称、延迟和关联 ID 的审计事件。

#### 26.2 浏览可用的网格工具

在 Social 中，打开"设置"→"人工智能"→"工具"（或询问 EnvoyAI 列出工具）。当启用 MCP 代理时，CLI 和桥接客户端可以调用 `mesh.mcp.list_tools`。导出到 OpenClaw 的启动目录镜像相同的名称——`mesh.*` 前缀用于网格操作，加上标准聊天/知识条目。

#### 26.3 知识和库工具

使用 `mesh.library_list`、`mesh.library_read`、`mesh.library_discover` 和 `mesh.chat_rag_search` 读取本地笔记并查询索引内容。`mesh.knowledge.query`（和任务变体）到达绑定对等节点的公共或允许索引。每个工具上的敏感度上限防止向陌生人泄露私有保险库路径。

#### 26.4 联系人和消息工具

`chat.send` 和网格发现/问候工具允许智能体查找联系人并起草消息。发送到非平凡敏感度的消息通常进入批准队列而不是立即传递。信任介绍工具（`mesh.intro.*`）仅在节点上启用信任模式时出现。

#### 26.5 文件共享工具

共享通过 `mesh.share_propose`、`mesh.library_request_share`、`mesh.transfer_status` 和图库助手进行。超过策略上限的原始文件传输需要所有者批准和对等节点明确接受。在假设传输完成之前检查 `mesh.share_list_pending`。

#### 26.6 任务和智能体网络工具

`mesh.task.propose`、`mesh.task.await_result` 和 `mesh.capability_provider.start` 参与对等任务和团队任务。智能体卡片工具（`mesh.agent_card.request`、`mesh.list_agent_network_workers`）支持工作者发现。竞争性奖励流程可能在支出或竞价规则触发时将 `chain_award` 批准入队。

#### 26.7 批准和升级工具

`mesh.list-pending`、`mesh.approve`、`mesh.reject`、`mesh.reject-all` 和 `mesh.escalate` 允许智能体向您展示工作或在不确定时暂停。当置信度低或情绪为负面时，优先升级而不是静默失败。除非策略明确允许自动解决，否则智能体不应批准自己的排队项。

#### 26.8 MCP 工具

`mesh.mcp.list_tools` 和 `mesh.mcp.call_tool` 代理到配置的 MCP HTTP 服务器（例如 Memex）。每次调用继承与原生工具相同的批准和审计路径。仅注册您信任的 MCP 服务器——它们使用节点的本地网络访问执行。

#### 26.9 启用或禁用访问

通过关闭 `trustModeEnabled` 禁用信任介绍工具。在知识库设置中暂停 MCP 服务器。使用 `autonomousKillSwitch` 阻止自主工具链的执行而不删除目录。桥接智能体通过 HTTP 桥接接收过滤后的网格工具列表——而不是完整的注册表。

#### 26.10 审查工具执行

打开活动并按工具或关联 ID 过滤。每行显示允许/拒绝、远程对等节点和摘要文本。对于桥接流量，还检查 `mesh.list-external-agent-actions`。如果工具返回"排队"而不是 `ok: true`，交叉检查待处理批准。


### 27. 触发器、计划和摘要

#### 27.1 创建触发器

触发器存储在节点触发器存储中，并触发主动操作。从"设置"→"人工智能"→"自动化"或通过 `mesh.add-trigger` 创建基于时间的（cron、间隔或一次性）、基于事件的（收到消息、联系人在线/离线）或基于主题的（关键词匹配）触发器。每个触发器声明一个操作类型——发送聊天、查询知识、发送摘要、通知所有者或跟进——以及每日触发上限。

#### 27.2 更新或删除触发器

使用 `mesh.update-trigger` 编辑条件或暂停触发器；使用 `mesh.remove-trigger` 删除。暂停的触发器保留历史但不触发。更改 cron 表达式后，在自动化面板中确认下一个计划时间，以免时区错误让您感到意外。

#### 27.3 安排提醒和操作

使用基于时间的触发器创建每日摘要、每周检查或一次性提醒。设置操作类型为"通知所有者"或"发送聊天"，并配置收件人——可以是您自己、联系人或群组。对于时间敏感的操作，验证节点时间与您的时区对齐。

#### 27.4 创建摘要

摘要触发器定期收集新消息、知识更新和任务进度，并将它们打包到单个聊天中。设置操作类型为"发送摘要"，并选择要包含的内容源。摘要包含关联 ID，以便您可以追溯到原始事件。

#### 27.5 触发器速率限制

每个触发器都有每日触发上限，防止单个规则在一天内发送过多消息。全局速率限制（`autoReplyLimits`）进一步限制每联系人的自动活动。当触发器达到其上限时，它会记录审计事件并在第二天之前停止触发。

#### 27.6 测试触发器

通过在自动化面板中使用"立即运行"按钮或调用 `mesh.trigger-fire` 来测试触发器。检查活动日志以确认操作按预期执行。在启用自动发送之前，始终用测试联系人验证触发器。

#### 27.7 触发器日志和审计

触发器操作记录在活动日志中，带有"trigger"类型和关联 ID。使用这些 ID 跟踪触发器何时触发、执行了什么操作以及结果如何。对于失败的触发器，检查 `lastError` 字段以了解原因。

#### 27.8 当前限制

复杂的条件组合（AND/OR）和跨触发器依赖关系尚未完全支持。每个触发器执行单个操作；链式操作需要多个触发器或通过团队任务编排。


---

## 第五部分 — 知识、库和网络

### 28. 您的保险库和库

#### 28.1 什么是保险库

保险库是本地文件存储，遵循路径安全规则和敏感度标签。它存储笔记、文档、照片和其他资产，通过库界面访问。每个项目都有一个敏感度标签（`public`、`friends`、`trusted`、`private`），控制哪些绑定联系人可以访问它。

#### 28.2 什么是库

库是笔记、导入和发布项目的界面和元数据层。它提供搜索、浏览和管理保险库内容的功能。保存的笔记会自动索引到 RAG，供智能体在聊天期间检索。

#### 28.3 创建笔记

在库中创建新笔记，编写 Markdown，设置敏感度，然后保存。笔记存储在保险库中，并自动索引到 RAG。您可以在笔记中使用标签和链接来组织内容。

#### 28.4 导入文档

从您的计算机导入文档到库中。支持的格式包括 Markdown、文本、PDF 和图像。导入的文档会自动分配敏感度标签，并索引到 RAG。大文件可能会被分块处理。

#### 28.5 设置敏感度

为每个库项目设置敏感度标签：
- **public**（公开）—— 任何人都可以访问
- **friends**（朋友）—— 直接绑定的联系人可以访问
- **trusted**（可信）—— 推荐的联系人可以访问
- **private**（私有）—— 只有您自己可以访问

绑定引擎强制执行这些等级——联系人无法访问超过其信任等级允许的内容。

#### 28.6 搜索库

使用库搜索功能按关键词查找笔记和文档。搜索结果尊重敏感度标签——您只会看到您有权访问的内容。智能体也可以通过 `mesh.chat_rag_search` 查询库。

#### 28.7 组织和标记

使用标签和文件夹组织您的库内容。标签有助于快速过滤和搜索相关笔记。您可以为笔记添加多个标签，并在搜索时组合它们。

#### 28.8 编辑和删除笔记

编辑现有笔记或删除不再需要的笔记。删除笔记会从保险库中移除它，并从 RAG 索引中删除。已发送给联系人的笔记副本仍然存在于他们的节点上。

#### 28.9 保险库路径安全

保险库对文件路径实施安全规则，防止路径遍历攻击。所有路径都经过验证，不允许 `..` 或其他危险模式。文件权限设置为 `0600`，确保只有所有者可以读取和写入。

#### 28.10 备份保险库

定期备份您的保险库数据。保险库内容存储在配置文件目录下的 `shared_vault/` 中（或您配置的自定义路径）。将此目录与应用程序二进制文件分开备份。


### 29. RAG 和知识检索

#### 29.1 什么是 RAG

RAG（检索增强生成）是一种技术，它从保险库中检索相关片段并将它们注入到智能体的提示中，帮助智能体回答基于您个人知识的问题。

#### 29.2 索引工作原理

当您保存笔记或导入文档时，库会自动将内容索引到 RAG。索引过程将文本分块，计算嵌入向量，并存储它们以供快速检索。

#### 29.3 配置 RAG

在"设置"→"人工智能"→"知识库"下配置 RAG 行为：
- `maxChunks` — 每次检索返回的最大块数
- `chunkSize` — 每个块的大小
- `similarityThreshold` — 相似度阈值

调整这些设置以平衡检索质量和提示大小。

#### 29.4 查询您的知识

向 EnvoyAI 提问，它会自动使用 RAG 从您的保险库中检索相关信息。您也可以使用库搜索直接查找内容。

#### 29.5 联合知识查询

绑定联系人可以通过 `knowledge.query` 查询您的公共或朋友等级知识。您可以为每个联系人配置联合上限，控制他们可以访问的敏感度级别。

#### 29.6 RAG 隐私

RAG 查询遵循敏感度标签——私有笔记不会被公共或推荐联系人检索到。智能体只能访问策略允许的内容。


### 30. 网络内容和浏览器

#### 30.1 发布网络内容

在主节点的网络内容目录下发布 Markdown、图片和 PDF。这些内容通过 `envoy://` URL 访问。设置可见性级别以控制谁可以访问您发布的内容。

#### 30.2 使用浏览器

浏览器通过节点的策略边界加载允许的 `envoy://` 网格内容。您看到的是绑定规则和敏感度标签允许的内容——默认情况下不是开放网络。

#### 30.3 可见性控制

为发布的内容设置可见性：
- **公共**—— 任何对等节点都可以访问
- **绑定联系人**—— 只有绑定联系人可以访问
- **直接联系人**—— 只有直接信任的联系人可以访问

#### 30.4 浏览公共内容

发现和浏览其他所有者发布的公共内容。使用搜索或浏览功能查找感兴趣的主题。

#### 30.5 当前限制

完整的浏览器功能和提要推送通知正在开发中（第 45E 阶段）。当前版本支持基本的内容浏览和访问控制。


---

## 第六部分 — 外部智能体

### 31. 连接外部智能体

#### 31.1 外部智能体概述

外部智能体是在 EnvoyMesh 进程之外运行的 AI 运行时，通过 HTTP 桥连接。支持的外部智能体包括 HomeClaw、Hermes、OpenHuman 和自定义 HTTP 智能体。

#### 31.2 连接 HomeClaw

在"设置"→"人工智能"→"外部智能体"中选择 HomeClaw，指向本地 HTTP 端点（默认 `http://127.0.0.1:8010/message`）。启动 HomeClaw 进程，启用桥接，并发送测试消息。

#### 31.3 连接 Hermes

选择 Hermes，使用默认端点 `http://127.0.0.1:8020/message` 或自定义 URL。Hermes 提供 Obsidian 风格的知识工具和网格消息传递集成。

#### 31.4 连接 OpenHuman

OpenHuman 默认禁用。启用时，它遵循相同的一次一桥规则，并且从不接收签名密钥。仅在您的组织验证其本地部署模型后使用。

#### 31.5 连接自定义智能体

选择"自定义"并提供外部智能体的 HTTP 端点和 Bearer token（如果需要）。自定义智能体必须遵循 EnvoyMesh 的消息契约格式。

#### 31.6 桥接安全

外部智能体永远不会接收您的 libp2p 密钥。EnvoyMesh 代表智能体对网格流量进行签名，并强制执行绑定策略。仅连接您信任的本地端点。

#### 31.7 一次一桥规则

一个节点一次只能运行一个外部桥。如果需要切换智能体，请先禁用当前桥，然后启用新的桥。


### 32. 外部智能体配置

#### 32.1 bridge-config.json

外部智能体配置存储在 `bridge-config.json` 中，包括：
- `extAgents` — 外部智能体列表
- `activeExtAgentId` — 当前活动的外部智能体 ID
- `bridgeListenPort` — 桥接监听端口（默认 `3031`）

#### 32.2 配置参数

每个外部智能体定义包括：
- `id` — 智能体唯一标识符
- `displayName` — 显示名称
- `baseUrl` — HTTP 端点 URL
- `bearerToken` — 认证令牌（可选）
- `capabilities` — 能力标志

#### 32.3 切换活动智能体

更改 `activeExtAgentId` 并重启节点或重新加载桥接配置，使新的智能体生效。

#### 32.4 安全注意事项

确保外部智能体端点是本地主机地址或受信任的内部网络地址。不要向不受信任的外部服务暴露桥接端口。


---

## 附录 A — 术语表

### A.1 核心概念

- **EnvoyMesh** — 去中心化的对等网格网络，用于连接人类和 AI 智能体
- **主节点** — 运行 EnvoyMesh 的核心进程，管理身份、策略、存储和网络
- **对等节点** — 网络中的其他 EnvoyMesh 节点
- **绑定** — 两个所有者之间的信任关系，定义信任等级
- **智能体** — AI 助手，可以是内置的（EnvoyAI/OpenClaw）或外部的（HomeClaw、Hermes 等）
- **保险库** — 本地文件存储，遵循路径安全规则和敏感度标签
- **库** — 笔记、文档和发布内容的界面

### A.2 身份类型

- **所有者** — 长寿的人类身份，由 Ed25519 密钥对支持
- **设备** — 特定设备（笔记本电脑、手机）的身份，由所有者签名的证书授权
- **智能体** — AI 智能体的身份，由所有者签名的授权绑定到所有者
- **对等 ID** — 运行时身份，用于消息签名，可能随密钥轮换而变化

### A.3 信任等级

- **阻止(blocked)** — 拒绝所有请求
- **公共(public)** — 陌生人，仅允许 ping 和窄范围发现
- **推荐(referred)** — 介绍，有限的知识访问和审批
- **直接(direct)** — 朋友，更丰富的聊天、文件和智能体工作流

### A.4 智能体模式

- **仅内置** — 仅运行 EnvoyAI（OpenClaw）
- **内置加外部** — 同时运行 EnvoyAI 和外部智能体桥
- **仅外部智能体** — 仅运行外部智能体，禁用 EnvoyAI
- **无 AI** — 关闭所有 AI 引擎

### A.5 敏感度标签

- **public** — 公开，任何人都可以访问
- **friends** — 朋友，直接绑定联系人可以访问
- **trusted** — 可信，推荐联系人可以访问
- **private** — 私有，只有所有者可以访问

### A.6 技术术语

- **libp2p** — 对等网络协议栈，支持 TCP、QUIC、mDNS、DHT 等
- **Ed25519** — 椭圆曲线数字签名算法，用于身份验证和消息签名
- **DID** — 去中心化标识符，格式为 `envoy:owner:<hash>`、`envoy:device:<hash>` 或 `envoy:agent:<hash>`
- **JSON-RPC** — 远程过程调用协议，用于客户端与主节点的通信
- **RAG** — 检索增强生成，从保险库中检索相关信息以增强智能体回答
- **MCP** — 模型上下文协议，用于 AI 应用程序的工具发现和调用
- **A2A** — 智能体到智能体协议，定义跨产品委派的智能体卡和任务接口
- **NAT** — 网络地址转换，可能阻止直接对等连接
- **TURN** — 中继遍历 NAT，用于 WebRTC 通话
- **WebSocket** — 双向通信协议，用于实时消息传递


---

## 附录 B — 功能和平台矩阵

### B.1 功能可用性

| 功能 | 桌面 | EnvoyGo |
|------|------|---------|
| 网格身份 | ✅ | ✅（镜像） |
| 绑定联系人 | ✅ | ✅ |
| 一对一聊天 | ✅ | ✅ |
| 群组聊天 | ✅ | ✅ |
| 语音消息 | ✅ | ✅ |
| 语音通话 | ✅ | ✅ |
| 视频通话 | ❌（计划中） | ❌（计划中） |
| 文件共享 | ✅ | ✅（受限） |
| EnvoyAI 助手 | ✅ | ✅（镜像） |
| 外部智能体 | ✅ | ❌ |
| 团队任务 | ✅ | ✅（只读） |
| 保险库/库 | ✅ | ❌ |
| 浏览器 | ✅ | ✅（受限） |
| 终端 | ✅ | ✅ |
| MCP 桥 | ✅ | ❌ |
| A2A 发布 | ✅ | ❌ |

### B.2 外部智能体支持

| 智能体 | 状态 | 默认端点 |
|--------|------|----------|
| OpenClaw（EnvoyAI） | 可用 | `http://127.0.0.1:18789` |
| HomeClaw | 兼容预设 | `http://127.0.0.1:8010/message` |
| Hermes | 兼容预设 | `http://127.0.0.1:8020/message` |
| OpenHuman | 兼容预设（禁用） | 自定义 |

### B.3 模型提供商

| 提供商 | 模式 | 端点示例 |
|--------|------|----------|
| Ollama | ollama | `http://127.0.0.1:11434/v1` |
| OpenAI | openai-compatible | `https://api.openai.com/v1` |
| Anthropic | anthropic-compatible | `https://api.anthropic.com/v1` |
| LiteLLM | litellm | `http://127.0.0.1:4000/v1` |
| Mock | mock | 无 |


---

## 附录 C — 快速参考卡片

### C.1 常用命令

```bash
# 启动节点（开发模式）
npm run node:dev

# 启动节点（指定配置文件）
npm run node:dev -- --profile ./data/myprofile

# 运行测试
npm test

# 类型检查
npm run typecheck

# CLI 帮助
npm run cli -w @envoymesh/node -- --help

# 连接状态
npm run cli -w @envoymesh/node -- connectivity-status

# 中继状态
npm run cli -w @envoymesh/node -- relay-status

# 保险库搜索
npm run cli -w @envoymesh/node -- vault-search --vault ./shared_vault --query "关键词"

# 运行中继服务器
npm run node:dev -- --profile ./data/relay --relay-server --listen /ip4/0.0.0.0/tcp/4001
```

### C.2 配置文件位置

- **macOS**: `~/Library/Application Support/EnvoyMesh/`
- **Windows**: `%APPDATA%\EnvoyMesh\`
- **Linux**: `~/.config/envoymesh/`
- **开发模式**: `./data/<profile>/`

### C.3 端口参考

| 服务 | 默认端口 | 配置项 |
|------|----------|--------|
| OpenClaw 网关 | 18789 | `openclawPort` |
| 外部智能体桥 | 3031 | `bridgeListenPort` |
| WebSocket（Social） | 8080 | `webSocketPort` |
| 中继服务器 | 4001 | 命令行参数 |
| Ollama | 11434 | Ollama 配置 |
| LiteLLM | 4000 | LiteLLM 配置 |


---

## 附录 D — 隐私和安全检查清单

### D.1 初始设置检查

- [ ] 创建所有者身份后立即备份
- [ ] 配置文件目录权限设置为 `0600`
- [ ] 禁用不必要的外部智能体桥
- [ ] 启用语义防火墙（默认启用）
- [ ] 设置 `requireApprovalForCloud: true`（默认启用）
- [ ] 配置自动回复速率限制

### D.2 日常安全实践

- [ ] 定期备份保险库和配置文件
- [ ] 使用强密码保护操作系统用户账户
- [ ] 不在聊天中分享私钥或敏感凭证
- [ ] 定期审查批准队列
- [ ] 监控活动日志中的异常行为
- [ ] 在不受信任的网络上使用时验证连接加密

### D.3 联系人管理

- [ ] 验证新联系人的身份（离线比较所有者 ID）
- [ ] 从低信任等级开始（公共(public) 或 推荐(referred)）
- [ ] 定期审查和更新信任等级
- [ ] 阻止不受欢迎的联系人
- [ ] 在分享敏感信息前确认信任等级

### D.4 智能体安全

- [ ] 启用 `autonomousKillSwitch` 进行全局暂停
- [ ] 限制智能体可以访问的敏感度级别
- [ ] 审查自动发送规则
- [ ] 定期重置智能体会话以防止漂移
- [ ] 仅连接受信任的外部智能体端点

### D.5 网络安全

- [ ] 使用社区中继或私有中继进行引导
- [ ] 为 WebRTC 通话配置 TURN 服务器
- [ ] 验证防火墙允许出站 TCP 连接
- [ ] 定期检查节点连接状态
- [ ] 在 WAN 环境中使用加密隧道


---

## 附录 E — 状态和路线图边界

### E.1 当前可用功能

- 网格身份和绑定
- 一对一和群组聊天
- 语音消息和语音通话
- 文件共享
- EnvoyAI（OpenClaw）助手
- 外部智能体桥（HomeClaw、Hermes）
- 保险库和库
- RAG 知识检索
- 团队任务
- 终端访问
- 浏览器（基本功能）
- 私人和社区中继

### E.2 计划中功能

- 视频通话（第 42I 阶段）
- 完整浏览器功能（第 45C-E 阶段）
- 提要推送通知（第 45E 阶段）
- 全球声誉系统
- 商业和支付功能
- Filecoin 持久性
- 完整的分层中继图

### E.3 搁置功能

- 全节点 EnvoyGo 操作
- 广泛的匿名工作者招募
- 作为独立完整网格节点运行 EnvoyGo

### E.4 外部兼容性

- MCP 兼容（可作为 MCP 服务器）
- A2A 兼容（可发布智能体卡）
- Obsidian 插件支持
- HomeClaw、Hermes、OpenHuman 兼容预设