# EnvoyMesh 指南

**版本：** 0.1.0
**版本类型：** 完整指南版
**修订：** 2026-07-25
**语言:** [English](EnvoyMesh_GuideBook_0.1.0.md) · [简体中文](EnvoyMesh_GuideBook_0.1.0.zh-CN.md) ([HTML](EnvoyMesh_GuideBook_0.1.0.html) · [中文 HTML](EnvoyMesh_GuideBook_0.1.0.zh-CN.html))
**受众：** 终端用户与潜在用户（第 I–XIV 部分）；网站编辑、支持团队与运维人员（第 XV 部分及标注运维的主题）
**目的：** 一份面向终端用户的 EnvoyMesh 完整指南——介绍它是什么、如何在桌面端与 EnvoyGo 上安装和使用、身份与信任如何运作，以及如何安全地运维网络、智能体、中继和高级功能。

> **完整指南版。** 本指南反映 EnvoyMesh 0.1.0 仓库在修订日期的状态。它面向终端用户编写，不是内容大纲占位。功能状态可能因平台与部署而异——在生产环境中依赖任何 Beta 或实验功能前，请在你的构建中校验（发行说明、设置界面标签与附录 J）。

## 如何阅读本指南

- **第 I–XIV 部分**面向终端用户与运维人员介绍产品。
- **第 XV 部分**面向网站编辑与内容运维人员，对终端用户可选。
- 任务生命周期名称（如 *Created* / *任务 计划中* / *运行*）是 EnvoyMesh 的状态，不是产品 **计划中** / **可用** 状态标签。
- 本指南中的 **移动**指 **EnvoyGo**（与家庭节点配对的瘦客户端），除非某节明确讨论遗留移动实验。

## 功能状态标签

- **可用** —— 已实现且面向当前使用。
- **Beta** —— 已实现，但仍在校验或产品打磨中。
- **实验** —— 可用于评估；行为或界面可能变化。
- **兼容预设** —— EnvoyMesh 提供该集成的配置，而集成的部分由其他项目维护。
- **计划中** —— 已设计或记录，但目前尚未作为完整功能提供。
- **暂缓** —— 有意推迟，无确定的发布日期。
- **桌面** —— 通过 EnvoyMesh 桌面应用或家庭节点可用。
- **移动** —— 在 EnvoyGo（当前 EnvoyMesh 移动产品，与家庭节点配对的瘦客户端）中可用。
- **运维** —— 面向节点、中继或集群管理员。

## 本指南使用的产品术语

- **EnvoyAI / OpenClaw** 是 EnvoyMesh 内置的更完整集成的智能体。
- **HomeClaw** 与 **Hermes** 是内置的外部智能体兼容预设。
- **OpenHuman** 是默认禁用的内置兼容预设。
- HomeClaw、Hermes 与 OpenHuman 的智能体端代码由各自项目维护；EnvoyMesh 提供桥接、预设、策略边界与 mesh 工具。
- **智能体网络**指已绑定的用户允许其自愿加入的本地智能体协作。它不是公开的智能体市场。
- **协作任务**是多智能体协作的用户面向名称。源代码与较早的文档可能将这些工作流称为 **链（链）**。
- **EnvoyGo** 是当前移动产品：与家庭 EnvoyMesh 节点配对的瘦客户端。较早的 Capacitor 移动分支（进程内完整节点）是遗留实验，并非主要移动应用。将 EnvoyGo 本身作为完整 mesh 节点运行属于暂缓事项（附录 J.6）。

---

# 目录

## 第 I 部分 —— 认识 EnvoyMesh

### 1. 欢迎

#### 1.1 为人类和AI智能体打造的私密网络

EnvoyMesh connects 人员 and AI 智能体 through a private mesh rather than a central 账户 service. Each participant keeps a local 身份, chooses trusted 联系人 (bonded at one of four user-selectable 信任层级 — 阻止, 公开, 推荐, or 直接; `自身` is the implicit tier for your own 所有者, 设备, and 智能体), and decides which 智能体, 工具, and information may cross those relationships.

#### 1.2 设计上采用本地优先和点对点架构

The home 节点 stores 身份, 策略, 对话, 任务, and 知识 locally. 对等节点-to-对等节点 transport is preferred, so routine communication does not depend on a 托管 application 数据库.

#### 1.3 无需中央账户

You create cryptographic 身份 instead of registering a global 用户名 and 密码. 公开 中继 may help 对等节点 find and reach each other, but they are not an 账户 authority.

#### 1.4 你的身份、关系和数据属于你自己

所有者 密钥 establish 控制, 绑定 记录 relationships, and 敏感度 labels protect data. 备份 therefore matter: losing the only copy of an 所有者 密钥 can mean losing 连续性 of that 身份.

#### 1.5 直接连接 and optional relays

EnvoyMesh first attempts a 直接 对等节点 路径. When NAT, firewalls, or 移动性 prevent that 路径, an optional 中继 supplies 会合 and 转发 without becoming the application brain.

#### 1.6 个人智能体和外部智能体

EnvoyAI is the bundled OpenClaw-based assistant. A separate 桥接 can connect HomeClaw, Hermes, OpenHuman, or a custom HTTP 智能体 without giving that external 进程 raw P2P 密钥.

#### 1.7 可信的多智能体协作

智能体网络 lets bonded 所有者 opt their local 智能体 into 协作任务. The requesting 节点 计划 work, eligible 工作节点 执行 locally, and the 协调代理 combines attributed results.

#### 1.8 开放协议和互操作性

原生 signed EnvoyMesh 信封 remain the internal 协议. MCP 暴露 工具 to compatible applications, while A2A 发布 智能体 发现 and 任务 interfaces at the 网络 edge.

#### 1.9 主要功能一览

可用 areas include messaging, 群组, 音频, 语音通话, 文件, 资料, 个人AI, 知识 and RAG, external-智能体 桥接, 协作任务, 终端, 浏览器, 中继, MCP, and A2A.

#### 1.10 当前可用性和限制

Some 能力 remain 平台-specific or 暂缓. In particular, 视频通话, broad 匿名 工作节点 recruitment, full-节点 EnvoyGo 操作, global reputation, commerce, Filecoin persistence, and a complete 分层 中继 graph are not current general 功能.


### 2. 为什么选择 EnvoyMesh？

#### 2.1 无需中央平台的私密通信

EnvoyMesh treats messaging as signed 对等节点 traffic rather than rows in a 托管 数据库. You choose who appears in your 联系人 list, and 对话 stay on 设备 you 控制 unless you explicitly 分享 outward. This differs from 中心化 messengers that can change terms, scan content, or freeze 账户 without your 密钥.

#### 2.2 自身-sovereign identity across your devices

Your 所有者身份 is an Ed25519 密钥对, not a 用户名 注册 by a vendor. 设备 and 智能体 derive from that 所有者 with signed 证书 and 授权, so you can prove 连续性 across laptops, desktops, and paired phones. Losing the only copy of an 所有者 密钥 can end that 身份's history, so 备份 and 恢复 计划 matter from day one.

#### 2.3 由你掌控的AI助手

EnvoyAI and external 智能体 运行 on your home 节点 under 绑定策略, 授权 limits, and optional human 审批. You decide which 模型, 工具, and 联系人 an 智能体 may use instead of accepting a vendor's default 自动化 scope. 远程 模型 提供商 receive only prompts the 节点 approves after its 语义防火墙 and 策略 checks.

#### 2.4 可信的知识分享

笔记 and 文件 live in your 保险箱, appear in the 资料库 UI, and can be 分享 with 敏感度 labels that the 绑定 engine enforces. Bonded 联系人 can query your 公开 or friends-tier material through `知识.query`, while strangers see only the 公开 sub-graph and are 限流. Publishing for 浏览 uses separate web-content 路径 and 可见性 rules described in Part V.

#### 2.5 安全的任务委托

任务 委托 uses 所有者-signed 授权 that cap 成本, 敏感度, 允许 actions, and 到期. An 智能体 cannot silently exceed those bounds; risky steps can require explicit 审批 before 执行. This makes autonomous work 透明 rather than a 黑盒 运行 on someone else's servers.

#### 2.6 你选择的智能体之间的协作

智能体网络 is 选择性加入 collaboration among bonded 所有者, not an 匿名 工作节点 市场. 协作任务 let your local 智能体 计划 work and 通话 工作节点 you already 信任, with attributed results returned to the 协调代理. You stay in 控制 of which 联系人' 智能体 may participate.

#### 2.7 本地模型、远程模型和外部智能体

EnvoyMesh supports 本地推理, 配置 远程 提供商, and external HTTP 智能体 such as HomeClaw or Hermes through a single 桥接 at a time. The 节点 signs mesh traffic on the 智能体's behalf without handing over Ed25519 密钥. Mix 提供商 to balance 隐私, 延迟, and 能力 without locking into one vendor stack.

#### 2.8 可审计性而非隐形自动化

运维 append JSONL 审计事件 with 关联ID that stitch multi-step flows together. You can review what an 智能体 attempted, what 策略 允许 or 拒绝, and which 对等节点 participated. This 审计轨迹 complements 聊天历史 when 诊断 自动化 or 分享 争议.

#### 2.9 何时选择EnvoyMesh

EnvoyMesh fits when you want cryptographic 身份, explicit 信任层级, 本地优先 存储, and 智能体 tooling under your 策略. It works well for small trusted 群组, 个人AI with mesh reach, and teams that need verifiable messaging plus 委托 任务. 启动 with one home 节点 and a few bonded 联系人 before expanding 中继 or 智能体网络 成员资格.

#### 2.10 何时其他方案更适合

A global consumer messenger with effortless signup, massive 群组, and vendor-managed moderation may serve you better than 运行 a home 节点. Likewise, if you only need a single 云 chatbot with no 对等节点 relationships or local 保险箱, a 托管 assistant is simpler. EnvoyMesh rewards 操作员 willing to own 密钥, 备份, and 信任 decisions.

### 3. 你可以做什么

#### 3.1 与可信的人建立连接

Add 联系人 through introductions, QR 配对, or 中继-assisted 发现 once you 验证 their 公开 密钥 指纹. 绑定 记录 信任层级—阻止, 公开, 推荐, or 直接—that gate what each 对等节点 may request. You can 升级 or 降级 信任 as relationships change without migrating to a new 账户.

#### 3.2 交换私信

Send one-to-one chat as signed 信封 with 人对人 role 策略 enforced by the 协议. 消息 prefer 直接 libp2p 路径 and fall back to circuit 中继 when NAT blocks a straight connection. Read receipts and delivery behavior follow the 设置 in Social or EnvoyGo once paired to your home 节点.

#### 3.3 创建群聊

Create 群组 线程 that include multiple bonded 联系人 with the same 签名 and 策略 guarantees as 直接 chat. 群组 成员资格 and naming are 本地优先 constructs coordinated through your 节点. Use 群组 for family, project, or research circles where everyone already 分享 an explicit 信任 relationship.

#### 3.4 发送语音消息和进行语音通话

记录 short 音频 clips in chat or 启动 语音通话 when both sides support the 功能 and 策略 allows. Media flows over the same mesh transport as 消息 rather than through a separate proprietary calling backend. Quality and 可用性 depend on 网络 路径 and whether 对等节点 are reachable via 直接 or relayed connections.

#### 3.5 分享文件和资料照片

分享 文件 with 联系人 using signed data-传输 凭证 that land in 保险箱 收件箱 文件夹 on the recipient side. 资料 照片 and avatars follow the same 身份 and 存储 模型 as other local assets. Recipients 索引 received 文件 under their own 敏感度 rules.

#### 3.6 与你的个人AI智能体对话

Chat with EnvoyAI (bundled OpenClaw) from Social 桌面 or through EnvoyGo when paired to a 运行 home 节点. The assistant can search your 保险箱, 消息 bonded 联系人, and invoke 允许 工具 subject to 授权 and 审批. 启用 or 禁用 the bundled 智能体 in 设置 → AI according to your comfort with 自动化.

#### 3.7 连接OpenClaw、HomeClaw、Hermes或OpenHuman

Connect HomeClaw, Hermes, OpenHuman, or a custom HTTP 智能体 through 设置 → AI → Ext 智能体 when you prefer an external 运行时 over bundled EnvoyAI. EnvoyMesh translates mesh 工具 into the 外部智能体's 消息 contract without exposing raw libp2p 密钥. Only one external 桥接 运行 at a time; 验证 you 信任 the local 端点 before enabling it.

#### 3.8 搜索本地和可信知识

Search your 保险箱 locally from the 资料库 tab or ask EnvoyAI to retrieve 块 through the RAG pipeline indexed on save. 联邦 search can query bonded 联系人' 联合 知识 within 敏感度 ceilings you 配置 per 联系人. 公开 笔记 participate in the wider mesh through 限流 `知识.query` for strangers.

#### 3.9 发布和浏览mesh内容

发布 Markdown, images, and PDFs under `envoy://` URLs served from your home 节点's 网页内容 目录. Bonded 联系人—and, when 可见性 allows, wider mesh 对等节点—open pages in the Social 浏览器 or EnvoyGo 浏览器 while paired to home. 拉取-based `库.read` 获取 bytes on demand; 推送 通知 for 订阅源 arrived in 阶段 45E.

#### 3.10 将工作委托给其他智能体

Send a 任务 授权 to another 所有者's 智能体 when you need specialized work within signed bounds. 协商 follows the 任务生命周期 from propose through accept, 运行, and result. Human 审批 gates remain 可用 for actions the 授权 marks as sensitive.

#### 3.11 Run 协作任务 across several agents

运行 协作任务 (multi-智能体 链) across opted-in 智能体网络 成员 when bonded 所有者 allow their 智能体 to collaborate. The requesting 节点 计划 steps, 工作节点 执行 locally on their own hardware, and results return with attribution. This is suited to research summaries, split analysis, or coordinated 报告—not open recruitment of 匿名 工作节点.

#### 3.12 Connect MCP 与 A2A applications

暴露 selected mesh 工具 to MCP-compatible 桌面 apps such as Claude 桌面, or 发布 an A2A 智能体 card for external 任务 clients. MCP and A2A sit at the 网络 edge; 原生 signed 信封 remain the internal 协议. 配置 桥接 only after you understand which 工具 cross the boundary.

#### 3.13 远程使用终端

Open 浏览器-based 终端 in Social or EnvoyGo that attach to PTY 会话 on your home 节点 over WebSocket when you are paired or on 桌面. 远程 Shell 访问 inherits the same 认证 and 配对 模型 as other home RPC 功能. Treat 终端 暴露 as high 权限 and 限制 it to 设备 you 控制.

#### 3.14 运行私有或社区中继

运行 a private 中继 for your 集群 or 引导 against the community 中继 for casual testing. 中继 provide 会合 and circuit 转发—they do not store your 消息, 运行 模型, or act as 账户 servers. 操作员 广告 监听地址 and may 配置 分层 中继 graphs for larger 部署.

### 4. EnvoyMesh 如何运作

#### 4.1 系统概述（通俗版）

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 470" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="760" height="80" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">客户端</text><rect x="60" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Social 桌面端</text><text x="140.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">React + WebSocket</text><rect x="260" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyGo</text><text x="340.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Flutter 瘦客户端</text><rect x="460" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">开发者 CLI</text><text x="540.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">node CLI</text><rect x="20" y="110" width="760" height="260" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="126" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">家庭节点进程（每个所有者一个）</text><rect x="60" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">入站守卫</text><text x="140.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">大小 · 模式 · 签名 · 重放</text><rect x="260" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">绑定引擎</text><text x="340.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">信任层级 · 策略</text><rect x="460" y="140" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">任务运行时</text><text x="540.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">授权 · 生命周期</text><rect x="60" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">身份</text><text x="140.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 · DID · 授权</text><rect x="260" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">保险箱 + 资料库</text><text x="340.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">文件 · RAG · 知识</text><rect x="460" y="220" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">模型</text><text x="540.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">路由 · 语义防火墙</text><rect x="260" y="290" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="340.0" y="312.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">libp2p</text><text x="340.0" y="328.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">TCP · QUIC · mDNS · DHT</text><path d="M140,80 L140,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M340,80 L340,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M540,80 L540,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="20" y="390" width="760" height="60" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="406" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">外部服务</text><rect x="60" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F3FF" stroke-width="1.2"/><text x="140.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#5d3ac7" font-weight="600" fill="#1e1d1b">模型提供商</text><text x="140.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">OpenAI · 本地 · LiteLLM</text><rect x="260" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F5F4" stroke-width="1.2"/><text x="340.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#6d6a63" font-weight="600" fill="#1e1d1b">中继</text><text x="340.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">仅连通性</text><rect x="460" y="410" width="160" height="30" rx="6" fill="" stroke="#F5F5F4" stroke-width="1.2"/><text x="540.0" y="422.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#6d6a63" font-weight="600" fill="#1e1d1b">MCP / A2A</text><text x="540.0" y="438.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">桥接</text><path d="M340,360 L340,390" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 1 —— 家庭节点系统架构：客户端通过 JSON-RPC 调用每个所有者的家庭节点；家庭节点持有身份、策略、存储、模型与网络；外部服务为可选，绝不持有所有者密钥。</figcaption></figure>


At a high level, your home 节点 combines 身份, 策略, 存储, 模型, and libp2p networking in one 进程. Social 桌面 and paired EnvoyGo are thin clients that 通话 JSON-RPC on that 节点. 入站流量 passes through guards for size, 签名, 重放, and 绑定 decisions before any 模型 or 保险箱 访问 occurs.

#### 4.2 所有者、设备、智能体和对等节点

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="300" y="20" width="200" height="50" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="400.0" y="42.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="14" font-weight="600" fill="#1e1d1b">所有者密钥</text><text x="400.0" y="58.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 · long-lived root</text><path d="M400,70 L200,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="300.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">智能体授权</text><path d="M400,70 L400,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">智能体授权</text><path d="M400,70 L600,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="500.0" y="91.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">智能体授权</text><rect x="100" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">设备证书</text><text x="200.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">per machine / phone</text><rect x="300" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">签名</text><text x="400.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">per agent · bounded</text><rect x="500" y="120" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="600.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">(direct use)</text><text x="600.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">owner signs envelopes</text><path d="M200,170 L200,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="200.0" y="191.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">派生</text><path d="M400,170 L400,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="191.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">派生</text><rect x="100" y="220" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Device Identity</text><text x="200.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy:device:&lt;hash&gt;</text><rect x="300" y="220" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="242.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Agent Identity</text><text x="400.0" y="258.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy:agent:&lt;hash&gt;</text><path d="M200,270 L200,320" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="200.0" y="291.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">runtime</text><path d="M400,270 L400,320" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="400.0" y="291.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">runtime</text><rect x="100" y="320" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="200.0" y="342.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Peer ID</text><text x="200.0" y="358.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy_&lt;hash&gt; · signs</text><rect x="300" y="320" width="200" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="400.0" y="342.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Peer ID</text><text x="400.0" y="358.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoy_&lt;hash&gt; · signs</text><rect x="470" y="200" width="260" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="478" y="216" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">特性</text><text x="490" y="230" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• 所有者密钥永不离开其设备</text><text x="490" y="250" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• 设备/智能体可被吊销</text><text x="490" y="270" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• 对等 ID 可轮换</text><text x="490" y="290" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• 对等节点验证所有者关联</text><text x="490" y="310" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• 丢失所有者密钥 = 丢失</text><text x="490" y="326" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">  该身份的历史</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 2 —— 身份层级：所有者密钥是根；它签名设备证书与智能体授权，各自派生设备/智能体身份与运行时对等 ID，后者签名信封流量。</figcaption></figure>


The 所有者 密钥 is the long-lived human root; 设备 receive 所有者-signed 证书; 智能体 receive 授权 linking them to that 所有者. 运行时 对等节点 IDs sign individual 信封 and may rotate with 密钥 while preserving 信任 links. Understanding this stack helps you reason about 备份, 配对, and 智能体 授权.

#### 4.3 联系人、绑定和信任层级

联系人 map to 绑定 记录 with tiers that determine which 意图 and 敏感度 levels are 允许. 公开 strangers may ping or request 绑定; 推荐 联系人 gain broader query 访问; 直接 绑定 unlock friends-tier 分享. 策略 evaluation is deterministic and logged for 审计.

#### 4.4 已签名消息 and verifiable senders

Every 信封 carries an Ed25519 签名 over 规范JSON so recipients 验证 sender 身份 before acting on content. Role fields enforce 人对人 chat versus 智能体对智能体 任务 traffic at the 模式 level. 篡改 or replayed 消息 fail inbound guards.

#### 4.5 个人智能体和外部智能体桥接

Bundled EnvoyAI 运行 in-进程 with mesh 工具, while external 智能体 connect through an HTTP 桥接 that never receives your private signing 密钥. The 桥接 forwards 允许 工具 通话 and translates responses into mesh 信封. Choose one primary 智能体 surface to avoid conflicting 自动化.

#### 4.6 本地知识、资料库和保险箱

The 保险箱 stores 文件 on 磁盘 under 路径-safe rules; the 资料库 is the UI and metadata layer for 笔记, 导入, and 发布 items; RAG 索引 保险箱 块 for 检索 during chat. 敏感度 overrides live in `.envoy/敏感度.json` per item, not per 文件夹. 网页内容 for 浏览 lives under a separate `web/` 目录 mapped to `envoy://` 路径.

#### 4.7 任务、授权和审批

任务 progress through named 生命周期 状态 with 授权 defining authorized 意图, 成本 ceilings, and termination 策略. 所有者 can require 审批 before specific actions even when a 授权 otherwise allows 自动化. 取消 and 心跳 意图 keep long-运行 work 可追溯.

#### 4.8 智能体网络成员资格

智能体网络 成员资格 is mutual 选择性加入 among bonded 联系人 who 启用 their 智能体 for collaboration. It is not a 公开 市场 listing 匿名 工作节点. 协作任务 consume this 成员资格 graph when selecting eligible 工作节点.

#### 4.9 直接 networking and relay assistance

节点 attempt 直接 TCP or QUIC connections first, using mDNS on LAN and DHT 发现 when 配置. When NAT blocks 直接 路径, circuit 中继 v2 reservations forward streams without decrypting application 载荷. You choose 引导 中继; they assist 连通性 rather than owning your 身份.

#### 4.10 活动记录和端到端审计

审计 and 日志 JSONL 文件 记录 意图, 结果, 延迟, and 关联ID for multi-hop flows. 操作员 can 追踪 a 协作任务, 知识 query, or 文件 传输 across 对等节点 using those IDs. 日志 intentionally avoid storing raw sensitive 载荷 unless required for debugging 策略.

### 5. 常见用例

#### 5.1 跨设备的私密个人AI

运行 EnvoyAI on a 桌面 home 节点 and reach it from Social locally or EnvoyGo when paired away from home. Your 保险箱, 模型, and 绑定 stay on the computer you 信任 while the 手机 acts as a 远程 控制. Back up 所有者 密钥 and 保险箱 data so 设备 loss does not strand your 智能体 history.

#### 5.2 家庭或朋友mesh

Invite family or friends through introductions, establish 直接 绑定, and use 群聊 plus 文件 分享 without a 分享 云 账户. Each participant keeps their own 节点 and data; 分享 is explicit through 消息, 凭证, and 联合 知识 设置. 中继 help when 成员 are on different 网络.

#### 5.3 可信的研究和知识交换

Exchange research 笔记 with 公开 or friends 敏感度, query 对等节点' 联合 libraries, and save attributed results back to your 保险箱 through MCP write-back. 联邦 RAG respects per-联系人 ceilings so you never silently exfiltrate private material. 发布 finished summaries as mesh pages when you want durable `envoy://` links.

#### 5.4 小型团队智能体网络

启用 智能体网络 among a small team that already 分享 直接 绑定 and aligned 授权. 分配 协作任务 for split research, code review assistance, or draft 报告 with each 工作节点 执行 on local hardware. Review 审计 trails to see which 智能体 contributed each segment.

#### 5.5 多智能体规划和报告生成

计划 a multi-step 报告 where one 智能体 outlines sections, 工作节点 gather evidence from local vaults, and the 协调代理 合并 attributed text. 授权 cap 成本 and require 审批 before sending external email or 支出 credits. Results land in chat and can be saved as 保险箱 笔记 for later citation.

#### 5.6 与可信mesh联系人一起使用OpenClaw

Keep OpenClaw as EnvoyAI on your 节点 while using mesh 工具 to 消息 bonded 联系人 and search 联合 知识. OpenClaw never receives raw libp2p 访问; it 通话 `mesh.findKnowledge`, `mesh.sendMessage`, and related 工具 through the 注册表. This pattern suits power users who want OpenClaw skills with trusted 对等节点 reach.

#### 5.7 将HomeClaw作为外部EnvoyMesh智能体

Point EnvoyMesh at a local HomeClaw HTTP 端点 so HomeClaw becomes the conversational surface while the 节点 handles 身份 and mesh I/O. HomeClaw's own 记忆 and plugins stay in its 进程; EnvoyMesh enforces 绑定 on outbound actions. 启用 the 预设 only on machines where you already 运行 and 信任 HomeClaw.

#### 5.8 将Hermes作为外部EnvoyMesh智能体

Use Hermes when you prefer its Obsidian-style 知识 tooling alongside mesh messaging. The 桥接 forwards Hermes responses and 工具 results through the same 策略 boundary as other external 智能体. 配置 the default `HTTP://127.0.0.1:8020/消息` 端点 or your custom URL in 设置 → AI.

#### 5.9 将OpenHuman作为外部EnvoyMesh智能体

OpenHuman is 可用 as a 禁用-by-default 兼容性 预设 for teams experimenting with that 运行时. When 启用, it follows the same one-桥接-at-a-time rule and never receives signing 密钥. Treat it as optional until your organization 验证 OpenHuman's local 部署 模型.

#### 5.10 通过MCP使用EnvoyMesh的Claude Desktop

注册 EnvoyMesh as an MCP 服务器 in Claude 桌面 to 暴露 mesh search, 联系人, and messaging 工具 to Anthropic's client. MCP crosses a 桌面 boundary—review which 工具 you 启用 and what data they can read from your 保险箱. The home 节点 must be 运行 for MCP 会话 to succeed.

#### 5.11 委托任务的外部A2A客户端

发布 an A2A 智能体 card from your 节点 so external A2A clients can discover 能力 and 委托 任务 through JSON-RPC proxies. Home tunnel and 中继 路径 let 远程 clients reach a home 节点 without exposing raw libp2p to the external 运行时. 授权 and 审批 still apply to 委托 work.

#### 5.12 A self-hosted relay fleet

Deploy one or more 中继 binaries with 广告 addresses for a family, lab, or organization that wants private 引导 and circuit 中继 capacity. 中继 stay lean: no LLM, no 保险箱, no 载荷 inspection beyond transport 转发. 监控 中继 审计 snapshots when operating 集群 infrastructure.

### 6. 产品与协议对比

#### 6.1 EnvoyMesh and centralized messengers

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 740 358" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:740px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="160" height="40" fill="#645a3a"/><text x="100" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">集成方式</text><rect x="180" y="10" width="240" height="40" fill="#645a3a"/><text x="300" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">信任边界</text><rect x="420" y="10" width="300" height="40" fill="#645a3a"/><text x="570" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="white">可触达范围</text><rect x="20" y="50" width="160" height="48" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1"/><text x="100" y="80" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">EnvoyAI / OpenClaw</text><rect x="180" y="50" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="80" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">内置 · 进程内</text><rect x="420" y="50" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="80" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">完整 mesh 工具 · 聊天 · 任务</text><rect x="20" y="98" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="128" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">HomeClaw</text><rect x="180" y="98" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="128" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP 桥接 · 本地</text><rect x="420" y="98" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="128" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">mesh 工具 · 聊天（单 URL）</text><rect x="20" y="146" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="176" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Hermes</text><rect x="180" y="146" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="176" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP 桥接 · 本地</text><rect x="420" y="146" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="176" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">mesh 工具 · 聊天（单 URL）</text><rect x="20" y="194" width="160" height="48" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="224" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">OpenHuman</text><rect x="180" y="194" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="224" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">HTTP 桥接 · 本地</text><rect x="420" y="194" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="224" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">mesh 工具 · 聊天（单 URL）</text><rect x="20" y="242" width="160" height="48" fill="#FEF3C7" stroke="#3d5a45" stroke-width="1"/><text x="100" y="272" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">MCP server</text><rect x="180" y="242" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="272" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">stdio · Claude Desktop</text><rect x="420" y="242" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="272" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">mesh 工具向外暴露</text><rect x="20" y="290" width="160" height="48" fill="#F5F3FF" stroke="#3d5a45" stroke-width="1"/><text x="100" y="320" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">A2A</text><rect x="180" y="290" width="240" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="300" y="320" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">JSON-RPC · 中继</text><rect x="420" y="290" width="300" height="48" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="570" y="320" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Agent Card · 任务方法</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 18 —— 集成形态对比：六种外部集成形态并列，各自标注信任边界与可触达范围。EnvoyAI 最深；MCP/A2A 面向外。</figcaption></figure>


中心化 messengers optimize for frictionless signup, 手机-number 身份, and vendor-operated moderation at scale. EnvoyMesh trades that convenience for 自身-sovereign 密钥, explicit 绑定, and 本地优先 存储 you 操作. Choose messengers for mass reach; choose EnvoyMesh when 信任 boundaries and auditability matter more.

#### 6.2 EnvoyMesh and cloud AI assistants

云 AI assistants 运行 inference and 记忆 on vendor infrastructure with 账户 login and vendor 策略. EnvoyMesh keeps 模型, 保险箱, and 绑定 on your 节点 while optionally calling 远程 提供商 you 配置. You gain mesh reach and 授权 instead of a single-vendor 聊天历史 silo.

#### 6.3 EnvoyMesh and standalone OpenClaw

Standalone OpenClaw excels as a local assistant but lacks 原生 signed 对等节点 messaging, 绑定策略, and 联邦 知识 unless extended. EnvoyMesh bundles OpenClaw as EnvoyAI and wraps it with mesh 工具, 授权, and 审计. 运行 both without integration duplicates 智能体 unless you 禁用 one.

#### 6.4 EnvoyMesh and external agent runtimes

External 智能体 runtimes (HomeClaw, Hermes, custom HTTP) focus on 对话 and plugins; EnvoyMesh supplies 身份, transport, and 策略. The 桥接 pattern keeps libp2p 密钥 on the 节点 while the external 进程 handles UX you prefer. Neither side replaces the other—they compose when 配置 deliberately.

#### 6.5 EnvoyMesh and MCP

MCP standardizes 工具 发现 for AI applications; EnvoyMesh implements an MCP adapter that 暴露 selected mesh 能力. 原生 mesh 意图 remain richer and signed; MCP is an 互操作性 edge for 桌面 clients. 启用 MCP 工具 narrowly to limit 保险箱 and 联系人 暴露.

#### 6.6 EnvoyMesh and A2A

A2A defines 智能体 cards and 任务 interfaces for cross-product 委托; EnvoyMesh 发布 cards and proxies 任务 through 中继 or home tunnel 路径. 原生 协作任务 and 授权 govern 信任 inside the mesh; A2A extends reach to external orchestrators. Both can coexist with different 策略 surfaces.

#### 6.7 EnvoyMesh native Agent Network versus public marketplaces

公开 智能体 marketplaces optimize for 发现 of 匿名 工作节点 and commercial ranking. EnvoyMesh 智能体网络 is the opposite: collaboration only among bonded 所有者 who opted in locally. There is no global listing, reputation score, or payment rail in the 原生 design.

#### 6.8 Native protocols versus interoperability bridges

Signed Envoy 信封, 授权, and 绑定 tiers are the 原生 协议 inside the mesh. MCP and A2A 桥接 translate at the edge for external ecosystems without replacing internal 安全 模型. Prefer 原生 flows for bonded 对等节点 work; use 桥接 when an external client must participate.

---

## 第 II 部分 —— 安装与入门

### 7. 选择你的部署方式

#### 7.1 Desktop only

运行 EnvoyMesh on a Mac or Windows computer as your primary home 节点. 安装 from the current release installer or 构建 from source, create your 所有者身份 on first launch, and keep the machine 运行 when you want mesh 连通性. This 路径 fits anyone 启动 on one trusted 桌面 without 移动 访问 yet.

#### 7.2 Desktop with EnvoyGo mobile access

Add EnvoyGo on iOS or Android after your home 节点 is healthy. The 手机 pairs by scanning a QR code and mirrors chat, 联系人, 终端, and selected home 功能—it does not replace the 桌面 节点 or hold 所有者 密钥 on its own. 计划 for the home computer to stay reachable over LAN, 中继, or tunnel when you use 移动 away from home.

#### 7.3 Desktop with the bundled EnvoyAI agent

EnvoyAI (OpenClaw) ships with the 桌面 节点 and 启动 on port 18789 by default. It can search your 保险箱, 消息 bonded 联系人, and 运行 local 工具 under your 绑定 and 审批 设置. Toggle it in 设置 → AI or set `openclawEnabled` in `节点-配置.json` if you prefer to 启动 without the bundled assistant.

#### 7.4 Desktop with an external agent

Connect HomeClaw, Hermes, OpenHuman, or a custom HTTP 智能体 through 设置 → AI → Ext 智能体. One 节点 运行 one external 桥接 at a time; EnvoyMesh signs mesh traffic on the 智能体's behalf without handing over Ed25519 密钥. 启用 the 桥接 only after you 信任 the external 进程 and its local 端点.

#### 7.5 Desktop with local or remote models

配置 模型 提供商 under 设置 → AI according to your 隐私 and 成本 偏好. Local 模型 keep inference on your hardware; 远程 提供商 send approved prompts outside the 节点 under your 配置 limits. 启动 with one 提供商, 验证 responses in chat, then widen 自动化 once 审批 behave as you expect.

#### 7.6 Personal relay or community relay

中继 help 对等节点 discover each other and traverse NAT; they do not hold your 账户 or read application 载荷. Use the community 中继 for casual testing, or 运行 your own 中继 with `npm 运行 节点:dev -- --资料 ./data/中继 --中继-服务器 --listen /ip4/0.0.0.0/TCP/4001`. Normal 节点 引导 with `--引导 "<中继-multiaddr>"` and `--中继`.

#### 7.7 Small-team and organization deployments

Give each team 成员 a home 节点 with its own 所有者身份, then 绑定 联系人 explicitly rather than 分享 one login. 操作员 may deploy private 中继, standardize 信任层级, and 禁用 内置赞助 联系人 before 集群 rollout. Document 资料 data 路径 so 备份 and 升级 stay consistent across machines.

#### 7.8 Recommended first-time setup

安装 the 桌面 app on a trusted computer, complete 所有者 and 设备 设置, 启用 EnvoyAI if you want a personal assistant, and back up 身份 material before adding 联系人. 配对 one test 联系人 on the same LAN, send a 消息, then optionally add EnvoyGo. Defer 协作任务, external 智能体, and WAN 中继 testing until basic chat and status indicators look healthy.


### 8. 安装 EnvoyMesh

#### 8.1 系统要求

Use a supported current macOS or Windows 桌面 environment with enough 存储 for the app, local data, and optional 模型 or IPFS components. Source builds require the repository’s 节点.js toolchain and 包 dependencies; 移动 访问 additionally requires a 运行 home 节点.

#### 8.2 在 macOS 上安装

Download the macOS 磁盘 image, open it, and move EnvoyMesh to Applications. On first launch, macOS may require confirmation because release signing and notarization can vary by 构建; retain your data 目录 when 升级.

#### 8.3 在 Windows 上安装

运行 the Windows installer and allow the bundled 节点 运行时 through local 防火墙 prompts when you want 对等节点 连通性. The Windows 包 intentionally carries a smaller essential OpenClaw extension set to 控制 installer size.

#### 8.4 在 iOS 上安装 EnvoyGo

安装 EnvoyGo through the 可用 iOS 分发 渠道, then 配对 it to an existing home 节点. EnvoyGo is a 瘦客户端: do not expect it to replace the 桌面 节点 or preserve an independent mesh 身份 while the home 节点 is unavailable.

#### 8.5 在 Android 上安装 EnvoyGo

安装 EnvoyGo on Android and complete the same home-节点 配对 flow. 通知 and background behavior depend on Android 权限, battery 优化, and FCM 配置.

#### 8.6 从源码安装

From the repository root, 安装 dependencies with `npm 安装`, 运行 `npm 运行 typecheck`, and 运行 `npm test`. 启动 the 节点 with `npm 运行 节点:dev`; consult `QuickStart.md` for 平台 prerequisites and optional components.

#### 8.7 校验安装

A healthy installation 启动 the 节点, opens the Social interface, shows 身份 and connection status, and can reach the local service. 验证 with the built-in status surfaces before importing data or adding external integrations.

#### 8.8 应用数据位置

身份, 信任, 审计, 任务, 保险箱, and 配置 data live in the 节点’s application-data location rather than in the installation 目录. Use 附录 K and the current release 笔记 to locate the 平台-specific root.

#### 8.9 更新 EnvoyMesh

Back up 身份 and 保险箱 data, 停止 active 任务, and 安装 the newer 包 over the application. Review `CHANGELOG.md` for 配置 or 存储 migrations before restarting.

#### 8.10 卸载但不丢失身份或数据

Removing the application should be treated separately from deleting its data 目录. Preserve the data root and 身份 备份 if you intend to reinstall; delete them only when you deliberately want to erase the local 身份 and 记录.


### 9. 平台与打包差异

#### 9.1 Desktop and mobile feature comparison

桌面 Social is the full home-节点 experience: mesh 身份, 保险箱, 智能体, 协作任务 orchestration, 浏览器, 终端, and 设置. EnvoyGo mirrors a subset—chat, 联系人, 语音通话, read-only 协作任务 status, 终端, and 浏览器—through JSON-RPC to the paired home 节点. Treat 移动 as a 远程 控制, not a second independent 节点.

#### 9.2 macOS packaging

macOS releases ship as a 磁盘 image with the Tauri-wrapped Social UI and embedded 节点 运行时. OpenClaw extensions are bundled more completely on macOS than on Windows to reduce post-安装 设置. Check release 笔记 for notarization and Gatekeeper behavior on your macOS 版本.

#### 9.3 Windows packaging

Windows releases use an installer that bundles the 节点 运行时 and a slimmer OpenClaw extension set to 控制 download size. Allow the app through Windows 防火墙 when prompted if you want inbound 对等节点 connections. 资料 data lives under your user app-data 路径, separate from the 安装 文件夹.

#### 9.4 OpenClaw extensions bundled on macOS

macOS 桌面 builds include the fuller OpenClaw extension bundle used by EnvoyAI. Source 安装 copy extensions during `./scripts/设置.sh` or `npm 运行 设置`. Rerun 设置 after 升级 OpenClaw-related dependencies if you develop from source.

#### 9.5 Essential OpenClaw extension selection on Windows

Windows installers include a curated essential extension set rather than every optional 渠道. If a 能力 is missing, compare with the macOS bundle list in release 笔记 or 安装 from source with `.\scripts\设置.ps1`. Core mesh and chat 功能 do not require extra extensions.

#### 9.6 完整与精简桌面包

Some releases offer full installers with optional components and slimmer builds without IPFS or extra sidecars. Pick full when you want optional content 功能 out of the box; pick slim on constrained disks or air-gapped lab machines. Your 身份 and 保险箱 data are the same regardless of bundle flavor.

#### 9.7 可选 IPFS 侧车

IPFS-related components are optional adjuncts for content-addressing experiments, not required for chat, 绑定, or 协作任务. 启用 them only when release 笔记 document a supported sidecar for your 平台. Omit them if you prefer a minimal attack surface.

#### 9.8 Features requiring a home node

mesh 身份, 智能体运行时, 保险箱 indexing, 协作任务 orchestration, MCP/A2A 桥接, and full 设置 live on the home 节点. EnvoyGo, 浏览器 dev UI pointed at a 远程 资料, and CLI against `--资料` all assume that 节点 is 运行 and reachable. Without a home 节点, 移动 mirrors and thin clients cannot authenticate or send signed traffic.

#### 9.9 Features available as an EnvoyGo mobile mirror

EnvoyGo 暴露 chat 线程, 联系人, 语音通话, 终端 attach, 浏览器 for `envoy://` content, 推送 通知, and read-only recent 协作任务 status under Me → 智能体网络. AI engine toggles and 桥接 配置 appear read-only on 移动; change them on the home 节点. Cached data on the 手机 is for convenience, not authoritative 身份 存储.

#### 9.10 Legacy mobile experiments and current product boundaries

The Capacitor app in `apps/移动` was an in-进程 full-节点 experiment and is not the product 移动 路径. EnvoyGo is the supported 瘦客户端 paired to home. 运行 EnvoyGo as a standalone full mesh 节点 remains parked; use 桌面 or source builds for a primary 节点.


### 10. 创建你的身份

#### 10.1 What your EnvoyMesh identity represents

Your 身份 is cryptographic, not a 云 用户名. An 所有者身份 控制 授权 and 设备; each 设备 has its own 密钥; your 智能体身份 acts on the mesh under an 所有者-signed 授权. 对等节点 验证 签名 against these IDs rather than trusting a central 目录.

#### 10.2 创建所有者身份

On first launch, Social walks you through generating an 所有者 密钥对 stored in your 资料 目录 (for example `./data/default` in source 运行). This step happens once per person; subsequent 安装 on new machines 导入 or authorize additional 设备 instead of creating a second 所有者. Back up the 所有者 material before bonding 生产 联系人.

#### 10.3 创建你的第一个设备身份

The first 桌面 安装 creates a 设备身份 authorized by your 所有者 密钥 automatically. The 设备 signs routine 信封 and holds local 会话 状态. 笔记 the 设备 ID in 资料 or via `npm 运行 CLI -w @envoymesh/节点 -- 资料 --资料 ./data/default` when 诊断 配对.

#### 10.4 创建或激活你的智能体身份

EnvoyMesh derives an 智能体 对等身份 from your 所有者 and 智能体 密钥, then 记录 an 所有者-signed 授权 linking the 智能体 to you. EnvoyAI uses this 身份 when sending 智能体-role 消息. External 桥接 智能体 receive a separate 桥接 身份 persisted as `桥接-身份.json` when 启用.

#### 10.5 设置你的展示资料

Open 资料 in Social to set the name, avatar, and fields other 联系人 see after bonding. 资料 data is signed and stored locally in your 资料 目录. Update it before 分享 配对 codes so recipients recognize you.

#### 10.6 了解你的 DID

Your 所有者 DID follows the form `envoy:所有者:<哈希>` derived from your 公开 密钥. 设备 and 智能体 IDs use parallel `envoy:设备:` and `envoy:智能体:` prefixes. 分享 所有者 IDs for stable addressing once 对等节点 have exchanged 信任; 运行时 对等节点 IDs can rotate with 密钥 while 所有者 IDs stay long-lived.

#### 10.7 保护你的加密密钥

Private 密钥 live in the 资料 data 目录 with restrictive 文件 权限. Do not copy 密钥 文件 to chat, email, or 分享 drives unencrypted. Use the OS user 账户 protection on your home 节点 machine as the first layer of defense.

#### 10.8 备份身份与恢复数据

Copy the entire 资料 目录—or export 备份 your release documents—before OS reinstall or hardware migration. 保险箱 content under `shared_vault/` or your 配置 保险箱 路径 should be 备份 separately from the application binary. Test 恢复 on a non-生产 machine before you need it urgently.

#### 10.9 添加另一台设备

配对 a second 设备 by scanning a QR code or approving a 配对 request from the home 节点's 配对 Queue. The 所有者 signs a 设备证书 authorizing the new 设备 while 分享 the same 所有者 ID. EnvoyGo 配对 follows the thin-client flow: the 手机 receives a 会话 to the home 节点 rather than duplicating 所有者 密钥 on the 手机.

#### 10.10 吊销丢失或被入侵的设备

From a trusted remaining 设备, 吊销 the 丢失 设备证书 and remove its 信任 entries. Change any 桥接 secrets if the 外部智能体 ran on the compromised machine. Treat 所有者 密钥 compromise as catastrophic: 吊销 设备, rotate 桥接 凭证, and rebond 联系人 only after you are confident 密钥 are clean.


### 11. 应用导览

#### 11.1 主页与节点状态

The home view summarizes 节点 连通性, 发现 mode, and recent activity. Use it to confirm the 节点 is listening, 中继 are reachable, and no startup warnings remain. CLI equivalents include `连通性-status` and `中继-status` for deeper 诊断.

#### 11.2 对话

对话 lists 直接 and 群聊 线程 with delivery indicators. Open a 线程 to send text, 音频, 文件, or 智能体 消息 depending on 信任 and 设置. Search and pin behavior follow the current Social release; unread 状态 syncs from your local 资料 store.

#### 11.3 联系人与发现

联系人 shows bonded 对等节点 with 信任层级 badges; 发现 surfaces 能力 or tag-based lookups where 策略 allows. Strangers remain heavily 限流 until you accept a 绑定请求. Block or 降级 信任 from the 联系人 detail sheet if a relationship changes.

#### 11.4 Groups

Create a 群组 from 对话, add bonded 联系人, and set a title and avatar. 群组 消息 use the same signed 信封 路径 as 直接 chat with 群组 routing metadata. Only add participants you 信任 at the 敏感度等级 you 计划 to 分享 in the 群组.

#### 11.5 知识库与资料库

资料库 is the in-app 知识库: create Markdown 笔记, 导入 documents, and toggle per-item 敏感度. The 策略 engine honors four ranks — `公开`, `friends`, `trusted`, `private` — while the UI 暴露 friendlier labels for the ones you pick most often. Saved 笔记 索引 into RAG automatically. Optional Obsidian and MCP plugins are 配置 under 设置 → AI → 知识库.

#### 11.6 Browser

浏览器 loads permitted `envoy://` mesh content through your 节点's 策略 boundary. You see what 绑定 rules and 敏感度 labels allow—not the open web by default. Use it to read 发布 笔记 and mesh pages from bonded or 公开 authors.

#### 11.7 协作任务

协作任务 appear where 智能体网络 is 启用. Your 智能体 orchestrates work across opted-in bonded 智能体; you review 计划, 预算, and results in the 协作任务 UI. 启动 with small objectives before enabling automatic 成本 重新平衡 策略.

#### 11.8 Terminals

终端 attach to Shell 会话 on the home 节点 via WebSocket, including from chat inline or the dedicated 终端 view. Sessions require 认证 through the 节点 and respect your 审批 设置 for 智能体 command 执行. 远程 attach from EnvoyGo tunnels through the home JSON-RPC transport.

#### 11.9 Approvals and activity

审批 queues sensitive 智能体 or 任务 actions awaiting your decision; Activity (审计) shows allow/deny 结果 with 关联ID. Approve or reject from Social or CLI (`npm 运行 CLI -w @envoymesh/节点 -- 审批 ...`). Use 关联ID to stitch multi-step 协作任务 or 中继-assisted flows.

#### 11.10 Profile

资料 edits your human-visible 身份 and shows 所有者, 设备, and 智能体 identifiers. It is the right place to copy 配对 information and 验证 which 设备 you are on. Changes propagate to 联系人 on the next signed 资料 update they receive.

#### 11.11 Settings

设置 控制 发现 资料, AI engines, 外部智能体 桥接, 知识 plugins, 通知, and 节点 behavior flags. Changes write to `节点-配置.json`, `桥接-配置.json`, and related 文件 in your 资料 目录. Restart or follow in-app prompts when a 设置 requires a 节点 reload.

#### 11.12 连接与智能体状态指示

Header badges show WebSocket/Social 连通性, mesh reachability, EnvoyAI gateway health, and external 桥接 状态 when 配置. Yellow or red 状态 mean you should fix 连通性 before sending sensitive data. EnvoyGo shows a parallel connection indicator for home reachability.


### 12. 连接你的第一个联系人

#### 12.1 What pairing and bonding do

配对 exchanges enough information to identify and reach another 所有者; bonding 记录 the 信任 relationship and 策略 tier. A packaged 桌面 构建 may also add the project sponsor 联系人 from `bundled-sponsor-friend.json` on first launch; 操作员 can 禁用 that bundle before 部署.

#### 12.2 Pair with a QR code

Open Add 联系人 on one 设备 and Show My Code on the other, then scan with the built-in scanner in Social or EnvoyGo. Confirm the displayed 所有者 ID and display name match what you expect in person. Complete the 绑定请求 flow before treating the 联系人 as trusted.

#### 12.3 Pair with an invitation link

Generate an invitation link or multiaddr 载荷 from 联系人 and 分享 it over a 渠道 you 信任 (Signal, in-person AirDrop, etc.). The recipient opens the link in Social to initiate 配对. Treat leaked links like leaked 手机 numbers—吊销 or ignore unexpected 绑定 requests.

#### 12.4 Pair on a local network

On the same LAN, mDNS 发现 may list nearby 节点 without manual multiaddrs. 启动 both 节点 with default 发现 or `--listen /ip4/0.0.0.0/TCP/0`, then pick the 对等节点 from the 发现 UI. LAN 配对 is the fastest way to validate signing and chat before testing 中继 路径.

#### 12.5 Verify identity information

Before accepting a 绑定, compare 所有者 ID, display name, and optional proof text out of band. Signed 信封 prove possession of 密钥, not that you know the person—your proof step closes that gap. Reject requests that do not match what your 联系人 said they would send.

#### 12.6 Choose an appropriate trust level

EnvoyMesh 信任层级 are 阻止, 公开 (stranger), 推荐, and 直接 (friend). 启动 new acquaintances at 公开 or 推荐 unless you already have a strong 信任 basis. 直接 unlocks richer 知识 分享 and 智能体 collaboration; 升级 only deliberately.

#### 12.7 Accept a bond request

Incoming 绑定 requests appear in 联系人 or 通知 with the sender's proof 消息. Accept to 记录 mutual 信任 locally; reject leaves them at stranger tier. Either side can later change tier or block from 联系人 设置.

#### 12.8 Send the first message

Open the new 联系人 线程 and send a short signed chat 消息. Watch for delivered or read indicators according to your release. If the 消息 stalls, check 连通性 status before resending duplicates.

#### 12.9 Confirm direct or relay-assisted delivery

Successful delivery shows positive acknowledgment in-线程 or an 审计 `chat.消息` allow row. 中继-assisted 路径 use `/P2P-circuit` addresses learned from `中继.lookup`; 直接 LAN 路径 skip 中继 hops. CLI 审计 with `--include-P2P-追踪` helps confirm which 路径 was used during testing.

#### 12.10 Troubleshoot pairing

验证 both 节点 运行, firewalls allow outbound TCP, and 资料 路径 match between UI and CLI. For WAN tests, confirm 引导 中继 multiaddrs and 运行 `连通性-status`. Retry with freshly copied listening multiaddrs after restarts because dynamic ports change.

#### 12.11 内置赞助联系人

A packaged 桌面 构建 (DMG / `.exe` / `.AppImage`) auto-绑定 to the project's sponsor 联系人 on first launch using the bundled `bundled-sponsor-friend.json`, so you 启动 with one working 联系人 out of the box. This is a convenience, not telemetry: no data leaves your 节点, and the 绑定 is a normal local 信任 记录 you can edit or remove like any other 联系人. 操作员 preparing 集群 images can 禁用 the auto-绑定 by 设置 `{"启用": false}` in the bundled 文件 before packaging.


### 13. 连接 EnvoyGo

#### 13.1 How EnvoyGo works with a home node

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 780 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:780px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="340" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">EnvoyGo (phone)</text><rect x="40" y="40" width="300" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="190.0" y="52.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Pairing tokens only</text><text x="190.0" y="68.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">no owner private keys</text><rect x="40" y="80" width="300" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="190.0" y="92.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">HomeRemote JSON-RPC</text><text x="190.0" y="108.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">read-only mirror</text><rect x="40" y="120" width="300" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="190.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Native WebRTC + CallKit</text><text x="190.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">voice calls (Phase 42I)</text><rect x="400" y="10" width="360" height="180" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="408" y="26" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Home Node (computer)</text><rect x="420" y="40" width="320" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="580.0" y="52.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Owner identity + keys</text><text x="580.0" y="68.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Ed25519 root</text><rect x="420" y="80" width="320" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="580.0" y="92.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault + Library + Agent</text><text x="580.0" y="108.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">full mesh features</text><rect x="420" y="120" width="320" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="580.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Orchestration</text><text x="580.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">Team jobs · approvals</text><path d="M360,55 L420,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">QR pair</text><path d="M420,75 L360,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">signed responses</text><text x="40" y="215" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Keys, vault, and agent runtime never leave the home node. The phone is a remote control.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 12 —— EnvoyGo 瘦客户端配对：手机仅持有配对令牌，通过 JSON-RPC 调用家庭节点。身份、保险箱、智能体与编排保留在家庭节点。</figcaption></figure>


EnvoyGo connects to a paired home 节点 and presents selected NodeService functions through a 移动 interface. The home 节点 keeps mesh 身份, 智能体运行时, 保险箱, and orchestration responsibility.

#### 13.2 Pair the mobile app

安装 EnvoyGo, tap 配对 with Home, and scan the QR code shown in Social on the 桌面 节点 (or enter the 配对 载荷 your release documents). Approve the 设备 on the home 节点 if prompted in 配对 Queue. The app stores 配对 tokens in secure 存储, not 所有者 private 密钥.

#### 13.3 Confirm the home connection

After 配对, the connection indicator should show home reachable and load your chat list. 拉取 to refresh or open Me → 节点 status if 线程 stay empty. Ensure the 桌面 节点 stays 运行 and reachable on the 网络 路径 you expect (LAN, 中继 tunnel, or 配置 远程 URL).

#### 13.4 Use chat and contacts

Chats and 人员 tabs mirror home-节点 线程 and bonded 联系人 with 移动 layouts. Sending a 消息 routes through HomeRemote JSON-RPC to the home 节点, which signs and delivers on the mesh. Media and 音频 消息 follow the same 路径.

#### 13.5 Use remote terminals

From 终端, attach to an existing 会话 or 启动 one 允许 by home 策略. Input travels over the tunneled 终端 协议; output streams back with scrollback. Avoid sensitive commands on untrusted 网络 until you confirm transport 加密 and home reachability.

#### 13.6 View 协作任务

Me → 智能体网络 shows read-only recent 协作任务 activity synced from the home 节点. You can inspect status and 报告 but cannot orchestrate new jobs from 移动 alone—启动 jobs from 桌面 chat with your 智能体. The UI says 协作任务 even when 日志 use older internal 术语.

#### 13.7 Browse mesh content

The EnvoyGo 浏览器 (阶段 45C) opens `envoy://` content through the paired home service. 可用性 depends on the home 节点 being reachable and on the requested author or content being permitted by 绑定策略.

#### 13.8 Receive notifications

EnvoyGo can receive normal and 通话-related 通知 when APNs or FCM is 配置. iOS backgrounded calling uses VoIP 推送 + CallKit (阶段 42I) and the operating system grants 权限. Delivery remains best effort and is affected by 平台 background restrictions.

#### 13.9 拨打与接听语音通话

可用 移动 通话 support covers one-to-one 语音通话 with 原生 WebRTC and 平台 通话 integration. iOS ships VoIP 推送 + CallKit (阶段 42I, shipped 2026-06-19) so backgrounded phones can receive 通话; real-设备 验证 is still open. Video calling is not yet 可用 (see §18.10 and 附录 J.4). TURN may be required for cross-网络 音频 when both 对等节点 sit behind restrictive NAT.

#### 13.10 Revoke a lost phone

From the home 节点, 吊销 the EnvoyGo 设备 or 会话 配对 and rotate any 暴露 tokens. Remove the 节点 entry in EnvoyGo if you recover the 手机 later and need a clean re-配对. Treat a 丢失 unlocked 手机 like a 丢失 会话 to your home API.

#### 13.11 Current mobile limitations

EnvoyGo does not 运行 a full mesh 节点, orchestrate 协作任务, edit all 设置, or replace home-节点 保险箱 authoring. Video 通话, full 浏览器 parity, and background 可靠性 vary by OS 权限. See release 笔记 for the exact 功能 matrix on your 构建.


### 14. 首日教程

#### 14.1 Send a private message

绑定 a 联系人 (Chapter 12), open their 线程, type a short 消息, and send. Confirm the delivery indicator updates. If it fails, open Home status and 验证 mesh 连通性 before retrying once.

#### 14.2 创建群组 conversation

From 对话, choose New 群组, select bonded 联系人, name the 群组, and send a hello 消息. Each 成员 receives 群组 信封 signed by your 节点. Adjust 成员资格 later from 群组 设置 if your release 暴露 it.

#### 14.3 Send an audio message

In chat, tap the microphone 控制, 记录 a brief clip, and send. The 音频 rides inside a signed chat 信封 and plays inline for recipients. Grant microphone 权限 when the OS prompts on 桌面 or EnvoyGo.

#### 14.4 发起语音通话

With a 直接-信任 联系人, 启动 a 语音通话 from the 线程 header. Accept the incoming 通话 on their 设备; media flows 点对点 after mesh signaling. If connection fails behind strict NAT, 配置 TURN as documented for your release.

#### 14.5 共享文件

Use the attachment 控制 in chat or 分享 from 资料库/保险箱 according to 敏感度 rules. 文件 传输 as data 意图 with 策略 checks on 路径 and 信任层级. Confirm the recipient sees the attachment and 审计 日志 an allow 结果.

#### 14.6 Ask EnvoyAI a question

Open your 智能体 线程 or main assistant entry point and ask a factual question answerable from your 保险箱 or 公开 知识. EnvoyAI 运行 locally on the 节点 gateway unless you routed engines differently. Deny or refine if the 智能体 requests 审批 for a sensitive 工具 通话.

#### 14.7 添加知识 to your Library

Open 资料库 → New 笔记, write Markdown, set 敏感度, and save. Indexing 运行 automatically for RAG. Optionally open the 保险箱 文件夹 in Obsidian if you 启用 the plugin and want external editing.

#### 14.8 Search your Vault

Use 资料库 search or ask EnvoyAI to search local 知识 with explicit scope. CLI users can 运行 `npm 运行 CLI -w @envoymesh/节点 -- 保险箱-search --保险箱 ./shared_vault --query "your terms"`. Results respect 敏感度 labels and your role on the 节点.

#### 14.9 Ask a bonded agent for knowledge

消息 a 联系人's 智能体 or send a 知识 query where the UI supports it, staying within their 信任层级. 公开-tier queries are 限流 for strangers; 直接 绑定 allow richer scope. Expect signed responses attributable to their 智能体身份.

#### 14.10 Approve a sensitive action

When an 智能体 or 任务 触发器 策略, an 审批 card appears in 审批. Read the 摘要, 关联ID, and requested action before allowing. Reject if the scope exceeds what you intended for that 会话.

#### 14.11 Start a simple Team job

In chat with your 智能体, describe a small multi-step objective that can 委托 to a bonded 对等节点's 智能体 (for example summarize then translate). Confirm 智能体网络 成员资格 is on for both sides. Review the 计划, 预算 cap, and final 协作任务 报告 before 分享 externally.

#### 14.12 连接外部智能体

In 设置 → AI → Ext 智能体, pick HomeClaw, Hermes, or Custom and point to the local HTTP 端点 (`HTTP://127.0.0.1:8010/消息` for HomeClaw by default). 启动 the external 进程, 启用 the 桥接, and send a test chat 消息 to the 桥接 智能体 对等节点. 验证 callbacks arrive on the 配置 listen port before enabling 自动化.


---

## 第 III 部分 —— 联系人、资料与对话

### 15. 联系人与绑定

#### 15.1 查看与搜索联系人

Open **人员** in Social or the 联系人 tab in EnvoyGo to 浏览 bonded 所有者 and pending introductions. Search by display name or 所有者 ID fragment; results respect your local 信任 store, so 阻止 联系人 stay hidden unless you explicitly show them. EnvoyGo lists the same 联系人 through HomeRemote JSON-RPC—it does not 维护 a separate 联系人 数据库 on the 手机.

#### 15.2 了解联系人身份

Each 联系人 maps to an **所有者身份** (`envoy:所有者:…`) backed by Ed25519 密钥, not a central 账户 handle. 运行时 消息 use 对等节点 IDs derived from 密钥; compare 所有者 ID and any out-of-band proof before 升级 信任. QR 配对 (Chapter 13) adds **设备** 身份 under the same 所有者—it does not replace 所有者-to-所有者 绑定.

#### 15.3 联系人资料与照片

资料 cards show display name, description, and 照片 the 联系人 发布 within 绑定策略. 照片 arrive as signed 资料 or 文件 载荷; 推荐 and 公开 tiers may see fewer fields than 直接 friends. Tap a 照片 to view full size; do not treat gallery thumbnails as 验证 身份 proof by themselves.

#### 15.4 Online, offline, and connection states

在线状态 reflects mesh reachability, not a 云 "在线" flag. A 联系人 may show 离线 while 消息 queue for 中继-assisted delivery when they return. EnvoyGo shows home 连通性 separately from 远程 对等节点 reachability—your 手机 can be 在线 to home even when the 联系人 is not.

#### 15.5 直接, referred, public, and blocked trust

EnvoyMesh uses four user-selectable tiers for 联系人 — **阻止** (deny all), **公开** (stranger—ping and narrow 发现 only), **推荐** (introduced—limited 知识 and 审批), and **直接** (friend—richer chat, 文件, and 智能体 workflows up to friends 敏感度). Tier is stored locally on your 节点; both sides can set different tiers toward each other.

#### 15.6 更改联系人信任层级

Open the 联系人 in Social → **信任** (or equivalent 设置) and pick 阻止, 公开, 推荐, or 直接. 降级 takes effect immediately for new 运维; already-delivered content remains in local history until you delete it. Document why you changed tier—审计 rows help if you later review an incident.

#### 15.7 推荐或介绍联系人

Use **Introduce** or 绑定-request flows to vouch for someone at 推荐 tier without granting 直接 信任 yourself. Introductions carry signed proof text so the recipient can 验证 out of band. 推荐 联系人 cannot recruit your 智能体 into 协作任务 until you deliberately 升级 them.

#### 15.8 静音、阻止或移除联系人

**Mute** suppresses 通知 locally without changing 绑定 tier. **Block** sets 阻止 信任 and 停止 new inbound 意图. **Remove** clears local 线程 metadata but does not erase their 密钥 from the 网络—re-add only after you are comfortable with renewed 联系人.

#### 15.9 恢复连接

To reconnect after block or accidental removal, exchange a fresh 绑定请求 or 介绍 with updated proof text. If you 吊销 their tier, they must accept a new request; stale 线程 may not resume automatically. 验证 身份 again before 恢复 直接 信任 or 分享 文件.

#### 15.10 联系人隐私与披露设置

资料 and 联系人 设置 控制 what you 发布 and what you request from others: display fields, 照片 可见性, and 敏感度 labels on 分享 知识. 默认值 lean conservative for 公开-tier viewers; 直接 联系人 see richer 资料 slices. Changes propagate on the next signed 资料 update, not retroactively to old screenshots.


### 16. 私信

#### 16.1 发起对话

From **人员**, open a 直接 联系人 or pick an existing 线程 under **Chat**. New 对话 require at least 公开-tier reachability and a successful 绑定 or 介绍 路径. 群组 rooms use separate creation flows (Chapter 17); do not assume a DM 线程 exists for every 联系人 until you send the first 消息.

#### 16.2 人对人消息

Private chat uses the `chat.消息` 意图 with **human** sender and **human** recipient roles—智能体 cannot impersonate this 路径. 消息 are signed 信封 delivered over libp2p 直接 or 中继-assisted 路径. Compose in Social or EnvoyGo; the home 节点 signs and sends on your behalf when using 移动.

#### 16.3 人对智能体消息

Talking to **@envoy** or your 配置 智能体 name routes through 智能体-capable chat flows, not `chat.消息` 人对人 semantics. 智能体 replies may invoke 工具 under 授权 and 绑定策略. Keep 所有者-facing instructions separate from 对等节点 DMs so you do not accidentally 分享 private context with a 联系人 线程.

#### 16.4 回复与对话连续性

Replies reference prior 消息 through 线程 metadata and 关联ID in 审计 日志. Quote or reply in-线程 to preserve context; resending the same text creates duplicate 信封. Search (16.7) helps locate earlier turns when a long DM splits across 会话.

#### 16.5 消息投递状态

Delivery indicators reflect local send acknowledgment and 远程 acceptance when your 构建 暴露 them—not read receipts unless explicitly supported. Failed sends show 策略 or 连通性 errors; read 审计 for `chat.消息` deny vs transport 超时. Avoid rapid duplicate sends while a 消息 is still pending.

#### 16.6 离线行为与重试

When a 联系人 is 离线, the home 节点 queues signed 消息 where 协议 and 策略 allow and retries over 直接 or 中继 路径 on reconnect. Large backlogs may arrive out of strict UI order but remain integrity-checked by 签名. EnvoyGo 离线 to **home** prevents any send until the tunnel 恢复.

#### 16.7 搜索对话历史

Use in-app search or 保险箱-adjacent 对话 索引 where 启用 to find text by keyword or 联系人. Results come from locally stored copies on the home 节点; 移动 search queries home over JSON-RPC. Sensitive 线程 remain visible only on 设备 paired to that 节点.

#### 16.8 草稿辅助

Draft assistance (when 启用) suggests completions through your 配置 模型 with semantic-防火墙 limits—it does not auto-send. Review suggested text before sending; 智能体-assisted drafts in 联系人 线程 still obey 绑定 tier and 敏感度. 禁用 assistance in 设置 if you prefer manual composition only.

#### 16.9 管理对话数据

Export, archive, or delete 对话 data from 线程 menus or 资料 维护 工具 on the home 节点. Deletion is local to your store unless a product 功能 explicitly requests 远程 retraction—which is not guaranteed for already-delivered 对等节点 copies. Back up before bulk purge (Chapter 89).

#### 16.10 消息隐私与安全

消息 inherit transport 加密 from libp2p where 协商; 授权 still depends on 签名 and 绑定策略, not TLS alone. Do not paste secrets into chats with 推荐 or 公开 联系人. 报告 abuse via block tier and preserve 审计 关联ID if you escalate.


### 17. 群组对话

#### 17.1 创建群组

In Social, choose **New 群组** (or Rooms) and name the room. Initial 成员 must be 联系人 you can reach under current 信任—typically 直接 or 推荐 depending on 策略. The creating 节点 stores 成员资格 locally; new 成员 receive signed invites through mesh delivery.

#### 17.2 邀请成员

Add 成员 from your bonded 联系人 list; you cannot invite 阻止 所有者 or strangers without an 介绍 路径. Each invite is a signed 成员资格 意图; pending 成员 appear until they accept. Large 群组 increase fan-out 延迟—prefer focused rooms for time-sensitive coordination.

#### 17.3 发送群组消息

群组 消息 use room-scoped chat 意图 with human senders; delivery fans out to 在线 成员 and queues for 离线 ones where supported. @mentions and replies follow the same threading rules as DMs within the room context. EnvoyGo 群聊 mirrors home 线程 once paired.

#### 17.4 管理成员

所有者 with 管理员 rights (per your 构建) can add or remove 成员 and rename the room. Removing someone 停止 new deliveries to them but does not erase history on their 节点. Rotate admins deliberately—被入侵的管理员 设备 can invite unwanted 成员.

#### 17.5 退出群组

Choose **Leave 群组** to 停止 receiving new 消息; your past copies remain on your 节点 until you delete them. Other 成员 continue the room. Rejoin requires a fresh invite if 成员资格 is not automatically 恢复.

#### 17.6 群组信任边界

群组 可见性 does not bypass per-成员 信任: a 推荐 成员 still cannot 访问 直接-only 文件 分享 you send outside the room. Sensitive attachments should use explicit 敏感度 labels. Do not treat 群组 成员资格 as mutual 直接 friendship with every participant.

#### 17.7 群组投递与离线成员

离线 成员 receive queued room 消息 on reconnect; ordering may batch during catch-up. If many 成员 are behind 中继-only 路径, expect delayed delivery indicators. Check home 连通性 before assuming the room is broken.

#### 17.8 群组故障排查

If 消息 stall, 验证 each 成员’s 绑定 tier, home reachability, and 中继 reservation. 审计 rows tagged with the room 关联ID show deny vs 超时. Split 故障排除: 策略 denials need 信任 changes; transport failures need 连通性 work (Chapter 91).


### 18. 语音消息与通话

#### 18.1 录制并发送语音消息

Hold the microphone 控制 in a DM or 群组 线程 to 记录 a short 音频 clip; release to attach and send. 音频 rides the same signed 文件/消息 路径 as other attachments with size caps enforced by 入站守卫. Prefer text for 推荐 联系人 unless they expect voice 笔记.

#### 18.2 播放与管理语音附件

Tap an 音频 bubble to play; long-press for save or delete locally where supported. Playback decodes on 设备; very long clips may be rejected at send time. Manage 存储 under 对话 设置 if attachments accumulate.

#### 18.3 发起语音通话

启动 a **语音通话** from the 通话 button in a bonded 直接 线程 on Social or EnvoyGo. Calls 协商 WebRTC 音频 between 对等节点 with home-节点 signaling; video is not 可用 in current builds. Both sides need microphone 权限 and reachable mesh or 中继 路径.

#### 18.4 接听或拒绝通话

Incoming 通话 surface as in-app banners and, on EnvoyGo, 平台 通话 UI when 配置. Decline sends a signed reject; answer establishes the WebRTC 会话. Unknown or 阻止 联系人 should not reach 通话 UI if 策略 is working—验证 信任层级 if 通话 appear unexpectedly.

#### 18.5 通话状态与控制

In-通话 控制 include mute, speaker routing, and hang up; status shows connecting, active, or failed 阶段. Dropped 通话 may retry manually—there is no hidden auto-redial. 笔记 关联ID in 审计 if you 报告 persistent failure.

#### 18.6 后台通话与移动通知

EnvoyGo can receive 通话 通知 via APNs/FCM when 推送 is 配置; background behavior depends on OS 策略. Keep the app paired to home and allow 通知 权限 for reliable ringing. 桌面 Social may use local 通知 without 移动 推送.

#### 18.7 STUN 与 TURN 连接

WebRTC tries 直接 UDP first, then STUN, then 配置 TURN when both 对等节点 sit behind symmetric NAT. 配置 TURN in 设置 if 通话 connect but have no 音频. 中继 libp2p 路径 carry signaling—not a substitute for TURN media 中继.

#### 18.8 Call privacy

Voice 通话 require at least 直接 or 推荐 信任 per product 策略; 阻止 联系人 cannot initiate 通话. Call metadata appears in 审计; media stays 点对点 when WebRTC succeeds. Do not 分享 screen or video—视频通话 remain 计划中 (18.10).

#### 18.9 语音通话故障排查

If 通话 fail to connect, check microphone 权限, TURN 设置, 绑定 tier, and `连通性-status`. One-way 音频 often means NAT or 防火墙 blocking UDP. Test LAN 直接 路径 first, then 中继-assisted WAN before opening broad 防火墙 rules.

#### 18.10 Video calls —— 计划中，当前不可用

**计划中.** One-to-one 音频 calling is 可用 today (§18.3); video calling is architecturally anticipated but not shipped in the current release. See 附录 J.4 for the roadmap boundary.


### 19. 文件、照片与资料共享

#### 19.1 共享文件

Use the attachment or **分享 文件** action in a DM or 群组 允许 by 信任层级. 文件 块 and 传输 with integrity checks; 直接 friends typically have the broadest limits. Name 文件 clearly—recipients see filenames before accepting.

#### 19.2 接受或拒绝收到的共享

Incoming 分享 prompt accept or decline before writing to 保险箱 or Downloads per 敏感度. Declined 传输 do not partial-write; accepted 文件 land in 策略-scoped 存储. On 移动, acceptance may require home 在线 to complete.

#### 19.3 查看传输进度

Progress bars reflect bytes acknowledged on the 传输 凭证 路径; stalled progress usually means 连通性 loss mid-stream. Wait for retry or 取消 and resend smaller 文件. 审计 may 日志 partial 传输 without storing incomplete secrets in the 日志 body.

#### 19.4 校验文件完整性

Compare displayed 哈希 or size metadata when your 构建 暴露 them; 签名 prove sender 身份, not that the 文件 is benign. Scan unfamiliar binaries locally before opening. Re-send if 哈希 mismatch 报告 after completion.

#### 19.5 共享资料照片

分享 资料 照片 through 资料 → Gallery → 发布 or send to a 联系人. 发布 照片 obey 可见性 tier; 直接 分享 attach to a 线程 like other media. EnvoyGo displays 照片 fetched via home—editing gallery is primarily a 桌面 Social flow.

#### 19.6 管理你的资料相册

维护 ordered gallery slots on the home 节点; reorder or remove images before they propagate in the next 资料 同步. Removing a gallery image 停止 future 获取 but not copies already saved by 联系人. Keep at least one neutral avatar for 推荐 viewers if you use 公开 发现.

#### 19.7 选择可见性与敏感度

Tag 分享 with 敏感度 matching 保险箱 conventions (`公开` / `friends` / `trusted` / `private`). The UI 暴露 friendlier labels for the most common choices; the 策略 engine honors all four ranks. Down-tier 联系人 cannot escalate 敏感度 at receipt—the 绑定 engine denies incompatible requests. Default to friends or private for documents with personal data.

#### 19.8 移除共享内容

Delete local copies from 线程 attachments or 保险箱 路径; 远程 对等节点 may retain their accepted copies unless a retraction 功能 exists in your 构建. 资料 照片 removal updates your signed 资料 on next 发布. For incidents, block the 联系人 and 吊销 信任 (Chapter 87).

#### 19.9 排查文件传输

For stuck 传输, 验证 信任层级, 文件 size limits, 磁盘 space on home 保险箱, and 中继 reachability. Retry on a stable 网络 with a smaller test 文件 to isolate 策略 vs transport. Collect 审计 关联ID before 分享 diagnostics (Chapter 91).


### 20. 资料与在线状态

#### 20.1 编辑你的人类资料

Edit **资料 → Human** in Social to set display name, bio, and 发布 fields. Changes serialize into signed human 资料 载荷 stored on the home 节点. EnvoyGo shows the result read-only unless your release adds 移动 editing.

#### 20.2 编辑你的智能体资料

智能体 资料 describe 能力 暴露 to 对等节点 (工具, 协作任务 roles, A2A card fields). Edit under 资料 → 智能体 or 智能体网络 设置; 所有者 授权 bounds what the 智能体 may 广告. Misleading 能力 text does not grant extra 权限—绑定策略 still gates actions.

#### 20.3 显示名称与描述

Display names are cosmetic; 授权 uses 所有者 and 对等节点 IDs. Keep descriptions concise—公开-tier viewers may see shortened fields. Avoid embedding secrets or 恢复 codes in 公开 bio text.

#### 20.4 资料照片与相册

Human and 智能体 资料 can each carry 照片 galleries with tier-aware 可见性. Upload on 桌面 Social; 同步 propagates to 联系人 on 资料 获取. Large images may be downscaled to respect size limits.

#### 20.5 身份详情与 DID

The 资料 details pane shows 所有者 DID, 设备 IDs where relevant, and 指纹-style 哈希 for verification. 分享 these out of band when confirming 身份—do not 信任 unsolicited IDs in chat alone. QR 配对 encodes 设备 配对 载荷, not 所有者 DID substitution.

#### 20.6 已绑定联系人能看到什么

直接 联系人 see the richest 资料 slice your 策略 发布; 推荐 联系人 see reduced fields; 公开 strangers see only 公开-敏感度 资料 data if 暴露. 阻止 联系人 see nothing new from you. Review **资料 可见性** 设置 before enabling 发现 功能.

#### 20.7 资料同步

资料 updates 推送 on signed 发布 events; 联系人 refresh on next 获取 or 线程 open. There is no global 云 资料 CDN—对等节点 learn changes when they communicate with your 节点. After 密钥 rotation, republish 资料 so fingerprints match.

#### 20.8 隐私默认值

Initial 隐私 默认值 favor minimal 公开 暴露: conservative 照片 可见性, friends-level 聊天历史 on home, and 智能体 工具 禁用 until mandated. Review 默认值 after 安装 before joining 发现 主题. Reset 路径 are in 设置 → Privacy where 可用.


---

## 第 IV 部分 —— 你的个人 AI

### 21. 认识 EnvoyAI

#### 21.1 EnvoyAI 是什么

EnvoyAI is your 所有者-facing assistant on the home 节点, powered by the bundled OpenClaw 运行时. You talk to it from Social, EnvoyGo, or `@envoy` in chat; it 计划 replies and 通话 mesh 工具 through EnvoyMesh 策略 rather than getting raw libp2p 访问. Think of it as the brain that stays inside the 安全 boundary while the 节点 handles 身份, 绑定, and 审计.

#### 21.2 OpenClaw 作为内置智能体运行时

OpenClaw 运行 as a child 进程 the 节点 启动 and supervises. Its gateway listens on port `18789` by default (`HTTP://127.0.0.1:18789/webhook/envoymesh`). EnvoyMesh passes each Assistant turn 会话 context—绑定, interests, and the 工具 catalog—and OpenClaw owns multi-turn reasoning and persistent 记忆 across 会话.

#### 21.3 EnvoyAI 与外部智能体桥接的区别

EnvoyAI is in-进程 with full ToolRegistry 访问. The 外部智能体桥接 (default port `3031`) is an optional HTTP pipe to HomeClaw, Hermes, OpenHuman, or a custom 智能体 in another 进程. You can 运行 both engines (`both` mode) or either alone; the 桥接 智能体 never receives your libp2p 密钥.

#### 21.4 EnvoyAI 可访问什么

EnvoyAI reads your local 保险箱 and 资料库 within 敏感度 labels, queries bonded 对等节点 through `知识.query`, and uses chat RAG when 知识库 设置 allow. It cannot bypass 绑定 tiers: strangers stay 限流, and private material requires 直接 信任 or 所有者 审批. 配置 ceilings under 设置 → AI → 知识库 and per-联系人 偏好 before enabling auto-replies.

#### 21.5 EnvoyAI 可用的 mesh 工具

At startup the 节点 exports a 工具 catalog to OpenClaw—chat send, 资料库 read/discover, 任务 propose, 发现, 审批, 触发器, MCP proxy, and more. Each 工具 declares a 敏感度上限 and whether it needs 所有者 审批 before 执行. EnvoyAI chooses 工具 by name; EnvoyMesh enforces 策略 and writes an 审计 row for every 通话.

#### 21.6 策略与审批控制

绑定引擎 decisions, 授权 limits, and the 审批队列 sit between EnvoyAI and the mesh. Outbound chat, 文件 分享, 云 模型 通话, and high-敏感度 保险箱 reads queue for your review unless an autonomous 策略 explicitly allows them. Flip `autonomousKillSwitch` in 设置 to pause all autonomous actions and force 审批 on everything the 智能体 would have done silently.

#### 21.7 启动、停止与检查智能体

Open 设置 → AI → AI Engine to see OpenClaw status: 启用 flag, 运行 状态, PID, and last error if the gateway failed. Use **Restart OpenClaw** for a clean child-进程 recycle without restarting the whole 节点. Toggling `openclawEnabled` off 停止 the gateway immediately and prevents spawn on the next 节点 启动—useful when debugging port conflicts on `18789`.

#### 21.8 Current limitations

Chat drafts and lightweight auto-replies still route through EnvoyMesh's 原生 模型 router for speed; complex Assistant turns go to OpenClaw with fallback to 原生 when the gateway is down. Full chat-history injection into OpenClaw context and 多轮 工具 loops within one turn remain partial—会话 记忆 works, but recent 线程 text may not always be attached. 终端 智能体 mode uses the 原生 模型 directly, not OpenClaw exec.


### 22. AI 引擎模式

#### 22.1 仅内置

**Built-in only** (`openclaw-only`) is the default on fresh 安装: `openclawEnabled` is on and `bridgeEnabled` is off. EnvoyAI handles Assistant chat, 工具 执行, and 会话 记忆; no external HTTP 智能体 listens on `3031`. Choose this when you want one bundled 运行时 and no second 智能体 进程.

#### 22.2 内置加外部智能体

**Built-in plus external** (`both`) 运行 EnvoyAI and the 桥接 together. mesh traffic from bonded 联系人 can reach the 桥接 智能体 while you still use OpenClaw for `@envoy` and 设置 → AI workflows. 启用 `bridgeEnabled`, pick an active 外部智能体 in `桥接-配置.json`, and confirm both status chips in the header before relying on either 路径.

#### 22.3 仅外部智能体

**External 智能体 only** (`ext-only`) 禁用 the OpenClaw gateway (`openclawEnabled: false`) but keeps the 桥接 active. All bridged chat and mesh 工具 通话 go through your 外部智能体's HTTP 端点; EnvoyAI Assistant turns are unavailable. Use this when HomeClaw or Hermes is your primary brain and you only need EnvoyMesh for 连通性 and 策略.

#### 22.4 No AI

**No AI** (`off`) turns off both engines. The 节点 still routes human chat and 策略, but no 模型 drafts, auto-replies, or 智能体 工具 运行. Select this for air-gapped 节点, CI fixtures, or when you need mesh 连通性 without any LLM surface.

#### 22.5 选择合适的模式

启动 with **built-in only** for the simplest 路径. Add **external** when you already 运行 HomeClaw/Hermes and want its plugins or 记忆 模型. Use **both** only when you deliberately want two 智能体—otherwise pick one brain to avoid duplicate replies. Switch to **off** temporarily rather than 卸载 when testing 连通性 alone.

#### 22.6 切换当前外部智能体

External 智能体 are defined in `桥接-配置.json` under `extAgents`; set `activeExtAgentId` to the entry you want. Each definition includes display name, base URL, bearer token, and 能力 flags. After editing, restart the 节点 or reload 桥接 配置 so the new destination binds to port `3031` (or your 配置 `bridgeListenPort`).

#### 22.7 启动设置与运行时设置

`openclawEnabled` and `bridgeEnabled` are persisted in `节点-配置.json` and take effect on 节点 启动—or immediately 停止 a 运行 gateway when flipped off. 运行时 status (`getOpenClawStatus`, `getBridgeStatus`) shows whether child 进程 are actually healthy, which can lag 配置 during startup. 模型 提供商 mode, AI rules, and 联系人 偏好 also persist to `节点-配置.json` and apply on the next 智能体 turn without restart.

#### 22.8 诊断智能体可用性

If EnvoyAI shows **停止**, read `lastError` on the OpenClaw status panel—common causes are port `18789` in use, a missing OpenClaw binary, or repeated watchdog restart failures. For the 桥接, 验证 loopback reachability, bearer token match, and that exactly one active 智能体 is selected. CLI helpers include 连通性 status; Social's header badges mirror the same effective mode as 设置 → AI → AI Engine.


### 23. 模型与提供商

#### 23.1 模型路由概述

EnvoyMesh uses two tiers: the **原生 router** (`@envoymesh/模型`) serves chat drafts, auto-replies, 终端 assist, and Team-job 计划; **OpenClaw** serves Assistant/`@envoy` turns with its own LLM 配置. 原生 routing respects the 语义防火墙 (empty prompts rejected, 48K char cap, 控制-character filter). When OpenClaw is unavailable, Assistant requests fall back to the 原生 提供商 you 配置.

#### 23.2 配置本地模型

Set 提供商 mode to **ollama** in 设置 → AI → 模型 (or `节点-配置.json`). Point `端点` at `HTTP://127.0.0.1:11434/v1` and set `modelName` to your pulled tag (for example `llama3.1`). Local 通话 skip 云 审批 gates and keep prompts on your machine—ideal for drafts and sensitive 保险箱 context.

#### 23.3 配置远程提供商

Use **openai-compatible** or **anthropic-compatible** mode with the vendor base URL and `apiKey`. Set `modelName` to the 远程 模型 ID. Keep `requireApprovalForCloud: true` (default) so non-公开 context 触发器 an 审批 item before the request leaves your 节点.

#### 23.4 配置 LiteLLM

**litellm** mode targets a LiteLLM proxy (typically `HTTP://127.0.0.1:4000/v1`) that fans out to many backends. Set `modelName` to the LiteLLM route name and supply the proxy API 密钥 if required. This is the flexible choice when one home 节点 should switch 模型 without editing EnvoyMesh 配置.

#### 23.5 选择默认模型

Pick one 原生 模型 for chat drafts and auto-replies; OpenClaw manages its own 模型 separately in OpenClaw 设置. Prefer a fast, inexpensive 模型 for drafts and a stronger 模型 (local or proxied) for Assistant if you split configs. Document your choice in the 资料 README so 恢复 on a new machine stay consistent.

#### 23.6 配置降级行为

When 原生 mode is **禁用**, drafts and assist 功能 return errors instead of calling a 模型. When OpenClaw is down, Assistant turns degrade to the 原生 提供商 automatically. For LiteLLM or 云 端点, 验证 fallback routes inside LiteLLM itself—EnvoyMesh does not 链 multiple 原生 提供商 in one request.

#### 23.7 上下文窗口考量

Large 保险箱 RAG injections and long Team-job prompts consume context quickly. The 语义防火墙 caps prompt size at 48K characters for 原生 通话. Trim 知识库 `maxChunks` or lower per-联系人 syndication ceilings when you see truncated answers. OpenClaw 会话 记忆 is separate—very long Assistant 线程 may need manual 会话 reset.

#### 23.8 提供商隐私

**mock** mode never 通话 an external 网络—useful for tests. **ollama** and local LiteLLM keep bytes on LAN. 云 modes send prompt text to the 配置 vendor; 配对 with 敏感度 labels and `requireApprovalForCloud` so private 笔记 do not leave without explicit consent. OpenClaw's own 模型 通话 follow OpenClaw 配置, not the 原生 router.

#### 23.9 成本控制

协作任务 and competitive award modes track spend in 授权; set `maxCost` and 重新平衡 策略 under 链 默认值. For chat, prefer local 模型 for high-volume auto-replies and reserve 云 模型 for occasional Assistant turns. Review Activity for correlated 云 通话 after enabling auto-send rules.

#### 23.10 排查模型调用

Empty or rejected prompts usually mean semantic-防火墙 验证 failed—check for 控制 characters or excessive length. Connection errors on Ollama/LiteLLM point to wrong `端点` or a 停止 service. Persistent 云 denials often mean an 审批 is pending: open 审批 before retrying. Set mode to **mock** temporarily to confirm the 智能体 loop 运行 without external dependencies.


### 24. 智能体风格、模式与联系人行为

#### 24.1 智能体沟通风格

Under 设置 → AI → 身份, choose **transparent** (default), **invisible**, or **defensive** presentation. Transparent replies openly as an AI; invisible drafts as if you typed them (still signed with 智能体 role on the wire); defensive acts as a gatekeeper when you appear 离线. Optional `debugPrefixInMessageText` adds a prefix in 日志 only—Social hides it in the UI.

#### 24.2 智能体运行模式

Global 默认值 live in `aiSettings.defaultModeForNewContacts`: **manual** (draft only), **assistant** (suggest + confirm), or **auto** (send when 策略 allows). 在线/离线 behavior is 控制 separately: `onlineAssistantEnabled` keeps suggestions while you are active; `offlineAgentEnabled` permits auto-reply when the 节点 thinks you are away. Set `statusMode` to manual if automatic 在线状态 detection misreads your schedule.

#### 24.3 按联系人设置模式

Each 联系人 can override global 默认值 with `aiAccessLevel`: **none**, **assistant_only**, or **full**. None blocks AI participation for that 对等节点; assistant_only allows drafts and gated sends; full 启用 richer 自动化 including rule 触发器. Set these from the 联系人 detail sheet or via `mesh.set-联系人-mode` during 智能体-assisted 设置.

#### 24.4 按联系人设置披露规则

`knowledgeAccess` caps what 保险箱 material the 智能体 may cite for a 联系人 (`公开`, `friends`, `trusted`, or `private`). Optional `syndicationMaxSensitivity` tightens inbound answers you syndicate to that 对等节点. `disclosure` 设置 (badges, collapse 对等节点 智能体 to 联系人) are local UI only—they do not change wire 载荷. Align disclosure with 信任层级 before enabling auto-send.

#### 24.5 社交代理行为

**Social proxy** (requires 信任 mode) lets EnvoyAI mediate intros and standing social workflows under a signed 授权. 启用 `socialProxyEnabled` only after `trustModeEnabled` is on and you have 配置 a 授权 ID. The 协调代理 respects `autonomousKillSwitch`—when kill switch is on, proxy passes 停止 even if the 功能 flag is set.

#### 24.6 主动问候

Proactive behavior combines AI rules, 触发器, and friend autopilot (`friendAutopilotEnabled`). Rules match greetings, keywords, or 联系人 访问 levels and choose draft, auto_send, gatekeep, or defer actions. Rate limits (`autoReplyLimits`) cap hourly and daily auto-replies per 联系人 so a single 线程 cannot spam while you are away.

#### 24.7 暂停或限制自动化

Toggle **autonomousKillSwitch** for an immediate global pause—every autonomous action becomes an 审批. Pause individual 触发器 from 设置 or `mesh.update-trigger`. Lower a 联系人 to **assistant_only** or **none** to 停止 auto-send for one relationship without disabling EnvoyAI entirely.

#### 24.8 重置智能体行为

Clear AI rules, reset 联系人 偏好 to 默认值, and 关闭 social proxy and autopilot flags in 设置 → AI. Restart OpenClaw if 会话 tone drifted across long 线程. For a hard reset, 禁用 EnvoyAI, clear pending 审批 you no longer need, re-启用, and re-test with a single bonded 联系人 at **manual** mode.


### 25. 会话与记忆

#### 25.1 什么是会话

An EnvoyAI 会话 binds your ongoing Assistant 对话 to OpenClaw's 记忆 store via a stable `sessionId`. 所有者 turns in Social's EnvoyAI chat, `@envoy` mentions, and 终端-correlated 计划 分享 this binding so follow-up questions stay coherent. Sessions are local to the home 节点—not replicated to EnvoyGo except through live RPC.

#### 25.2 对话上下文

Each OpenClaw request carries 所有者 interests, bonded 联系人 names with 信任 levels, and the exported 工具 catalog. 原生 chat drafts use a slimmer 上下文窗口 through the 模型 router. 关联ID in 审计 日志 stitch a single turn across 工具 通话—use them when reviewing Activity after a complex exchange.

#### 25.3 短期与长期记忆

OpenClaw retains short-term 线程 状态 inside the active 会话 and longer recall through its own 记忆 subsystem (including optional MCP 桥接 like Memex when 配置). EnvoyMesh does not duplicate that long-term store in the 保险箱 by default. Treat OpenClaw's workspace and 记忆 plugins as the source of truth for "what the assistant remembers."

#### 25.4 搜索记忆

Use OpenClaw-facing 工具 or 配置 MCP search (`memex_search` by default in 知识库 设置) to query external 记忆 索引. Inside EnvoyMesh, `mesh.chat_rag_search` retrieves indexed chat and 资料库 snippets for 智能体 turns. Results inherit 敏感度 labels—do not 暴露 private RAG 块 to 公开 联系人.

#### 25.5 会话摘要

Call `mesh.session-摘要` or list 会话 via `mesh.list-sessions` to inspect OpenClaw 线程 metadata without opening the gateway UI. Summaries help before handing off a 任务 to 协作任务 or filing 审计 笔记. They are 操作员-oriented views, not wire 消息 to 联系人.

#### 25.6 更正过时记忆

When OpenClaw 状态 a stale fact, correct it in the Assistant 线程 and, if using Memex or similar, update or archive the source card. Adjust 资料库 笔记 that fed RAG so the next `mesh.chat_rag_search` returns current text. Per-联系人 偏好 may also need updating if the error involved disclosure scope.

#### 25.7 删除记忆

吊销 external 记忆 entries through the MCP 工具's archive/delete 路径 配置 in 知识库 设置. Clear OpenClaw 会话 状态 by 启动 a new 会话 ID (restart gateway for a full wipe). Removing local chat 日志 does not erase OpenClaw 记忆 until you delete on that side too.

#### 25.8 保留与隐私

Session and 记忆 data live under your 资料 目录 and OpenClaw workspace 路径 with `0600` 文件 modes. Back up the 资料 before OS migration. 云 记忆 plugins follow their vendor retention—禁用 them for air-gapped 部署.

#### 25.9 跨设备记忆

EnvoyGo displays live Assistant replies from the home 节点 but does not host OpenClaw 记忆 locally. All persistent recall stays on the home machine where the gateway 运行. 配对 a new 手机 does not copy 会话 history unless you 恢复 the home 资料.

#### 25.10 当前聊天历史集成的边界

Full recent-chat injection into every OpenClaw turn is not complete—绑定 and interests attach reliably; verbatim 线程 scrollback may be partial. 原生 auto-replies use current 消息 text only. 计划 important 连续性 by referencing 资料库 笔记 or explicit summaries in your prompt until chat-日志 integration ships.


### 26. 工具

#### 26.1 什么是智能体工具

A 工具 is a named, 模式-described action the 智能体 can invoke—send chat, query 知识, list 审批, etc. EnvoyMesh 注册 工具 in `ToolRegistry`, evaluates 绑定策略 and 敏感度, then 执行 or queues 审批. Every invocation produces an 审计事件 with 工具 name, 延迟, and 关联ID.

#### 26.2 浏览可用 mesh 工具

In Social, open 设置 → AI → 工具 (or ask EnvoyAI to list 工具). CLI and 桥接 clients can 通话 `mesh.MCP.list_tools` when MCP proxying is 启用. The startup catalog exported to OpenClaw mirrors the same names—`mesh.*` prefix for mesh 运维, plus standard chat/知识 entries.

#### 26.3 知识与资料库工具

Use `mesh.library_list`, `mesh.library_read`, `mesh.library_discover`, and `mesh.chat_rag_search` to read local 笔记 and query indexed content. `mesh.知识.query` (and 任务 variants) reaches bonded 对等节点' 公开 or permitted 索引. 敏感度 ceilings on each 工具 prevent exfiltrating private 保险箱 路径 to strangers.

#### 26.4 联系人与消息工具

`chat.send` and mesh 发现/hello 工具 let the 智能体 find 联系人 and draft 消息. Sends to non-trivial 敏感度 usually enter the 审批队列 rather than delivering immediately. 信任 intro 工具 (`mesh.intro.*`) appear only when 信任 mode is 启用 on the 节点.

#### 26.5 文件共享工具

分享 flows through `mesh.share_propose`, `mesh.library_request_share`, `mesh.transfer_status`, and gallery helpers. Raw 文件 传输 above 策略 ceiling requires 所有者 审批 and explicit 对等节点 accept. Check `mesh.share_list_pending` before assuming a 传输 completed.

#### 26.6 任务与智能体网络工具

`mesh.任务.propose`, `mesh.任务.await_result`, and `mesh.capability_provider.启动` participate in 对等节点 任务 and 协作任务. 智能体 card 工具 (`mesh.agent_card.request`, `mesh.list_agent_network_workers`) support 工作节点 发现. Competitive award flows may enqueue `chain_award` 审批 when spend or 竞价 rules 触发器.

#### 26.7 审批与升级工具

`mesh.list-pending`, `mesh.approve`, `mesh.reject`, `mesh.reject-all`, and `mesh.escalate` let the 智能体 surface work to you or pause when uncertain. Prefer 升级 over silent failure when confidence is low or sentiment is negative. The 智能体 should not approve its own queued items unless 策略 explicitly allows auto-resolution.

#### 26.8 MCP 工具

`mesh.MCP.list_tools` and `mesh.MCP.call_tool` proxy to 配置 MCP HTTP servers (for example Memex). Each 通话 inherits the same 审批 and 审计 路径 as 原生 工具. 注册 only MCP servers you 信任— they 执行 with the 节点's local 网络 访问.

#### 26.9 启用或禁用访问

禁用 信任 intro 工具 by turning off `trustModeEnabled`. Pause MCP servers in 知识库 设置. Use `autonomousKillSwitch` to block 执行 of autonomous 工具 链 without removing the catalog. 桥接 智能体 receive a filtered mesh 工具 list via the HTTP 桥接— not the full 注册表.

#### 26.10 审查工具执行

Open Activity and filter by 工具 or 关联ID. Each row shows allow/deny, 远程 对等节点, and 摘要 text. For 桥接 traffic, also check `mesh.list-external-智能体-actions`. Cross-check pending 审批 if a 工具 returned "queued" instead of `ok: true`.


### 27. 触发器、计划与摘要

#### 27.1 创建触发器

Triggers live in the 节点 触发器 store and fire proactive actions. Create time-based (cron, interval, or one-shot), event-based (消息 received, 联系人 在线/离线), or 主题-based (keyword match) 触发器 from 设置 → AI → 自动化 or via `mesh.add-trigger`. Each 触发器 declares an action type—send chat, query 知识, send 摘要, notify 所有者, or follow up—and a daily fire cap.

#### 27.2 更新或移除触发器

Edit conditions or pause a 触发器 with `mesh.update-trigger`; delete with `mesh.remove-trigger`. Paused 触发器 retain history but do not fire. After changing cron expressions, confirm the next scheduled time in the 自动化 panel so timezone mistakes do not surprise you.

#### 27.3 安排提醒与动作

Time 触发器 accept cron strings, ISO `at` timestamps, or `intervalMs` for repeating checks. The 节点 evaluates due 触发器 on its periodic loop and 记录 `trigger.fired` 审计事件. Chat sends from 触发器 still pass 审批 策略—high-risk templates queue instead of auto-sending.

#### 27.4 配置活动摘要

Digest 设置 (`mesh.set-digest-schedule`, `mesh.get-digest-配置`) 控制 **daily**, **weekly**, or **off** summaries written under your 资料 `digests/` 目录. Toggle sections: 外部智能体 通话, 发现 queries, 绑定 changes, proactive actions, and pending 审批. When a 摘要 is ready, Social emits a `digest:ready` event you can open from Activity.

#### 27.5 晨报与发现摘要

**Morning 报告** (`getMorningReport`) ranks recent 发现 events and 信任-store signals—a separate, on-demand 发现 摘要 from periodic activity 摘要. 运行 it from Social 发现 panels or CLI `morning-报告` when evaluating new 公开 对等节点. It does not send mesh 消息 by itself.

#### 27.6 跟进与主动检查

Follow-up actions re-open a 联系人 线程 after delays you define in 触发器 metadata. Proactive check-ins combine 离线 detection (`offlineAgentEnabled`) with rules and 触发器— for example, defer a draft when sentiment is negative. Escalations from proactive passes appear in 审批 with `proactive_checkin` or `follow_up` action types.

#### 27.7 勿扰时段与通知偏好

Per-domain **智能体 可见性** (`instant`, `brief`, `silent`, `审批`) 控制 推送 noise for 任务, intros, and 报告 without 停止 the underlying 自动化. Use **silent** overnight and **审批** during focus blocks so only 审批-needed events interrupt you. This is 通知 loudness, not a separate cron quiet-hours clock—combine with paused 触发器 for true blackout Windows.

#### 27.8 审查自动化历史

Filter Activity for `trigger.fired`, 摘要 generation, and proactive 智能体 events. Each entry includes 触发器 name, action type, and 关联ID. Compare against `mesh.list-triggers` status fields (`firesToday`, `lastFiredAt`, `lastError`) when a schedule misfires.

#### 27.9 停止自动化

Hit **autonomousKillSwitch** to halt all proactive firing immediately. Individually 禁用 触发器, 关闭 `offlineAgentEnabled`, or set 摘要 frequency to **off**. 取消 in-flight proactive chat by rejecting the 审批 item before it 到期.


### 28. 审批与升级

#### 28.1 为什么 EnvoyMesh 会请求审批

审批 enforce 所有者 consent for actions that exceed 绑定 tier, 敏感度上限, or autonomous 策略: outbound chat drafts, 知识 分享, 云 模型 通话, 发现 forwards, 摘要, and Team-job awards. The queue is the 控制 surface between 智能体 意图 and mesh 执行—nothing in the pending list has been sent yet.

#### 28.2 审查待处理动作

Open **审批** in Social or 通话 `listPendingApprovals` from CLI. Each item shows title, draft content, action type, priority, and request timestamp. Read the draft as if it would send verbatim—edits after 审批 are not automatic unless you reject and ask the 智能体 to regenerate.

#### 28.3 检查联系人、数据与能力范围

Inspect context fields: 联系人 所有者 ID, display name, 敏感度等级, requested 能力, and linked 触发器 name if 自动化-fired. Confirm the recipient matches your 意图 and the 敏感度 label fits the relationship tier. Reject if the 智能体 requested private data for a 公开 or 推荐 联系人.

#### 28.4 批准动作

Approve from the 审批 panel or CLI approve command; the executor 运行 the underlying 工具 or send 路径 and marks the item resolved. Approved sends propagate as normal signed 信封. 云 模型 审批 unblock the specific 原生 router 通话 tied to the item.

#### 28.5 拒绝单个或全部动作

Reject with an optional 笔记 so 审计 shows 所有者 意图. `mesh.reject-all` clears the queue when you distrust a batch—for example after a misconfigured auto rule. Rejection does not penalize the 联系人; it only blocks that draft.

#### 28.6 升级原因

Items escalate to **escalated** status when confidence is below 0.6, sentiment is negative, or 敏感度 score exceeds the threshold. Manual 升级 via `mesh.escalate` flags thorny 线程 for 所有者 attention even when 策略 might allow auto-send. Escalated items stay visible until acknowledged.

#### 28.7 确认升级

Use **Acknowledge** in 审批 or `mesh.acknowledge-升级` after you have read the context—even if you reject the underlying action. Acknowledgment clears urgent signaling without approving the draft. 配对 with a 联系人 mode change if the 对等节点 should stay on manual assist going forward.

#### 28.8 过期审批

Pending items expire after seven days by default; 到期 entries cannot be approved without a new 智能体 request. The 节点 periodically purges 到期 IDs and 日志 the count. If you routinely miss the window, switch risky 联系人 to manual mode and raise 可见性 to **审批** only.

#### 28.9 智能体网络授予审批

Competitive 协作任务 may enqueue **`chain_award`** items when a 工作节点 竞价 needs 所有者 sign-off on spend or selection. Review 竞价 price, 工作节点 身份, and 授权 预算 before approving. 直接 award mode skips 竞价 but still respects 授权 `maxCost`.

#### 28.10 避免审批疲劳

启动 new 联系人 in **manual** mode, 启用 auto-send only for trusted 对等节点, and use autonomous 策略 with tight 敏感度 ceilings. Prefer **brief** or **审批** 智能体 可见性 so low-value activity does not ping you. 审计 weekly: if the same rule generates noise, pause the 触发器 or narrow its keywords.


---

## 第 V 部分 —— 知识、资料库与网络内容

### 29. 知识体系概述

#### 29.1 知识库、资料库、保险箱与 RAG

The 知识库 is the user experience, the 资料库 organizes discoverable items, the 保险箱 stores local 文件, and RAG retrieves relevant 块 for an 智能体 prompt. These layers work together but have different 安全 and 生命周期 responsibilities.

#### 29.2 本地优先存储

Your 保险箱 文件 and 资料 metadata live on the home 节点's 磁盘 first—typically under the 资料's 保险箱 目录 with `笔记/`, `documents/`, `收件箱/`, and `.envoy/` metadata. Nothing requires a 云 同步 service for ordinary reading or editing in Social 桌面. Paired EnvoyGo reads and writes through home RPC; it does not hold a full 保险箱 replica on the 手机 by default.

#### 29.3 笔记、文件与结构化信息

Markdown 笔记 are created in the 资料库 UI and stored under `保险箱/笔记/` with optional subfolders you define. Imported PDFs, Word 文件, images, and plain text land in `documents/` or legacy 保险箱 路径 and join the same 索引. Structured `.envoy/敏感度.json` overrides track per-item 可见性 independent of 文件夹 layout.

#### 29.4 可见性与敏感度

Each item carries a 敏感度 tier—公开, friends, trusted, or private—控制 by the 发布 toggle and Obsidian frontmatter when plugins are 启用. 绑定 map 对等节点 信任层级 to the maximum 敏感度 they may read or receive in 联合 responses. Changing 敏感度 re-索引 RAG 可见性 without moving 文件 on 磁盘.

#### 29.5 搜索与检索

Local search scans indexed 保险箱 块; chat RAG retrieves the best matches to ground 模型 answers with citations. 远程 对等节点 use `知识.query` for natural-语言 search or `库.read` for 路径-based byte 检索 when 浏览 发布 网页内容. These 路径 differ: search synthesizes or ranks text; 资料库 read serves 文件 verbatim.

#### 29.6 受信任的远程知识

Bonded 联系人 may query 联合 知识 within ceilings you set per relationship. Strangers on the 公开 tier can query only 公开 笔记 through 限流 `知识.query` and see a stripped wiki-link graph. 联邦 RAG 合并 local and 远程 块 when 策略 allows, preserving source attribution in responses.

#### 29.7 来源与哈希

Content 哈希 指纹 保险箱 bytes and appear in 发现 matches, 浏览器 verification, and IPFS export metadata. 哈希 let recipients confirm they received unaltered 文件 without trusting filename alone. Publishing updates may change bytes at a stable 路径; 验证 哈希 when integrity matters more than friendly titles.

#### 29.8 发布与浏览

阶段 45 adds URL-addressable mesh pages under `envoy://所有者/路径` served from the home `web/` 目录 with per-entry 可见性. Social 浏览器 and paired EnvoyGo 浏览器 render Markdown, images, and PDFs like a lightweight web client. 订阅源 and 主题 通知 (45E) alert followers when authors 发布, but 获取 remains 拉取-based via `库.read`.

#### 29.9 IPFS 集成

Optional IPFS export 发布 content-addressed copies of selected 资料库 items through Helia or Kubo integrations. CIDs complement mesh 发现 but do not replace 绑定-gated `库.read` for authorized 浏览. Treat IPFS as 分发 and verification aid, not as implicit 权限 to ignore 敏感度 labels.

### 30. 创建与组织知识

#### 30.1 创建 Markdown 笔记

Open the 资料库 tab in Social, choose New 笔记, and enter Markdown in the editor; saves land in `保险箱/笔记/` automatically. The RAG pipeline re-索引 on save without restarting the 节点. Use `createNote` JSON-RPC when automating 笔记 creation from scripts or integrations.

#### 30.2 编辑与预览笔记

Switch between edit and preview modes to validate formatting before 分享 or publishing. Preview uses the same sanitization 路径 as chat rendering so you see roughly what bonded readers will see. EnvoyMesh does not silently rewrite 笔记 bodies except through explicit plugin 导入 flows.

#### 30.3 组织文件夹

Create subfolders under `笔记/` for research, work, or personal categories—the UI mirrors 保险箱 路径. 敏感度 remains per 笔记, so one 文件夹 can mix 公开 tutorials and private drafts. Obsidian users can organize the same 目录 externally while EnvoyMesh 索引 changes on refresh.

#### 30.4 添加文件

Drag or 导入 文件 into `documents/` for PDF, DOCX, images, and text formats the indexer supports. Large 导入 may take a moment to 块 for RAG; check 资料库 status if search lags. Received 对等节点 文件 arrive in `收件箱/` with separate handling from authored 笔记.

#### 30.5 Choose public, friends, trusted, or private visibility

Toggle 发布 in the 资料库 item editor or set Obsidian `发布: true/false` frontmatter when the Obsidian plugin is 启用. 公开 items join the stranger-queryable mesh; friends items require at least 推荐 绑定 tier; private items stay local and 智能体-only. Review labels before bulk 导入 that default to private.

#### 30.6 管理元数据

Titles, 路径, tags, and 敏感度 overrides form the metadata layer the 资料库 displays and 发现 matches against. `.envoy/敏感度.json` persists overrides across restarts. Avoid hand-editing metadata 文件 while the 节点 is 运行 unless you follow 操作员 备份 procedures.

#### 30.7 使用 Obsidian 集成

启用 the Obsidian plugin under 设置 → AI → 知识库 → Plugins, then point Obsidian at your 保险箱 目录 for rich editing. The plugin parses frontmatter, builds a wiki-link graph, and strips private links from stranger-facing responses. EnvoyMesh never writes Obsidian 文件 directly—all mutations go through Social or RPC.

#### 30.8 导入与导出内容

Export 笔记 for 离线 archives or 导入 markdown batches during migration from other 工具. 验证 敏感度 labels after 导入 because external 工具 may not understand EnvoyMesh tiers. Keep a 文件系统 备份 before bulk delete or 路径 rewrites that could orphan 索引 entries.

#### 30.9 安全删除知识

Delete removes 保险箱 文件 and 索引 entries together when using 资料库 delete actions or `deleteNote` RPC. 发布 web manifest entries may need separate unpublish steps if the item was 暴露 at an `envoy://` 路径. Confirm no bonded 对等节点 rely on 联合 copies before deleting authoritative originals.

### 31. 搜索与 RAG

#### 31.1 搜索本地知识

Use 资料库 search for keyword 检索 across indexed 保险箱 块 on your home 节点. Results show matching excerpts with 路径 so you can open the source 笔记 or document. Search respects 敏感度—you will not see private 块 in contexts meant for strangers.

#### 31.2 让 EnvoyAI 搜索

Ask EnvoyAI in chat to find information; it invokes RAG 工具 that retrieve 保险箱 块 before answering. Answers should cite 路径 or titles when attribution is 启用 in your 配置. 远程 模型 通话 still pass through the 语义防火墙 and 绑定 checks on outbound context.

#### 31.3 了解分块与匹配

RAG splits documents into 块 for embedding and 检索; matches are ranked by relevance to your query. 块 boundaries may split paragraphs, so read surrounding context in the source 文件 when precision matters. Re-indexing after large edits refreshes 块 boundaries automatically on save.

#### 31.4 审查来源归属

Review citations in chat or 知识 responses to confirm which 笔记 or 文件 supplied each claim. 联邦 results include 远程 所有者 identifiers so you know whether text came from your 保险箱 or a 对等节点's 联合 资料库. Save attributed excerpts with MCP write-back when you want a durable local copy.

#### 31.5 聊天 RAG 搜索

Chat RAG 运行 during assistant turns, combining 检索 with 模型 generation in one flow. It differs from manual 资料库 search because the 模型 synthesizes an answer grounded on retrieved 块. 禁用 or narrow 工具 if you prefer search-only interactions without generative summarization.

#### 31.6 跨受信任联系人的联邦 RAG

联邦 RAG queries opted-in 联系人 libraries within syndication ceilings 配置 under 信任 设置. Private 笔记 never leave your 节点; friends-tier material requires sufficient 绑定 tier on both sides. Conflicting facts from multiple 对等节点 should be resolved by reading originals, not trusting 合并 summaries alone.

#### 31.7 处理冲突结果

When local and 远程 块 disagree, open each cited source and compare 哈希 or timestamps. 模型 may over-合并 paraphrases; treat RAG output as a map to evidence, not as authority. Adjust syndication 设置 if a 联系人's 自动化 summaries are consistently misleading.

#### 31.8 保存有用结果

Use MCP write-back or manual 笔记 creation to store useful query results in your 保险箱 with default friends 敏感度. Include source 对等节点 and query text in the 笔记 body for future 审计. Avoid saving strangers' private-leak attempts—验证 敏感度 before publishing saved summaries.

#### 31.9 保护敏感信息

Keep 凭证, medical, and legal material at private 敏感度 unless you explicitly accept broader 暴露. 公开 mesh queries rate-limit strangers and strip non-公开 wiki links from responses. 审计 知识 queries periodically if you syndicate friends-tier content to 推荐 联系人.

### 32. 受信任的知识共享

#### 32.1 向已绑定联系人询问知识

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 720 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="40" y="40" width="140" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="110.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Local Vault</text><text x="110.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">files · notes</text><rect x="220" y="40" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="290.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Chunk Index</text><text x="290.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">embeddings</text><rect x="400" y="40" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="470.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">RAG</text><text x="470.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">in chat prompt</text><path d="M180,60 L220,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M360,60 L400,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><polygon points="620,35.0 680.0,60 620,85.0 560.0,60" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="620" y="64" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Sensitivity gate</text><path d="M540,60 L560,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="560" y="130" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="630.0" y="147.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Bonded Peer</text><text x="630.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">syndicated library</text><path d="M620,85 L620,130" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="400" y="130" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="470.0" y="147.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Attributed result</text><text x="470.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">save to vault</text><path d="M560,150 L540,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 16 —— 联邦 RAG：本地保险箱分块直接供给 RAG；联邦路径通过按联系人的敏感度上限门查询已绑定对等节点的资料库，返回带归属的结果。</figcaption></figure>


Send a `知识.query` 意图 to a bonded 联系人's 智能体 when you need their 联合 资料库 summarized or searched. The 远程 节点 applies its 绑定 tier, syndication ceilings, and 模型 routing before answering. Ask precise questions and expect natural-语言 responses, not raw 文件 dumps.

#### 32.2 公开、介绍与直接访问

公开 tier allows stranger queries with tight rate limits; 推荐 tier unlocks broader 联合 访问; 直接 tier allows friends-敏感度 分享. Each tier maps to deterministic 绑定策略 decisions logged in 审计. 升级 绑定 deliberately—推荐 访问 暴露 more than 公开 ping alone.

#### 32.3 共享笔记或文件

分享 笔记 or 文件 by sending chat attachments, data-传输 凭证, or publishing with appropriate 可见性. 凭证 copy bytes into the recipient 收件箱; publishing 暴露 metadata via 发现 or bytes via `库.read`. Pick the mechanism that matches whether you want a point copy or ongoing 浏览 访问.

#### 32.4 提议共享

Propose 分享 through 任务 or chat flows when your 工作流 requires explicit recipient acceptance. Proposals carry 敏感度 hints so recipients know what they are importing before indexing. 取消 proposals that stall to avoid ambiguous half-分享 状态.

#### 32.5 接受共享请求

Accept inbound 分享 requests only after verifying sender 绑定 tier and described 敏感度. Imported content lands in 保险箱 收件箱 or 资料库 lists with attribution to the 远程 所有者. Re-索引 or adjust 敏感度 if you intend to re-分享 material further.

#### 32.6 敏感度强制

The 绑定 engine denies requests that exceed 允许 敏感度 for the sender's 信任层级, even when users believe they are friends. Syndication max 设置 cap what leaves your 节点 during 自动化 queries. Test with a secondary 联系人 账户 if you tune syndication for a research 群组.

#### 32.7 联系人范围发现

联系人-scoped 发现 returns 发布 资料库 metadata for bonded 对等节点 without exposing private 路径. Matches include titles, 哈希, and optional CIDs—not full text until a follow-up read or query. Use scoped 发现 before wide searches to respect relationship boundaries.

#### 32.8 全网文档发现

Network-wide document 发现 广告 公开 发布 能力 on the DHT for strangers meeting 能力 and rate rules. It supports finding 公开 material, not enumerating private vaults. 操作员 should 监控 审计 for unusual query volume from 公开 对等节点.

#### 32.9 速率限制与防滥用

Stranger `知识.query` traffic is 限流 (on the order of a few queries per minute and tens per hour in default 配置). Abuse protection complements 绑定 denials to reduce scanning of 公开 笔记. 报告 persistent abuse by blocking 公开-tier 对等节点.

#### 32.10 防止意外披露

Double-check 发布 toggles before promoting 笔记 to 公开 or friends tiers, especially after Obsidian 同步. Web manifest 可见性 uses separate ACL fields—including 联系人 pickers for 联系人-only pages. Anti-enumeration returns `not_found` for unauthorized `库.read` attempts rather than confirming hidden 路径 exist.

### 33. 发布与浏览 mesh 内容

#### 33.1 `envoy://` 地址格式

mesh content URLs follow `envoy://envoy:所有者:<id>/路径/to/page` using permanent 所有者 IDs, not display names. `@handle` syntax parses but is rejected at 运行时 until a future 注册表 ships. 配对 URIs (`envoy://联系人?...`) remain distinct and must not be confused with content URLs.

#### 33.2 打开 mesh 页面

Open a mesh page from chat links, 浏览器 address bar, or 订阅源 通知 in Social 桌面. Paired EnvoyGo forwards `库.read` through the home 节点, so 浏览 away from home requires 连通性 to that 节点. Pages render Markdown, images, and PDFs with sanitized HTML where applicable.

#### 33.3 浏览历史

浏览器 back, forward, reload, and per-所有者 history behave similarly to a conventional web client within mesh constraints. Large binary bodies may arrive in ranged 块 with 哈希 verification at display time. Navigation guards prevent overlapping in-flight reads from corrupting the view 状态.

#### 33.4 创建书签

Bookmark frequently visited `envoy://` pages per 所有者 in 浏览器; autocomplete suggests recent 路径 as you type. Bookmarks stay local to your client 资料—they do not 同步 through a central 服务器. Export bookmarks manually if you rebuild a 设备.

#### 33.5 浏览作者

浏览 an author's site by opening their 所有者 root URL, which serves `索引.md` when present under `web/`. Blog, 资料, PhotoWall, and Bazaar templates organize 路径 by convention, not hard 模式. 可见性 still applies per 文件—seeing an 索引 does not imply 访问 to every subpath.

#### 33.6 浏览 Bazaar 内容

Bazaar and 订阅源 views aggregate discoverable 公开 or bonded content depending on manifest and 主题 订阅. 主题 follow (阶段 45E) helps match interests without GossipSub 推送 fanout on the wire. 发现 lists metadata first; opening an entry 触发器 `库.read` for bytes.

#### 33.7 发布页面

Author pages in Social place Markdown or media into `~/EnvoyMesh/web/` (or 资料-equivalent) and 注册 manifest entries with 可见性. Choose 公开, bonded, or specific-联系人 ACL before 分享 URLs in chat. Updating content changes bytes at the same 路径—notify followers via 订阅源 when updates matter.

#### 33.8 关注动态与主题

Follow 订阅源 and 主题 to receive 收件箱 通知 when authors 发布 matching material. 通知 link into 浏览器 with the originating `envoy://` URL. Unfollow 主题 you no longer want to avoid 通知 noise.

#### 33.9 更新已发布内容

Edit source 文件 locally, bump manifests, and republish when correcting typos or replacing media. Clients 验证 `contentHash` when reloading to detect changes since last visit. There is no built-in 版本 history URL—keep 保险箱 git or snapshots if you need rollback.

#### 33.10 外部 HTTP 网关 —— 计划中

**计划中.** The `envoy://` mesh-content 路径 is 可用 today; a 公开 HTTP gateway for non-mesh 浏览 is forward-referenced as 阶段 45F and is not part of the current release.


### 34. IPFS 与内容校验

#### 34.1 为什么 EnvoyMesh 使用内容哈希

哈希 identify content independently of filenames so recipients detect tampering after 传输 or IPFS 获取. EnvoyMesh surfaces 哈希 in 发现, 浏览器, and export dialogs. Treat 哈希 mismatch as a hard 停止 before trusting quoted text or binaries.

#### 34.2 将资料库内容导出到 IPFS

Export selected 资料库 items to IPFS when you want content-addressed 分享 outside immediate mesh 拉取 路径. Export respects 敏感度—do not pin material you would not 发布 at the same 可见性 tier. 记录 CIDs alongside mesh URLs when 分享 with hybrid audiences.

#### 34.3 Helia 集成

Helia integration embeds a lightweight IPFS 节点 suitable for 桌面 home 节点 exporting or verifying CIDs. 配置 Helia when you need in-进程 pinning without a separate Kubo daemon. 监控 磁盘 use because pinned blocks accumulate locally.

#### 34.4 Kubo 集成

Kubo integration targets 操作员 who already 运行 a Kubo daemon and want EnvoyMesh to interoperate with its API. Point 设置 at your local Kubo 端点 and 验证 连通性 before bulk export jobs. Kubo and Helia are alternatives—typically 启用 one strategy per 节点.

#### 34.5 通过网关校验内容

公开 gateways help humans 获取 IPFS CIDs through HTTPS for verification, but gateways are not 授权 layers. Compare gateway bytes to expected mesh 哈希 before treating content as authentic. Sensitive material should not rely on 公开 gateways for 访问 控制.

#### 34.6 固定与可用性

Pinning keeps IPFS blocks reachable; unpinned CIDs may disappear when no 对等节点 hosts them. mesh `库.read` remains authoritative for authorized live reads from the 所有者's home 节点. Use pinning for archival redundancy, not as a substitute for 保险箱 备份.

#### 34.7 隐私考量

Publishing to IPFS or 公开 mesh tiers 暴露 bytes to anyone who obtains the CID or URL regardless of friendly filenames. Private 保险箱 material should stay off export and unpublish lists. Review 阶段 44 stranger-query behavior before marking research 笔记 公开.

#### 34.8 Filecoin 持久化 —— 延期

**暂缓.** Helia and Kubo IPFS 路径 are 可用 today; Filecoin-based long-term persistence is designed but not part of the current release. See 附录 J.9.


### 35. 备份与恢复知识

#### 35.1 需要备份什么

Back up 所有者 密钥, 保险箱 目录, `.envoy/` metadata, web manifests, 资料 JSON 状态, and 审计 journals you need for compliance. 资料库 UI 状态 alone is insufficient without underlying 保险箱 文件. Document your 备份 schedule alongside 中继 or 模型 凭证 stored outside EnvoyMesh.

#### 35.2 备份保险箱

Copy the entire 保险箱 tree—including `笔记/`, `documents/`, `收件箱/`, and `.envoy/`—while the 节点 is 停止 or quiesced to avoid partial 文件. 验证 free space before large copies. 加密 备份 at rest if they contain friends-tier or private material.

#### 35.3 备份资料库元数据

资料库 metadata such as 敏感度 overrides and 发布 flags lives under `.envoy/敏感度.json` and related stores—include these with 保险箱 备份. 发布 web manifests under the 资料 目录 should 备份 with `web/` content. Missing metadata 恢复 文件 but may wrong-foot 可见性 until repaired.

#### 35.4 在同一节点恢复

恢复 保险箱 and 资料 data into the same 资料 路径, then restart the 节点 and 运行 索引 refresh if search seems stale. Confirm 绑定 and 信任 stores if you 恢复 partial 资料 trees. Test one private and one 公开 query before returning to 生产 use.

#### 35.5 迁移到另一台电脑

Moving to a new computer requires copying 资料, 保险箱, and 所有者 密钥 material, then reinstalling EnvoyMesh and re-配对 EnvoyGo 设备. Update 中继 引导 or port 设置 if 网络 layout changed. 吊销 old 设备证书 if the old hardware is discarded.

#### 35.6 校验恢复内容

After 恢复, spot-check 笔记 哈希, open sample `envoy://` pages, and 运行 资料库 search for known keywords. 联邦 queries to 联系人 should still work once 绑定 reload. 日志 discrepancies before deleting the old machine's 备份.

#### 35.7 移动数据边界

EnvoyGo does not replace the home 保险箱 on the 手机—it caches only what paired RPC 会话 获取 for UI display. 移动 备份 mean 备份 the home 节点 your 手机 pairs to, not expecting full 保险箱 export from EnvoyGo alone. Re-配对 QR codes after home 恢复 if 会话 tokens invalidate.

#### 35.8 安全修复受损本地数据

If 索引 corruption occurs, 停止 the 节点, 恢复 保险箱 from 备份, and allow re-indexing rather than deleting unknown 文件 blindly. Use 审计 日志 to identify which 运维 preceded corruption. 联系人 操作员 documentation before 运行 manual JSONL edits on metadata stores.

---

## 第 VI 部分 —— 外部智能体

### 36. 外部智能体概述

#### 36.1 什么是外部智能体

An 外部智能体 is a separately 运行 assistant that receives selected 消息 and invokes 允许 mesh 工具 through EnvoyMesh’s local HTTP 桥接. HomeClaw, Hermes, and OpenHuman use the 分享 `envoymesh-消息` contract.

#### 36.2 内置 EnvoyAI 与外部智能体

EnvoyAI/OpenClaw is bundled, deeper, and managed with the home 运行时. External 智能体 are 兼容性 integrations with independently maintained 智能体-side code and should be 启用 only when you 信任 that 进程.

#### 36.3 为什么外部智能体使用桥接

The 桥接 converts between plain HTTP requests and signed mesh 运维. This keeps networking 密钥, 绑定 checks, 能力 limits, and 审计 记录 inside EnvoyMesh.

#### 36.4 为什么外部智能体绝不获得原始 P2P 访问

Raw libp2p 访问 would let an 智能体 evade 身份 and 策略 boundaries. The 桥接 暴露 intentional 运维 instead, such as sending a 消息, finding 知识, or 执行 an approved 工具.

#### 36.5 外部智能体身份

The 桥接 智能体 has its own mesh 对等身份 derived from the 所有者 授权, distinct from the external 运行时’s internal user or 会话 IDs. Bonded 对等节点 消息 that 桥接 身份; EnvoyMesh signs outbound replies on its behalf.

#### 36.6 可用桥接工具

When 启用, compatible 智能体 may 通话 `GET /桥接/list-工具` and `POST /桥接/执行-tool` on port 3031. The catalogue reflects 绑定策略, 授权, and 所有者 审批—not every 工具 on the home 节点.

#### 36.7 会话与动作历史

External-智能体 会话 and action history appear in 设置 for review. Each inbound mesh 消息 and 工具 invocation is correlated in the 审计 JSONL so you can 追踪 what the 桥接 forwarded to the external 进程.

#### 36.8 权限、审批与吊销

High-risk mesh 运维 may still require 所有者 审批 even when the 桥接 forwards the request. 吊销 访问 by disabling the 桥接, clearing the active 预设, or rotating the Bearer secret 分享 with the 外部智能体.

#### 36.9 每个桥接仅一个活动外部智能体 URL

A 桥接 resolves one active external-智能体 URL at a time. You may retain several 预设, but switch the active 预设 rather than sending the same inbound event to several assistants and creating duplicate replies.

#### 36.10 选择集成

Pick one integration 路径: bundled EnvoyAI (OpenClaw on port 18789), HomeClaw (8010), Hermes (8020), OpenHuman (8021), or a custom `envoymesh-消息` adapter. Only one `agentUrl` is active per 桥接 资料 at a time.


### 37. 安全的智能体桥接

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 600 210" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:600px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="40" width="140" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="90.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Mesh Peer</text><text x="90.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded contact</text><rect x="220" y="40" width="160" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="300.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyMesh Node</text><text x="300.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bridge :3031</text><rect x="440" y="40" width="140" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="510.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">External Agent</text><text x="510.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">HomeClaw / etc</text><path d="M160,55 L220,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">① chat.message (signed)</text><path d="M380,55 L440,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="410.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">② POST agentUrl</text><path d="M440,75 L380,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="410.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">③ POST /bridge/send</text><path d="M220,75 L160,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">④ chat.message (node signs)</text><rect x="20" y="130" width="560" height="60" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="146" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">The agent never holds Ed25519 keys or speaks libp2p directly</text><text x="40" y="170" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">• to = inbound peer ID (not owner ID)    • Bearer secret gates /bridge/*    • messageId dedups retries</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 7 —— 外部智能体桥接：mesh 流量经由 EnvoyMesh 节点，由其代为签名。外部智能体接收纯 HTTP，并通过 /bridge/send 回复。</figcaption></figure>


#### 37.1 mesh 到智能体的消息流

When a bonded 对等节点 消息 the 桥接 智能体, EnvoyMesh 验证 the signed 信封 and POSTs a compact 消息 object to the 配置 智能体 URL. The object includes sender routing information, display context, text, and a unique 消息 identifier.

#### 37.2 智能体到 mesh 的回复流

The 外部智能体 replies by POSTing `{ to, text }` to `/桥接/send` on the local 桥接, normally port `3031`. The `to` value is the inbound mesh 对等节点 ID, not the 所有者 ID; EnvoyMesh signs and sends the outbound 信封.

#### 37.3 Bearer 令牌认证

Set a 桥接 secret so requests use `授权: Bearer <secret>`. Use a long random value, store it like a credential, and rotate it after suspected disclosure.

#### 37.4 消息标识与去重保护

The inbound `messageId` lets an 智能体 suppress repeated webhook deliveries. The OpenClaw extension also has a short content-哈希 fallback for older 桥接, but integrations should prefer exact 消息-ID deduplication.

#### 37.5 关联标识与同步回复

所有者-to-智能体 synchronous asks include a 关联ID. A matching `/桥接/send` resolves the pending local request; an unknown correlation receives a gone response so the 智能体 can retry instead of silently losing the answer.

#### 37.6 异步知识与发现回复

发现 and 知识 responses can arrive after the initiating 工具 通话. Compatible 智能体 should handle `mesh.async_reply` events and associate them with the user’s ongoing context.

#### 37.7 列出与执行 mesh 工具

`GET /桥接/list-工具` returns the 允许 工具 catalogue and `POST /桥接/执行-tool` invokes a selected 操作. Both remain subject to 桥接 认证, 工具 模式, 策略, and 审批.

#### 37.8 提议文件共享

An 智能体 can propose 分享 a 保险箱 item through `/桥接/智能体-分享-proposal`; it does not gain unrestricted 文件系统 访问. The 所有者 or 策略 路径 decides whether the 分享 proceeds.

#### 37.9 本地默认与网络暴露

The 桥接 listens on loopback by default. Do not 暴露 port `3031` directly to a LAN or the Internet; if 远程 访问 is necessary, place an authenticated, TLS-protected proxy in front and 限制 its source 网络.

#### 37.10 审计外部智能体活动

Filter 审计 日志 for 桥接 意图 and 工具 executions. Look for 远程 对等节点 IDs, 关联ID, allow/deny 结果, and 延迟. This is the authoritative 记录 when disputing what an 外部智能体 DID on your behalf.

#### 37.11 吊销外部智能体

禁用 **Ext 智能体** in 设置, clear or change `agentUrl` in 桥接 配置, and rotate the Bearer secret. 停止 the external 进程 so it cannot keep calling port 3031 with a stale credential.


### 38. OpenClaw 与 EnvoyAI

#### 38.1 OpenClaw 在 EnvoyMesh 中的角色

OpenClaw supplies EnvoyAI’s bundled assistant 运行时 and also supports the canonical EnvoyMesh 渠道 extension. That extension handles webhook 消息, reply routing, mesh 工具, asynchronous replies, and onboarding surfaces.

#### 38.2 内置运行时与权威 EnvoyMesh 扩展

The packaged 运行时 and `OpenClawExtension/` are maintained with EnvoyMesh, which makes this integration richer than the generic 兼容性 预设. The extension is also installable into another OpenClaw checkout.

#### 38.3 自动启动

The home 节点 normally 启动 OpenClaw automatically on gateway port `18789`. If it is 禁用 in startup 配置, 启用 it and restart the 节点 before expecting EnvoyAI responses.

#### 38.4 在其他 OpenClaw 环境安装扩展

To 安装 the 渠道 in another checkout, 运行 `./scripts/安装-openclaw-extension.sh /路径/to/openclaw --with-docs`, 安装 that checkout’s dependencies, and 配置 its EnvoyMesh webhook and 桥接 secret.

#### 38.5 配置 EnvoyMesh 频道

In OpenClaw 配置, 注册 the EnvoyMesh 渠道 with webhook 路径 `/webhook/envoymesh` on gateway port **18789** and set `bridgeUrl` to `HTTP://127.0.0.1:3031/桥接/send`. Match the Bearer secret to `桥接-配置.json` on the EnvoyMesh 节点.

#### 38.6 发送与接收 mesh 消息

Bonded 对等节点 chat with the 桥接 智能体 对等节点 ID; EnvoyMesh POSTs JSON to `HTTP://127.0.0.1:18789/webhook/envoymesh`. Replies go to `/桥接/send` with `to` set to the sender’s mesh 对等节点 ID (`envoy_…`), not the 所有者 DID.

#### 38.7 列出与执行 mesh 工具

The OpenClaw extension 暴露 `envoymesh_list_mesh_tools` and `envoymesh_execute_mesh_tool`, which proxy to the 桥接 on 3031. Tool 通话 still pass 绑定 checks and 语义防火墙 rules on the home 节点.

#### 38.8 处理异步 mesh 回复

发现 and 知识 responses may arrive asynchronously. The extension handles `mesh.async_reply` POSTs to the webhook and surfaces them as in-渠道 消息 so the 模型 can continue the 对话.

#### 38.9 使用入门与设置界面

运行 `openclaw onboard` or use the bundled Social 设置 flow to seed workspace, 桥接 secret, and 渠道 docs. Confirm the gateway 日志 注册 the EnvoyMesh HTTP route before testing with a bonded 联系人.

#### 38.10 管理扩展与 ClawHub

安装 optional OpenClaw extensions through ClawHub or symlinks; the EnvoyMesh 渠道 lives in `OpenClawExtension/`. macOS bundles more extensions than Windows; add others manually when needed.

#### 38.11 macOS 内置扩展选择

The macOS DMG includes a broader set of OpenClaw extensions for an integrated experience. This increases 包 size but reduces post-安装 设置 for common workflows.

#### 38.12 Windows 精简扩展包

The Windows installer packages the essential useful OpenClaw extensions rather than the full macOS set, keeping the bundle within practical size limits. Additional extensions can be 安装 separately when needed.

#### 38.13 从 Hermes 迁移

Use the bundled migration extension to 导入 Hermes memories, skills, or 凭证 into OpenClaw, then point `agentUrl` from `8020/消息` to the OpenClaw webhook. Back up both environments and 验证 imported secrets before switching 生产 traffic.

#### 38.14 排查 OpenClaw

If chat fails: confirm gateway on 18789, 桥接 日志 shows 3031, webhook 路径 matches, Bearer secrets align, and `to` on replies is a 对等节点 ID. 运行 `npm 运行 smoke:openclaw-桥接` from the repo for a local round-trip check.


### 39. HomeClaw

#### 39.1 HomeClaw 预设提供什么

HomeClaw is the default external-智能体 兼容性 预设 and conventionally receives 消息 at `HTTP://127.0.0.1:8010/消息`. EnvoyMesh supplies the 桥接 配置; HomeClaw supplies its 智能体运行时 and 渠道 implementation.

#### 39.2 兼容预设状态

**兼容性 预设.** The EnvoyMesh side is 可用, but 验证 the compatible HomeClaw release and its `channels/envoymesh` support before 生产 use.

#### 39.3 启动 HomeClaw

启动 HomeClaw so its EnvoyMesh 渠道 listens on **8010** (default `HTTP://127.0.0.1:8010/消息`). 验证 the 进程 is bound to loopback unless you deliberately 运行 智能体 and 节点 on different hosts.

#### 39.4 在设置中选择 HomeClaw

In **设置 → AI → Ext 智能体**, 启用 the 桥接 and choose the HomeClaw 预设. EnvoyMesh sets `agentUrl` to `HTTP://127.0.0.1:8010/消息` and 启动 转发 bonded 对等节点 chat to that 端点.

#### 39.5 配置消息 URL

Use the local default `HTTP://127.0.0.1:8010/消息` unless HomeClaw is intentionally bound elsewhere. Keep the 端点 on loopback whenever both 进程 运行 on the same host.

#### 39.6 配置回复桥接

配置 HomeClaw to return replies to `HTTP://127.0.0.1:3031/桥接/send`. Use the same Bearer secret on both sides.

#### 39.7 添加共享密钥

Generate a long random secret in 桥接 设置 and 配置 the same value in HomeClaw’s EnvoyMesh 渠道. Both inbound POSTs to 8010 and outbound POSTs to 3031 should send `授权: Bearer <secret>`.

#### 39.8 发送与接收消息

When a bonded 联系人 消息 your 桥接 智能体, HomeClaw receives `{from, fromOwnerId, fromName, text, messageId}`. Replies POST to `HTTP://127.0.0.1:3031/桥接/send` with `{to, text}` where `to` is the inbound `from` 对等节点 ID.

#### 39.9 使用 mesh 工具

If HomeClaw’s 渠道 implements 工具 proxies, it 通话 list/执行 端点 on 3031. Each 工具 remains subject to 绑定 tier, 授权 bounds, and 所有者 审批 queues on the EnvoyMesh 节点.

#### 39.10 权限与知识访问

知识 and 保险箱 reads flow through mesh 工具—not 直接 文件系统 访问. Tune HomeClaw’s own 权限 separately; EnvoyMesh still enforces 敏感度 ceilings and 联系人 scope on every 工具 通话.

#### 39.11 智能体端频道归属

The `channels/envoymesh` implementation lives in the HomeClaw repository. EnvoyMesh only 配置 URLs and secrets; 升级 or patch the 渠道 on the HomeClaw side when wire behavior changes.

#### 39.12 断开或吊销 HomeClaw

禁用 Ext 智能体 in 设置, 停止 HomeClaw, and rotate the 桥接 secret. Clear `agentUrl` or switch to another 预设 so queued mesh 消息 are not delivered to a 停止 进程.

#### 39.13 排查 HomeClaw

Common failures: HomeClaw not listening on 8010, secret mismatch, wrong reply `to` field, or 桥接 禁用. Check 节点 日志 for `[桥接] HTTP on …3031` and curl 8010/消息 with a test 载荷 plus Bearer header.


### 40. Hermes

#### 40.1 Hermes 预设提供什么

Hermes is a built-in 兼容性 预设 using the same 消息 contract, conventionally at `HTTP://127.0.0.1:8020/消息`. Its 知识-oriented 运行时 is maintained outside this repository.

#### 40.2 兼容预设状态

**兼容性 预设.** EnvoyMesh provides selection and bridging, not a guarantee about every Hermes 版本. Test the exact release and 配置 工具 before enabling it for 联系人.

#### 40.3 启动 Hermes

Launch Hermes with its EnvoyMesh adapter on **8020** (`HTTP://127.0.0.1:8020/消息`). Confirm the release you 运行 matches the 兼容性 预设 expectations in release 笔记.

#### 40.4 在设置中选择 Hermes

Select the Hermes 预设 under **设置 → AI → Ext 智能体**. EnvoyMesh points `agentUrl` at 8020 and 启用 the 桥接 listener on 3031 for return traffic.

#### 40.5 配置消息与回复 URL

Set inbound 消息 to `HTTP://127.0.0.1:8020/消息` and 配置 Hermes to reply via `HTTP://127.0.0.1:3031/桥接/send`. Keep both URLs on loopback for same-machine 设置.

#### 40.6 添加共享密钥

Copy the 桥接 secret from EnvoyMesh 设置 into Hermes’s EnvoyMesh 渠道 配置. Mismatched Bearer tokens produce 401 responses on both 8020 and 3031.

#### 40.7 发送与接收消息

Hermes receives the standard 桥接 载荷 on 8020. Outbound replies must target the sender 对等节点 ID from `from`; 所有者 DIDs will not route correctly on the mesh.

#### 40.8 使用知识与 mesh 工具

Hermes’s 知识-oriented 工具 map to mesh list/执行 通话 when implemented in its adapter. 保险箱 and 发现 results may return asynchronously through the same async-reply pattern OpenClaw uses.

#### 40.9 权限与审批

Hermes-side prompts and 记忆 are outside EnvoyMesh 策略. mesh-side 审批 still apply when a 工具 would exceed 授权 成本, 敏感度, or 联系人 scope.

#### 40.10 智能体端集成归属

Hermes 维护 its own integration code and release cadence. EnvoyMesh supplies the 预设 URLs and 桥接 安全 boundary only.

#### 40.11 从 Hermes 迁移 to OpenClaw

A bundled OpenClaw migration extension can 导入 supported Hermes 配置, memories, skills, or 凭证. Back up both environments and review imported secrets before switching the active 运行时.

#### 40.12 断开或吊销 Hermes

关闭 the Hermes 预设, rotate secrets, and 停止 the Hermes 进程. Consider migrating to OpenClaw with the migration extension if you need a supported bundled 路径.

#### 40.13 排查 Hermes

验证 8020 is reachable, secrets match, and Hermes 版本 supports `messageId` deduplication. Inspect 桥接 审计事件 for 拒绝 工具 通话 versus transport errors.


### 41. OpenHuman

#### 41.1 OpenHuman 预设提供什么

OpenHuman is a built-in 兼容性 预设 using the 分享 adapter, conventionally at `HTTP://127.0.0.1:8021/消息`. Its 智能体-side 运行时 remains an external project.

#### 41.2 兼容预设状态

**兼容性 预设.** 验证 the OpenHuman release, 端点 behavior, and consent 模型 independently; EnvoyMesh secures only the mesh-facing 桥接 boundary.

#### 41.3 为什么 OpenHuman 默认禁用

OpenHuman is 禁用 by default so 安装 EnvoyMesh never silently grants an unverified external 进程 访问 to 对话 or 工具. 启用 it only after 配置 and 信任 review.

#### 41.4 启动 OpenHuman

启动 OpenHuman with its adapter listening on **8021** (`HTTP://127.0.0.1:8021/消息`). Because OpenHuman is 禁用 by default, confirm you intentionally 启用 it after reviewing its consent 模型.

#### 41.5 启用并选择 OpenHuman

启用 OpenHuman in 桥接 设置 and select its 预设. EnvoyMesh will not auto-启动 OpenHuman; both the external 进程 and the Ext 智能体 toggle must be on.

#### 41.6 配置消息与回复 URL

配置 `HTTP://127.0.0.1:8021/消息` for inbound mesh traffic and `HTTP://127.0.0.1:3031/桥接/send` for replies. Document any non-default ports in both OpenHuman and `桥接-配置.json`.

#### 41.7 添加共享密钥

Set a 分享 Bearer secret in EnvoyMesh 桥接 设置 and OpenHuman’s 渠道 配置. Treat rotation like credential compromise response: update both sides before resuming traffic.

#### 41.8 发送与接收消息

OpenHuman handles inbound `{from, text, messageId, …}` like other 预设. Replies use the 对等节点 ID in `from`; duplicate `messageId` values should be ignored to absorb retries.

#### 41.9 使用 mesh 工具

Tool 访问 is limited to what the 桥接 暴露 via list/执行 on 3031. OpenHuman cannot bypass 绑定 or 授权 checks by calling libp2p directly.

#### 41.10 同意、隐私与审批

Review OpenHuman’s consent prompts and data retention separately from EnvoyMesh 策略. 所有者 审批 on the home 节点 still gate sensitive mesh 运维.

#### 41.11 智能体端集成归属

OpenHuman ships its own integration layer; EnvoyMesh does not vet every 智能体-side behavior. Keep OpenHuman updated and 禁用 the 预设 if its 安全 posture changes.

#### 41.12 断开或吊销 OpenHuman

禁用 the 预设, 吊销 the secret, and 停止 OpenHuman. Clearing Ext 智能体 returns chat to EnvoyAI or another selected engine without exposing 8021.

#### 41.13 排查 OpenHuman

Check that OpenHuman is 启用, listening on 8021, and using matching Bearer 认证. Consent or 审批 denials may look like transport failures—inspect 审计 结果.


### 42. 自定义外部智能体

#### 42.1 使用 `envoymesh-message` 适配器

A custom 智能体 can implement the `envoymesh-消息` adapter without speaking libp2p. It accepts the 桥接’s inbound JSON, replies through the local 桥接, and may list or 执行 only the 工具 暴露 to it.

#### 42.2 注册自定义智能体预设

Add a custom 预设 in 桥接 设置 with your adapter’s `agentUrl` (for example `HTTP://127.0.0.1:9000/消息`). One 桥接 资料 points to one active URL.

#### 42.3 实现入站消息端点

Implement `POST /your/消息` accepting `{from, fromOwnerId, fromName, text, messageId}` and optional Bearer 认证. Respond 200 quickly; deliver replies asynchronously via 3031 rather than echoing in the HTTP response body.

#### 42.4 通过 `/bridge/send` 实现回复

POST `{to, text}` and optional `correlationId` to `HTTP://127.0.0.1:3031/桥接/send`. Use `to` = inbound `from` 对等节点 ID. 同步 asks resolve when `correlationId` matches a pending 所有者 request.

#### 42.5 认证请求

Validate `授权: Bearer` on inbound mesh webhooks and on your outbound 通话 to 3031. Reject unsigned requests when a secret is 配置.

#### 42.6 处理重复消息

Track seen `messageId` values and drop duplicates within your retry window. This prevents double replies when the 桥接 retries a flaky webhook delivery.

#### 42.7 列出与调用 mesh 工具

Call `GET /桥接/list-工具` then `POST /桥接/执行-tool` with JSON arguments. Handle structured errors and 审批-pending responses without crashing your 智能体 loop.

#### 42.8 处理异步结果

Subscribe to or poll for async mesh results (`mesh.async_reply` shape when mimicking OpenClaw). Associate late 发现 or 知识 responses with the user turn that triggered them.

#### 42.9 定义能力与数据边界

Document which mesh 工具 your 智能体 may 通话 and what local data it stores. Never request raw libp2p 密钥 or 保险箱 路径 outside approved 工具.

#### 42.10 测试集成

运行 bonded 对等节点 chat tests, 工具 通话, and secret-rotation drills. Use `npm 运行 smoke:openclaw-桥接` patterns as a reference for mock round-trips.

#### 42.11 安全清单

Loopback bind only, strong Bearer secret, least-权限 工具, 审计 review, prompt secret rotation, and a documented 吊销 路径. Do not 暴露 3031 to LAN/WAN without TLS and 网络 ACLs.

#### 42.12 排查自定义智能体

Compare 桥接 日志 with your adapter 日志 for 401/404/410 responses, wrong `to` IDs, and 模式 mismatches. Test with curl before involving live mesh 对等节点.


### 43. 管理外部智能体

#### 43.1 审查当前智能体

Open **设置 → AI** and confirm which 预设 is active, its `agentUrl`, whether Ext 智能体 is 启用, and the 桥接 listen port (default 3031). Bundled EnvoyAI uses 18789 separately from Ext 智能体 预设.

#### 43.2 审查外部智能体会话

Review external-智能体 会话 lists for active correlations and recent 对等节点 联系人. Sessions tie mesh senders to 桥接 转发 状态 on the home 节点.

#### 43.3 审查动作历史

Action history summarizes 工具 executions and forwarded 消息. Cross-check unusual entries against 审计 JSONL using the same correlation or 消息 IDs.

#### 43.4 检查可用能力

Inspect the 工具 catalogue via 设置 or `GET /桥接/list-工具` with 认证. 能力 change when 绑定, 授权, or 所有者 审批 change—not when the 外部智能体 restarts.

#### 43.5 切换当前预设

Switch 预设 by selecting HomeClaw, Hermes, OpenHuman, OpenClaw webhook, or custom. Restart or reconnect the target external 进程 after changing `agentUrl` or secrets.

#### 43.6 禁用桥接

Toggle **Ext 智能体** off to 停止 转发 mesh chat to external URLs while keeping bundled EnvoyAI 可用. The 桥接 HTTP listener may remain for in-flight replies—rotate secrets if you need a hard 停止.

#### 43.7 吊销智能体会话

吊销 a 会话 by disabling the 桥接, clearing 凭证 in the 外部智能体, and rotating the Bearer secret so old tokens cannot 通话 3031.

#### 43.8 轮换共享密钥

Generate a new secret in EnvoyMesh, update the 外部智能体 配置, then restart both sides. Expect brief 401 errors until configs match.

#### 43.9 应对被入侵的外部智能体

Immediately 禁用 Ext 智能体, rotate secrets, block affected 对等节点 if needed, and review 审计 日志 for exfiltration or 工具 abuse. Treat compromise of the external 进程 as compromise of everything the 桥接 was 允许 to do.

#### 43.10 收集诊断

Gather 桥接-配置 (redact secrets), recent 审计 excerpts, gateway/adapter 日志, and results of `curl` probes to 3031 and your `agentUrl`. Include EnvoyMesh and external-智能体 versions when filing issues.


---

## 第 VII 部分 —— 智能体网络与协作任务

### 44. 智能体网络概述

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 290" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="20" width="200" height="40" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="37.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Orchestrator</text><text x="380.0" y="53.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">home node + owner</text><rect x="40" y="120" width="160" height="50" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="120.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Worker A</text><text x="120.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded · opted-in</text><rect x="280" y="120" width="160" height="50" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="360.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Worker B</text><text x="360.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded · opted-in</text><rect x="520" y="120" width="160" height="50" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="600.0" y="142.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Worker C</text><text x="600.0" y="158.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bonded · opted-in</text><path d="M330,60 L120,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="225.0" y="86.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">task.chain.*</text><path d="M380,60 L360,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M430,60 L600,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M120,170 L330,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="225.0" y="111.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">partial/result</text><path d="M360,170 L380,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M600,170 L430,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="20" y="210" width="720" height="50" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="226" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Relays (lean) — connectivity only, no LLM, no payload reading</text><text x="40" y="270" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Bonded + opted-in = eligible. Strangers and non-opted-in peers are NOT recruiters.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 8 —— 智能体网络拓扑：协调代理招募已绑定、自愿加入的工作节点。中继仅承载连通性。没有公开市场——陌生人无法招募你的智能体。</figcaption></figure>


#### 44.1 智能体网络是什么

智能体网络 is the collaboration layer where bonded 所有者 opt their local 智能体 into work for 协作任务. It combines 身份, 信任, 能力 发现, 授权, orchestration, 交付物, and auditing.

#### 44.2 已绑定的用户与自愿加入的本地智能体

A 工作节点 is eligible only when the 所有者 are bonded at an acceptable tier, the 远程 所有者 启用 Join 智能体网络, and a fresh 智能体 card 广告 the required 成员资格 and 能力.

#### 44.3 智能体网络不是公开市场

There is no 公开 市场 where strangers can freely recruit your 智能体. Broad 匿名 recruitment is deliberately outside the current product boundary.

#### 44.4 你的智能体默认保持私有

The local 智能体 remains usable by its 所有者 whether or not it joins. 成员资格 changes what bonded 对等节点 can discover and request, and can disclose 所有者-attested 资料 fields to those 对等节点.

#### 44.5 工作节点成员资格

**Worker 成员资格** is the 选择性加入 flag (**Join 智能体网络**) that 广告 `能力-提供商` on your 智能体 card. Without it, bonded 对等节点 cannot recruit your 智能体 for 协作任务 even if 信任 is 直接.

#### 44.6 Agent Card 与能力

An **智能体 Card** lists 能力, supported 任务 types, optional 资料 fields, and 成员资格 tags. Orchestrators 索引 cards from bonded 对等节点 to decide who can 执行 each subtask.

#### 44.7 协作任务

**协作任务** (UI name for multi-智能体 链) split an 所有者 goal into subtasks, 分配 them to opted-in 工作节点, and 合并 results into one 报告. 协议 code still uses `任务.链.*` 意图.

#### 44.8 智能家庭节点与精简中继

**Home 节点** 运行 LLMs, 保险箱 访问, orchestration, and 工作节点 执行. **中继** provide 连通性 and 发现 only—they never 执行 subtasks or read private 载荷.

#### 44.9 典型的个人、家庭与团队拓扑

Personal 设置 often 配对 two home laptops; families may add a child’s 节点; teams use 集群 manifest or LAN onboarding. Every topology still requires 绑定 plus 工作节点 选择性加入 before 跨家庭 协作任务 work.

#### 44.10 当前范围与未来方向

Today, 智能体网络 covers bonded, opted-in collaboration: an 所有者 启用 Join 智能体网络, bonded 对等节点 see the 工作节点 card, and the requesting 节点 orchestrates 协作任务 across those trusted 工作节点. There is no 公开 市场, no 匿名 工作节点 recruitment, and 中继 stay lean (连通性 only). Forward directions — broader 发现, richer reputation, multi-hop commerce, and a complete 分层 中继 graph — are documented in 附录 J.5–J.11 as 计划中, Parked, or 暂缓; treat them as direction, not committed release dates.


### 45. 加入智能体网络

#### 45.1 前提条件

Before joining: 运行 home 节点, 所有者身份, 配置 AI engine, and at least one 绑定 if you expect to collaborate soon. Joining alone does not create 绑定 automatically.

#### 45.2 Enable 加入智能体网络

Open **设置 → 智能体网络** and 启用 **Join 智能体网络**. The 节点 sets 能力-提供商 成员资格 in its advertisements; it does not create 绑定 automatically.

#### 45.3 成员资格广播什么

成员资格 广告 the `能力-提供商` tag and, if 配置, the 智能体网络 资料. Bonded 对等节点 can then 索引 the card and consider the 工作节点 for compatible subtasks.

#### 45.4 关闭成员资格

禁用 **Join 智能体网络** in 设置 to remove `能力-提供商` from your card. In-flight subtasks may finish, but new orchestrators should 停止 recruiting you after refresh.

#### 45.5 确认你的工作节点可见

On a 对等节点’s 节点, open **设置 → 智能体网络 → Workers status** and click **Refresh 工作节点**. Your entry appears when 绑定 信任 is eligible, you joined, and a fresh card synced.

#### 45.6 未加入时本地智能体的行为

When not joined, your local 智能体 still serves chat, 保险箱, and personal 任务 on your 节点. Only recruitability to bonded 对等节点’ 协作任务 is withheld.

#### 45.7 隐私影响

Joining 分享 能力 tags and optional 资料 fields with bonded 对等节点—not the 公开 internet. Strangers cannot 浏览 your 智能体; only 联系人 who already passed 绑定策略 see recruitability signals.

#### 45.8 排查成员资格

If 成员资格 seems stuck: toggle Join off/on, restart the 节点, confirm 智能体 card 发布, and ask a bonded 对等节点 to refresh 工作节点. Check 审计 for card 获取 or 索引 errors.


### 46. 智能体网络资料

#### 46.1 所有者自证的工作节点资料

The 资料 is an 所有者-attested description used for soft 工作节点 ranking, not a centrally 验证 benchmark. It may include 模型 freshness, spend posture, 上下文窗口, strengths, and 吞吐量.

#### 46.2 模型新鲜度

**模型 freshness** (1–10) is 所有者-attested signal for how current your 模型 feel. Orchestrators use it as a soft tie-breaker after 能力 match, not as 验证 benchmark.

#### 46.3 消费姿态

**Spend posture** (`订阅`, `metered`, `unknown`) hints whether long jobs may hit 提供商 limits. It influences scoring but does not override 授权 成本 ceilings.

#### 46.4 上下文窗口

**上下文窗口** (`128k`–`1M+`) helps orchestrators pick 工作节点 for large-document subtasks. Misstating window size may cause 分配 mismatch or failed 执行—keep it honest.

#### 46.5 优势与技能标签

**Strengths and skill tags** (research, coding, summarization, etc.) improve soft ranking when several 工作节点 分享 the same 能力. They do not grant 能力 you DID not 广告 on the card.

#### 46.6 吞吐量信息

**吞吐量 information** (when provided) helps Assigner estimate parallel capacity. It is informational; stall detection still relies on 心跳 and 协调代理 timers.

#### 46.7 候选评分如何运作

Candidate scoring prioritizes 能力 match, then uses context, freshness, spend posture, strengths, and related signals. These factors guide 分配 but do not override 绑定 and 授权 策略.

#### 46.8 资料信任与局限

资料 are **自身-declared** by 所有者 you already 信任 via 绑定—not third-party ratings. Treat them as hints; 验证 结果 through 报告, 审计, and repeated collaboration.

#### 46.9 更新或移除资料

Edit 资料 fields under **设置 → 智能体网络** anytime. Clearing the 资料 removes soft-ranking hints but does not 禁用 Join; toggle 成员资格 separately to 停止 recruitment.


### 47. 智能体身份与 Agent Card

#### 47.1 为什么智能体有独立身份

智能体 have **independent 对等节点 IDs** (`envoy_agent_…`) derived from 所有者 + 智能体 密钥 so 对等节点 can 验证 an 智能体 acts under a specific 所有者 授权, separate from 设备 密钥.

#### 47.2 所有者、设备、智能体与对等节点关系

**所有者** 身份 authorize 授权; **设备** 运行 节点; **智能体** 执行 任务; **对等节点 IDs** sign 信封 at 运行时. 协作任务 always address 智能体 对等节点 for 任务 traffic.

#### 47.3 所有者授权的智能体凭据

所有者-signed **授权** link an 智能体 公开 密钥 to an 所有者 DID. Workers should reject 链 proposals that lack valid 授权 签名 within 成本, 敏感度, and 到期 bounds.

#### 47.4 智能体公钥

Each 智能体 发布 a **公开 密钥** on its card. Recipients 验证 信封 签名 before accepting `任务.链.*` or `任务.result` 载荷.

#### 47.5 Agent Card

An 智能体 Card describes an 智能体’s 身份, 能力, 任务 support, optional 工作节点 资料, and 端点. 原生 cards move through signed EnvoyMesh flows; an A2A 桥接 can 发布 a filtered external representation.

#### 47.6 能力与支持的任务类型

**能力** are string tags (`doc.translate`, `任务.执行`, …) on the card. **Supported 任务 types** describe which wire 意图 the 智能体 accepts. Subtasks declare required 能力; mismatches exclude a 工作节点.

#### 47.7 成员资格标签

**成员资格 tags** include `能力-提供商` when Join 智能体网络 is 启用. Orchestrators filter on this tag before offering subtasks to a bonded 联系人.

#### 47.8 获取与刷新已绑定智能体的名片

Cards auto-获取 when 绑定 form (eligible tiers) and cache ~24h. Use **Refresh 工作节点** or 绑定 events to force update before a critical 协作任务.

#### 47.9 验证智能体的所有者

验证 `ownerId` on the card matches the bonded 联系人 you expect. 授权 签名 must 链 to that 所有者; mismatches are grounds to reject work.

#### 47.10 吊销智能体

吊销 an 智能体 by 所有者 授权 吊销 and removing or rotating its 密钥 on the home 节点. 对等节点 with stale cards should refresh; 阻止 信任 停止 new assignments immediately.

#### 47.11 一个所有者的多个智能体

One 所有者 may 运行 **multiple 智能体** with distinct 密钥 and cards. Each opts in and 广告 能力 independently; orchestrators treat them as separate 工作节点.


### 48. 绑定与工作节点资格

#### 48.1 绑定信任层级

信任层级 are **阻止**, **公开**, **推荐**, and **直接**. 协作任务 工作节点 generally require 推荐 or 直接 信任; 公开 strangers are not recruitable 工作节点.

#### 48.2 Why 协作任务 require bonded contacts

协作任务 操作 across bonded relationships because 工作节点 may receive objectives, data context, and 委托 authority. 绑定 策略 prevents unknown 公开 对等节点 from entering this 工作流 by default.

#### 48.3 公开对等节点与陌生人

**公开** 对等节点 are not auto-fetched as 协作任务 工作节点. 绑定 them to 推荐 or 直接 before expecting collaboration.

#### 48.4 介绍级工作节点

**推荐** 工作节点 may participate under tighter 策略. 协调代理-side 链 traffic typically requires 推荐 or higher; confirm 绑定 tier before assigning sensitive subtasks.

#### 48.5 直接级工作节点

**直接** 绑定 unlock the full 工作节点 路径: 直接 分配, 竞价, and 跨家庭 交接 subject to 授权. This is the usual friend/集群 配置.

#### 48.6 阻止级工作节点

**阻止** 对等节点 cannot send or receive collaboration 意图. Existing assignments should 失败即关闭; 取消 active subtasks involving 阻止 工作节点.

#### 48.7 能力要求

Each subtask names a **required 能力**. Workers must 广告 an exact or soft-matched tag plus `能力-提供商` 成员资格 to be eligible.

#### 48.8 成员资格与名片新鲜度

Stale cards may hide new 能力 or show 吊销 智能体. Refresh after 成员资格 toggles, 模型 changes, or 绑定 updates; orchestrators skip 工作节点 beyond freshness thresholds.

#### 48.9 工作节点资格清单

Confirm: the 所有者 are bonded; 信任 is 推荐 or 直接 as required; Join 智能体网络 is 启用; the card is fresh; `能力-提供商` is present; the requested 能力 matches; and neither side is 阻止.

#### 48.10 更改或吊销信任

Lowering 信任 or blocking a 联系人 停止 new recruitment immediately. Review active 协作任务 for in-flight subtasks awarded to that 对等节点 and 取消 or reassign as needed.


### 49. 发现与接入工作节点

#### 49.1 绑定现有联系人

绑定 an existing 联系人 through chat intro, QR, or invite before recruiting them. 协作任务 never substitute 匿名 发现 for 信任 establishment.

#### 49.2 办公局域网接入

**Office LAN** onboarding combines same-Wi-Fi 发现 with a 分享 token under **设置 → 智能体网络**. It accelerates bonding for coworkers on one 网络.

#### 49.3 局域网自动绑定

**LAN auto-绑定** pairs machines on the same subnet when 启用 and tokens match. It creates 信任, not 成员资格—each 对等节点 must still 启用 Join 智能体网络 to become a 工作节点.

#### 49.4 公司邀请链接

**Company invitation links** (`envoy://invite?…`) let teammates join your 集群 with scoped 信任. Distribute links through your normal secure channels; 到期 links 停止 working.

#### 49.5 配对自助端

**配对 kiosk** mints one-click invites for events or support desks. Keep kiosk mode off unless you actively supervise pairings—it reduces friction by design.

#### 49.6 集群清单导入

**集群 Manifest** 导入 applies a signed roster of 对等节点 and 信任 hints for larger teams. Validate manifest 签名 before 导入; manifests create 绑定, not automatic 工作节点 选择性加入.

#### 49.7 刷新工作节点状态

Click **Refresh 工作节点** on the 智能体网络 tab after onboarding changes. The 能力 索引 updates from freshly fetched 智能体 cards across bonded 联系人.

#### 49.8 基于能力的匹配

Assigner matches subtask `requiredCapability` to 工作节点 card tags, then applies soft scoring (context, freshness, strengths, same-LAN hints). Missing 能力 excludes the 工作节点 entirely.

#### 49.9 探测对等节点

**Probe a 对等节点** sends a lightweight reachability check before awarding expensive subtasks. Failed probes remove unreachable 工作节点 from the current roster pass.

#### 49.10 诊断零合格工作节点

If no 工作节点 is eligible, refresh cards, 验证 绑定, confirm 成员资格, inspect 能力 tags, and probe reachability. The UI should not 启动 a multi-智能体 job when only the local 节点 is 可用.

#### 49.11 广泛的匿名工作节点发现 —— 当前不提供

**计划中 boundary.** Current 协作任务 recruit bonded, opted-in 工作节点. Network-wide 匿名 工作节点 search and 公开-市场 behavior are not offered.


### 50. 协作任务基础

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 580" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="10" width="200" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="22.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">所有者目标</text><rect x="280" y="60" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="72.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">协调代理规划 + 拆解</text><rect x="280" y="110" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="122.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">构建合格工作节点名册</text><rect x="280" y="160" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="172.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">候选评分（能力 ≫ 上下文 ≫ 新鲜度）</text><polygon points="380,200.0 450.0,225 380,250.0 310.0,225" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="380" y="229" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">分配模式？</text><rect x="180" y="290" width="140" height="30" rx="6" fill="#3d5a45" stroke="12" stroke-width="1.2"/><text x="250.0" y="302.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">直接分配</text><text x="250.0" y="318.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#F0FDF4</text><rect x="440" y="290" width="140" height="30" rx="6" fill="#3d5a45" stroke="12" stroke-width="1.2"/><text x="510.0" y="302.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">竞争竞标</text><text x="510.0" y="318.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#EFF6FF</text><rect x="180" y="340" width="400" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="352.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">协商 / 接受</text><rect x="180" y="390" width="400" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="402.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">工作节点本地执行</text><rect x="180" y="440" width="400" height="30" rx="6" fill="#645a3a" stroke="12" stroke-width="1.2"/><text x="380.0" y="452.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">多轮迭代（可选）</text><text x="380.0" y="468.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#FEF3C7</text><rect x="180" y="490" width="400" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="502.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">合并带归属的交付物</text><rect x="280" y="540" width="200" height="30" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="552.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">合成最终报告</text><path d="M380,40 L380,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,90 L380,110" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,120 L380,130" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,160 L380,190" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,250 L250,290" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,250 L510,290" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M250,320 L250,340" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M510,320 L510,340" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,370 L380,390" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,420 L380,440" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,470 L380,490" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,520 L380,540" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 6 —— 协作任务编排：协调代理规划、构建名册、为候选评分，然后分支到直接分配或竞争竞标。工作节点本地执行；结果合并为一份带归属的报告。</figcaption></figure>


#### 50.1 什么是协作任务

A 协作任务 turns one 所有者 goal into coordinated subtasks executed by several eligible 智能体. The initiating home 节点 owns the 预算 and 报告 and normally acts as 协调代理.

#### 50.2 协作任务 and the older “chains” name

The UI says **协作任务**. 协议 意图, RPC names, 存储, and older documents may use **链**; treat that as the implementation name for the same product 工作流.

#### 50.3 所需工作节点

At least one eligible 远程工作节点 is required for meaningful multi-智能体 执行. A solo 节点 can use its personal 智能体, but the 协作任务 UI blocks or 报告 no-工作节点 rather than pretending to distribute work.

#### 50.4 设定目标

Enter a clear, bounded goal in **协作任务 → New team job** or promote from chat. Good goals 状态 deliverable, constraints, and 敏感度 so the planner can 分解 realistically.

#### 50.5 预览计划

**Preview the 计划** shows proposed subtasks, 能力, and 工作节点 slots before spend 启动. Edit or 取消 here if the 分解 looks wrong.

#### 50.6 从聊天发起

From chat, escalate a 对话 turn into a 协作任务 when the goal needs multiple 智能体. The 协调代理 inherits context subject to 授权 敏感度 limits.

#### 50.7 Start from the 协作任务 view

The **协作任务** view is the primary 控制 surface on 桌面 Social: 启动, 监控, approve, 重新平衡, and open 报告. EnvoyGo mirrors status read-only.

#### 50.8 跟踪进度

Watch 生命周期 状态 (`discovering`, `运行`, `partial`, `synthesizing`, …) and per-subtask rows. WebSocket `链:迭代` events update 迭代 progress during 阶段 47 多轮 jobs.

#### 50.9 审查已完成报告

Open the 发布 **链 报告** for attributed sections, 工作节点 provenance, 成本 摘要, and pinned 交付物. Draft rounds (阶段 47) appear in accordion before final 发布.

#### 50.10 取消或重试协作任务

取消 from 协作任务 UI sends `任务.链.取消` downstream. Retry may require a new job or 协调代理 re-计划 depending on failure mode; check 审计 for 终端 reason.


### 51. 规划与拆解工作

#### 51.1 协调代理的角色

The 协调代理 turns the 所有者’s goal into a 计划, finds 工作节点, awards subtasks, tracks 执行, enforces 预算 and 策略, and 合并 results. 中继 only carry 连通性 and never assume this role.

#### 51.2 将目标拆解为子任务

The 协调代理 分解 the goal into subtasks with objectives, required 能力, inputs, deadlines, and 成本 ceilings. LLM-assisted 计划 may propose steps; 所有者 preview approves before dispatch.

#### 51.3 所需能力

Each subtask declares a **required 能力** tag matching 智能体 card entries. 计划 fails early if no bonded, opted-in 工作节点 广告 that 能力.

#### 51.4 依赖与顺序

Dependencies order subtasks (for example research before synthesis). The 协调代理 respects DAG edges and will not award dependent work until prerequisites complete or partial results arrive.

#### 51.5 工作节点数量上限

**maxWorkers** caps concurrent active 工作节点 会话 on a 链 授权. Finished or 取消 subtasks free slots for reassignment.

#### 51.6 深度上限

Default 链 **depth is 2** (协调代理 → 工作节点). Depth 3 requires `allowDepth3` on the 所有者-signed 链 授权; depth beyond 3 is rejected.

#### 51.7 截止时间与敏感度

Set per-subtask deadlines and 敏感度 ceilings in the 计划 preview. Workers enforce local 绑定 and 保险箱 策略 even when 协调代理 requests higher 敏感度.

#### 51.8 预览与编辑计划

Edit subtask objectives, costs, or 能力 tags in preview when manual mode is 可用. Automatic LLM 计划 should be reviewed before 启动 on high-stakes goals.

#### 51.9 LLM 辅助规划

**LLM-assisted 计划** uses the home 模型 to propose 分解 when 启用. Failures fall back to keyword/heuristic templates or block 启动 with a clear 计划 error.

#### 51.10 规划失败与降级行为

When 计划 fails, check for zero eligible 工作节点, unsupported 能力, depth violations, or 模型 errors. Reduce goal scope or add 工作节点 before retrying.


### 52. 发现与分配智能体

#### 52.1 构建合格工作节点名册

The roster lists bonded 联系人 who joined 智能体网络 and pass 能力 filters for the current 计划. Same-LAN 对等节点 may rank higher when dial hints show 直接 路径.

#### 52.2 能力匹配

**能力 matching** is hard filter first: no tag, no 分配. Soft scoring breaks ties among remaining eligible 工作节点.

#### 52.3 上下文、新鲜度、消费与优势评分

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 310" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="20" width="200" height="30" rx="6" fill="#FEE2E2" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="32.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Capability match</text><text x="380.0" y="48.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">HARD GATE</text><rect x="280" y="70" width="200" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="380.0" y="82.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Context window</text><rect x="280" y="120" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Model freshness</text><rect x="280" y="170" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="182.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Spend posture</text><rect x="280" y="220" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="232.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Strengths / sameLan</text><rect x="280" y="270" width="200" height="30" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="282.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Final rank</text><path d="M380,50 L380,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,100 L380,120" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,150 L380,170" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,200 L380,220" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M380,250 L380,270" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="540" y="150" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Priority decreases downward.
Capability is a hard gate — failing it disqualifies the candidate regardless of soft signals.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 14 —— 候选评分漏斗：能力匹配是硬门；其下，软因素（上下文、新鲜度、消费、优势）贡献最终排名。</figcaption></figure>


Scoring weighs **上下文窗口**, **freshness**, **spend posture**, and **strengths** after 能力 fit. 直接 分配 picks the top scored 工作节点; 竞价 still uses score as signal.

#### 52.4 同网络考量

Workers on the same LAN may respond faster and rank higher (`sameLan` soft score). WAN 路径 use 中继 for 连通性 without changing 信任 requirements.

#### 52.5 直接分配模式

直接 分配 is the default for personal and small-team use. It selects an eligible scored 工作节点 and awards work without exposing a 竞价 flow.

#### 52.6 竞争竞标模式

Competitive 竞价 collects offers when 成本, timing, or choice matters. It adds 协商 and 所有者 decisions, so 启用 it only when those 控制 justify the extra delay.

#### 52.7 分配器选择

**Assigner selection** chooses which home 节点 计划 and awards subtasks—usually yours. 远程 assigner 交接 委托 that role to another bonded 协调代理 with better 工作节点 可见性.

#### 52.8 远程分配器交接

**远程 assigner 交接** 传输 分配 authority via `任务.链.交接` while preserving 授权 bounds and 阶段 47 迭代 knobs when 配置.

#### 52.9 无工作节点行为

With **no eligible 工作节点**, 启动 is 阻止 (`no_workers`). 启用 Join on 对等节点, refresh cards, or 绑定 additional 联系人—solo 节点 cannot fake multi-智能体 执行.

#### 52.10 刷新与重新评估工作节点

Re-运行 roster 构建 after refresh, 绑定 changes, or mid-job stalls. 协调代理 may swap 工作节点 when probes fail or 竞价 expire.


### 53. 竞标与协商

#### 53.1 何时使用竞标

竞价 is used only in competitive mode or a 工作流 that explicitly requests offers. 直接 分配 avoids this exchange.

#### 53.2 请求竞标

In **competitive 竞价** mode, the 协调代理 broadcasts `任务.链.propose` and collects `任务.链.竞价` responses before accept. 直接 分配 skips this step.

#### 53.3 审查提议的成本与时间

Compare each 竞价’s proposed **成本** and **ETA** against subtask ceilings and 链 预算. Reject 竞价 that exceed 授权 limits without 所有者 审批.

#### 53.4 审查信心与理由

Review 竞价 **confidence** and textual justification when shown. Low-confidence 竞价 may warrant counter-proposal or a different 工作节点.

#### 53.5 比较候选

Side-by-side candidate comparison highlights 成本, score, and 能力 fit. 所有者 picks accept when manual award mode is 启用.

#### 53.6 还价

**Counter-竞价** adjust 成本, deadline, or scope via `任务.链` 协商 信封. Workers may accept revised terms or withdraw.

#### 53.7 接受或拒绝工作

Accepting emits `任务.链.accept`; rejecting leaves the subtask open for other bidders or reassignment. Document decisions in 审计 for later 成本 争议.

#### 53.8 协商超时

协商 timers prevent indefinite stalls. 到期 竞价 free the subtask for re-offer or fallback 直接 分配 per 协作任务 默认值.

#### 53.9 协商期间的人工审批

Sensitive or high-成本 accepts may enter **所有者 审批** queues. Resolve 审批 in Social before 工作节点 启动 执行.

#### 53.10 审计协商决策

审计 记录 capture 竞价 amounts, accepted 对等节点, counter-proposal history, and 审批 结果. Export or filter by `chainId` for retrospective review.


### 54. 预算、成本与再平衡

#### 54.1 设定协作任务预算

Set **maxChainCostUsd** and related limits when 启动 a job or in saved 配方. The 协调代理 tracks spend against the 链 预算 ledger throughout 执行.

#### 54.2 成本上限

Each subtask carries a **成本 ceiling**; 工作节点 cannot 竞价 or charge above it without 重新平衡 or 所有者 审批.

#### 54.3 工作节点成本分配

Initial allocation splits 链 预算 across subtasks in the 计划. Manual 重新平衡 moves funds; automatic 重新平衡 adjusts within 配置 increments.

#### 54.4 手动再平衡

Manual 重新平衡 pauses for 所有者 review when allocation or 工作节点 conditions change. It maximizes 控制 at the 成本 of requiring timely attention.

#### 54.5 自动再平衡

Automatic 重新平衡 lets the 协调代理 adjust within 配置 increments, ceiling, and retry limits. Use conservative limits and require 审批 for material 成本 increases.

#### 54.6 从不再平衡策略

Never-重新平衡 preserves the original 预算 allocation. A stalled or underfunded subtask may then fail rather than consume additional funds.

#### 54.7 再平衡增量与限制

配置 **重新平衡 increment** size and maximum automatic retries in 协作任务 默认值. Conservative increments reduce surprise spend.

#### 54.8 高成本审批

Crossing high-成本 thresholds 触发器 **审批 requirements** on the 授权. Watch for waiting-for-所有者 状态 when spend spikes.

#### 54.9 导出成本数据

Export 成本 breakdowns from completed 报告 or 审计 CSV when 启用. Includes per-工作节点 attribution and 重新平衡 events.

#### 54.10 解读最终成本报告

Final 成本 报告 show estimated versus actual spend, 重新平衡 history, and unspent 预算. Compare to 授权 `maxChainCostUsd` before 启动 similar jobs.


### 55. 运行与监控工作

#### 55.1 工作节点接受

After accept, 工作节点 acknowledge and transition subtasks to **运行**. Reject or 超时 returns the subtask to 协商 or failed 状态.

#### 55.2 运行状态

链 生命周期 moves through `discovering → 协商 → 运行 → partial → synthesizing → completed|failed`. UI maps these to human-readable 协作任务 status.

#### 55.3 心跳

Workers send 心跳 so the 协调代理 can distinguish progress from disconnection. Missing 心跳 订阅源 stall detection but should not be treated as proof of malicious behavior.

#### 55.4 部分结果

Workers emit **`任务.链.partial`** with intermediate 交付物 when more output is coming. 协调代理 waits or 合并 partials per termination 策略.

#### 55.5 停滞检测

**Stall detection** uses missed 心跳 and 配置 超时. Trigger retry, reassignment, or 所有者 prompt per stall 策略.

#### 55.6 重试与重新分配

**Retry** re-offers a subtask; **reassignment** 取消 the stalled 工作节点 slot and awards a 备份. Release 工作节点 capacity before assigning replacements.

#### 55.7 等待所有者输入

Jobs pause in **waiting_for_owner** when 审批, 迭代 continue/停止, or 重新平衡 decisions are needed. Resolve in 桌面 Social—EnvoyGo shows the 状态 but cannot act.

#### 55.8 工作节点失败

Worker **failure** marks subtasks failed with reason codes. 协调代理 may synthesize partial 报告 or fail the 链 per termination 策略.

#### 55.9 取消子任务或整个任务

取消 a single subtask or entire 链 from 协作任务. Downstream 工作节点 receive 取消 意图; 审计 记录 who initiated termination.

#### 55.10 审计进度

Filter 审计 by `chainId` and 关联ID to reconstruct timeline: 计划, 竞价, accepts, partials, 合并, 迭代 rounds, 发布.


### 56. 多轮迭代

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 620 360" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:620px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="280" y="20" width="200" height="30" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="32.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Plan + Assign</text><rect x="280" y="70" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="82.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Execute (workers)</text><rect x="280" y="120" width="200" height="30" rx="6" fill="#645a3a" stroke="12" stroke-width="1.2"/><text x="380.0" y="132.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Seal round N</text><text x="380.0" y="148.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#FEF3C7</text><rect x="280" y="170" width="200" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="182.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Synthesize draft_N</text><polygon points="380,210.0 460.0,240 380,270.0 300.0,240" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="380" y="244" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Judge</text><rect x="40" y="310" width="140" height="30" rx="6" fill="#3d5a45" stroke="11" stroke-width="1.2"/><text x="110.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Continue</text><text x="110.0" y="338.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#F0FDF4</text><path d="M310,255 L110,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="200" y="310" width="100" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="250.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Stop</text><path d="M360,270 L250,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="320" y="310" width="120" height="30" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="380.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Ask owner</text><path d="M400,270 L380,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="460" y="310" width="140" height="30" rx="6" fill="#645a3a" stroke="11" stroke-width="1.2"/><text x="530.0" y="322.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Extend (capped)</text><text x="530.0" y="338.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">#FEF3C7</text><path d="M440,255 L530,310" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M110,340 L280,25" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="195.0" y="178.5" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">carry to N+1</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 10 —— 多轮迭代：一轮内执行 规划 → 执行 → 封存 → 合成草稿。评审者随后继续、停止、询问所有者或扩展（有上限）。摘要带入下一轮。</figcaption></figure>


#### 56.1 为什么协作任务可能需要另一轮

Some goals benefit from reviewing a first draft and requesting targeted follow-up. 多轮 迭代 adds that loop without allowing unbounded autonomous work.

#### 56.2 草拟、评审与重新规划

阶段 47 **seal → draft → judge → replan** closes a round, synthesizes a draft 报告, decides whether to continue, and optionally launches another 计划 pass with carried summaries.

#### 56.3 在一轮内扩展工作

**Extend within a round** (阶段 47B) appends capped extra steps before seal when local heuristics say more work in the same round will help.

#### 56.4 最大轮次与扩展上限

默认值 preserve single-round behavior unless the 所有者 or template opts in. Maximum rounds and per-round extensions are hard caps that limit 成本 and duration.

#### 56.5 LLM 评审模式

LLM judge mode asks the 配置 模型 whether another round would improve the result. The decision remains bounded by maximum rounds, 预算, deadline, and 策略.

#### 56.6 始终停止模式

Always-停止 ends after the current sealed round, giving predictable 成本 and 延迟.

#### 56.7 所有者决策模式

所有者-decision mode pauses after a draft and asks the 所有者 whether to 停止, continue, or extend specific work.

#### 56.8 将摘要带入下一轮

Summaries and `iterationState` blobs carry forward so the next round does not repeat completed subtasks blindly. 远程 assigner 交接 preserves this 状态 when 配置.

#### 56.9 停止原因

**停止 reasons** include max rounds reached, 所有者 停止, 预算 exhaustion, judge always-停止, or failed seal. They appear in 报告 metadata and 审计.

#### 56.10 审查迭代历史

Review 迭代 history in 协作任务 accordion: each draft round, 所有者 Continue/Accept decisions, and final 发布. EnvoyGo mirrors read-only.


### 57. 跨家庭与跨协调代理交接

#### 57.1 何时交接编排

交接 is useful when another bonded home has better 工作节点 可见性 or should own a 委托 sub-链. It does not 传输 the original 所有者’s unlimited authority.

#### 57.2 选择远程分配器

Pick a **远程 assigner** bonded 对等节点 with `链.orchestrate` or better 工作节点 roster for 委托 分配. 信任 must be 直接 or 策略-允许 for 交接.

#### 57.3 委派子链

**委托 a sub-链** via `任务.链.委托` so another 协调代理 运行 a subtree under your 授权 limits, not unlimited 所有者 authority 传输.

#### 57.4 父与子职责

The **parent** 协调代理 retains 链 ownership and 预算; the **child** assigner 执行 委托 subtasks and returns results upstream.

#### 57.5 中继链流量

**中继 链 traffic** uses circuit 路径 for WAN 对等节点. 中继 forward 信封 without interpreting 载荷 or 运行 模型.

#### 57.6 保留迭代状态

交接 载荷 include 阶段 47 **迭代 knobs** and optional `iterationState` so the 远程 assigner continues 多轮 jobs seamlessly.

#### 57.7 仲裁记录

**Arbitration 记录** resolve ordering 争议 between orchestrators using seq and timestamp rules when 跨家庭 coordination conflicts arise.

#### 57.8 失败与恢复

On 交接 failure, parent 协调代理 should reclaim 分配, fail the subtree, or 取消 per 策略. Check 审计 for `交接` reject reasons.

#### 57.9 信任要求

交接 requires compatible 信任层级, valid 授权, and mutual reachability. 阻止 or 公开 对等节点 cannot become 远程 assigners.

#### 57.10 审计交接

审计 交接 events with sender/receiver 协调代理 对等节点 IDs, 委托 链 IDs, and 迭代 状态 checksums for compliance review.


### 58. 合并结果与生成报告

#### 58.1 收集工作节点结果

The 协调代理 collects `任务.result` and `任务.链.partial` 载荷 from each awarded 工作节点 before 合并 or synthesis.

#### 58.2 文本交付物

**Text 交付物** store narrative 工作节点 output with attribution metadata. Suitable for summaries and research sections.

#### 58.3 结构化交付物

**Structured 交付物** hold JSON or typed 记录 (tables, extracted fields). Validators check shape on receipt.

#### 58.4 文件交付物

**文件 交付物** reference 保险箱 items or chunked content by ID. Workers do not 推送 raw 文件系统 路径 across the mesh.

#### 58.5 复合交付物

A 复合交付物 bundles attributed 工作节点 contributions and an aggregation method. It preserves provenance that would be 丢失 if all text were flattened into one 匿名 answer.

#### 58.6 加权贡献

**Weighted contributions** let synthesis emphasize higher-confidence or 所有者-prioritized 工作节点 sections in the composite 报告.

#### 58.7 合并策略

**合并 strategies** (concatenate, summarize, vote, template-driven) are chosen per 报告 type. 阶段 47 draft rounds may use lighter 合并 before final 发布.

#### 58.8 工作节点归属与来源

报告 preserve **工作节点 attribution** and provenance so readers know which 对等节点 produced each section—critical for 可追溯性.

#### 58.9 合成最终报告

**Synthesize the final 报告** after all required subtasks complete or partial 策略 allows best-effort 合并. Only one 终端 发布 per 迭代 round.

#### 58.10 置顶与导出报告

**Pin** important 报告 in 协作任务 for quick 访问; **export** when CSV or 文件 export is 启用 in your 构建.

#### 58.11 所有者审查

**所有者 review** accepts draft 迭代 (阶段 47), rejects unsafe content, or requests another round before final 发布.


### 59. 协作任务配方与默认值

#### 59.1 保存可复用任务模板

Save **job templates** with default 预算, award mode, stall/重新平衡/迭代 策略, and 敏感度. Templates are local to your 节点—not a 市场.

#### 59.2 选择授予默认值

Choose **直接 分配 vs competitive 竞价** default in **设置 → AI → 协作任务 默认值**. Most personal teams should stay on 直接 分配.

#### 59.3 配置停滞策略

配置 **stall 策略** (超时, auto-rebid, notify 所有者) per template or globally. Aggressive 超时 reduce 成本 but increase reassignment churn.

#### 59.4 配置再平衡策略

Set **重新平衡 策略** to manual, automatic, or never. Match your appetite for autonomous 预算 shifts mid-job.

#### 59.5 配置迭代默认值

阶段 47 **迭代 默认值** (`iterationMaxRounds`, judge mode, extend caps) live in 默认值 or templates. Default `iterationMaxRounds=1` preserves single-round behavior.

#### 59.6 配置成本可见性

**成本 可见性** toggles whether 工作节点 and 所有者 see 竞价 amounts in UI during competitive mode. Hidden 成本 UI does not remove ledger tracking.

#### 59.7 使用已保存的配方

启动 from a **saved 配方** to pre-fill 策略 and award mode. Edit goal and preview before committing spend.

#### 59.8 更新或移除配方

Update 配方 when your team 工作流 changes; delete obsolete templates to avoid accidental use of stale 策略.

#### 59.9 模板市场 —— 暂缓

**Parked.** Saved 配方 are local product 功能; a mesh-wide 市场 for exchanging templates has no committed release.


### 60. EnvoyGo 上的协作任务

#### 60.1 View active 协作任务

EnvoyGo **协作任务** tab lists active jobs mirrored from the home 节点 over JSON-RPC. Status updates when the 手机 is connected; 离线 viewing may lag.

#### 60.2 查看近期任务

**Recent jobs** shows completed or failed 链 with timestamps. Use it to reopen 报告 on 移动 without 启动 new work.

#### 60.3 打开任务详情

Tap a job for detail: 生命周期 状态, subtask 摘要, 迭代 progress line, and links to 发布 报告. 控制 that change orchestration are hidden.

#### 60.4 阅读报告与交付物

Read **报告 and 交付物** inline when synced. Large 文件 交付物 may require opening on 桌面 if not cached on the 手机.

#### 60.5 了解只读移动行为

EnvoyGo presents a read-only mirror of active and recent 协作任务. 启动, award, 重新平衡, and orchestration 控制 remain on the home/桌面 experience.

#### 60.6 回到桌面进行编排控制

For 启动, 取消, 重新平衡, 竞价 accept, or 迭代 Continue/Accept, switch to **桌面 Social** on the home 节点. EnvoyGo intentionally omits these mutating RPCs.

#### 60.7 移动通知

**移动 通知** (when 启用) alert for job completion or 所有者-审批 waits. Tapping opens read-only detail; act on 审批 from 桌面.

#### 60.8 排查 EnvoyGo 移动镜像

If the mirror is empty: confirm EnvoyGo 配对, home 节点 reachability, and that jobs were 启动 on 桌面. Reload after WebSocket reconnect.


### 61. 智能体网络信任与安全

#### 61.1 验证工作节点身份

验证 工作节点 **对等节点 ID** and card 签名 match 信封 on every `任务.链.*` 消息. Reject mismatched 密钥 or 到期 授权.

#### 61.2 验证所有者授权

Confirm the 工作节点’s **所有者 授权** authorizes the 链 能力 and 敏感度 requested. 所有者 DID on card must match bonded 联系人.

#### 61.3 绑定策略与能力门

**绑定 策略** and 能力 gates 运行 before 协调代理 logic. 阻止 意图 never reach 工作节点 执行 even if UI 允许 计划.

#### 61.4 授权限制

Every 工作节点 request is bounded by a signed 授权 that specifies objective, actions, 对等节点 scope, 敏感度, 成本, 到期, and 审批 requirements. A 工作节点 should reject work outside those bounds.

#### 61.5 数据敏感度边界

Subtasks declare 敏感度; 工作节点 降级 or reject over-limit data per 保险箱 策略. Do not exfiltrate friends-tier content to 公开-tier 对等节点.

#### 61.6 成本与截止时间限制

授权 **成本 and deadline** limits apply on both 协调代理 and 工作节点 节点. 任务 运行时 guards 取消 到期 or over-预算 work.

#### 61.7 审批要求

Actions listed in `requiresApprovalFor` pause until 所有者 allow. External 智能体 observing 链 cannot bypass 审批 queues.

#### 61.8 运行时任务守卫

**任务 运行时 guards** enforce cancellation, collect-N termination, and 授权 到期 on 工作节点 mid-flight.

#### 61.9 保险箱与模型隔离

Workers 运行 模型 and 保险箱 访问 locally under Diplomat → 绑定 → Brain → 保险箱 isolation. 远程 orchestrators never receive raw 保险箱 文件系统 路径.

#### 61.10 阻止与吊销工作节点

**Block** 信任 to 停止 all collaboration with a 对等节点. **吊销** 智能体 授权 on your 节点 if your 工作节点 should reject new inbound 链 proposals.

#### 61.11 应对恶意或错误配置的智能体

For misconfigured 智能体, 禁用 Join, rotate 密钥, block 对等节点, and 取消 active 链. Collect 审计 evidence before re-enabling.

#### 61.12 审查端到端审计轨迹

Stitch **审计 JSONL** by `chainId` and `correlationId` across 协调代理 and 工作节点 节点 (each side 日志 its view). No central 服务器 holds the trail.


### 62. 智能体网络连通性

#### 62.1 局域网发现

**mDNS / LAN 发现** helps find 对等节点 on the same 网络 for bonding and lower-延迟 路径. It does not replace 绑定 establishment for 协作任务.

#### 62.2 直接对等连接

**直接 TCP/QUIC** connections are preferred when dial hints show reachable private addresses. Same-LAN 工作节点 score higher in Assigner.

#### 62.3 中继辅助连接

**中继-assisted** circuit 路径 connect WAN 对等节点 when NAT blocks 直接 dial. 中继 do not terminate TLS for 链 载荷 beyond transport 中继.

#### 62.4 Agent Card 同步

智能体 cards 同步 over 绑定-triggered 获取 and 能力 索引 updates. Stale 同步 manifests as missing 工作节点 until refresh.

#### 62.5 能力发现

**能力 发现** queries the 索引 built from bonded 对等节点’ cards. Only opted-in 工作节点 with matching tags appear.

#### 62.6 离线工作节点

**离线 工作节点** fail probes and 心跳; 协调代理 marks subtasks stalled and may reassign per 策略.

#### 62.7 重连与重试

libp2p reconnects automatically when 对等节点 return. Retry 发现 after 网络 changes; use 中继 引导 if 直接 路径 fail.

#### 62.8 多中继协调

**Multi-中继** 设置 use community or private 引导 对等节点 for DHT and circuit 中继. Override `TEST_RELAY_ADDR` only in tests—操作员 配置 引导 in 节点 设置.

#### 62.9 NAT 与防火墙考量

Open 防火墙 ports for outbound mesh traffic; inbound 直接 dial may require port mapping or 中继 fallback. 协作任务 可靠性 improves with working circuit reservations.

#### 62.10 诊断工作节点可达性

运行 对等节点 **probe** from 智能体网络 设置, inspect dial hints, and 验证 中继 reservation 日志. Compare LAN vs WAN 路径 when 工作节点 are reachable but slow.


### 63. 智能体网络故障排查

#### 63.1 加入开关不生效

If Join toggle does not stick, restart 节点, check `capabilityProviderEnabled` in 配置, and confirm no 集群 script overwrote 设置. Re-启用 and refresh 工作节点 on a 对等节点.

#### 63.2 工作节点不可见

Invisible 工作节点: 验证 绑定 tier, 远程 Join 启用, 能力 tag present, and click **Refresh 工作节点**. 公开-tier 绑定 do not auto-获取 cards.

#### 63.3 Agent Card 过期或缺失

Force card refresh by re-bonding or manual 获取; cards older than cache TTL may hide new 能力. Check 审计 for `智能体.card.response` errors.

#### 63.4 无合格工作节点

Fix **no eligible 工作节点** by bonding 联系人, having them Join, aligning 能力 tags with 计划, and refreshing. UI should block 启动 rather than 运行 solo multi-智能体 fiction.

#### 63.5 无法创建计划

**计划 cannot be created** when LLM planner fails, 能力 mismatch, or depth/预算 constraints violate 授权. Simplify goal or add 工作节点.

#### 63.6 竞标或协商未完成

Stuck **竞价**: check competitive mode 超时, 工作节点 Join status, and 绑定策略. Counter-竞价 loops exhaust when max 协商 rounds reached.

#### 63.7 任务停滞

Stalled jobs: inspect 心跳, stall 策略, 工作节点 离线 状态, and 所有者-审批 waits. Manual 重新平衡 or 取消 may unblock.

#### 63.8 工作节点未返回结果

Empty **results** often mean 工作节点 rejected 授权, hit 敏感度 wall, or crashed locally. Worker-side 审计 shows deny vs fail reason.

#### 63.9 无法打开交付物

Artifact open failures: 验证 保险箱 路径 on 协调代理 节点, 敏感度 审批, and that 文件交付物 IDs still exist. Re-同步 资料库 if chunked content missing.

#### 63.10 预算或审批阻塞任务

预算 or **审批 blocks** show as `waiting_for_owner`. Resolve 审批 or raise 授权 limits on 桌面, then resume.

#### 63.11 交接失败

**交接 fails** when 远程 assigner unreachable, 信任 insufficient, or 迭代 状态 rejected. Parent should fail over or 取消 subtree; check `任务.链.交接` 审计.

#### 63.12 报告不完整

**Partial 报告** may 发布 under best-effort termination 策略 when some subtasks fail. Review attribution to see which sections are missing.

#### 63.13 收集诊断

Collect **diagnostics**: 链 ID, 审计 excerpts, 工作节点 roster snapshot, 绑定 tiers, card timestamps, and 网络 probe results from both 协调代理 and 工作节点 节点.


---

## 第 VIII 部分 —— 任务、授权与交付物

### 64. 任务基础

#### 64.1 什么是 EnvoyMesh 任务

An EnvoyMesh 任务 is a signed, 策略-checked request between 智能体 with an objective, requested result, constraints, 生命周期, and attributable 交付物. It is narrower than a 协作任务, which coordinates several subtasks.

#### 64.2 任务目标与请求结果

状态 a clear **objective** and **requestedResult** so 工作节点 can judge fit before accepting. Vague goals cause unnecessary `任务.协商` rounds or early `任务.reject`; include 敏感度 hints when 保险箱 content is involved.

#### 64.3 创建任务

On mesh, 智能体 open a 任务 with `任务.授权` then `任务.propose`. Over A2A, `消息/send` 触发器 the 生产 executor: 绑定 gate → home-所有者-signed 授权 → `任务.propose` → `handleDaemonTaskInbound` (运行时 guard + 日志).

#### 64.4 提议与协商

`任务.propose` offers concrete work under an accepted 授权; `任务.协商` adjusts terms. Both are signed 智能体 信封—the daemon inbound handler 验证 授权 bounds before advancing 生命周期 状态.

#### 64.5 接受或拒绝工作

Workers reply with `任务.accept` or `任务.reject`. Acceptance requires 绑定 tier and 授权 ceilings still satisfied; rejection should carry a reason auditors can correlate via `correlationId`.

#### 64.6 跟踪任务状态

Track progress in Social, 审计 JSONL, or A2A `任务/get` when bridged. Map internal twelve-状态 生命周期 to nine A2A 状态 when presenting status to external clients.

#### 64.7 心跳 and partial results

Emit `任务.心跳` during long 运行 so orchestrators do not stall waiting. Partial `任务.result` 载荷 记录 interim 交付物 while 授权 `collectCompletedResults` and 到期 rules remain enforced.

#### 64.8 已完成与失败的任务

终端 success requires a signed `任务.result` in `completed` 状态; failures land in `failed` with an auditable reason. A2A pollers see mapped `completed` / `failed` after `任务/get`.

#### 64.9 取消任务

Send 原生 `任务.取消` on mesh or `任务/取消` over A2A JSON-RPC. Tokens are 所有者-scoped—a bearer mapped to one 所有者 cannot 取消 another 所有者's tracked 任务.

#### 64.10 任务反馈

Attach post-completion feedback to the 任务 记录 for 操作员 review. Feedback does not widen 授权 authority or alter 交付物 内容哈希 already 发布.


### 65. 任务生命周期

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 340" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><circle cx="40" cy="180" r="10" fill="#3d5a45"/><rect x="70" y="160" width="120" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">created</text><rect x="230" y="160" width="120" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="290.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">planned</text><rect x="390" y="160" width="130" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="455.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">discovering</text><rect x="570" y="160" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="640.0" y="184.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">negotiating</text><path d="M50,180 L70,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M190,180 L230,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M350,180 L390,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M520,180 L570,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="570" y="60" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="640.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">waiting_for_peer</text><rect x="570" y="260" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="640.0" y="284.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">waiting_for_owner</text><path d="M640,160 L640,100" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M640,200 L640,260" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="390" y="60" width="130" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="455.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">running</text><path d="M570,80 L520,80" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="230" y="60" width="120" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="290.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">partial</text><path d="M390,80 L350,80" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="70" y="60" width="120" height="40" rx="20.0" fill="#F0FDF4" stroke="#5d3ac7" stroke-width="1.2"/><text x="130.0" y="84.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">completed</text><path d="M230,80 L190,80" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="230" y="260" width="120" height="40" rx="20.0" fill="#FEE2E2" stroke="#5d3ac7" stroke-width="1.2"/><text x="290.0" y="284.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">failed</text><rect x="70" y="260" width="120" height="40" rx="20.0" fill="#FEE2E2" stroke="#5d3ac7" stroke-width="1.2"/><text x="130.0" y="284.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#1e1d1b">cancelled</text><path d="M640,280 L570,280" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M230,280 L190,280" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M280,200 L280,260" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 4 —— 任务生命周期：12 个状态与三个终态（completed 绿色、failed/cancelled 红色）。箭头表示合法转换；协商可分支到等待状态；部分结果可继续到完成。</figcaption></figure>


#### 65.1 Created

Created means the 任务 记录 exists but 计划 or 对等节点 interaction has not begun. It is a 生命周期 状态, not a statement that the product 功能 is merely 计划中.

#### 65.2 Task planned

任务 计划中 means the 节点 has derived an 执行 approach and can proceed to 发现 or proposal. The source 模式 names this 状态 `计划中`.

#### 65.3 Discovering

The 协调代理 scans bonded 对等节点 and 能力-索引 entries within 授权 联系人 scope. 发现 stalls when no 工作节点 meets 绑定 tier (`直接` / `推荐`) or 敏感度 requirements—refresh 智能体 cards before blaming mesh outage.

#### 65.4 Negotiating

Active `任务.协商` exchanges adjust deliverables, 成本, or 敏感度. Either party rejects when a counter-offer exceeds 授权 `maxCost`, `maxSensitivity`, or disallowed actions.

#### 65.5 Waiting for a peer

状态 `waiting_for_peer` means no 远程 智能体 has accepted yet. 验证 远程 Join toggles, 绑定 tier, and dial hints; time out and reassign per 协调代理 策略 if 心跳 停止.

#### 65.6 Waiting for the owner

`waiting_for_owner` follows `requiresApprovalFor` hits or 绑定策略 that demands 所有者 consent. Clear the Social 审批队列 on the home 节点—A2A clients may see `input-required` until then.

#### 65.7 Running

模型, 保险箱 reads, and 工具 执行 under Brain/保险箱 isolation on the 工作节点. The A2A 桥接 默认值 to leaving 任务 `运行` until a real mesh `任务.result` arrives (unless `autoCompleteLocal` is 启用 for smoke).

#### 65.8 Partial

Partial 状态 记录 one or more 交付物 while work continues. 授权 `closeOnFirstCompletedResult` may terminate the 任务 as soon as the first acceptable 交付物 lands.

#### 65.9 Synthesizing

Team and multi-工作节点 flows 合并 child 交付物 into a composite result. Weighted child references preserve 工作节点 lineage through the synthesis step.

#### 65.10 Completed

Completed is 终端: the requested work ended successfully and the 可用 result and 交付物 were recorded.

#### 65.11 Failed

Failed is 终端: 执行 ended without a successful result. Preserve the reason and 审计轨迹 before retrying.

#### 65.12 Cancelled

取消 is 终端 after an 所有者, 设备, 对等节点, or 策略 路径 停止 the 任务. A2A spells the mapped external 状态 `取消` with one “l”.


### 66. 授权与委派权限

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 720 310" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="290" y="150" width="180" height="60" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="380.0" y="177.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="14" font-weight="600" fill="#1e1d1b">Mandate</text><text x="380.0" y="193.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">owner-signed envelope</text><rect x="40" y="40" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Allowed actions</text><path d="M220,60 L290,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="40" y="110" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="127.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Disallowed actions</text><path d="M220,130 L290,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="40" y="180" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="197.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Contact scope</text><path d="M220,200 L290,200" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="40" y="250" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="130.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Sensitivity ceiling</text><path d="M220,270 L290,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="40" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Cost limits</text><path d="M530,60 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="110" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="127.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Expiration</text><path d="M530,130 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="180" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="197.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Approval requirements</text><path d="M530,200 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="530" y="250" width="180" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="620.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">First-result / collect-many</text><path d="M530,270 L470,180" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 15 —— 授权剖析：八个正交维度限制智能体可做什么。所有者签名信封；每个维度独立可执行。</figcaption></figure>


#### 66.1 为什么智能体需要授权

A 授权 prevents an 智能体 from interpreting a broad goal as unlimited authority. It defines a verifiable 信封 within which 计划, 工具 use, 对等节点 联系人, and 支出 are 允许.

#### 66.2 谁签发授权

**授权 are always home-所有者 signed.** External A2A bearer tokens identify the 所有者 context but do not sign 授权—the 生产 executor uses the 所有者's 密钥. 智能体 act under 所有者-委托 凭证 验证 via 授权 签名.

#### 66.3 允许与禁止的动作

`allowedActions` and `disallowedActions` constrain which 意图 and 工具 may 运行. The 任务 运行时 guard denies transitions that would invoke a disallowed action even mid-执行.

#### 66.4 联系人与对等节点范围

授权 may 限制 participating 对等节点 IDs or 联系人 lists. 绑定 tiers `自身`, `直接`, and `推荐` further limit who may receive `任务.propose`—strangers cannot accept 委托 work.

#### 66.5 数据敏感度上限

`maxSensitivity` caps 保险箱 and 知识 暴露 for the whole 任务. Workers must not return 交付物 above the 授权 ceiling even when local 绑定策略 would normally allow higher 敏感度.

#### 66.6 成本限制

`maxCost` bounds authorized spend. Exceeding it 停止 执行 unless the 所有者 issues a new 授权 or approves an extension through the 审批队列.

#### 66.7 过期

`到期时间` is enforced by the 任务 运行时 guard on every inbound 意图. Post-到期 proposals, 心跳, and results are rejected before 模型 or 保险箱 访问.

#### 66.8 首结果与多结果策略

Set `closeOnFirstCompletedResult` to 停止 after the first successful 工作节点; use `collectCompletedResults` when fan-out jobs need N completions before synthesis.

#### 66.9 审批要求

List sensitive actions in `requiresApprovalFor` to pause until 所有者 allow in Social. Bridged A2A callers stall in `waiting_for_owner` or see `input-required` until 审批 clears.

#### 66.10 智能体专属授权

Bind 授权 to `envoy:智能体:<哈希>` via 所有者-signed 智能体 凭证. 远程 对等节点 验证 the 智能体 is authorized by the stated 所有者 before accepting proposals.

#### 66.11 意图证明

Optional signed proof-of-意图 documents why the 智能体 initiated work. Use for 审计 trails—it does not bypass 绑定 checks or replace 授权 签名.

#### 66.12 吊销或取消权限

所有者 吊销 授权 or send `任务.取消` to halt further work. 吊销 prevents new proposals under the same 授权 ID; completed 交付物 and 审计 history remain intact.


### 67. 交付物与结果

#### 67.1 文本交付物

A 文本交付物 contains human-readable output and may include a media type. Use it for summaries, explanations, and 报告 that do not require a structured 模式.

#### 67.2 文件交付物

A 文件交付物 refers to a 保险箱 路径 and 内容哈希, with optional name, media type, and size. Recipients should 验证 the 哈希 before trusting downloaded bytes.

#### 67.3 结构化交付物

A 结构化交付物 carries a 模式 reference and object data. It is suitable for machine-readable results, tables, 记录, and 互操作性 载荷.

#### 67.4 复合交付物

A 复合交付物 contains weighted, attributed child 交付物 and an aggregation strategy. 协作任务 use it to retain 工作节点 lineage through 合并.

#### 67.5 内容哈希

File and structured 交付物 carry sha256 hashes. Verify hash before trusting downloaded bytes—especially when fetching via authenticated `GET /vault/<path>?hash=…` on the home bridge or 中继 proxy.

#### 67.6 显示名称与媒体类型

Set `displayName` and `mediaType` for UI rendering and A2A Part translation. These labels aid presentation; they never substitute for 哈希 verification on 文件 content.

#### 67.7 工作节点来源

Artifacts 记录 producing 智能体 对等节点 IDs. Composite 合并 retain weighted child references so 协作任务 attribution survives synthesis.

#### 67.8 将结果存入保险箱

文件 交付物 reference 保险箱 路径 on the 执行 节点. 路径-安全 and 敏感度 checks 运行 before write; bridged 文件 Parts 暴露 gateway URIs instead of raw 文件系统 路径.

#### 67.9 共享结果

发布 交付物 IDs inside signed `任务.result` 信封 or 分享 within bonded `知识.query` bounds. Do not hand cross-tier 对等节点 直接 保险箱 路径 outside 授权 敏感度.

#### 67.10 校验结果

Check 授权 ID, 交付物 哈希, result-信封 签名, and 绑定 tier at delivery time. Re-获取 文件 bytes through 保险箱 HTTP with matching `?哈希=` before acting on content.

#### 67.11 MCP 内容映射

阶段 48 maps MCP TextContent, ImageContent, AudioContent, resource_link, and structuredContent into EnvoyMesh 交付物 via `mesh.MCP.call_tool`. The MCP 服务器 adapter reverses the mapping when external clients 通话 `mesh.*` 工具.

#### 67.12 A2A Part 映射

Text, Data, and 文件 Parts translate through `A2A-artifact-map.ts` into 原生 交付物 kinds. 文件 Parts 广告 `<gateway>/保险箱/<encodedPath>?哈希=…` URLs served from the home 桥接 (中继 forwards via home-tunnel).


---

## 第 IX 部分 —— MCP 与 A2A 互操作

### 68. 互操作概述

#### 68.1 原生 EnvoyMesh 通信

原生 EnvoyMesh communication uses signed 信封, 所有者 and 智能体 身份, 绑定策略, and typed 意图. It remains the preferred 路径 between EnvoyMesh 节点.

#### 68.2 为什么需要桥接

Claude 桌面, Cursor, and A2A SDKs speak MCP or JSON-RPC—not libp2p 信封. 选择性加入 桥接 端点 translate external 通话 into signed 授权 and 工具-注册表 invocations without handing clients a raw mesh socket.

#### 68.3 用于工具的 MCP

MCP target support focuses on the 2025-06-18 工具 interfaces: stdio or Streamable HTTP with `工具/list` and `工具/call`. Resources, prompts, and OAuth are future scope.

#### 68.4 用于智能体发现与任务的 A2A

A2A target support follows v1.0.0 concepts for 智能体 Card, unified Parts, 任务 methods, 轮询, and streaming. EnvoyMesh maps these external 通话 into its signed 任务 system.

#### 68.5 信任边界

桥接 sit above Diplomat: authenticate callers, enforce size limits, then 委托 to 绑定 and 授权. 桥接 tokens must not exceed the mapped 所有者身份's intended authority.

#### 68.6 认证

MCP 服务器 adapter: `ENVOYMESH_BRIDGE_SECRET` or `--桥接-token` matching `桥接.secret` on the 节点. A2A JSON-RPC: `授权: Bearer` from `a2aBridge.bearerTokens[]` (中继: `ENVOYMESH_A2A_BEARER_TOKENS` as `token:envoy:所有者:…`). Missing 认证 失败即关闭.

#### 68.7 审计

桥接 invocations emit 审计事件 (`auditTag: "MCP-服务器"`, A2A method names). Correlate external request IDs with internal 任务 IDs in JSONL when debugging cross-boundary flows.

#### 68.8 当前兼容范围

阶段 48 shipped: MCP consumer (`mesh.MCP.*` + `mcpConsumers` 配置), MCP 服务器 (`npx envoymesh MCP-服务器`), 智能体 Card at 中继 `/.well-known/智能体-card.json`, JSON-RPC `消息/send|stream`, `任务/get|取消`, and 保险箱 FileArtifact `GET /保险箱`. OAuth, MCP resources/prompts, and 匿名 A2A remain future scope.


### 69. 使用外部 MCP 服务器

#### 69.1 MCP 消费者模式做什么

Lets the home 智能体 通话 external MCP servers through `mesh.MCP.list_tools` and `mesh.MCP.call_tool`, backed by `@modelcontextprotocol/SDK` and entries in `节点-配置.json` → `mcpConsumers`.

#### 69.2 添加 MCP 服务器

Add to `mcpConsumers: [{ name, transport, command?, url?, bearerToken?, allowRemoteHttp?, env? }]`, reload 配置, then 运行 `mesh.MCP.list_tools` with the consumer `name` to confirm the 会话 启动.

#### 69.3 Stdio 传输

Stdio launches a 配置 local 进程 and exchanges MCP 消息 over standard input and output. Treat the command as executable code: use only trusted binaries and fixed arguments.

#### 69.4 流式 HTTP 传输

Streamable HTTP connects to an MCP 端点. EnvoyMesh 默认值 to safe local or HTTPS destinations and requires an explicit override for 远程 plain HTTP.

#### 69.5 列出外部工具

Call `mesh.MCP.list_tools` naming the 配置 consumer. Returns MCP 工具 模式 for 智能体 计划; empty or error responses usually mean 进程 exit, bad URL, or bearer mismatch.

#### 69.6 调用外部工具

Invoke `mesh.MCP.call_tool` with 工具 name and JSON arguments. MCP content blocks map into EnvoyMesh 交付物 suitable for 任务 results and 审计.

#### 69.7 内容与交付物映射

Text, image, 音频, resource links, and structured MCP content become typed 交付物. Inspect mapped output before publishing to bonded 对等节点 above 公开 敏感度.

#### 69.8 超时与响应限制

Consumer 会话 honor SDK 超时 and 节点 载荷 size caps. Oversized MCP responses are rejected before entering the 语义防火墙 or 保险箱.

#### 69.9 远程 URL 安全

远程 URL 验证 reduces SSRF risk: prefer HTTPS, avoid private metadata services, keep loopback as the default, and 启用 远程 plain HTTP only for a 控制 开发 网络.

#### 69.10 排查 MCP 消费者

验证 `command` vs `url`, stdio vs Streamable HTTP transport, `allowRemoteHttp` for dev plain-HTTP 端点, and `bearerToken`. 审计 JSONL distinguishes connection failures from 模式 验证 errors.


### 70. 将 EnvoyMesh 作为 MCP 服务器

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 800 140" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:800px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><text x="120" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#645a3a">MCP Consumer (§69)</text><rect x="40" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="120.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyMesh Agent</text><text x="120.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mesh.mcp.call_tool</text><path d="M200,60 L260,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="260" y="40" width="140" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="330.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">External MCP</text><text x="330.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">stdio / HTTP</text><text x="560" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#645a3a">MCP Server (§70)</text><rect x="440" y="40" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="520.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Claude Desktop</text><text x="520.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">external client</text><path d="M600,60 L660,60" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="660" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="720.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">EnvoyMesh</text><text x="720.0" y="73.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">envoymesh mcp-server</text><text x="380" y="120" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Same node, two opposite directions. Consumer pulls external tools in; Server pushes mesh tools out.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 9 —— MCP 消费者 vs 服务器：同一个 EnvoyMesh 节点可消费外部 MCP 工具（方向 A），或向 Claude Desktop 等 MCP 客户端暴露 mesh 工具（方向 B）。数据方向相反。</figcaption></figure>


#### 70.1 MCP 服务器模式暴露什么

The stdio adapter answers MCP JSON-RPC (`initialize`, `工具/list`, `工具/call`) and forwards to the home 桥接 HTTP listener (default `HTTP://127.0.0.1:3031`), exposing 注册 `mesh.*` 工具.

#### 70.2 启动 `envoymesh mcp-server`

启动 the adapter through the EnvoyMesh CLI `MCP-服务器` command (for example, the packaged or workspace CLI invocation documented for your release). It communicates by stdio and forwards 通话 to the 配置 local 桥接.

#### 70.3 连接 Claude Desktop

Edit `~/库/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
"mcpServers": {
  "envoymesh": {
    "command": "npx",
    "args": ["envoymesh", "MCP-服务器"],
    "env": { "ENVOYMESH_BRIDGE_SECRET": "YOUR_SECRET" }
  }
}
```

Restart Claude 桌面; confirm **envoymesh** appears under MCP servers. Match `ENVOYMESH_BRIDGE_SECRET` to the 节点's `桥接.secret`.

#### 70.4 列出 EnvoyMesh 工具

Ask Claude or Cursor to list MCP 工具—you should see `mesh.*` entries from the home 工具 注册表. An empty list usually means the 桥接 listener is down or the 桥接 secret mismatches.

#### 70.5 调用 mesh 工具

MCP `工具/call` reaches the 桥接; the 节点 运行 绑定 checks and 工具 handlers locally. 启动 with read-only 工具 (联系人, ping) before invoking 保险箱 or spend actions.

#### 70.6 桥接认证

Set `桥接.secret` on the 节点 and the same value in `ENVOYMESH_BRIDGE_SECRET` or pass `--桥接-token YOUR_SECRET` to the adapter. Misaligned secrets return 401 before any 工具 运行.

#### 70.7 本地与远程桥接 URL

Default: `npx envoymesh MCP-服务器 --桥接 HTTP://127.0.0.1:3031`. For LAN hosts add `--桥接-allow-远程` and point `--桥接` at the 节点's 桥接 URL—avoid plain HTTP with live secrets on untrusted 网络.

#### 70.8 错误处理与审计标签

Adapter failures surface as MCP 工具 errors; successful 通话 日志 `auditTag: "MCP-服务器"` on the 节点. Distinguish 桥接 401 (认证) from 工具 deny (绑定/授权) in 审计 summaries.

#### 70.9 当前仅工具范围

Current 服务器 scope 暴露 工具. MCP resources and prompts are not automatically translated into the 保险箱 or 资料库.

#### 70.10 OAuth 与 MCP 资源 —— 未来工作

**Future.** Bearer 认证 is current; OAuth 2.1 and broader MCP resources/prompts support are 暂缓 until required by a 部署.

#### 70.11 排查 MCP 服务器

运行 manually: `npx envoymesh MCP-服务器 --桥接 HTTP://127.0.0.1:3031`. Confirm the 节点 桥接 listener is up, secrets match, and 工具 are 启用 in 节点 配置. See `docs/阶段-48-interop-smoke.md` for the full checklist.


### 71. A2A Agent Card

#### 71.1 什么是 Agent Card

A2A 智能体 Card JSON describes name, skills, 能力, 安全 schemes, and the JSON-RPC interface URL. EnvoyMesh translates 原生 智能体 cards through `toA2AAgentCard()` before 中继 publication.

#### 71.2 发现 well-known Agent Card

An A2A client 获取 `/.well-known/智能体-card.json` from the 配置 中继 HTTP origin. Publication is 选择性加入 through A2A 桥接 设置.

#### 71.3 身份与提供商字段

Fields derive from EnvoyMesh 资料 and 智能体-网络 metadata—display name, 提供商 URL, 所有者-linked hints. The 中继 may attach optional Ed25519 签名 (`type: "envoymesh-Ed25519"`) so clients can detect tampering.

#### 71.4 技能与能力

原生 能力 map to A2A skills with strength tags from the 能力 索引. Clients use skills for 发现 fit—not as 授权; bearer tokens and 绑定 still gate 任务 执行.

#### 71.5 支持的接口

`supportedInterfaces[0].url` targets `/.well-known/A2A/jsonrpc` on the 配置 gateway. 获取 the card first, then POST JSON-RPC to that URL with the same bearer token used for 任务.

#### 71.6 流式能力

When `能力.streaming: true` and metadata includes `x-envoymesh-taskBridgeStatus: "可用"`, clients may 通话 `消息/stream` for 服务器发送事件 任务 updates instead of 轮询 `任务/get` alone.

#### 71.7 已签名 Agent Card

The 中继 can sign the 智能体 Card with its Ed25519 控制 身份 so clients can detect alteration. Consumers must still decide whether they 信任 that signer and 端点.

#### 71.8 中继发布

启用 with `--A2A-桥接` / `ENVOYMESH_A2A_BRIDGE=1` and set `--A2A-gateway-url` / `ENVOYMESH_A2A_GATEWAY_URL`. The card is served at `GET /.well-known/智能体-card.json` on the 中继 HTTP port (commonly `:15432`).

#### 71.9 隐私与字段过滤

Sensitive 资料 fields may be omitted from the 公开 card. Treat 发布 cards as 发现 metadata—任务 授权 still requires bearer tokens, 绑定 tiers, and home-所有者-signed 授权.

#### 71.10 排查名片发现

运行 `curl -sS https://中继:15432/.well-known/智能体-card.json | jq .` — expect HTTP 200 when the 桥接 is 启用, 503 when 禁用. 验证 the gateway URL hostname matches the TLS 证书 clients use.


### 72. A2A 任务

#### 72.1 A2A JSON-RPC 端点

The 公开 中继 暴露 `POST /.well-known/A2A/jsonrpc`; the home 桥接 uses the loopback `/A2A/jsonrpc` 路径. The 中继 authenticates and forwards rather than 执行 the 模型 itself.

#### 72.2 Bearer 令牌认证

Bearer tokens map an external caller to an EnvoyMesh 所有者身份. Keep tokens unique, rotate them, and bind them to the minimum intended 信任 relationship.

#### 72.3 用 `message/send` 发送任务

`消息/send` supplies user 消息 Parts and receives an A2A 任务. The 生产 executor applies 绑定策略, mints an 所有者-authorized 授权, and dispatches through the 原生 任务 运行时.

#### 72.4 用 `message/stream` 流式更新

`消息/stream` returns 服务器-sent 任务 updates for clients that need progress without 轮询. Close abandoned streams and observe gateway 超时.

#### 72.5 用 `tasks/get` 轮询

`任务/get` retrieves the current persisted 任务 mapping and 状态. Use it after a synchronous request returns working or after reconnecting.

#### 72.6 用 `tasks/cancel` 取消

`任务/取消` requests 原生 cancellation for the authenticated 所有者’s 任务. 所有者 scoping prevents one token from controlling another 所有者’s 任务.

#### 72.7 A2A 到 EnvoyMesh 的策略门

The 生产 executor 通话 绑定 `evaluatePolicy` for tiers `自身`, `直接`, and `推荐`. 绑定 denial returns A2A 状态 **`认证-required`**—no home-所有者-signed 授权 is minted for 阻止 or 公开 strangers.

#### 72.8 生产任务执行

Pipeline: bearer 认证 → 绑定 gate → home-所有者-signed `任务.授权` + `任务.propose` → `handleDaemonTaskInbound` (运行时 guard + 日志) → persist mapping for `任务/get` and `任务/取消`. Default leaves 任务 **`运行`** until a mesh `任务.result` arrives.

#### 72.9 中继到家庭转发

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 580 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:580px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="40" width="140" height="50" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="90.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">External A2A</text><text x="90.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">LangChain / etc</text><rect x="220" y="40" width="140" height="50" rx="6" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1.2"/><text x="290.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Relay</text><text x="290.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">bearer lookup · lean</text><rect x="420" y="40" width="140" height="50" rx="6" fill="#F5F3FF" stroke="#5d3ac7" stroke-width="1.2"/><text x="490.0" y="62.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#1e1d1b">Home Node</text><text x="490.0" y="78.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mandate · policy · executor</text><path d="M160,55 L220,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">① POST /.well-known/a2a/jsonrpc + Bearer</text><path d="M360,55 L420,55" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="51.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">② forward over home tunnel</text><path d="M420,75 L360,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">③ Task result + artifacts</text><path d="M220,75 L160,75" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="190.0" y="71.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">④ JSON-RPC response</text><rect x="20" y="130" width="540" height="50" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="146" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Relay never executes models, reads payloads, or stores tasks — it forwards only</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 11 —— A2A 中继到家庭转发：中继认证 Bearer 令牌并转发到所有者的家庭节点，后者持有授权、策略、模型与任务存储。中继保持精简。</figcaption></figure>


The 中继 looks up the token 所有者’s home and forwards over the home tunnel. It remains lean: 策略, 授权, 模型 执行, 任务 存储, and 交付物 stay on the home 节点.

#### 72.10 错误码

JSON-RPC errors follow A2A conventions; 绑定 denial surfaces as 任务状态 `认证-required`. 中继 `forwardToHome` preserves upstream HTTP status from the home 桥接 when the tunnel or 节点 rejects a 通话.

#### 72.11 排查 A2A 任务

Confirm bearer token maps to the intended 所有者, home tunnel is up for 中继 转发, and 审计 shows 授权/propose acceptance. Poll `任务/get` with the returned 任务 id; use `任务/取消` only for that 所有者's tracked 任务.


### 73. A2A 状态、交付物与文件映射

#### 73.1 EnvoyMesh 到 A2A 的任务状态

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:680px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><text x="140" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#645a3a">EnvoyMesh (12 states)</text><text x="540" y="25" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#645a3a">A2A (9 states)</text><rect x="60" y="50" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="59.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">created</text><rect x="60" y="76" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="85.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">planned</text><rect x="60" y="102" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="111.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">discovering</text><rect x="60" y="128" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="137.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">negotiating</text><rect x="60" y="154" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">waiting_for_peer</text><rect x="60" y="180" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="189.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">waiting_for_owner</text><rect x="60" y="206" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="215.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">running</text><rect x="60" y="232" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="241.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">partial</text><rect x="60" y="258" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">synthesizing</text><rect x="60" y="284" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="293.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">completed</text><rect x="60" y="310" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="319.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">failed</text><rect x="60" y="336" width="160" height="24" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="140.0" y="345.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">cancelled</text><rect x="460" y="50" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="59.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">submitted</text><rect x="460" y="76" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="85.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">working</text><rect x="460" y="102" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="111.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">input-required</text><rect x="460" y="128" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="137.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">completed</text><rect x="460" y="154" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="163.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">canceled</text><rect x="460" y="180" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="189.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">failed</text><rect x="460" y="206" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="215.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">rejected</text><rect x="460" y="232" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="241.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">auth-required</text><rect x="460" y="258" width="160" height="24" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="540.0" y="267.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" font-weight="600" fill="#1e1d1b">unknown</text><line x1="220" y1="62" x2="460" y2="62" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="88" x2="460" y2="62" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="114" x2="460" y2="88" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="140" x2="460" y2="88" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="166" x2="460" y2="88" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="192" x2="460" y2="114" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="218" x2="460" y2="114" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="244" x2="460" y2="140" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="296" x2="460" y2="166" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="322" x2="460" y2="192" stroke="#6d6a63" stroke-width="1" /><line x1="220" y1="348" x2="460" y2="218" stroke="#6d6a63" stroke-width="1" /></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 17 —— EnvoyMesh 到 A2A 状态映射：12 个内部状态收敛为 9 个 A2A 状态。多对一合并（如 waiting_for_peer + waiting_for_owner → input-required）由 a2a-state-map.ts 处理。</figcaption></figure>


Twelve internal 生命周期 状态 collapse to nine A2A 状态 via `A2A-状态-map.ts`. Document the mapping when building client UX that polls `任务/get` or renders 服务器发送事件 events from `消息/stream`.

#### 73.2 submitted、working 与 input-required

Fresh A2A 任务 often appear **`submitted`**, then **`working`** after 授权 acceptance through `handleDaemonTaskInbound`. **`input-required`** mirrors 所有者-审批 stalls or missing parameters the executor cannot infer.

#### 73.3 completed、failed 与 canceled

终端 A2A 状态 align with mesh `completed`, `failed`, and `取消` (A2A spells **`取消`** with one "l"). Artifacts attach on completed 路径 when the mapper finds 原生 results.

#### 73.4 rejected、auth-required 与 unknown

**`rejected`** follows 工作节点 `任务.reject` or executor refusal; **`认证-required`** signals 绑定 failure for the bearer-mapped 所有者; **`unknown`** covers untracked or 到期 任务 IDs not in `A2A-桥接-任务.json`.

#### 73.5 文本 Part

Inbound 消息 text becomes objective context and may map to TextArtifacts in results. Outbound text 交付物 become A2A Text Parts in bridged 任务 载荷.

#### 73.6 数据 Part

Structured JSON Parts map to structured 交付物 with 模式 hints. Validate 模式 and 敏感度 before acting on machine-readable output from external 智能体.

#### 73.7 文件 Part

文件 Parts carry URIs like `<gateway>/保险箱/<encodedPath>?哈希=…`. 获取 with the same A2A bearer used for JSON-RPC—the 中继 proxies `GET /保险箱/*` to the home 桥接 via home-tunnel.

#### 73.8 复合结果

Composite EnvoyMesh 交付物 expand into multiple A2A Parts where the mapper supports child weights and attribution metadata.

#### 73.9 保险箱支撑的文件 URL

文件 交付物 may be represented as authenticated 保险箱-backed URLs. The 端点 验证 路径 安全 and can check the expected 内容哈希 before serving bytes.

#### 73.10 哈希校验与访问控制

保险箱 HTTP 验证 路径 安全, A2A bearer 认证, and optional `?哈希=` against SHA256 (hex, base64url, or `SHA256:` prefix). 哈希 mismatch returns 403/404 without leaking whether the 路径 exists.


---

## 第 X 部分 —— 网络与中继

### 74. 点对点网络

#### 74.1 本地与互联网连接

节点 can discover and dial 对等节点 on a local 网络 or across the Internet. The final 路径 depends on 广告 addresses, NAT, 中继 可用性, and transport 兼容性.

#### 74.2 TCP、QUIC 与 WebSocket 路径

EnvoyMesh uses libp2p over TCP and QUIC for 直接 对等节点 links, and WebSocket where 中继 or NAT require HTTP-friendly transport. The Social UI and EnvoyGo usually reach the home 节点 over WebSocket when you are off-LAN. Transport choice affects reachability only; application 消息 still require signed 信封 and 绑定策略 after the link is up.

#### 74.3 本地发现

On the same 网络, 节点 can find each other through mDNS without typing multiaddrs. Use local 发现 when testing two machines on one Wi‑Fi segment before adding WAN 引导 对等节点. Guest 网络, VPN split tunneling, or 禁用 multicast can block mDNS—fall back to printed multiaddrs or 中继 check-in when LAN 发现 fails.

#### 74.4 分布式发现

Across the Internet, 节点 发布 and resolve 会合 记录 through 配置 引导 对等节点 and 中继 (DHT plus 中继 lookup 意图). WAN 发现 needs reachable 引导 multiaddrs and a compatible 发现 资料 (for example `wan-default` in source 运行). Zero 引导 对等节点 or an empty 中继 roster in `连通性-status` usually indicates 引导 or 防火墙 misconfiguration, not a missing 身份.

#### 74.5 直接连接

When both sides 暴露 reachable addresses, libp2p prefers a 直接 dial before any 中继 hop. 直接 路径 reduce 延迟 and keep 中继 操作员 out of the signed-信封 data plane. After every 节点 restart, copy the latest `Listening on:` multiaddr—dynamic ports invalidate saved addresses.

#### 74.6 NAT 与防火墙行为

Home routers and corporate firewalls often block inbound TCP unless you forward a port or use circuit 中继. Allow outbound TCP from the 节点 进程 on both 对等节点 when 诊断 WAN 连通性. `--连通性-strict` intentionally fails startup when all 引导 probes fail; 禁用 it only temporarily for 诊断, then 恢复 strict mode.

#### 74.7 连接升级

libp2p 协商 identify, stream muxers, and optional 中继 reservations below the application layer. Successful transport 升级 does not grant 信任—绑定策略 still applies to every 意图. 启用 `--P2P-debug` or 审计 `P2P.追踪` rows when a 对等节点 connects but signed 信封 exchange fails afterward.

#### 74.8 已签名信封流

Application traffic travels as Ed25519-signed `EnvoyEnvelope` 记录 on libp2p streams, not as opaque bytes trusted by IP alone. The 入站守卫 checks size, 模式, 签名, and 重放 before the 绑定 engine 运行. A live TCP 会话 without valid 签名 still produces deny or reject 结果 in 审计.

#### 74.9 离线对等节点与重试

对等节点 that restart, sleep, or roam may be unreachable until 中继 注册 and 广告 addresses refresh. Clients retry 发现 with updated multiaddrs; temporary 离线 status is not the same as a 阻止 绑定. Confirm 中继 roster freshness and 远程 check-in before treating a failure as a 信任 problem.

#### 74.10 网络诊断

Run `npm run cli -w @envoymesh/node -- connectivity-status --profile <path>` for bootstrap counts and 中继 hints; add `--rich` for a text snapshot. Export 审计 timelines with `--include-p2p-trace` when sharing connectivity evidence. Use the same absolute 资料 path for the 节点, CLI, and Social—a mismatched path makes diagnostics look empty even when traffic exists.


### 75. 中继服务

#### 75.1 何时需要中继

中继 help when NAT, firewalls, or 移动性 prevent a 直接 libp2p dial. They provide 会合, lookup, optional WebSocket entry, and circuit 转发—not 账户 login or 消息 解密 authority. Try 直接 路径 first; add a 中继 when 对等节点 cannot learn each other's reachable addresses.

#### 75.2 中继能做什么与不能做什么

A 中继 helps with 会合, lookup, WebSocket 访问, and 转发. It does not 运行 user 模型, become an 身份 authority, or receive 权限 to bypass signed-信封 策略.

#### 75.3 选择中继

Choose a 中继 you 信任 for 连通性 metadata: community 引导 预设, an 操作员-运行 集群 节点, or a private 中继 you administer. 记录 its 引导 multiaddr and 验证 it supports the 中继 协议 your 构建 expects (check-in, lookup, and circuit reservation on current releases). Avoid switching 中继 frequently while debugging—stale registrations confuse lookup results.

#### 75.4 通过中继连接

启动 the 节点 with `--中继` and `--引导 "<中继-multiaddr>"` (or an equivalent 设置 entry) so it checks in and 发布 a circuit address. 远程 对等节点 dial `/P2P-circuit/P2P/<your-对等节点-id>` when 直接 路径 fail. Confirm both sides use compatible 引导 lists and the same major 协议 版本.

#### 75.5 中继签到与查询

Checked-in 节点 注册 with `中继.checkin`; seekers resolve them through `中继.lookup` without learning private home IPs by default. 审计 rows such as `中继.checkin.ok` and `中继.lookup.response` confirm healthy 注册. An empty roster on the 中继 usually means clients never completed check-in or used the wrong 资料 路径.

#### 75.6 路由提示

中继 may return sibling or 集群 hints so clients try alternate 引导 路径 before giving up. Hints affect where to dial next, not who may send which 意图. Treat hints as 优化; 绑定策略 and 签名 still gate every application 消息.

#### 75.7 使用多个中继

配置 several 引导 中继 for redundancy when one host is down or geographically distant. Multi-homed clients can check in to more than one 中继 while keeping a bounded 中继 book locally. More 中继 improve reachability options; they do not 合并 信任 stores or 身份.

#### 75.8 使用中继时的隐私

中继 see connection metadata—对等节点 IDs, timing, and 转发 路径—not 解密 application 载荷 inside signed 信封. Choose 中继 操作员 accordingly, especially for sensitive workflows. End-to-end 意图 授权 still depends on 绑定 and 授权, not on hiding traffic from your chosen 中继.

#### 75.9 更改或移除中继

Update 引导 multiaddrs in 设置 or launch flags, restart the 节点, and 验证 fresh check-in before removing an old 中继 from your book. 对等节点 缓存 stale circuit addresses may fail until they rediscover you. Document the change for 联系人 who pinned your old 中继-dependent multiaddr.

#### 75.10 中继故障排查

运行 `中继-status` on the 中继 资料 and `连通性-status` on clients; compare roster totals, 引导 counts, and recent `P2P.追踪` rows. Common fixes: correct `--引导` multiaddr, open outbound TCP, align 资料 路径, and recopy post-restart 监听地址. See QuickStart WAN 故障排除 and 附录 K for command references.


### 76. 运营中继

#### 76.1 运维要求

**操作员.** 运行 a 中继 only if you can 维护 a stable host, 公开 reachability, 密钥 material, TLS for 公开 HTTP/WebSocket surfaces, 访问 控制, 监控, 升级, and abuse response.

#### 76.2 安装中继

构建 or deploy `apps/中继` from a current repository release on a stable host with a 公开 TCP listener. 包 安装 and source 运行 both work; keep the 中继 版本 aligned with client 节点 to avoid reservation handshake skew. Document the 引导 multiaddr you will give to 集群 clients.

#### 76.3 配置身份与监听地址

分配 the 中继 its own libp2p 密钥 material and bind to `/ip4/0.0.0.0/TCP/<port>` (or your 操作员 standard). Print and archive the resulting `/ip4/.../TCP/.../P2P/...` multiaddr for 引导 配置. Separate 中继 身份 from any personal EnvoyMesh 所有者 资料 you use elsewhere.

#### 76.4 配置公开模式

公开 mode 广告 an externally reachable address (`--广告-addr` on current builds) so circuit 中继 reservations work across NAT. Without it, a 中继 may appear 发现-only—clients connect for lookup but fail reservation handshakes. Match 广告 addresses to DNS or 防火墙 rules you actually 暴露.

#### 76.5 配置 WebSocket 访问

启用 the 中继 HTTP/WebSocket surface when thin clients or 浏览器 Social instances must tunnel through the 中继. Terminate TLS at the edge for 生产 hostnames. 限制 administrative routes from the 公开 Internet even when user WebSocket 路径 are open.

#### 76.6 配置管理员访问

Protect 中继 管理员 APIs and 指标 with 操作员 凭证, 网络 ACLs, or mutual TLS as your 部署 模型 requires. Never 暴露 unauthenticated 管理员 端点 on 公开 interfaces. Rotate 凭证 when 操作员 leave and 审计 访问 changes.

#### 76.7 发布 DNS 与 TLS 端点

Map stable DNS names to 中继 监听地址 and 安装 valid TLS 证书 for HTTPS and secure WebSocket. Clients embed these names in 引导 预设 and 配对 flows. Keep 证书 renewal 自动化—到期 TLS breaks 移动 and 浏览器 clients silently.

#### 76.8 监控健康、指标、名册与日志

Track 进程 health, 中继 roster size, lookup 延迟, and error rates from 中继 审计 snapshots and host 指标. Alert when roster drops unexpectedly or check-in failures spike. Correlate 中继-side 追踪 with client `连通性-status` during incidents.

#### 76.9 升级与备份中继

Back up 中继 密钥 material and 配置 before 升级; schedule 维护 when client traffic is low. Roll forward one 中继 at a time in multi-中继 集群 so 引导 lists always include a healthy 对等节点. Test circuit reservation after 升级 before decommissioning the old binary.

#### 76.10 应对滥用

Rate-limit or block 对等节点 IDs that flood lookup, reservation, or WebSocket 端点. Preserve 审计 evidence with 关联ID when escalating. Document your abuse 联系人 and takedown 进程 for 集群 customers—中继 carry 连通性 metadata even though they do not read 信封 载荷.


### 77. 多中继集群

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="40" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="100.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Leaf A</text><rect x="200" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="260.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Leaf B</text><rect x="360" y="40" width="120" height="40" rx="6" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1.2"/><text x="420.0" y="57.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">Leaf C</text><rect x="180" y="140" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="260.0" y="157.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Relay 1</text><text x="260.0" y="173.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">checkin · lookup</text><rect x="440" y="140" width="160" height="40" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="520.0" y="157.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Relay 2</text><text x="520.0" y="173.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">sibling hint</text><path d="M100,80 L220,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M260,80 L260,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M420,80 L500,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M260,80 L500,140" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="380.0" y="106.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">multi-home</text><path d="M340,160 L440,160" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="390.0" y="156.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="10" fill="#6d6a63">one-hop miss-forward</text><rect x="20" y="210" width="720" height="40" rx="4" fill="#F5F5F4" stroke="#6d6a63" stroke-width="1" stroke-dasharray="4,3"/><text x="28" y="226" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="600" fill="#6d6a63">Bounded relay book · sibling gossip · split-checkin avoided</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 13 —— 多中继集群：叶子节点在多个中继间多归属；兄弟中继交换提示并一跳错失转发查询。有界中继簿防止签到分裂故障。</figcaption></figure>


#### 77.1 为什么使用多个中继

Multiple 中继 improve geographic coverage, 正常运行时间, and 引导 redundancy. Clients can home to several 引导 entries while keeping a bounded local 中继 book. 集群 操作员 standardize 预设 so end users are not locked to a single community 节点.

#### 77.2 配置引导预设

引导 预设 bundle known-good 中继 multiaddrs (for example `公开-libp2p` in source 运行) so new 节点 启动 with WAN 发现 启用. 操作员 can ship private 预设 for enterprise 集群. 预设 seed 连通性—they do not 导入 联系人 or 信任 relationships.

#### 77.3 客户端多归属

A 节点 may check in to several 中继 and 维护 multiple circuit addresses simultaneously. Multi-homing helps roaming users stay reachable when one 中继 region is degraded. Local 中继-book pruning keeps 存储 bounded; stale entries drop after 配置 freshness Windows.

#### 77.4 有界中继簿

Each 节点 stores a capped 中继 book (`中继-book.json` in the 资料 目录) rather than an unbounded global 目录. Eviction 策略 favor recently 验证 中继. 操作员 should 监控 whether legitimate 中继 are aged out too aggressively in long-idle 部署.

#### 77.5 兄弟中继提示

Sibling hints tell a lookup client about alternate 中继 in the same 集群 when the primary miss occurs. They reduce failed dials during partial outages. Hints are optional 优化; clients must still complete check-in and lookup on the chosen target.

#### 77.6 一跳查询转发

When a 中继 does not hold a 注册, it may forward lookup to a sibling once rather than building a full 分层 graph. This covers many 集群 topologies today without ancestor/parent/child coordination. Deep multi-hop 转发 remains limited—see 77.10 for 暂缓 分层 work.

#### 77.7 集群健康与诊断

Compare roster counts, check-in rates, and lookup success across 集群 中继 using `中继-status` and 中继 审计 snapshots. 运行 live WAN 验证 tests from representative client 资料 after 配置 changes. Standardize 资料 路径 in runbooks so CLI and UI diagnostics align.

#### 77.8 真实 WAN 校验

Prove cross-网络 路径 with two 资料 on different 网络 bootstrapping to the same 中继, then exercise ping, chat, or 审计-验证 意图. QuickStart's cross-网络 中继 walkthrough and `npm 运行 poc:发现` smoke modes are reference flows. 记录 关联ID from both sides when filing 连通性 bugs.

#### 77.9 当前协调限制

Today's multi-中继 support covers bounded books, sibling hints, and one-hop miss 转发—not a complete 分层 中继 graph or global 中继 市场. 计划 集群 layouts accordingly. 功能 marked **延期** in 77.10 are design targets, not hidden toggles.

#### 77.10 完整分层中继图 —— 延期

**暂缓.** Current multi-中继 coordination supports bounded books, sibling hints, and one-hop miss 转发; the complete 分层 ancestor/parent/child graph remains future work.


---

## 第 XI 部分 —— 终端、浏览器与高级用法

### 78. 终端

#### 78.1 打开终端视图

Open 终端 from Social's navigation or 启动 a 会话 from an eligible chat 线程. The view lists active PTY 会话 on the home 节点 and offers 控制 to attach, resize, or end them. EnvoyGo 暴露 the same 能力 through its 终端 screen when paired to home.

#### 78.2 创建与管理终端会话

Create a 会话 to spawn a Shell PTY on the home 桌面 节点; name or tag 会话 when the UI supports it so you can find long-运行 work. Multiple clients can attach read/write depending on 策略. Sessions persist until closed or until the 节点 restarts—save important output elsewhere.

#### 78.3 了解家庭端 PTY

The 终端 进程 运行 as a PTY on the home 桌面 节点. EnvoyGo and the Social UI are clients of that 会话, so commands 执行 with the home user’s operating-system 权限.

#### 78.4 使用终端输入与输出

Type commands in the 终端 pane; stdout and stderr stream back over the authenticated WebSocket or JSON-RPC tunnel. Large output may be truncated in 移动 clients—prefer 桌面 Social for heavy 日志. Copy/paste behavior follows your 平台 and 浏览器 constraints.

#### 78.5 使用智能体辅助终端模式

When 智能体 assist is 启用, EnvoyAI may propose Shell commands based on your 对话 context. Review every proposed command before 执行—智能体 assist does not bypass 审批 you 配置. 拒绝 commands should appear in 审计 with an explicit 结果.

#### 78.6 从 EnvoyGo 访问终端

EnvoyGo attaches to home-节点 PTY 会话 over the paired JSON-RPC transport; commands still 执行 on the 桌面 with its OS 权限. Keep the home 节点 awake and reachable via 中继 or LAN while using 移动 终端. Treat 手机 访问 as 远程 控制 of a powerful surface.

#### 78.7 Security and approvals

终端 访问 is powerful and can alter 文件, 凭证, or software. 限制 配对, require 审批 for 智能体-suggested commands, inspect commands before 执行, and close abandoned 会话.

#### 78.8 安全关闭会话

Exit long-运行 programs cleanly (`exit`, `Ctrl+D`, or application-specific 停止 commands) before closing the 终端 tab. Abrupt disconnects may leave background jobs 运行 on the home 节点. 吊销 配对 or change 审批 if you 分享 a 会话 unintentionally.

#### 78.9 Troubleshoot terminals

If attach fails, confirm the home 节点 is 运行, WebSocket or 中继 路径 are healthy, and your 会话 token is valid. Check 审计 for 认证-required or deny rows tied to 终端 RPCs. Restart the 节点 only after closing sensitive 会话 you do not want orphaned.

#### 78.10 外部终端集成

Some releases integrate external 终端 products through the same home PTY boundary rather than granting them libp2p 密钥. 配置 integrations in 设置 and 限制 them to trusted 网络. External 工具 inherit home-节点 OS 权限—apply the same caution as local Shell 访问.


### 79. 浏览器

#### 79.1 打开浏览器视图

Open 浏览器 from Social or EnvoyGo to 浏览 permitted mesh content. The view resolves `envoy://` URLs through your home 节点's 策略 boundary, not the 公开 web by default. 配对 or local 节点 可用性 is required before content loads on 移动.

#### 79.2 Navigate `envoy://` content

An `envoy://` URL identifies mesh-托管 content by author and 路径 rather than a 公开 web 服务器. Resolution passes through the paired or local 节点 and its 信任 策略.

#### 79.3 Browse authors and topics

浏览 by author DID, 发布 主题, or 订阅源 your 绑定策略 暴露. Strangers may see only 公开-敏感度 material; bonded 联系人 may see friends-level 笔记 when authors 发布 them. Empty lists often mean 策略 denial, not a broken 索引—check 信任层级 and 敏感度 labels.

#### 79.4 Use history and bookmarks

浏览器 history and bookmarks are stored locally in your 资料 for quick return to mesh pages you already 访问. Clearing history does not unpublish 远程 content. Bookmarks reference `envoy://` 路径; if an author moves content, update or remove stale entries.

#### 79.5 从浏览器发布

Publishing creates or updates mesh-visible content from 笔记 and pages you own, subject to per-item 敏感度 toggles in 资料库. 公开 items become queryable via `知识.query` within rate limits; friends-level items require appropriate 绑定. Preview 敏感度 before publishing sensitive drafts.

#### 79.6 订阅动态更新

Subscribe to authors or 主题 to receive 订阅源 updates when new mesh content appears and 策略 allows delivery. 订阅 respect 绑定 and 敏感度 rules—dropping a 绑定 may silently 停止 updates. 推送 通知 on EnvoyGo depend on home-节点 转发 and 平台 权限 设置.

#### 79.7 在 EnvoyGo 上使用浏览器

EnvoyGo renders 浏览器 through the paired home 节点, mirroring 桌面 策略 results on a smaller screen. Keep the home 节点 在线; cached pages may be stale when 离线. Read-only 浏览 does not substitute for 资料库 editing—create 笔记 on 桌面 when possible.

#### 79.8 Paired-mode requirements

移动 浏览器 requires a completed EnvoyGo 配对 with a healthy home JSON-RPC 会话. Without 配对, the 手机 has no 保险箱, 绑定 store, or signing context to resolve `envoy://` URLs. Re-配对 if 会话 tokens expire or after major home-节点 身份 changes.

#### 79.9 Troubleshoot Browser content

When a page fails to load, 验证 the URL author exists, 敏感度 allows your 信任层级, and the home 节点 can reach the publishing 对等节点. 审计 may show 绑定 deny or 模式 reject for 获取—not generic HTTP 404 semantics. Retry after 绑定 acceptance or author republish.


### 80. 高级设置

#### 80.1 Node settings

节点 设置 cover 资料 身份, display name, 发现 资料, 监听地址, and service ports for the home 运行时. Changes often require a restart to take effect. 笔记 your 资料 目录 路径 before editing 路径 or ports so CLI and Social stay aligned.

#### 80.2 Network and bootstrap settings

配置 引导 multiaddrs, 预设, strict 连通性 mode, and 广告 监听地址 here or via equivalent launch flags. Misconfigured 引导 lists are the most common WAN failure mode. After changes, 运行 `连通性-status` and inspect 审计 for 引导 probe results.

#### 80.3 Relay settings

启用 client 中继 mode, set 引导 中继, and manage the local 中继 book from 中继 设置. These 控制 affect how others dial you—not whom you 信任. 配对 中继 changes with `中继-status` on both client and 中继 操作员 资料 during rollout.

#### 80.4 AI and model settings

AI 设置 select 提供商, 模型 routes, 语义防火墙 behavior, and EnvoyAI/OpenClaw gateway integration. API 密钥 and 模型 凭证 live in 资料 配置—back them up securely and never paste them into support bundles. 禁用 远程 模型 when air-gapped 策略 requires local-only inference.

#### 80.5 External-agent settings

External-智能体 设置 配置 HomeClaw, Hermes, OpenHuman, or custom HTTP 桥接, including ports, bearer secrets, and 启用 预设. 桥接 forward 策略-checked 工具—they do not receive raw libp2p 密钥. Rotate 桥接 secrets after compromise and review action history against 审计 JSONL.

#### 80.6 Agent Network settings

智能体网络 设置 控制 选择性加入 collaboration, 工作节点 可见性, 协作任务 预算, and orchestration limits. Both sides must opt in and hold appropriate 绑定 before 智能体 collaborate. 启动 with manual 审批 and small 授权 before enabling automatic spend 重新平衡.

#### 80.7 Knowledge and storage settings

Point the 保险箱 at `shared_vault/` (default in source 运行) or a 配置 路径; 启用 资料库 plugins such as Obsidian or MCP under 知识库. 敏感度 默认值 and indexing options live here. Large 保险箱 moves require re-索引 time and 磁盘 space on the home 节点.

#### 80.8 Call and TURN settings

Voice 通话 设置 include STUN/TURN URLs, 凭证, and 平台-specific 推送 主题 for EnvoyGo. Misconfigured TURN prevents 通话 across strict NAT. Video remains limited on current releases—确认功能状态 before training users on video workflows.

#### 80.9 Notification settings

配置 推送 通知 提供商 (APNS/FCM) on the home 节点 and 权限 prompts on EnvoyGo. Delivery depends on home-节点 转发, 中继 reachability, and OS battery 策略. Test with a low-noise 渠道 before enabling alerts for every chat 消息.

#### 80.10 Logging and diagnostics

Adjust verbosity, P2P 追踪 capture, and diagnostic exports from 日志记录 设置 or CLI flags such as `--P2P-debug`. 审计 JSONL remains the authoritative allow/deny trail even when console 日志记录 is quiet. Redact secrets before 分享 日志—see 附录 K.

#### 80.11 Experimental settings

实验 toggles gate 功能 still receiving 验证; interfaces and 默认值 may change between releases. 启用 them only on non-生产 资料 until release 笔记 mark them **可用**. Document which toggles you 启用 when reporting bugs.

#### 80.12 Restore recommended defaults

恢复 recommended 默认值 resets risky or nonstandard 设置 while preserving 身份 密钥 and 保险箱 content. Use this after 连通性 experiments or failed 智能体-桥接 trials before escalating support. Export a 资料 备份 first if you customized many fields.


---

## 第 XII 部分 —— 隐私、信任与安全

### 81. 身份与密钥安全

#### 81.1 所有者身份

The 所有者身份 is the long-lived root representing the human. It signs 设备证书, 授权, and other 授权, so its private 密钥 deserves the strongest 备份 and 访问 protection.

#### 81.2 设备身份

Each 设备 has its own 身份 authorized by the 所有者. This lets you 吊销 one 丢失 machine without changing the human’s 所有者身份 everywhere.

#### 81.3 智能体身份

An 智能体 has a distinct 密钥 and an 所有者-signed credential linking it to the 所有者. 对等节点 can therefore 验证 which 所有者 authorized an 智能体 without treating the 智能体 密钥 as the 所有者 密钥.

#### 81.4 对等身份

A 对等身份 is the 运行时 sender 身份 used for signed 信封 and networking. It is not interchangeable with 所有者, 设备, or 智能体身份 even when one 节点 holds several of them.

#### 81.5 Ed25519 签名的通俗解释

Ed25519 lets a sender create a compact 签名 with a private 密钥 and lets others 验证 it with the 公开 密钥. Verification proves 消息 integrity and 密钥 possession, not that the human is trustworthy.

#### 81.6 DID 呈现

DIDs (`envoy:所有者:…`, `envoy:设备:…`, `envoy:智能体:…`) label 身份 in UI and 审计 without replacing 密钥 verification. Present DIDs alongside fingerprints when teaching someone to 验证 you. A matching string is not proof unless 签名 checks succeed.

#### 81.7 密钥存储

Private 密钥 stay in the 节点 资料 with restrictive 文件 modes (`0o600` on sensitive JSON). EnvoyGo stores 配对 secrets in OS secure 存储, not 所有者 root 密钥. Never copy private 密钥 文件 into chat, email, or 云 drives without 加密.

#### 81.8 备份与恢复

Back up 所有者 密钥 material, 设备证书, 信任 store, and 保险箱 together on 加密 media tested with a 恢复 drill. Losing the only 所有者 密钥 备份 may require a new 身份. Separate hot 备份 from 离线 copies to limit ransomware spread.

#### 81.9 设备证书

设备 证书 are 所有者-signed documents binding a 设备 公开 密钥 to your 所有者身份. 配对 EnvoyGo or adding a 笔记本电脑 mints a new 证书 链. 吊销 证书 promptly when hardware is 丢失—see Chapter 88.

#### 81.10 吊销

吊销 记录 invalidate 设备证书 or 授权 without rotating the 所有者 密钥. 发布 revocations from a still-trusted 设备 and 审计 that 对等节点 reject stale 凭证 on next handshake. 所有者-密钥 compromise requires 身份 migration, not 证书 吊销 alone.


### 82. 绑定与信任策略

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 760 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:760px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="10" width="170" height="40" fill="#645a3a"/><text x="105" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">信任层级</text><rect x="190" y="10" width="170" height="40" fill="#645a3a"/><text x="275" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">含义</text><rect x="360" y="10" width="220" height="40" fill="#645a3a"/><text x="470" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">允许的动作</text><rect x="580" y="10" width="160" height="40" fill="#645a3a"/><text x="660" y="35" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="white">敏感度上限</text><rect x="20" y="50" width="170" height="55" fill="#FEE2E2" stroke="#3d5a45" stroke-width="1"/><text x="105" y="82" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">blocked 阻止</text><rect x="190" y="50" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="82" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">全部拒绝</text><rect x="360" y="50" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="82" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">—</text><rect x="580" y="50" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="82" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">—</text><rect x="20" y="105" width="170" height="55" fill="#F5F5F4" stroke="#3d5a45" stroke-width="1"/><text x="105" y="137" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">public 公开</text><rect x="190" y="105" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="137" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">陌生人</text><rect x="360" y="105" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="137" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">ping · 窄发现</text><rect x="580" y="105" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="137" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">public</text><rect x="20" y="160" width="170" height="55" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1"/><text x="105" y="192" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">referred 介绍</text><rect x="190" y="160" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="192" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">已介绍</text><rect x="360" y="160" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="192" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">知识 · 受限任务</text><rect x="580" y="160" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="192" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">friends</text><rect x="20" y="215" width="170" height="55" fill="#F0FDF4" stroke="#3d5a45" stroke-width="1"/><text x="105" y="247" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">direct 直接</text><rect x="190" y="215" width="170" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="275" y="247" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">好友</text><rect x="360" y="215" width="220" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="470" y="247" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">完整协作 + 协作任务</text><rect x="580" y="215" width="160" height="55" fill="white" stroke="#6d6a63" stroke-width="0.8"/><text x="660" y="247" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">friends · trusted</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 3 —— 绑定信任层级：每个层级限制联系人可执行的动作与最高数据敏感度。更高层级解锁更丰富的协作；阻止层级拒绝一切。</figcaption></figure>


#### 82.1 绑定的含义

A 绑定 记录 a local 信任层级 for another 所有者 and drives deterministic 策略. 身份 answers “who signed”; the 绑定 answers “what may this relationship do.”

#### 82.2 自身信任

自身 is the local 所有者’s highest 信任 context and can reach private 敏感度 within local 策略.

#### 82.3 直接信任

直接 represents a deliberately trusted 联系人 and permits the broadest 远程 workflows, generally up to friends-level 敏感度 unless additional 策略 限制 them.

#### 82.4 介绍信任

推荐 represents limited 信任 established through 介绍 or constrained onboarding. 知识 and 协作任务 运维 remain more 限制 and may require 审批.

#### 82.5 公开信任

公开 is the stranger/default tier. Only narrow 发现, ping, 介绍, and 公开-知识 behaviors are eligible; it is not sufficient for 协作任务 recruitment.

#### 82.6 阻止信任

阻止 denies communication regardless of 广告 能力. Use it for abuse, compromise, or a relationship that should no longer reach the 节点.

#### 82.7 能力门

能力 map 意图 and 工具 actions to allow, deny, challenge, or 审批 结果. A 联系人 may be 直接 yet still 拒绝 a specific 保险箱 action if 授权 or 敏感度 forbids it. Inspect 审计 `deny` rows for the missing 能力 name.

#### 82.8 敏感度上限

Each 信任层级 caps maximum **敏感度** (`公开` / `friends` / `trusted` / `private`) for 知识 and data 运维. Requests above the ceiling 失败即关闭 even when the 意图 is otherwise 允许. Lower 敏感度 before 分享 with 推荐 联系人.

#### 82.9 挑战与审批

Stranger-tier or high-risk actions may return **challenge** or **审批** 结果 instead of immediate allow. Human 审批 land in the 审批队列 on the home 节点. Do not bypass 审批 by retrying the same 载荷 repeatedly.

#### 82.10 更改或吊销信任

Change 信任层级 in 联系人 设置 or issue signed 吊销 for 设备 and 授权. 降级 takes effect on the next inbound 操作; already 分享 文件 remain on 对等节点 节点 until they delete local copies. Document tier changes for future incident review.


### 83. 已签名消息与协议安全

#### 83.1 已签名消息

Every 信封 is Ed25519-signed over 规范JSON so tampering is detectable. Unsigned or wrongly signed 载荷 fail 入站守卫 before 策略 运行. 签名 prove 密钥 possession, not moral 信任—配对 with 绑定.

#### 83.2 发送者与接收者角色

Roles (`human`, `智能体`, `system`) are 模式-enforced per 意图—`chat.消息` requires 人对人, 任务 意图 require 智能体对智能体. Role mismatch rejects at 验证. UI choices must match the intended role 路径.

#### 83.3 类型化意图

意图 are typed (`chat.消息`, `知识.query`, `任务.propose`, …) with Zod-验证 载荷. Unknown 意图 失败即关闭. 智能体 and integrations must use the correct 意图 for the 操作, not opaque blobs.

#### 83.4 消息与关联标识

`messageId` identifies one 信封; `correlationId` stitches multi-step flows in 审计 across 对等节点. Include 关联ID when 分享 diagnostics. 重放 dedup uses 消息 IDs within the 入站守卫 window.

#### 83.5 模式校验

Inbound 载荷 pass 模式 验证 before 绑定 evaluation. Malformed JSON or field violations return structured errors without touching 保险箱 or 模型. Client bugs show up as 验证 failures in 审计, not silent drops.

#### 83.6 签名验证

Verification recomputes 规范JSON and checks Ed25519 签名 against the sender 公开 密钥, which must 哈希 to `senderPeerId`. Failed verification denies before 策略. Never 禁用 verification for convenience.

#### 83.7 重放保护

The 入站守卫 rejects duplicate `messageId` values within a 重放 window to limit 重放 attacks. Clock skew affects ordering but not 签名 validity. Restarting 节点 does not reset 对等节点 重放 状态 mid-会话.

#### 83.8 速率与大小限制

Diplomat enforces rate and size caps on streams before expensive work. Oversized chat or 文件 载荷 deny early. Burst traffic from one 对等节点 may throttle—back off rather than splitting into many tiny 消息.

#### 83.9 格式错误消息处理

Malformed 消息 are rejected with 审计 summaries; guards do not crash the 节点 on bad input. Persistent malformed traffic from a 对等节点 is grounds for block tier. Capture one sample for diagnostics without enabling verbose 载荷 日志记录 in 生产.

#### 83.10 协议版本管理

协议 版本 fields gate incompatible 对等节点 during handshake. Mixed-版本 集群 should 升级 中继 and 节点 together per release 笔记. 版本 mismatch manifests as connect failures, not partial silently broken chat.


### 84. 安全架构

<figure style="display:block;width:100%;margin:2.5em auto;break-inside:avoid"><svg viewBox="0 0 790 230" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:790px;height:auto;font-family:Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"><defs>
<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6d6a63"/></marker>
<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d5a45"/></marker>
</defs><rect x="20" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="75.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Diplomat</text><text x="75.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">network boundary</text><rect x="150" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="205.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Inbound Guard</text><text x="205.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">size · schema · sig</text><rect x="280" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="335.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Bond Engine</text><text x="335.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">trust · policy</text><rect x="410" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="465.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Task Runtime</text><text x="465.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">mandate · expiry</text><rect x="540" y="40" width="110" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="595.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Semantic FW</text><text x="595.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">prompt filter</text><rect x="670" y="40" width="100" height="60" rx="6" fill="#EFF6FF" stroke="#3d5a45" stroke-width="1.2"/><text x="720.0" y="67.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="13" font-weight="600" fill="#1e1d1b">Vault</text><text x="720.0" y="83.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" fill="#6d6a63">path safety</text><path d="M130,70 L150,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M260,70 L280,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M390,70 L410,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M520,70 L540,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><path d="M650,70 L670,70" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="150" y="150" width="110" height="30" rx="6" fill="" stroke="#FEE2E2" stroke-width="1.2"/><text x="205.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="#5d3ac7" font-weight="600" fill="#1e1d1b">DENY</text><text x="205.0" y="178.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" fill="#6d6a63">drop</text><path d="M205,100 L205,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="280" y="150" width="110" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="335.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">DENY / challenge</text><path d="M335,100 L335,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="410" y="150" width="110" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="465.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">DENY / approve</text><path d="M465,100 L465,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><rect x="540" y="150" width="110" height="30" rx="6" fill="#FEF3C7" stroke="#645a3a" stroke-width="1.2"/><text x="595.0" y="162.0" text-anchor="middle" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="12" font-weight="600" fill="#1e1d1b">REJECT prompt</text><path d="M595,100 L595,150" fill="none" stroke="#6d6a63" stroke-width="1.2" marker-end="url(#a)"/><text x="20" y="210" text-anchor="start" font-family="Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" font-size="11" font-weight="normal" fill="#6d6a63">Each layer fails closed. No single layer suffices — defense in depth.</text></svg><figcaption style="text-align:center;font-size:9pt;color:#6d6a63;margin-top:0.6em">图 5 —— 安全流水线：从网络边界到保险箱的六个有序层。每层可拒绝、质询或要求审批；链条失败即关闭，且不单独信任任何一层。</figcaption></figure>


#### 84.1 网络边界

The Diplomat (网络 boundary) accepts bytes and connections but has no 直接 模型 or 文件系统 authority. It parses, limits, and forwards only 验证 requests.

#### 84.2 入站守卫

入站守卫 checks size, 模式, 签名, and 重放 before 绑定 engine. It has no 保险箱 or 模型 访问—only accept or reject. Most user-visible "消息 failed" 追踪 启动 here or at 绑定 deny.

#### 84.3 绑定策略引擎

The 绑定引擎 turns 信任层级, 意图, 能力, and 敏感度 into an allow, deny, challenge, or 审批 decision before privileged work proceeds.

#### 84.4 任务运行时守卫

任务 运行时 guard enforces 授权 到期, cancellation, collect-N termination, and action lists during 智能体 work. Even 允许 绑定 cannot exceed an 到期 授权. Review 任务 日志 alongside 审计 when jobs stall mid-flight.

#### 84.5 Semantic firewall

The 语义防火墙 (part of the 模型 boundary, historically called the Brain layer) rejects empty, oversized, or 控制-character-laden 模型 prompts and normalizes excessive newline 运行 before a 模型 sees them.

#### 84.6 模型边界

The 模型 router receives only approved context after 绑定 and 任务 guards; external 智能体 never bypass it via 桥接 工具. Prompts pass the 语义防火墙 before 提供商 通话. 模型 output does not auto-执行 保险箱 writes.

#### 84.7 保险箱隔离

The 保险箱 enforces 路径 安全 and explicit 运维. Neither a 远程 对等节点 nor an 外部智能体 receives unrestricted 文件系统 访问.

#### 84.8 路径与文件安全

保险箱 运维 resolve 路径 against an allow-list; `../` and unsafe symlinks deny. 远程 对等节点 never get arbitrary 文件系统 路径—only explicit 保险箱 意图. Validate local 路径 when indexing new 资料库 文件夹.

#### 84.9 SSRF 防护

MCP and 桥接 URL 验证 限制 unsafe 远程 destinations and plain HTTP 默认值, reducing the chance that an integration can probe internal services.

#### 84.10 外部智能体隔离

桥接 and MCP adapters 暴露 curated 工具, not Shell or libp2p. Tokens authenticate 桥接 HTTP; 授权 scope each 工具 通话. Compromise of an 外部智能体 is contained by 绑定 + 授权, not full 节点 访问.

#### 84.11 中继信任边界

A 中继 is a 连通性 service, not a trusted brain. End-to-end 签名 and home-节点 策略 remain necessary even when the 中继 操作员 is reputable.

#### 84.12 纵深防御

Security stacks Diplomat → 入站守卫 → 绑定 engine → 任务 guard → 语义防火墙 → 保险箱 路径 checks. No single layer is sufficient—连通性 success does not imply 授权. Design integrations assuming deny-by-default at each hop.


### 85. 隐私控制

#### 85.1 资料可见性

Choose which 资料 fields each 信任层级 may 获取—公开 bios vs friends-only 照片. Publishing overly open 默认值 暴露 you on 发现 主题. Revisit after changing 信任 relationships.

#### 85.2 联系人披露

联系人 cards show only what 绑定策略 and your disclosure 设置 permit. 介绍 flows reveal minimal proof text until 升级. Do not embed third-party 手机 numbers in signed proof unless intended.

#### 85.3 知识敏感度

索引 and query 知识 with 敏感度 tags; 推荐 and 公开 tiers cannot read private-indexed 块. Re-tag before 分享 summaries in 协作任务. Mis-tagged content is a 隐私 bug, not a crypto failure.

#### 85.4 对话保留

对话 history stays on your home 节点 unless you export it. Retention 控制 (where offered) prune local 索引, not 远程 对等节点 copies of 消息 they already accepted. Align retention with 备份 策略 (Chapter 89).

#### 85.5 智能体记忆

智能体 记忆 and 会话 context live in home-节点 stores governed by 授权 and 设置. Clearing 智能体 记忆 does not delete 对等节点 chat 日志. Scoped 授权 limit how much history 工具 may retrieve.

#### 85.6 保险箱共享

保险箱 分享 uses explicit 意图 with 敏感度 and 路径 安全—no hidden 文件夹 同步 to strangers. 协作任务 拉取 only mandated 保险箱 slices. 审计 保险箱 retrieve denials when 智能体 "cannot find" a 文件.

#### 85.7 模型提供商隐私

云 模型 提供商 receive prompts you send through the 配置 adapter—review their terms and prefer local 模型 for sensitive 主题. Semantic 防火墙 reduces exfiltration patterns but is not a full DLP suite. 禁用 云 routing for classified workflows.

#### 85.8 中继隐私

中继 see connection metadata and 加密/signed frames they forward—they are not trusted readers of plaintext chat. Avoid putting secrets in 中继-visible routing hints. Choose 中继 you tolerate for 可用性, not for confidentiality.

#### 85.9 审计日志隐私

审计 JSONL stores structured summaries, not full 消息 bodies by default. Protect 审计 文件 like 密钥—`0o600` and 加密 备份. Redact tokens before 分享 日志 externally.

#### 85.10 删除本地数据

Local delete removes 线程, 保险箱 objects, or 资料 fields from **your** 节点; 对等节点 may retain copies. Use block and 吊销 for ongoing abuse. Secure-delete media if OS support exists before decommissioning hardware.


### 86. 审计与活动历史

#### 86.1 为什么 EnvoyMesh 记录活动

审计 记录 make 策略 and 自动化 reviewable. EnvoyMesh 记录 structured summaries and correlation identifiers rather than treating 智能体 activity as an opaque 模型 transcript.

#### 86.2 审计事件字段

审计 events carry `eventId`, `createdAt`, `type`, `意图`, `结果`, `摘要`, optional `remotePeerId`, `correlationId`, and `延迟毫秒`. Learn the field 词汇表 in 设置 → Activity help. Summaries are human-readable; correlate IDs for multi-hop 追踪.

#### 86.3 跨对等节点关联

Use 分享 `correlationId` values to follow one user action across 绑定, 中继 forward, and 工具 通话 on both sides. CLI `审计 --include-P2P-追踪` expands 追踪 when debugging WAN 路径. Ask 联系人 for their side's ID only over a 验证 渠道.

#### 86.4 策略允许与拒绝记录

Allow and deny rows prove 策略 decisions with 意图 names and reasons—essential for "why was this 阻止?" 争议. 审批 appear as separate 结果. Export filtered 审计 slices for support, redacted.

#### 86.5 任务与协作任务记录

协作任务 生命周期 events append to 任务 日志 and 审计 with 状态 transitions (`discovering`, `运行`, `completed`, …). Correlate job ID with chat 线程 that spawned the work. Failed jobs retain error summaries without raw 模型 transcripts.

#### 86.6 工具与审批记录

Tool invocations and human 审批队列 entries 日志 授权 action, 工具 name, and 结果. 拒绝 工具 name missing 能力. Use these rows to tune 授权 without disabling 审计.

#### 86.7 外部智能体记录

桥接 and MCP traffic tags external-智能体身份 separately from 原生 mesh 对等节点. Cross-check bearer 认证 failures vs 绑定 denials. External compromise investigations 启动 in these rows.

#### 86.8 网络诊断

Network diagnostic 审计 entries 记录 中继 reservation, dial failures, and 连通性 snapshots—no 消息 plaintext. 配对 with `连通性-status` CLI during outages. Do not 启用 verbose libp2p 日志记录 routinely in 生产.

#### 86.9 检查端到端流程

Pick one failed 消息 or job, 笔记 its 关联ID, and walk 审计 chronologically on home and 对等节点 if 可用. Identify whether failure was guard, 绑定, transport, or 模型. 停止 after the first definitive deny reason—avoid random 设置 changes.

#### 86.10 保留、备份与保护

审计 日志 grow unbounded without 操作员 rotation—archive JSONL to 加密 备份 media. Include 审计 in disaster-恢复 drills. 限制 read 访问 to 所有者-trusted 设备.


### 87. 应对安全事件

#### 87.1 丢失设备

From a trusted 设备, 吊销 the 丢失 设备, rotate any 桥接 or 中继 tokens it held, and review recent activity. If the 丢失 设备 held the only 所有者-密钥 备份, 恢复 may require creating a new 身份.

#### 87.2 所有者密钥被入侵

Treat an 暴露 所有者 private 密钥 as a root compromise. Disconnect affected 节点, preserve evidence, rotate dependent 凭证, notify trusted 联系人, and migrate to a new 所有者身份 because 签名 from the old 密钥 can no longer be trusted.

#### 87.3 可疑联系人

Lower 信任 to 公开 or block, preserve 审计 and recent 线程, and 验证 身份 out of band before 恢复 直接 tier. Do not 执行 文件 opens or 工具 审批 from suspicious 线程. 报告 coordinated harassment via block and documented 审计 export.

#### 87.4 行为异常的智能体

Pause or 吊销 the 智能体 授权, 禁用 桥接 tokens, and inspect 工具 审计 for unexpected 保险箱 or mesh 通话. Narrow `allowedActions` before re-enabling. Treat repeated 授权 violations as potential prompt injection or compromised integration.

#### 87.5 被入侵的外部智能体

Rotate 桥接 bearer tokens, 禁用 the 外部智能体's MCP 注册, and review all 工具 通话 since last known good. External 智能体 never had libp2p—containment is token + 授权 scope. Re-启用 only with fresh secrets and tighter 授权.

#### 87.6 恶意文件或知识内容

Do not open unknown attachments; quarantine downloads outside default 保险箱 open 路径. Re-索引 知识 sources if malicious content was ingested. Warn 联系人 if your 节点 forwarded malware-signed-as-you due to 密钥 compromise.

#### 87.7 中继事件

If a 中继 操作员 报告 abuse or outage, rotate home tunnel tokens and 验证 智能体 Card URLs still point to your 节点. 中继 cannot 解密 chat but can disrupt 可用性—have a secondary 引导 中继 in 配置. Document incident time window for 审计 review.

#### 87.8 吊销、阻止与暂停

Use block tier for 联系人, 吊销 for 设备 and 智能体, and pause 协作任务 from 智能体网络 UI. Order: 停止 ongoing harm (吊销/block), then investigate 审计, then 恢复 with tighter 策略. Pausing is reversible; 阻止 联系人 need deliberate unblock.

#### 87.9 保留诊断

Copy relevant 审计 JSONL segments and 关联ID before clearing 日志 or reinstalling. Remove bearer tokens, private 密钥, and 恢复 phrases from 分享 bundles. Store evidence 加密 with incident date in filename.

#### 87.10 报告漏洞

报告 安全 defects through the project's coordinated disclosure 渠道 listed in release 笔记 or repository SECURITY 策略. Include reproduction steps and 版本—not live 密钥. Do not test exploits against 生产 对等节点 without 权限.


---

## 第 XIII 部分 —— 管理设备与数据

### 88. 设备管理

#### 88.1 查看设备

Open 设置 → 设备 to list 所有者-authorized machines and EnvoyGo pairings with creation dates and last activity hints. Each entry maps to a 设备证书, not the 所有者 root 密钥. Use this view before revoking stale hardware.

#### 88.2 添加桌面设备

安装 Social/Tauri on the new computer, 恢复 or create 设备身份 from 所有者 授权 flow, and approve the new 证书 from an existing trusted 设备. Copy 资料 data via 备份 恢复 (Chapter 89) rather than hand-copying 密钥 文件 over chat.

#### 88.3 配对 EnvoyGo

On 桌面 Social open 配对 → show QR; in EnvoyGo tap 配对 and scan `envoy://配对?…`. Approve the pending 设备 on home if the queue prompts. Confirm chat loads through HomeRemote before retiring an old 手机 配对.

#### 88.4 了解独立的设备身份

设备 can 分享 one 所有者身份 while retaining independent 设备 密钥 and 证书. This supports targeted 吊销 and 审计 attribution.

#### 88.5 审查设备活动

Filter 审计 and 设备 list by 设备 ID to see which machine sent 消息 or invoked 工具. Unexpected 设备 IDs after travel warrant 吊销. EnvoyGo actions appear attributed to the paired 手机 设备, not 桌面.

#### 88.6 吊销设备

Select the 设备 → 吊销 证书; the 节点 rejects new 会话 immediately. Rotate 桥接 or 中继 tokens that 设备 held. Physical 访问 after 吊销 still reads old local caches—加密 磁盘 on 分享 PCs.

#### 88.7 迁移到新电脑

Take a full 资料 备份, 安装 on the new host, 恢复 密钥 and 保险箱, then 吊销 证书 for the old PC if retiring it. 验证 mesh 监听地址 and update 联系人 if your 公开 multiaddr changed. Send a test DM before decommissioning.

#### 88.8 更换丢失的手机

吊销 丢失 EnvoyGo 配对 from 桌面 first, then 配对 a replacement 手机 with a fresh QR. Assume the 丢失 手机's 配对 token is compromised if unlocked. Do not clone 配对 文件 between phones manually.

#### 88.9 设备同步边界

EnvoyGo syncs selected NodeService views—not a full mesh replica. 桌面 and 移动 may show different 设置 depth. 对话 状态 authoritative on home; 移动 cache clears on re-配对.


### 89. 备份与恢复

#### 89.1 备份策略

Use a layered 备份: protect 所有者 and 设备 凭证 separately from replaceable application binaries, and back up 配置, 信任, 保险箱 content, and important 记录 on a tested schedule.

#### 89.2 身份密钥

Export 所有者 and 设备 private 密钥 only into 加密 备份 archives; never store plaintext 密钥 in 云 同步 文件夹. Test 导入 on an isolated machine yearly. Loss of 所有者 密钥 without 备份 is 身份 loss.

#### 89.3 配置

Back up `节点-配置`, 中继 tokens, 模型 提供商 设置, and 桥接 secrets with secrets redacted in secondary copies. 版本-控制 non-secret 配置 templates separately. 恢复 配置 before 启动 节点 after OS reinstall.

#### 89.4 联系人与信任

Include `信任-记录.json` and 对等节点 目录 in 备份—losing 信任 store turns friends into strangers locally. Export before major migrations. 恢复 信任 must match still-valid 远程 密钥.

#### 89.5 对话 and sessions

对话 索引 and 会话 stores live in 资料 JSON/JSONL; back them with the home 资料. 移动 holds minimal cache—re-配对 refreshes from home. Large media may live in 保险箱 路径 included in 89.6.

#### 89.6 保险箱与资料库

保险箱 and 资料库 文件 need 文件系统-level 备份 alongside 索引. 块 stores and search 索引 rebuild slowly—prefer consistent snapshot while 节点 停止. 验证 random 文件 哈希 after 恢复.

#### 89.7 审计与任务历史

Archive `审计-events.JSONL`, `任务-日志.JSONL`, and 审批 queues for compliance. Rotation 策略 prevent unbounded 磁盘 use. 恢复 审计 on new hardware preserves historical 关联ID.

#### 89.8 恢复与校验

恢复 to a clean 安装, 导入 密钥 and data, 启动 节点 离线 to 验证, then 启用 网络 and send test 消息. Compare 所有者 DID and 设备 list with pre-disaster 记录. 吊销 设备 that should not return post-恢复.

#### 89.9 灾难恢复清单

维护 a printed or 离线 checklist: 所有者 密钥 备份 location, 中继 引导, trusted 联系人 to notify, 吊销 order for 设备, and last 验证 恢复 date. 运行 tabletop exercise annually. Store checklist without live secrets.


### 90. 更新与迁移

#### 90.1 检查已安装版本

Check **About** in Social/Tauri or `envoy --版本` on CLI against release 笔记 before 升级. 笔记 中继 and 移动 app versions separately—mixed versions cause handshake surprises. 记录 构建 哈希 when reporting bugs.

#### 90.2 更新桌面应用

Quit the app cleanly, 运行 the installer or bundle update, relaunch, and confirm 身份 loaded in status. 桌面 updates replace binaries only—资料 目录 persists. Roll back binary if startup fails, not by deleting 资料.

#### 90.3 更新 EnvoyGo

Update EnvoyGo from the app store or sideload 渠道 your 集群 uses; re-配对 if release 笔记 require new 配对 模式. Test home connection and one 语音通话 after update. Keep 桌面 home 节点 on compatible API 版本.

#### 90.4 更新 OpenClaw 扩展

Update OpenClaw/HomeClaw extensions per bundled 兼容性 matrix in release 笔记. Restart 桥接 after extension update. Mismatch shows as gateway errors in 智能体 status, not mesh failures.

#### 90.5 更新中继

升级 中继 binaries with `--广告-addr` preserved; restart during low traffic if 操作员. Community 中继 users depend on 操作员 schedule—private 中继 you 控制 should follow same 版本 as 节点. 验证 reservation after 升级.

#### 90.6 配置 compatibility

Read migration 笔记 for renamed 配置 密钥 or JSONL 模式 bumps. Automatic migrations 运行 at startup; failed migration backs up `.bak` 文件 beside originals. Do not hand-edit migrated 文件 while 节点 is 运行.

#### 90.7 数据迁移

Large data migrations may re-索引 保险箱 or rebuild 信任 views—allow time on first boot after 升级. 监控 审计 for migration 摘要 events. Keep pre-migration 备份 until 索引 stabilize.

#### 90.8 安全回滚

To roll back, 安装 previous binary 版本 and 恢复 资料 备份 if new 版本 wrote incompatible data. 吊销 tokens issued only on new 构建 if 安全 fix motivated rollback. Never roll back 所有者 密钥—only application bits.

#### 90.9 查看发行说明

Read release 笔记 for 安全 fixes, breaking 协议 changes, and 实验 flags before clicking update. 附录 J lists maturity labels for 计划中 功能. Schedule 升级 after 备份, not before travel.


---

## 第 XIV 部分 —— 帮助与故障排查

### 91. 故障排查基础

#### 91.1 检查节点状态

启动 with the application status surfaces: confirm the 节点 service is 运行, 身份 loaded, 模型/智能体 状态 is expected, and at least one 网络 路径 is 可用.

#### 91.2 安全重启

Quit Social or the Tauri wrapper cleanly so the 节点 can flush JSONL appenders. Restart the 节点 进程 (or relaunch the 桌面 app) and wait until status shows 身份 loaded and mesh listening. If the 资料 was mid-write, check for `.tmp` 文件 beside `信任-记录.json` before deleting anything.

#### 91.3 检查连通性

运行 `连通性-status --rich` from the CLI and confirm at least one of: mDNS 对等节点, 引导 dial, or 中继 reservation. Compare your 引导 multiaddrs with the 联系人's 广告 addresses. If 直接 dial fails but 中继 works, treat it as NAT/防火墙—not a 绑定 or 身份 problem.

#### 91.4 检查智能体状态

Open 设置 → AI and confirm the 智能体 授权 is present and not 到期. For EnvoyAI, 验证 OpenClaw Gateway responds on its 配置 port (default 18789). External 智能体 should show 桥接 health on port 3031; 审计 rows tagged `桥接` explain 认证 or 超时 failures.

#### 91.5 审查近期活动

Open Activity or 运行 `审计 --limit 40 --include-P2P-追踪` and sort by time around the failure. Follow `correlationId` across rows—绑定 deny, guard reject, and 中继 forward each produce distinct summaries. 笔记 the 意图 name (`chat.消息`, `知识.query`, etc.) before changing 信任 or 网络 设置.

#### 91.6 查找日志

Operational history lives in your 资料 目录 as JSONL: `审计-events.JSONL`, `任务-日志.JSONL`, `审批-queue.JSONL`, and `发现-events.JSONL`. 中继 操作员 also get 中继-manager snapshots in 中继 资料 审计 日志. Console output from `npm 运行 节点:dev` supplements but does not replace these 文件.

#### 91.7 收集诊断报告

A useful diagnostic bundle includes 版本, 平台, relevant 配置 with secrets removed, recent 日志, 审计 关联ID, 对等节点/中继 status, and exact reproduction steps.

#### 91.8 分享诊断前移除隐私数据

Before 分享 日志, copy only the relevant time window and redact `所有者-密钥*`, 设备 密钥, `桥接-配置.json` bearer tokens, 模型 API 密钥, and raw 信封 载荷. Replace 对等节点 display names with labels if needed; keep 关联ID intact so support can 追踪 flows.

#### 91.9 向社区求助

Gather 版本, 平台, 资料 路径, reproduction steps, and redacted 审计 excerpts with 关联ID. 状态 which 功能 状态标签 applies (可用, Beta, 实验). Community channels are announced in release 笔记 for 0.1.0—avoid posting secrets in 公开 线程.


### 92. 安装与启动问题

#### 92.1 安装程序无法运行

Confirm the download matches your CPU architecture and macOS/Windows 版本 in release 笔记. On macOS, if Gatekeeper blocks the DMG, use System 设置 → Privacy & Security → Open Anyway once. On Windows, unblock the installer 文件 property if SmartScreen quarantined it.

#### 92.2 操作系统阻止应用

macOS: approve the app under Privacy & Security after first launch; notarized builds should not require disabling SIP. Windows: allow the app through Defender/防火墙 when prompted for inbound mesh traffic. Corporate MDM may block unsigned or unknown publishers—request an exception or 安装 from source with your own signing.

#### 92.3 应用无法启动

Launch from 终端 with logging enabled (`npm run node:dev -- --profile <path>`) to capture startup exceptions. Verify the 资料 directory is writable and not on a sync folder that locks 文件 (iCloud, OneDrive). A corrupt `trust-records.json` or missing 所有者 密钥 prevents UI load—restore from backup rather than deleting the 资料.

#### 92.4 节点运行时不启动

Check 节点.js 版本 against `包.json` engines and rerun `npm 安装` from the repo root for source 安装. Packaged 桌面 builds embed the 运行时—reinstall if the bundled binary was quarantined. Look for port conflicts on WebSocket/API ports 配置 in 节点 设置.

#### 92.5 OpenClaw 运行时不可用

Confirm OpenClaw Gateway is 安装 and listening (default 18789). 运行 `./scripts/设置.sh` or `.\scripts\设置.ps1` after 升级 to refresh extensions. Windows slim bundles may omit optional extensions—compare with macOS bundle list in release 笔记.

#### 92.6 所需扩展缺失

List 启用 OpenClaw extensions in Gateway 设置 and compare with the 平台 bundle in Chapter 9. Re-运行 设置 scripts to copy missing extensions into the expected 路径. mesh chat and 绑定 do not require optional 渠道 extensions—only 启用 what your 智能体 工作流 needs.

#### 92.7 防火墙或杀毒警告

Allow outbound TCP/QUIC to 引导 对等节点 and 中继; inbound 直接 dial may need a 防火墙 rule on the home 节点. Antivirus hooks on `%AppData%` or `~/.local/分享/envoymesh` can block JSONL writes—add an exclusion for the 资料 路径. Document which ports you opened before retrying WAN 发现.

#### 92.8 更新失败

Ensure the updater can write beside the 安装 目录 and 资料 路径. Back up the 资料 and 保险箱 before major 升级. If auto-update fails, download the new installer manually and 安装 over the existing app without deleting user data.

#### 92.9 重装但不丢数据

卸载 or replace the application bundle only—never delete the 资料 目录 or `shared_vault/`. 笔记 your absolute 资料 路径 from 设置 or 附录 K before reinstalling. After reinstall, point the app at the same `--资料` 路径 or 恢复 from your 加密 备份.


### 93. 身份与配对问题

#### 93.1 身份创建失败

Ensure the 资料 目录 is empty or use a new `--资料` 路径 for a fresh 所有者. 磁盘 full or 权限 拒绝 on 密钥 write shows in console as ENOENT/EACCES—fix 文件系统 访问 first. Do not 运行 two 节点 against the same 资料 simultaneously.

#### 93.2 二维码无法扫描

Increase screen brightness and 关闭相机微距模糊; QR must include the full `envoy://配对?` 载荷. Regenerate the invitation if it 到期—tokens are time-bound. For LAN onboarding, confirm both 设备 分享 the same 网络 segment without client isolation.

#### 93.3 邀请无效

Compare the scanned URI with what the sender displayed—truncated copies break 签名 verification. Check clock skew; some invitation formats embed 到期 timestamps. Ask the sender to regenerate from 联系人 → Invite rather than 转发 a screenshot.

#### 93.4 身份验证失败

验证 the sender's 公开 密钥 哈希 to the claimed 对等节点 ID and the 信封 签名 验证. If verification fails after a 密钥 rotation, ensure 吊销 记录 propagated and both sides refreshed 信任. 审计 rows `malformed or unsigned 信封` indicate transport corruption or 版本 skew, not necessarily malice.

#### 93.5 绑定请求缺失

绑定 requests require the recipient to be 在线 or reachable via 中继 for `绑定.request` delivery. 公开-tier 对等节点 receive a challenge flow—not an automatic 绑定; complete referral or manual 审批. Check Activity on both sides for `绑定.request` / `绑定.challenge` 意图.

#### 93.6 局域网接入失败

Confirm mDNS is not 阻止 by guest Wi‑Fi or VPN split tunneling. Print multiaddrs from the host 节点 and dial manually if 发现 fails. 防火墙 on the host must allow inbound mesh ports for LAN onboarding 交接.

#### 93.7 EnvoyGo 配对失败

EnvoyGo must scan a home-节点 QR while the 桌面 节点 is 运行 and WebSocket-reachable. Off-LAN 配对 needs 中继/circuit 路径 to home—验证 home tunnel and 配对 token in 设置 → 设备. 吊销 stale 设备证书 if an old 手机 retains a broken 会话.

#### 93.8 恢复缺失的身份数据

恢复 `所有者-密钥.pem` and 设备 密钥 from your 加密 备份 into the original 资料 路径. Never invent new 密钥 for the same 所有者 ID—对等节点 will reject mismatched 签名. If only 保险箱 data is missing, re-索引 from 备份; 身份 loss without 备份 cannot be cryptographically recovered.


### 94. 消息、文件与通话

#### 94.1 联系人显示离线

离线 usually means no active libp2p connection—not necessarily a 阻止 绑定. 运行 连通性 checks and confirm the 联系人's 节点 is 运行. 中继-assisted 路径 may lag behind 直接; wait one 心跳 interval before assuming permanent 离线.

#### 94.2 消息未投递

Confirm 绑定 tier allows `chat.消息` (直接 or 推荐 with 审批). Inspect 审计 for deny vs guard reject vs 中继 forward failure. Large 载荷 may hit 信封 size caps—try a smaller 消息 or 文件 块 路径.

#### 94.3 群组消息缺失

验证 all 成员 分享 the same room ID and room 同步 completed (`chat.room.同步`). A 成员 on an old 构建 may not decode new room 信封 versions—align versions. Check whether the missing 消息 was sent while you were 离线; request room 同步 from the host 对等节点.

#### 94.4 文件传输失败

Raw 文件 分享 may require 所有者 审批 when `allowRawFiles` 触发器 绑定策略. Confirm 保险箱 路径 安全 and size limits on both 节点. If 传输 stalls mid-stream, inspect 中继 circuit stability—resume after reconnect rather than duplicating sends.

#### 94.5 语音消息无法播放

Confirm the 音频 codec and container match what Social/EnvoyGo expects for the release. Download completed before play—partial 文件 fail decode silently in some clients. Check 绑定策略 DID not strip attachments from the chat 信封.

#### 94.6 语音通话无法连接

Voice 通话 need working 对等节点 连通性 plus TURN/STUN when NAT blocks 直接 media. 验证 TURN 凭证 in 设置 and that UDP is not 阻止 on restrictive 网络. Both parties must be on builds that support voice signaling for the current 协议 版本.

#### 94.7 后台通话通知缺失

On 移动, confirm 通知 权限 and that EnvoyGo background refresh is 启用. iOS Focus modes and Android battery savers can delay 推送 until the app foregrounds. Incoming 通话 signaling still requires home 节点 reachability—check 中继 路径 if away from LAN.

#### 94.8 TURN 配置问题

Validate TURN 服务器 URL, 用户名, and credential 到期—stale 凭证 produce ICE failed 状态. Test with a known-good 公开 TURN service before blaming mesh signaling. Document whether the failure is gather 超时 (防火墙) or 中继 allocate reject (bad creds).

#### 94.9 重复或延迟事件

Duplicate 消息 often indicate reconnect 重放—check 入站守卫 dedup and whether two 设备 分享 one 身份. Delayed events on 中继 路径 are normal under load; compare timestamps in 审计, not UI order alone. If duplicates persist, ensure only one active 会话 per 设备证书.


### 95. 智能体、模型与工具问题

#### 95.1 EnvoyAI 无响应

验证 OpenClaw Gateway is up and the 桥接 on 3031 accepts the 配置 bearer token. Check 模型 router 配置 and 语义防火墙 rejections in 审计. An 到期 智能体 授权 停止 all 智能体-role 意图 until renewed on 桌面.

#### 95.2 模型提供商失败

Confirm API 密钥 and base URLs for the selected 提供商 in 模型 设置. LiteLLM or adapter errors surface in 审计 with 提供商 name and HTTP status. Try a local 模型 or different 提供商 to isolate 网络 vs 配额 failures.

#### 95.3 工具缺失

Open the 工具 注册表 on the home 节点 and confirm the 工具 is 注册 for your 智能体 授权. MCP-imported 工具 require an active MCP client 会话; mesh-原生 工具 need matching 能力 on the 智能体 card. Restart the 智能体运行时 after adding 工具 so the 注册表 reloads.

#### 95.4 工具调用被拒

Tool denial usually means 授权 `allowedActions`, 绑定 tier, or missing 能力 (`保险箱.retrieve`, `任务.执行`, etc.). Read the 审计 deny reason verbatim—it distinguishes 绑定 deny from 授权 approval_required. Raise 信任 or approve the pending action on 桌面 rather than retrying blindly.

#### 95.5 审批待处理

Open 审批 on 桌面 and resolve items matching the 任务's 关联ID. 审批 expire with 授权—check `到期时间` if the queue looks empty but 任务 stay waiting. External 智能体 cannot approve on your behalf; only the 所有者 设备 can clear 所有者 prompts.

#### 95.6 触发器未运行

验证 触发器 schedules, cron expressions, and that the 节点 was 运行 at fire time. Triggers respect 授权 bounds—disallowed actions fail silently in 审计, not always in UI toasts. Check whether 实验 toggles gate the 触发器 功能 for your 构建.

#### 95.7 摘要缺失

Digests batch activity on a schedule—confirm 摘要 generation is 启用 and the 智能体 had events in the window. Empty 摘要 may mean no qualifying 审计 rows or 语义防火墙 dropped the 摘要 prompt. Inspect `任务-日志.JSONL` for failed 摘要 任务.

#### 95.8 记忆或会话结果异常

Session 记忆 is local to the 智能体运行时—clearing 桥接 cache or rotating 会话 resets context. Compare what the 模型 returned with 保险箱 检索 citations; RAG may 拉取 unexpected 公开 items. If 记忆 looks like another user's data, 停止 and 验证 资料 路径—never 分享 one 资料 between 所有者.

#### 95.9 外部智能体无回复

Ping the 外部智能体's 消息 port (HomeClaw 8010, Hermes 8020, OpenHuman 8021) from the home 节点 host. Confirm 桥接 bearer token matches on both sides and the 智能体 进程 日志 show inbound `envoymesh-消息` traffic. 兼容性 预设 do not guarantee the external 运行时 is 运行—启动 it separately.


### 96. 知识与浏览器问题

#### 96.1 文件无法添加

保险箱 enforces 路径 安全—illegal 路径 or symlinks outside 允许 roots 拒绝添加. Check 磁盘 space and 文件 权限 under `shared_vault/`. Very large 文件 may need chunking 设置; watch 审计 for size cap denials.

#### 96.2 搜索无结果

Confirm the item was indexed: 运行 资料库 refresh and check 敏感度 labels match your query scope. Local search only covers your 保险箱; 远程 queries need 绑定-permitted `知识.query`. Rebuild the 索引 if `shared_vault` was 恢复 from 备份 without re-indexing.

#### 96.3 远程知识被拒

远程 deny usually means 绑定 tier caps 敏感度—公开 对等节点 only see `公开` items; 推荐 caps at `公开` for 知识.query; 直接 caps at `friends`. 公开 知识 queries are 限流 (default 5/min)—wait for window reset. Inspect 审计 for `requested 敏感度 exceeds` vs `对等节点 is 阻止`.

#### 96.4 共享内容无法打开

浏览器 and 资料库 require `库.read` 权限 for the reader's 绑定 tier and item 可见性. Confirm 内容哈希 matches if 完整性检查 failed—do not open mismatched blobs. EnvoyGo mirrors 浏览器 through home—home 节点 must be 在线.

#### 96.5 内容哈希不匹配

Re-download or re-export the item; 哈希 mismatch means bytes changed in transit or on 磁盘. Compare SHA256 from publisher metadata with local 文件. If IPFS pin is stale, 获取 from the original publisher rather than a cached gateway.

#### 96.6 IPFS 导出失败

IPFS export is optional—confirm Helia/Kubo sidecar is 运行 if your 构建 includes it. Check sidecar 日志 for connect errors to the IPFS daemon. Omit IPFS entirely if you only need local 保险箱 存储—export is not required for mesh 分享.

#### 96.7 `envoy://` 页面无法加载

`envoy://` pages resolve through home 浏览器 routing—验证 the URI scheme handler and that the item is 发布. Off-LAN 访问 needs home reachability via EnvoyGo or 桌面 with 中继 路径. Broken 哈希 or missing 保险箱 路径 show as blank pages with errors in home 审计.

#### 96.8 动态更新缺失

订阅源 notify requires 推荐+ 绑定 for inbound 通知; publisher must have sent `订阅源.notify`. Check 绑定 tier and that 订阅源 订阅 is 启用 on the reader 节点. Metadata-only notify does not 推送 full content—open 资料库/浏览器 to 获取 the item.

#### 96.9 恢复受损内容

恢复 文件 from 备份 into the same 保险箱 路径 layout; 运行 re-索引 afterward. Do not hand-edit 块 manifests unless you understand 保险箱 chunking—prefer republishing from source. If corruption is widespread, isolate the 资料 and scan 磁盘 health before continuing.


### 97. 网络与中继问题

#### 97.1 直接连接失败

Collect dial hints from both 对等节点 and attempt manual dial from CLI if UI shows disconnected. Symmetric NAT often blocks 直接 TCP—配置 中继 引导 and 验证 circuit reservation succeeds. Compare libp2p versions if identify handshake fails immediately.

#### 97.2 本地发现 fails

mDNS requires multicast on the LAN—guest 网络 and VPNs frequently block it. Use printed multiaddrs for lab 设置. Confirm both 节点 广告 the same 发现 资料 (e.g. local vs wan-default).

#### 97.3 中继查询失败

校验引导 multiaddr includes `/P2P/<中继-id>` and 中继 HTTP check-in succeeds. 运行 `中继-status` and inspect 审计 for `中继.lookup` failures. Override with a private 中继 if community 中继 is down—do not 禁用 引导 entirely.

#### 97.4 社区中继不可用

Community 中继 at the default 引导 may be busy or undergoing deploy—retry with backoff. For 生产, 运行 a private 中继 with `--广告-addr` in 公开 mode. Circuit reservation failure often means 版本 skew on the 中继 host, not client misconfig.

#### 97.5 多个中继不一致

节点可能检查 in to different 中继 with 分叉的路由提示—standardize 引导 lists across your 集群. Compare 中继-manager snapshots in 审计 for conflicting parent/child 记录. Prefer one organization 中继 as primary 引导 to reduce split views.

#### 97.6 防火墙或 NAT 限制

Map required outbound ports for 引导 and 中继 TCP. Inbound 直接 dial needs port 转发 or UPnP where supported; otherwise rely on circuit 中继. Document corporate proxy rules—libp2p does not traverse HTTP proxies without explicit tunnel 设置.

#### 97.7 对等节点持续离线

对等节点 离线 on your UI may still be 在线 to others—验证 from a third mutual 联系人 if possible. Check last-seen in 对等节点 目录 and recent `system.ping` results. Long 离线 periods may mean sleep, 资料 migration, or 吊销 设备 cert.

#### 97.8 Agent Card 无法获取

智能体 cards 获取 over bonded 路径—公开 绑定 do not auto-获取 工作节点 cards. Force refresh from 智能体网络 设置 after 绑定 升级. 审计 `智能体.card.request` / `智能体.card.response` for deny or 超时; stale cards hide 能力.

#### 97.9 收集网络诊断

Bundle: app 版本, OS, 资料 路径, 引导 multiaddrs, `连通性-status --rich` output, redacted `审计-events.JSONL` with 关联ID, and 中继 reservation result. Include both 对等节点' perspectives for connection issues. See 附录 K.5 for CLI commands.


### 98. 集成问题

#### 98.1 OpenClaw 扩展缺失

Compare 安装 OpenClaw extensions with Chapter 9 平台 bundle lists. Re-运行 设置 script after clone or 升级. Windows essential set is slimmer—安装 missing extensions manually or switch to source/macOS bundle.

#### 98.2 HomeClaw 无法连接

Default HomeClaw 消息 port is 8010—confirm 进程 is listening on the home 节点 host. 桥接 bearer token in `桥接-配置.json` must match HomeClaw's expected secret. HomeClaw 运行时 is externally maintained; 验证 its 日志 independently from EnvoyMesh 审计.

#### 98.3 Hermes 无法连接

Hermes 默认值 to port 8020—test with curl or netcat from localhost on the home machine. Apply the Hermes 兼容性 预设 then restart both 桥接 and Hermes after 配置 edits. Check 防火墙 loopback rules if 桥接 is containerized.

#### 98.4 OpenHuman 无法连接

OpenHuman listens on 8021 by default in 兼容性 预设. Confirm OpenHuman's envoymesh adapter is 启用 and using the same 桥接 URL as 桌面 设置. Treat 智能体-side errors as external-运行时 issues once 桥接 认证 succeeds.

#### 98.5 桥接认证 fails

A 401 response usually means the Bearer token is missing or mismatched. Confirm both sides use the same secret, the header uses `Bearer`, and the URL points at the correct 桥接 rather than the OpenClaw gateway.

#### 98.6 外部工具调用失败

Inspect 桥接 日志 for 工具 name, 授权 action, and 绑定 decision on the failing 通话. External 工具 map to mesh 能力—missing `保险箱.retrieve` denies 知识 工具. Retry with a minimal 工具 invocation to isolate 模式 vs 策略 failures.

#### 98.7 MCP 客户端无法连接

MCP 客户端连接 to the home MCP adapter—确认端口, bearer token, and that the 节点 暴露 MCP when 桥接 is 启用. stdio MCP servers need correct command 路径 in 注册表 配置. Client and 服务器 must agree on 协议 版本 supported by your 构建.

#### 98.8 MCP 服务器被拒

Rejected MCP servers usually fail 能力 or 认证 checks at 注册 time. 验证 服务器 manifest 工具 do not require disallowed actions for the active 授权. Check 审计 for `missing 能力 for` 消息 naming the 意图.

#### 98.9 A2A Agent Card 不可用

获取 `/.well-known/智能体-card.json` from the home or 中继 公开 base URL with a valid bearer when required. 中继 转发 needs an active home tunnel for the token 所有者. Card JSON must be signed and fresh—republish after 能力 changes.

#### 98.10 A2A 任务失败或未找到

Locate the 任务 id from `任务/send` response and poll `任务/get` with the same bearer. Map internal 状态 via Chapter 73—`认证-required` means 绑定/授权 denial, not transport failure. 取消 only 任务 owned by the bearer-mapped 所有者; unknown id means 到期 or never created on this 节点.


### 99. 常见问题

#### 99.1 EnvoyMesh 需要账号吗？

No central EnvoyMesh 账户 is required. You create local cryptographic 身份 and may optionally use third-party 模型 提供商, 中继, 移动 推送 services, or integrations that have their own 账户.

#### 99.2 我的数据存储在哪里？

Everything lives on **your 设备**, primarily the home 节点 资料 目录: 保险箱 文件, 信任 store, 对话 索引, 审计 JSONL, and 身份 密钥. EnvoyGo keeps 配对 tokens and cached UI 状态 on the 手机—not a second copy of the full 保险箱 unless a 功能 explicitly caches media. 中继 forward traffic; they are not your data store.

#### 99.3 中继能阅读我的消息吗？

中继 can observe connection metadata and forward 加密/signed application traffic, but they are not authorized to impersonate a sender or bypass home 策略. Avoid placing unnecessary sensitive data in routable metadata.

#### 99.4 我可以不使用中继吗？

Yes, on the same LAN with mDNS or 直接 multiaddrs, or over known 对等节点 routes without 中继 reservation. Many WAN 设置 still use a **中继** for 发现 and circuit 中继 when NAT blocks 直接 dial. 中继 assists 连通性; it does not replace home-节点 策略 or signing.

#### 99.5 我可以使用多台设备吗？

Yes. One **所有者身份** can authorize multiple **设备证书**—桌面 Social/Tauri, additional computers, and EnvoyGo via QR 配对. Each 设备 has its own 密钥 for 审计 and 吊销. 移动 is a 瘦客户端 to home; it does not duplicate the full mesh 节点.

#### 99.6 我可以使用自己的模型吗？

Yes. 配置 提供商 in 设置 → AI → 模型 (LiteLLM-compatible 端点, local runners, or 云 APIs you 信任). The 语义防火墙 still filters prompts; 绑定 and 授权 still gate 工具 use. 提供商 traffic is subject to that 提供商's 隐私 terms.

#### 99.7 我可以使用外部智能体吗？

Yes, through the **Ext 智能体 桥接** (HomeClaw, Hermes, or OpenHuman) and MCP adapters on the home 节点. External 智能体 通话 mesh 工具 (`mesh.findKnowledge`, etc.)—they do not receive raw libp2p sockets. 启用 桥接 认证, scope 授权, and review 审计 for external 工具 通话.

#### 99.8 联系人离线时会怎样？

Signed 消息 queue on the sender's home 节点 and retry when a 路径 opens—直接 LAN, 中继 circuit, or later 在线 在线状态. Delivery indicators may lag until the 远程 节点 acknowledges. Neither side 丢失 消息 integrity; duplicates are avoided by 协议 IDs where implemented.

#### 99.9 陌生人能招募我的智能体吗？

No. 协作任务 require bonded 联系人 and opted-in 能力 提供商. 公开 strangers are not recruitable 工作节点 in the current product.

#### 99.10 我可以吊销智能体或设备吗？

Yes. **吊销 设备证书** for 丢失 laptops or phones from a trusted 桌面 节点; 吊销 or narrow **智能体 授权** to 停止 自动化. 阻止 信任 停止 new 联系人 运维. 吊销 is local and signed—对等节点 learn on next 验证 interaction.

#### 99.11 EnvoyMesh 是 MCP 或 A2A 的替代品吗？

No. EnvoyMesh uses its own signed 原生 协议 and provides MCP and A2A 桥接 so other ecosystems can use selected 工具, 发现, and 任务.

#### 99.12 哪些功能是实验或计划中的？

See 附录 J for the authoritative list. In short: Beta/实验 items are implemented but still being 验证 (interfaces may change); 计划中 items are designed but not shipped as complete 功能 (notably video calling and broad 匿名 工作节点 发现); Parked items are intentionally 暂缓 without a committed date (EnvoyGo full-节点 mode, global reputation, multi-hop commerce); 暂缓 items are designed but not yet built (Filecoin persistence, full 分层 中继 graph); Future items are scoped for later interop work (MCP resources/prompts, OAuth 2.1). Always confirm against the current release 笔记 before relying on any non-可用 能力.


---

## 第 XV 部分 —— 网站与内容体系 *（面向编辑与运维）*

> Part XV is a website and editorial content map. End users can skip this part; use Parts I–XIV and the appendices instead.

### 100. 网站信息架构

#### 100.1 主页

Lead with the one-sentence value proposition (private mesh for 人员 and 智能体), the primary 安装 CTA, and three 功能 pillars (私信, 个人AI, 智能体网络). Link to Use Cases and Downloads; avoid 协议 jargon above the fold.

#### 100.2 产品概述

One paragraph per pillar linking to the dedicated product page. Attach the 可用/桌面/移动 labels and link each pillar to its in-guide chapter (messaging → Part III, 个人AI → Part IV, 知识 → Part V, external 智能体 → Part VI, 智能体网络 → Part VII).

#### 100.3 Agent Network

Frame as bonded 选择性加入 collaboration — never "市场". Attach the 智能体网络 概述 chapter link (§44) and the Join flow (§45). Call out that strangers cannot recruit the local 智能体.

#### 100.4 外部智能体

List OpenClaw (bundled), HomeClaw, Hermes, OpenHuman with 兼容性-预设 labels where applicable; link each to its guide chapter (§38–§42). 状态 that only one 外部智能体 is active per 桥接.

#### 100.5 Use cases

Curate 6–8 scenarios (个人AI across 设备, family mesh, trusted research, small-team 智能体网络, Claude 桌面 via MCP, A2A 委托, 自身-托管 中继). Each links to the matching tutorial in §14 or use case in §5.

#### 100.6 How it works

Plain-语言 architecture diagram (所有者 → 绑定 → signed 消息 → optional 中继). Link to §4 and the 安全 模型 page; keep Ed25519/libp2p in an expandable technical 笔记.

#### 100.7 Security and privacy

Summarize the Diplomat/绑定引擎/语义防火墙/保险箱 boundaries without claiming "unbreakable" 安全. Link to §84 and 附录 H checklists; surface the vulnerability-reporting 联系人.

#### 100.8 Downloads

Per-平台 cards (macOS, Windows, iOS, Android, source) with 验证 badges and last-验证 dates. Link to §8 安装 steps; surface release 笔记 and 附录 J status boundaries.

#### 100.9 Guide

Entry point to this 指南: Getting 启动, Everyday Use, 外部智能体, 智能体网络, 故障排除. Mirror the "Proposed Guide Navigation" tail of this document.

#### 100.10 Community and support

GitHub, discussions, roadmap, release 笔记, support 联系人. Keep it actionable — where to 文件 bugs, where to ask questions, where to read the roadmap.


### 101. 产品页面

#### 101.1 私信

Pitch signed 点对点 messaging with 绑定-gated delivery. Attach 可用 + 桌面 + 移动 labels; link to §16 and §17. 笔记 群聊 and 音频 消息 as related.

#### 101.2 个人 AI

Pitch EnvoyAI/OpenClaw as the bundled assistant under 所有者 策略. Attach 可用 + 桌面 label; link to §21–§28. Cross-reference external 智能体 for users who prefer a different 运行时.

#### 101.3 Knowledge Base

Pitch 本地优先 笔记, 保险箱 文件, RAG, and Obsidian integration. Attach 可用 + 桌面 label; link to §29–§35. 笔记 敏感度 labels and 联邦 RAG as differentiators.

#### 101.4 Agent Network and 协作任务

Pitch bonded multi-智能体 collaboration with attributed 报告. Attach 可用 + 桌面 label (EnvoyGo is read-only mirror); link to §44–§63. Emphasize "not a 市场".

#### 101.5 外部智能体

Pitch the safe 桥接 for OpenClaw/HomeClaw/Hermes/OpenHuman. Attach 兼容性-预设 labels; link to §36–§43. 状态 the one-active-桥接 rule.

#### 101.6 桌面与 EnvoyGo

Pitch two surfaces, one 身份: 桌面 home 节点 + EnvoyGo 瘦客户端. Attach 可用 + 桌面 + 移动 labels; link to §8 and §13. Surface the macOS/Windows bundle difference (§9.4/§9.5).

#### 101.7 语音与文件共享

Pitch 语音通话 (阶段 42I on iOS) and content-addressed 文件 分享. Attach 可用 + 桌面 + 移动 labels; link to §18 and §19. Mark 视频通话 as 计划中.

#### 101.8 终端与浏览器

Pitch 远程 终端 and `envoy://` 浏览. Attach 可用 + 桌面 label (EnvoyGo mirrors); link to §78 and §79. Surface herdr/TmuxAI as external integrations.

#### 101.9 MCP 与 A2A

Pitch MCP 工具 bridging (consumer + 服务器) and A2A 智能体 cards/任务. Attach 实验/Beta labels as appropriate; link to §68–§73. 笔记 OAuth/resources as future scope.

#### 101.10 中继与自托管

Pitch optional 中继 for 连通性 and 自身-托管 集群 运维. Attach 操作员 label; link to §74–§77. Surface the community 中继 and the 操作员 集群 guide.


### 102. 外部智能体网站页面

#### 102.1 外部智能体 overview

Explain the 桥接 模型 (no raw P2P for 智能体). Attach 兼容性-预设 guidance; link to §36 and 附录 C matrix. 受众: integrators choosing an 智能体运行时.

#### 102.2 OpenClaw / EnvoyAI

Detail the bundled 运行时, gateway port 18789, canonical extension, macOS/Windows bundle differences. Attach 可用 + 桌面 label; link to §38.

#### 102.3 HomeClaw

Detail the default 预设 at 8010/消息, externally maintained 渠道. Attach 兼容性-预设 label; link to §39. 状态 verification responsibility.

#### 102.4 Hermes

Detail the 预设 at 8020/消息, 知识-oriented 运行时, migration 路径. Attach 兼容性-预设 label; link to §40.

#### 102.5 OpenHuman

Detail the 预设 at 8021/消息, 禁用 by default, externally maintained. Attach 兼容性-预设 + 计划中-for-生产 labels; link to §41.

#### 102.6 自定义智能体集成

Document the `envoymesh-消息` adapter contract. Attach 实验 label; link to §42 and the 桥接 wire contract in §37. 受众: developers.

#### 102.7 集成状态矩阵

Render 附录 C as a sortable table (智能体 × mode × port × status × last-验证). Keep it the single source of truth; every other page links here.

#### 102.8 安全边界

Explain why 智能体 never hold Ed25519 密钥 and how Bearer 认证 gates `/桥接/*`. Link to §37 and §84.10; do not overstate — say "策略-checked", not "secure".

#### 102.9 开发者交接链接

Cross-link to `docs/agent_bridge_guide.md`, `docs/openclaw-智能体-桥接-adr.md`, `OpenClawExtension/`, and the MCP/A2A design docs. 受众: engineers implementing an 智能体.


### 103. 智能体网络网站页面

#### 103.1 智能体网络概述

Define bonded 选择性加入 collaboration; attach 可用 + 桌面 label; link to §44. Emphasize "not a 市场" and "中继 stay lean".

#### 103.2 加入智能体网络

Step-by-step 启用 Join + 发布 资料; link to §45 and §46. Attach screenshots of the 设置 → 智能体网络 tab.

#### 103.3 智能体身份与名片

Explain 所有者-authorized 智能体 凭证 and 智能体 Card; link to §47. Surface the A2A 智能体 Card 桥接 as the external face.

#### 103.4 已绑定工作节点发现

Explain card auto-获取 on 绑定 + 能力 索引; link to §48 and §49. 笔记 that broad 匿名 发现 is 计划中, not current.

#### 103.5 协作任务

Define 协作任务 (product name) vs 链 (code name); link to §50–§58. Attach screenshots of the 链/协作任务 UI.

#### 103.6 规划与分配

Explain 协调代理 计划 + 直接-分配 vs competitive 竞价; link to §51–§53. Keep LLM planner details in an expandable.

#### 103.7 竞标与预算

Explain 授权, 成本 ceilings, 重新平衡 策略; link to §53 and §54. Surface CSV export and 成本 可见性 控制.

#### 103.8 多轮协作

Explain 迭代 (draft → judge → replan); link to §56. 状态 default `iterationMaxRounds=1`.

#### 103.9 结果与来源

Explain composite 交付物 and 工作节点 attribution; link to §58 and 附录 G. Emphasize that flattened 匿名 answers 丢失 provenance.

#### 103.10 Trust and safety

Summarize 绑定 gates, 授权 limits, 敏感度 ceilings, 审批; link to §61 and 附录 H.5/H.6 checklists.

#### 103.11 Network connectivity

Explain LAN, 直接, 中继-assisted 路径; link to §62 and Part X. Surface NAT/TURN guidance.

#### 103.12 功能状态与路线图

Render 附录 J.4–J.11 as the authoritative boundary list; link each item to its design doc. Mark 计划中/Parked/暂缓 explicitly.


### 104. 可复用内容模板

#### 104.1 页面标题

简洁、面向动作，≤ 60 字符。镜像用户搜索的名词（如“私信”、“加入智能体网络”），而非内部术语。

#### 104.2 一句话摘要

先说读者能做什么，再说功能是什么。“向已绑定联系人发送已签名的点对点消息”胜过“使用 Ed25519 信封的消息子系统”。

#### 104.3 可用性标签

Render the standard labels exactly: 可用, Beta, 实验, 兼容性 预设, 计划中, Parked, 桌面, 移动, and 操作员. A page may carry more than one label, such as 可用 + 桌面.

#### 104.4 功能做什么

最多两到三句。点明用户动作、边界（涉及谁/什么）与结果。除非页面面向开发者，否则避免协议名称。

#### 104.5 为何使用

围绕真实目标组织（隐私、控制、协作、成本）。若有多种受众，每类受众一句话——分别用“面向个人”、“面向团队”、“面向运维”开头。

#### 104.6 开始之前

以项目符号列出硬性前提：运行中的家庭节点、已绑定的联系人、已启用的开关、已配置的模型。每个前提链接到其设置章节。

#### 104.7 分步说明

编号步骤，每步一个动作，附精确 UI 路径（设置 → …）或命令。路径不明显处加截图或简短代码块。每步可独立校验。

#### 104.8 幕后发生什么

可选的可折叠小节，用于协议/加密细节。用它满足技术读者，而不强迫所有人先读 Ed25519/libp2p 术语。链接到设计文档，不要重复。

#### 104.9 隐私与安全提示

说明该功能强制执行的边界（已签名、策略受限、敏感度封顶、需审批）以及它不能防护的内容。引用安全章节，而非重述。

#### 104.10 故障排查

三到五条“症状 → 原因 → 修复”。深入诊断请链接到对应的 §91–§98 章节。除非重启确实是修复，否则避免泛泛的“重启应用”建议。

#### 104.11 相关主题

三到五个交叉链接，指向相邻章节与下一个合理动作。帮助读者从“设置”走到“使用”再到“排查”，无需退回目录。

#### 104.12 最后校验版本与日期

Every page should 记录 the last EnvoyMesh 版本 and date against which its steps and status were checked. Re-验证 after UI, 协议, packaging, or 安全 changes.


### 105. 编辑与术语指南

#### 105.1 优先为终端用户写作

Address the reader directly ("you"), lead with the 任务, defer 协议 internals to expandable 笔记. Mirror the tone of §1–§14.

#### 105.2 技术细节渐进披露

Surface the user-facing concept first; link to the deeper guide chapter; reserve code identifiers, 模式, and 配置 密钥 for the technical layer. Never force a reader to learn Ed25519 to send a 消息.

#### 105.3 产品术语与代码名

Prefer current product terms such as 协作任务 and EnvoyGo. Mention code names such as 链 only when they help developers find 日志, 设置, or 协议 references.

#### 105.4 功能状态用语

严格使用 §“功能状态标签”中的九个规范标签（可用、Beta、实验、兼容预设、计划中、暂缓、桌面、移动、运维）。绝不创造新的状态词；若某能力不匹配，用散文说明而非新增标签。

#### 105.5 平台标签

每个功能页面配一个平台标签（桌面、移动、运维）。若功能当前仅桌面可用但移动镜像已计划，写“桌面（移动镜像计划中）”，而非让平台含糊。

#### 105.6 安全声明与证据

Security statements must identify their boundary and evidence. Say “signed by the sender 密钥 and checked by the 入站守卫,” not “completely secure.”

#### 105.7 集成成熟度声明

Describe HomeClaw, Hermes, and OpenHuman as 兼容性 预设 and 状态 that their 智能体-side runtimes are externally maintained. Do not imply equal maturity with the bundled OpenClaw integration.

#### 105.8 无障碍与包容性语言

Use plain 语言, alt text for diagrams, sufficient color contrast, and avoid assumed-ability phrasing. Mirror WCAG-AA contrast in website pages.

#### 105.9 截图、图示与替代文本

Every screenshot needs alt text describing the action, not the chrome. Diagrams should be SVG with text labels; keep ASCII diagrams as a fallback in code blocks.

#### 105.10 翻译与本地化

Translate prose; keep brand names (EnvoyMesh, OpenClaw, etc.), code identifiers, and UI 路径 in English. Follow the Chinese edition 词汇表; coordinate locale updates with UI i18n.

#### 105.11 版本与审查节奏

Bump the 指南 版本 with each release; re-验证 状态标签 against `docs/implementation-计划.md` and 附录 J. 记录 the last-验证 date on every website page.


---

# 附录

## 附录 A —— 术语表

#### A.1 Agent

**智能体**（智能体）是由所有者授权、可通信或执行受限任务的 AI 身份。

#### A.2 Agent Card

**智能体 Card**（智能体名片）是一份描述能力的文档（可选由中继签名），用于发现某个智能体能做什么、是否已加入智能体网络。

#### A.3 Agent Network

**智能体网络**（智能体 Network）指已绑定的所有者之间，让其自愿加入的本地智能体协同工作的协作关系。

#### A.4 Artifact

**交付物**（artifact）是带类型的任务结果：文本、文件、结构化数据或复合包。

#### A.5 Bond

**绑定**（绑定）是本地记录的对另一位所有者的信任关系及信任层级。

#### A.6 Capability

**能力**（能力）是已广播或已授权的操作，例如任务执行或知识查询。

#### A.7 Contact

**联系人**（联系人）是出现在本地目录与关系界面中的已知所有者或智能体。

#### A.8 Device

**设备**（设备）是经所有者授权、拥有独立密钥与证书的安装实例。

#### A.9 DID

**DID**（去中心化标识符）是由加密身份派生的标识呈现。EnvoyMesh 的所有者/设备/智能体 DID 分别使用 `envoy:所有者:` / `envoy:设备:` / `envoy:智能体:` 前缀（见 §10.6）。

#### A.10 EnvoyAI

**EnvoyAI** 是 EnvoyMesh 内置的、由 OpenClaw 驱动的个人智能体体验。

#### A.11 EnvoyGo

**EnvoyGo** 是当前 iOS/Android 上与家庭节点配对的瘦客户端。

#### A.12 External agent

**外部智能体**（external 智能体）是通过本地 HTTP 桥接连接的、独立维护的运行时。

#### A.13 Library

**资料库**（库）组织知识条目，供本地搜索、共享、发布与浏览使用。

#### A.14 Mandate

**授权**（授权）是一份由所有者签名的授权文档，用于限定某个智能体任务的范围。

#### A.15 Owner

**所有者**（所有者）是长期存在的人类身份与根授权密钥。

#### A.16 Peer

**对等节点**（对等节点）是签名并传输信封的运行时网络身份。

#### A.17 Relay

**中继**（中继）协助可达性、查询与转发，但本身不成为应用权威。

#### A.18 Task

**任务**（任务）是委派工作与带类型结果的已签名生命周期。

#### A.19 Team job

**协作任务**（Team job，代码中称 链）协调多个智能体子任务，并合并其带归属的结果。

#### A.20 Vault

The **保险箱** is 带路径安全的本地存储与索引 for private 文件 and 知识.


## 附录 B —— 功能与平台矩阵

#### B.1 macOS

**macOS** — Tauri 桌面 bundle with embedded 节点; fuller OpenClaw extensions; DMG/notarized 安装. Home 节点 运行 all mesh 功能; EnvoyGo pairs as mirror. 资料 under Tauri app data area (附录 K.1).

#### B.2 Windows

**Windows** — Installer with slimmer OpenClaw essential set; 资料 in `%AppData%` / `%USERPROFILE%\.envoymesh\`. Allow 防火墙 for inbound 对等节点 when prompted.

#### B.3 iOS 上的 EnvoyGo

**EnvoyGo iOS** — Flutter 瘦客户端; QR 配对 to home; chat, 通话, 终端, 浏览器 mirror; no standalone mesh 节点.

#### B.4 Android 上的 EnvoyGo

**EnvoyGo Android** — Same mirror scope as iOS; home 节点 must stay reachable via WebSocket/中继 when off-LAN.

#### B.5 仅家庭节点功能

**Home-节点-only** — 身份, 保险箱, 智能体, Team orchestration, MCP/A2A 桥接, full 设置. Required for authoritative signing and 策略.

#### B.6 EnvoyGo 移动只读镜像

**EnvoyGo mirrors** — Read-heavy 远程 UI; AI engine and 桥接 配置 read-only on 手机; change on 桌面.

#### B.7 运维功能

**运维** — 中继 部署, 引导 lists, `--广告-addr`, 集群 manifest CLI; not end-user Social 功能.

#### B.8 可用、Beta、实验、计划中与暂缓功能

**状态标签** — 可用, Beta, 实验, 计划中, Parked, 暂缓 per front matter; 附录 J is canonical over marketing copy.

## 附录 C —— 外部智能体矩阵

#### C.1 EnvoyAI / OpenClaw

**EnvoyAI / OpenClaw** — Bundled personal 智能体; Gateway default 18789; 桥接 3031; EnvoyMesh-maintained extensions on 桌面.

#### C.2 HomeClaw

**HomeClaw** — 兼容性 预设; external 运行时; 消息 port 8010; bearer 认证 via 桥接-配置.

#### C.3 Hermes

**Hermes** — 兼容性 预设; external 运行时; port 8020; 验证 adapter 日志 separately.

#### C.4 OpenHuman

**OpenHuman** — 兼容性 预设; external 运行时; port 8021; human-in-loop workflows external to mesh.

#### C.5 自定义 `envoymesh-message` 智能体

**Custom envoymesh-消息** — HTTP 消息 adapter; you 维护 智能体 进程; match 桥接 token and JSON 模式.

#### C.6 兼容 MCP 的应用

**MCP applications** — Clients attach to home MCP adapter; 工具 map to 注册表; Bearer 认证; no OAuth resources yet (J.11).

#### C.7 兼容 A2A 的智能体

**A2A 智能体** — 公开 card at `/.well-known/智能体-card.json`; JSON-RPC 任务; 中继 home-tunnel 转发 when 启用.

#### C.8 运行时归属与校验状态

**Verification** — 记录 last tested 版本/date per integration; 兼容性 预设 ≠ equal maturity to EnvoyAI.

## 附录 D —— 智能体网络速查

#### D.1 成员资格清单

**成员资格 checklist:** 所有者 授权 valid → Join toggle on → signed 智能体 Card 发布 → 能力 tags match 计划 → 直接 绑定 to 协调代理.

#### D.2 工作节点资格清单

**Worker eligibility:** bonded 直接 联系人 → 远程 Join 启用 → card lists required 能力 → probe succeeds → not 阻止 tier.

#### D.3 协作任务状态参考

**协作任务 状态:** track 协调代理 状态 machine (Chapter 64); 终端: completed/failed/取消; stall 触发器 重新平衡 策略.

#### D.4 授予模式

**Award modes:** competitive vs single-分配 per job 设置; competitive waits for 竞价 before award.

#### D.5 预算与再平衡策略

**预算/重新平衡:** 授权 `maxCost` and job 预算 caps; 重新平衡 when 工作节点 离线 or stall 超时 fires.

#### D.6 迭代模式

**迭代 modes:** single-round vs 多轮 collaboration; 所有者 审批 may pause between rounds.

#### D.7 交付物类型

**Artifact types:** text, 文件, structured, composite—validate 哈希 and 敏感度 before 合并 (附录 G).

#### D.8 故障排查 decision tree

**Decision tree:** 绑定? → card fresh? → 能力 match? → 授权 OK? → 审计 correlation → then 网络/probe.

## 附录 E —— 信任层级参考

#### E.1 自身

**自身** is the 绑定 tier for your own 所有者, 设备, and locally authorized 智能体. `evaluatePolicy` returns `{ action: "allow", maxSensitivity: "private" }`—the highest ceiling. 授权 and 能力 checks still apply; 自身 tier does not bypass 入站守卫 or 语义防火墙.

#### E.2 直接

**直接** (friends tier) is a mutual 绑定 with explicit 信任. 策略 allows 意图 subject to `limitSensitivity(requested, "friends")`—friends-tier 知识 and 资料库 reads proceed; trusted/private items require 所有者 审批 when requested 敏感度 exceeds friends. Chat, 任务, and 智能体网络 工作节点 发现 among 直接 绑定 are the default collaboration 路径.

#### E.3 介绍

**推荐** is 介绍-backed 信任—stronger than 公开, weaker than 直接. `知识.query` caps at **公开** 敏感度; `库.read` caps at **friends** 可见性. `订阅源.notify`, intro 意图, `system.ping`, and `绑定.request` are 允许 at 公开 敏感度; most other 意图 return **`approval_required`** (`推荐 对等节点 requires 审批`).

#### E.4 公开

**公开** is stranger/unbonded tier. 允许: `system.ping`, `social.intro.同步`, 公开 `知识.query`, 公开 `库.read`, with rate limits on 公开 知识 (default 5 queries/minute). `绑定.request` and `social.intro.propose` return **`challenge`** (referral or manual 审批). All other 意图 are **`deny`** (`公开 对等节点 cannot use this 意图`).

#### E.5 阻止

**阻止** 对等节点 are hard-拒绝: `evaluatePolicy` returns `{ action: "deny", reason: "对等节点 is 阻止" }` for every 意图. Use block for abuse or 吊销 relationships; unblock requires explicit 信任 restoration. 阻止 status is local—your 节点 will not send or accept application traffic regardless of 远程 reachability.

#### E.6 典型权限

**Typical 权限 by tier** (before 授权 and 能力 gates):

| Tier | Chat / 任务 | 知识 query max | 资料库 read max | 智能体 card 获取 |
|------|--------------|---------------------|------------------|------------------|
| 自身 | Yes (local) | private | private | N/A |
| 直接 | Yes | friends | friends | Yes (bonded) |
| 推荐 | 审批 usually | 公开 | friends | After 审批 |
| 公开 | Deny | 公开 (限流) | 公开 | Challenge/deny |
| 阻止 | Deny | Deny | Deny | Deny |

Raw 文件 分享 (`allowRawFiles`) always returns **`approval_required`** regardless of tier.

#### E.7 知识敏感度限制

**知识-敏感度 limits** use ordered ranks: 公开 < friends < trusted < private. 绑定 tier sets the ceiling; requesting higher 敏感度 yields **`approval_required`** (`requested 敏感度 exceeds <tier>`). Item 可见性 in handlers is checked against `maxSensitivity` from 策略—not 绑定 tier alone.

#### E.8 智能体网络资格

**智能体网络 eligibility** requires 直接 (or higher) 绑定 for 工作节点 发现 and card 获取; 公开 绑定 do not auto-获取 智能体 cards. Workers must opt in (`capabilityProviderEnabled`) and 广告 matching 能力 tags on signed 智能体 Card. 协作任务 still enforce 授权 bounds, 预算, and per-action 审批 independently of 绑定 tier.

## 附录 F —— 任务状态参考

#### F.1 EnvoyMesh 状态

**EnvoyMesh 状态:** `created → 计划中 → discovering → 协商 → waiting_for_peer | waiting_for_owner → 运行 → partial → completed | failed | 取消` (Chapter 65).

**Typical transitions:** `created → 计划中` (协调代理 accepts the objective); `计划中 → discovering|协商` (工作节点 search or 竞价 exchange); `协商 → waiting_for_owner` (审批 needed); `运行 → partial` (interim result, more work pending); `partial → completed` (final 合并); any non-终端 状态 → `取消` (所有者/对等节点/策略 取消). `completed`, `failed`, and `取消` are 终端.

#### F.2 有效状态转换

**Valid transitions:** forward along 生命周期; `partial` may precede 终端 success; reject/取消 意图 from 协商 or 运行 per 授权.

#### F.3 终态

**终端 状态:** `completed`, `failed`, `取消`—no further 任务 意图 except 审计; collect-N 授权 may close early on first completion.

#### F.4 A2A 状态对应

**A2A equivalents:** twelve internal 状态 map to nine A2A 状态 via `A2A-状态-map.ts` (Chapter 73)—document mapping for client UX.

#### F.5 取消行为

**Cancellation:** 所有者 or 授权 holder sends `任务.取消`; in-flight work should 心跳 until ack; A2A clients use `任务/取消` for tracked ids.

## 附录 G —— 交付物与内容映射

#### G.1 文本交付物

**Text 交付物** — UTF-8 summaries and chat extracts; map to A2A Text Parts; apply 语义防火墙 before 模型 ingestion.

#### G.2 文件交付物

**文件 交付物** — 保险箱-backed 路径 with optional `?哈希=` verification; size and 路径 安全 enforced at serve time.

#### G.3 结构化交付物

**Structured 交付物** — JSON with 模式 hints; validate before 自动化; map to MCP/A2A Data Parts.

#### G.4 复合交付物

**Composite 交付物** — Bundles of child 交付物 with attribution weights; expand to multiple Parts when bridging.

#### G.5 MCP 内容映射

**MCP mapping** — Tool results become typed content blocks; preserve 关联ID for 审计 stitch.

#### G.6 A2A Part 映射

**A2A Part mapping** — Text/Data/文件 Parts ↔ 原生 交付物 types (Chapter 73); 哈希-check 文件 Part URIs before 获取.

## 附录 H —— 隐私与安全清单

#### H.1 首次设置

**First-time 设置:** create 所有者 密钥 → 备份 `所有者-密钥.pem` → first 设备 cert → set display 资料 → test ping with low 敏感度.

#### H.2 添加联系人

**Add 联系人:** 验证 out-of-band 身份 → scan full QR → complete 绑定/challenge → 启动 at 推荐 unless mutual 直接 信任 intended.

#### H.3 添加设备

**Add 设备:** 所有者-signed 设备证书 → 记录 设备 ID → 配对 EnvoyGo or secondary 桌面 → 吊销 丢失 设备 promptly.

#### H.4 连接外部智能体

**External 智能体:** generate 桥接 bearer → 兼容性 预设 → test localhost port → minimal 工具 通话 → review 审计 before broad 授权.

#### H.5 加入智能体网络

**Join 智能体网络:** 直接 绑定 → 启用 Join → 发布 card → refresh 工作节点 → trial single-工作节点 任务 before 协作任务.

#### H.6 发起协作任务

**启动 协作任务:** 授权 bounds set → eligible 工作节点 visible → 计划 approved → 预算/deadline realistic → 监控 心跳.

#### H.7 运营中继

**操作 中继:** `--广告-addr` for WAN → 引导 multiaddr documented → 监控 中继-manager 审计 → no LLM/保险箱 on 中继 host.

#### H.8 应对丢失设备

**丢失 设备:** 吊销 设备 cert immediately → rotate 桥接 tokens if 暴露 → review 审计 for post-loss traffic → re-配对 from 备份 所有者 密钥 only on trusted hardware.

## 附录 I —— 速查卡

#### I.1 配对联系人

**配对 联系人:** 联系人 → Invite → show QR → other scans → complete 绑定 flow → confirm 直接/推荐 tier in 信任 UI.

#### I.2 配对 EnvoyGo

**配对 EnvoyGo:** home 设置 → 设备 → show 配对 QR → scan in EnvoyGo → 验证 WebSocket connected on 手机.

#### I.3 更改信任

**Change 信任:** open 联系人 → 信任层级 → confirm 策略 implications (附录 E) → approve if lowering requires re-绑定.

#### I.4 添加知识

**Add 知识:** 资料库 → Add → pick 保险箱-safe 路径 → set 敏感度 label → re-索引 if search misses.

#### I.5 批准动作

**Approve action:** 桌面 审批 queue → read 授权 context → Allow/Deny → 任务 resumes or 取消 per 策略.

#### I.6 连接外部智能体

**Connect 外部智能体:** 设置 → External 智能体 → 预设 → paste bearer to 智能体 配置 → test 消息 round-trip.

#### I.7 加入智能体网络

**Join 智能体网络:** 设置 → 智能体网络 → Join → 验证 card 发布 → Refresh 工作节点 on 对等节点.

#### I.8 发起协作任务

**启动 协作任务:** 智能体网络 → New job → select 工作节点 → set 授权 → launch → watch 状态 in job panel.

#### I.9 取消任务

**取消 任务:** open 任务 → 取消 → confirm 授权 allows 取消 → 审计 记录 终端 取消 状态.

#### I.10 吊销设备

**吊销 设备:** 设置 → 设备 → 吊销 → confirm cert 吊销 → remove 配对 on 设备 app.

#### I.11 收集诊断

**Collect diagnostics:** 附录 K bundle checklist → redact secrets → attach 关联ID → CLI 连通性-status.

## 附录 J —— 状态与路线图边界

#### J.1 可用功能

**可用 (0.1.0)** — intended for current use on supported platforms:

- Signed messaging, 群组, 音频 消息, 语音通话, 文件/资料 分享 (Chapters 11–14)
- 个人AI via EnvoyAI/OpenClaw and external-智能体 桥接 (Part VI)
- 保险箱, 资料库, 知识 query, 浏览器/`envoy://` publishing (Part V)
- 智能体网络, 协作任务, 授权, 审批 (Part VII)
- 终端, 中继, MCP 工具 桥接, A2A 智能体 card + JSON-RPC 任务 (Parts VIII–IX, X)
- 桌面 Social (macOS/Windows) and EnvoyGo 瘦客户端 (iOS/Android) per Chapter 9

Confirm exact packaging in release 笔记 before 生产 rollout.

#### J.2 Beta 与实验功能

**Beta / 实验** — implemented but still receiving 验证; interfaces may change:

- 实验 toggles in 设置 (§80.11)—启用 only on non-生产 资料
- MCP stdio live servers and extended interop smoke 路径 (阶段 48 docs)
- A2A home-tunnel 转发 and 交付物 mapping edge cases (Part IX)
- IPFS/Helia sidecars when bundled—optional content experiments, not core chat
- Multi-中继 coordination under load—works but 操作员 tuning may be required

报告 issues with the **Beta** or **实验** label and redacted 审计 excerpts.

#### J.3 平台专属功能

**平台-specific boundaries:**

- **macOS 桌面** — fuller OpenClaw extension bundle; Tauri notarization 路径 (Chapter 9.2–9.4)
- **Windows 桌面** — slimmer extension set; user AppData 资料 路径 (9.3, 9.5)
- **EnvoyGo iOS/Android** — 瘦客户端 only: chat, 通话, 终端, 浏览器 mirror, read-only Team status; no local 保险箱, 智能体运行时, or MCP/A2A 服务器 (9.1, 9.9)
- **Home-节点-only** — mesh 身份, 保险箱 indexing, Team orchestration, 桥接 端点, full 设置 (9.8)
- **运维** — 中继 binary, 集群 manifests, 引导 tuning (Part X, 附录 K)

Do not infer 桌面 可用性 from 移动 mirrors or vice versa.

#### J.4 计划中的视频通话

**计划中.** Voice calling is 可用; video calling remains architecturally anticipated but is not a current user 功能.

#### J.5 计划中的广泛或匿名发现

**计划中 boundary.** 联系人- and 能力-scoped 发现 exists, but open 匿名 工作节点 recruitment and 市场 behavior are not current 智能体网络 功能.

#### J.6 暂缓：EnvoyGo 作为完整 mesh 节点（EnvoyGo 仍为瘦客户端）

**Parked.** EnvoyGo remains a home-paired 瘦客户端. 运行 it as an independent full mesh 节点 has no committed release.

#### J.7 暂缓的全球信誉

**Parked.** Local feedback and reputation signals exist, but a 联邦 global reputation ledger is intentionally 暂缓.

#### J.8 暂缓的多跳商业

**Parked.** Multi-hop commerce, payment, and receipt workflows are outside the current collaboration product.

#### J.9 Deferred Filecoin 持久化

**暂缓.** Helia and Kubo IPFS 路径 are 可用, but Filecoin-based long-term persistence is not part of the current release.

#### J.10 延期的分层中继图

**暂缓.** Multi-中继 sibling coordination exists; a full 分层 中继 graph is not complete.

#### J.11 未来 MCP 资源与 OAuth

**Future.** MCP currently focuses on 工具 and Bearer-authenticated 桥接. Resources, prompts, and OAuth 2.1 remain future 互操作性 work.

#### J.12 其他路线图参考

**Other roadmap references** (documented direction, not current general 功能):

- Video calling (J.4)—voice only today
- Broad/匿名 工作节点 recruitment (J.5)
- EnvoyGo as full mesh 节点 (J.6—parked; 瘦客户端 remains product 路径)
- Global reputation ledger (J.7), multi-hop commerce (J.8)
- Filecoin persistence (J.9), full 分层 中继 graph (J.10)
- MCP resources/prompts/OAuth 2.1 (J.11)

See `docs/implementation-计划.md` for 阶段 numbers; design docs alone do not imply shipment.

## 附录 K —— 支持参考

#### K.1 应用数据位置

EnvoyMesh keeps 状态 outside the application 安装 目录. **Source / 开发者 运行** default to `./data/default` for the 资料 (身份, 信任, 任务, 审批, 桥接 配置) and `./shared_vault/` for 资料库 content. **Packaged 桌面 builds** use OS-specific user data 路径 (for example `~/.local/分享/envoymesh/` on Linux, `%AppData%` or `%USERPROFILE%\.envoymesh\` on Windows, and the Tauri app data area on macOS—confirm the exact 路径 in release 笔记 for your installer). The 保险箱 may appear as `shared_vault/` beside the 资料 or under a `保险箱/` subdirectory depending on 平台 packaging. Always back up the whole 资料 目录 **and** the 保险箱 together before migration. Include only the relevant subtree in support bundles; remove `所有者-密钥*`, 设备 密钥, `桥接-配置.json` secrets, 模型 API 密钥, and unrelated personal 文件.

#### K.2 默认端口

Common 默认值 include 外部智能体桥接 `3031`, OpenClaw Gateway `18789`, 中继 HTTP `15432`, and HomeClaw/Hermes/OpenHuman 消息 ports `8010`/`8020`/`8021`. Confirm 配置 because 操作员 may override every value.

#### K.3 公开 endpoints

公开 A2A routes include `/.well-known/智能体-card.json` and `/.well-known/A2A/jsonrpc` when the 中继 桥接 is 启用. Keep home-only 桥接 and administrative 端点 private.

#### K.4 日志位置

Primary operational history is append-only **JSONL** in the 资料 目录, not a separate syslog tree. 密钥 文件 include `审计-events.JSONL` (allow/deny 结果 and 连通性 追踪), `任务-日志.JSONL`, `审批-queue.JSONL`, `发现-events.JSONL`, and `分享-events.JSONL`, plus JSON 状态 such as `信任-记录.json` and `对等节点-目录.json`. 中继 操作员 also generate 中继-manager snapshot rows inside 中继 资料 审计 日志. Console output from `npm 运行 节点:dev` or the 桌面 wrapper is supplementary—prefer redacted 审计 excerpts with 关联ID when opening support tickets. Strip bearer tokens, 信封 载荷, and 密钥 material before 分享 any 日志 文件.

#### K.5 诊断命令

From the repository root (adjust `--资料` to your absolute 资料 路径):

```bash
npm 运行 typecheck                    # TypeScript 构建 check
npm test                             # Unit tests
npm 运行 test:orchestrator -- dev     # Fast dev loop (~35s, no E2E)
npm 运行 test:orchestrator -- full    # Full gate incl. libp2p E2E + smoke (~10 min)
npm 运行 节点:dev -- --资料 ./data/default
npm 运行 CLI -w @envoymesh/节点 -- --help
npm 运行 CLI -w @envoymesh/节点 -- 连通性-status --资料 ./data/default --rich
npm 运行 CLI -w @envoymesh/节点 -- 中继-status --资料 ./data/default
npm 运行 CLI -w @envoymesh/节点 -- 审计 --资料 ./data/default --limit 40 --include-P2P-追踪
```

See `QuickStart.md` for 设置 scripts, cross-网络 中继 walkthroughs, and the end-to-end verification checklist. Global `envoymesh doctor` is 可用 after `npm i -g .` from the repo root.

#### K.6 常见错误主题

EnvoyMesh surfaces failures by **theme** in 审计 summaries, CLI output, and 桥接 responses rather than a single printed error-code handbook. Common patterns:

- **`认证-required`** — bearer or 会话 授权 failed (missing/invalid token, or 信任层级 too weak for the requested A2A/MCP/任务 action). Fix 配对 tokens, 桥接 secrets, or 绑定 level before retrying.
- **绑定 deny** — `evaluatePolicy` returned deny (for example `对等节点 is 阻止`, `公开 对等节点 cannot use this 意图`, 到期 授权, disallowed action, or 敏感度 above 授权). Inspect 信任层级 and 授权 bounds; raising 信任 requires explicit human 审批, not a 连通性 tweak.
- **模式 / guard reject** — 入站守卫 rejected malformed, oversized, replayed, or unsigned 信封 (`malformed or unsigned 信封`, `信封 exceeds maximum size`, `replayed 消息`). Usually indicates 版本 skew, corrupt 载荷, or attack traffic—not a 中继 routing issue.

A2A JSON-RPC may also return `-32001` with an `认证-required:` 消息 when 授权 headers are missing on 中继-proxied 任务 端点. Capture the 审计 row's `摘要` and `correlationId` instead of inventing numeric codes when filing issues.

#### K.7 支持与社区链接

**In-repo documentation:** 启动 with `QuickStart.md`, `README.md`, `docs/implementation-计划.md`, and the scenario/design docs referenced from QuickStart (for example `docs/UserStory.md`, `docs/scenarios.md`).

**Source repository:** https://github.com/allenpeng0705/EnvoyMesh — use GitHub Issues for bug 报告 and 功能 discussion when that repository is your 分发 渠道. There is no separate 商业支持 门户 documented in this release; enterprise 操作员 should 维护 内部运行手册.

**Before opening an issue:** reproduce on a current 构建, 笔记 平台 (macOS/Windows/EnvoyGo), 资料 路径, 功能 状态标签 (**Beta** / **实验**), and redacted `审计-events.JSONL` excerpts with 关联ID. Placeholder community chat/forum links are not bundled with 0.1.0—watch release 笔记 for official channels as they are announced.


---

> **面向网站编辑的信息架构建议。** 下方两个列表不是终端用户章节。它们是根据本指南结构推导的公开网站导航骨架建议。编辑应将其作为起点，并根据实际网站信息架构调整。

## 建议的网站主导航

- **产品**
- **智能体网络**
- **外部智能体**
- **用例**
- **工作原理**
- **安全**
- **下载**
- **指南**
- **社区**

## 建议的指南导航

- 入门
- 对话与共享
- 个人 AI
- 知识与资料库
- 外部智能体
- 智能体网络与协作任务
- 任务与交付物
- MCP 与 A2A
- 网络与中继
- 隐私与安全
- 设置与数据
- 故障排查
- 常见问题
