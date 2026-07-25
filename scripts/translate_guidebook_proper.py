#!/usr/bin/env python3
import re
import time

try:
    from googletrans import Translator
    translator = Translator()
except ImportError:
    print("googletrans not installed, using manual translation mode")
    translator = None

PRESERVE_TERMS = [
    'EnvoyMesh', 'EnvoyGo', 'EnvoyAI', 'OpenClaw', 'HomeClaw', 'Hermes', 'OpenHuman',
    'libp2p', 'Ed25519', 'DID', 'MCP', 'A2A', 'JSON-RPC', 'WebSocket', 'RAG',
    'Vault', 'Library', 'Social', 'Node', 'Home Node', 'Agent', 'Bond', 'Trust',
    'Peer', 'Mesh', 'Profile', 'Contact', 'Team jobs', 'Relay', 'Terminal', 'Browser',
    'Mandate', 'Approval', 'Audit', 'Knowledge', 'Conversation', 'Group',
    'Voice call', 'Audio message', 'QR code', 'Pairing', 'Discovery', 'mDNS', 'DHT',
    'TCP', 'QUIC', 'LAN', 'WAN', 'NAT', 'TURN', 'PTY', 'JSONL', 'Claude', 'Obsidian',
    'OpenAI', 'LiteLLM', 'Phase', 'Beta', 'Experimental', 'Available', 'Planned', 'Parked',
    'Desktop', 'Mobile', 'Operator', 'identity', 'policy', 'storage', 'models', 'networking',
    'inbound', 'outbound', 'signing', 'verification', 'sensitivity', 'trust tier',
    'blocked', 'public', 'referred', 'direct', 'self', 'stranger', 'friends',
    'owner', 'device', 'runtime', 'payload', 'envelope', 'signature', 'public key',
    'private key', 'fingerprint', 'hash', 'canonical JSON', 'schema', 'Zod',
    'correlation ID', 'intent', 'chat.message', 'knowledge.query', 'library.read',
    'relay.checkin', 'relay.lookup', 'task.mandate', 'task.propose', 'task.negotiate',
    'task.accept', 'task.reject', 'task.result', 'envoy://', 'in-process', 'thin client',
    'full node', 'circuit relay', 'rendezvous', 'forwarding', 'direct connection',
    'peer-to-peer', 'local-first', 'self-sovereign', 'cryptographic', 'auditability',
    'interoperability', 'federated', 'syndicated', 'delegation', 'orchestration',
    'attribution', 'semantic firewall', 'policy engine', 'bond engine', 'task runtime',
    'inbound guard', 'model router', 'vault inbox', 'profile directory',
    'node-config.json', 'bridge-config.json', 'CHANGELOG.md', 'QuickStart.md',
    'npm', 'Node.js', 'TypeScript', 'React', 'Vite', 'Flutter', 'Tauri',
    'macOS', 'Windows', 'iOS', 'Android', 'Signal', 'Telegram', 'WhatsApp', 'AirDrop',
    'APNs', 'FCM', 'CallKit', 'VoIP', 'IPFS', 'Filecoin', 'Gatekeeper', 'DMG', 'AppImage',
    'Firewall', 'IPv4', 'multiaddr', 'bootstrap', 'listen', 'connectivity', 'reachability',
    'notification', 'push notification', 'background', 'battery optimization', 'permission',
    'microphone', 'video', 'video call', 'screen sharing', 'screen', 'camera', 'media',
    'attachment', 'inline', 'read receipt', 'delivery', 'delivery indicator', 'thread',
    'threading', 'group chat', 'room', 'membership', 'admin', 'mute', 'block', 'remove',
    'restore', 'disclosure', 'privacy', 'privacy setting', 'display name', 'avatar',
    'photo', 'thumbnail', 'gallery', 'description', 'bio', 'status', 'online', 'offline',
    'connection state', 'presence', 'trust boundary', 'trust level', 'bond request',
    'bond tier', 'introduction', 'proof', 'proof text', 'out of band', 'vouch', 'recruit',
    'upgrade', 'downgrade', 'revoke', 'rotate', 'renew', 're-pair', 'catch-up', 'fan-out',
    'latency', 'timeout', 'queue', 'pending', 'stale', 'purge', 'archive', 'export',
    'delete', 'backup', 'recovery', 'migration', 'hardware migration', 'OS reinstall',
    'configuration', 'settings', 'preferences', 'deploy', 'rollout', 'fleet',
    'infrastructure', 'monitor', 'diagnosis', 'troubleshooting', 'logging', 'debug',
    'audit trail', 'audit log', 'journal', 'activity', 'allow', 'deny', 'outcome',
    'summary', 'remote', 'local', 'local network', 'remote URL', 'URL', 'endpoint',
    'port', 'localhost', '127.0.0.1', 'API', 'session', 'token', 'encryption',
    'transport encryption', 'TLS', 'integrity', 'abuse', 'escalate', 'report',
    'metadata', 'label', 'tag', 'keyword', 'search', 'index', 'indexing', 'retrieval',
    'chunk', 'note', 'document', 'Markdown', 'image', 'PDF', 'web content', 'web',
    'content', 'visibility', 'publish', 'browse', 'view', 'edit', 'compose', 'draft',
    'suggestion', 'assistance', 'auto-send', 'manual', 'copy', 'paste', 'share',
    'send', 'receive', 'resend', 'resume', 'split', 'merge', 'follow', 'invite',
    'accept', 'reject', 'request', 'grant', 'enable', 'disable', 'toggle', 'configure',
    'setup', 'install', 'uninstall', 'update', 'upgrade', 'build', 'source', 'release',
    'distribution', 'installer', 'disk image', 'channel', 'prerequisites',
    'requirements', 'system requirements', 'memory', 'file permission', 'path',
    'directory', 'folder', 'root', 'data directory', 'application data', 'user app-data',
    'profile data', 'extension', 'plugin', 'sidecar', 'attack surface', 'minimal',
    'essential', 'curated', 'full', 'slim', 'flavor', 'bundle', 'mirror',
    'remote control', 'sync', 'cached', 'authoritative', 'read-only', 'read-write',
    'write-back', 'row', 'column', 'table', 'comparison', 'matrix', 'shape',
    'architecture', 'system overview', 'hierarchy', 'property', 'property list',
    'diagram', 'figure', 'caption', 'SVG', 'viewBox', 'xmlns', 'font-family',
    'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'sans-serif',
    'text-anchor', 'marker', 'rect', 'path', 'circle', 'defs', 'markerWidth',
    'markerHeight', 'orient', 'refX', 'refY', 'rx', 'ry', 'fill', 'stroke',
    'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'marker-end',
    'url(#', 'break-inside:avoid', 'display:block', 'width:100%', 'max-width',
    'height:auto', 'margin:2.5em auto', 'text-align:center', 'font-size:9pt',
    'color:#6d6a63', 'margin-top:0.6em', '#EFF6FF', '#F5F5F4', '#F5F3FF', '#FEF3C7',
    '#3d5a45', '#6d6a63', '#1e1d1b', '#5d3ac7', '#645a3a', '#ffffff', 'white',
    'auto-start-reverse', 'middle', 'start', 'Inter,', 'sans-serif)',
]

TERM_MAPPINGS = {
    'Vault': '保险库',
    'Library': '库',
    'Agent': '智能体',
    'Bond': '绑定',
    'Trust': '信任',
    'Peer': '对等节点',
    'Mesh': '网格',
    'Profile': '资料',
    'Contact': '联系人',
    'Team jobs': '团队任务',
    'Relay': '中继',
    'Terminal': '终端',
    'Browser': '浏览器',
    'Mandate': '授权',
    'Approval': '审批',
    'Audit': '审计',
    'Knowledge': '知识',
    'Conversation': '对话',
    'Group': '群组',
    'Voice call': '语音通话',
    'Audio message': '语音消息',
    'QR code': '二维码',
    'Pairing': '配对',
    'Discovery': '发现',
    'identity': '身份',
    'policy': '策略',
    'storage': '存储',
    'models': '模型',
    'networking': '网络',
    'sensitivity': '敏感度',
    'trust tier': '信任等级',
    'blocked': '阻止',
    'public': '公开',
    'referred': '推荐',
    'direct': '直接',
    'stranger': '陌生人',
    'friends': '朋友',
    'owner': '所有者',
    'device': '设备',
    'runtime': '运行时',
    'payload': '载荷',
    'envelope': '信封',
    'signature': '签名',
    'public key': '公钥',
    'private key': '私钥',
    'fingerprint': '指纹',
    'hash': '哈希',
    'correlation ID': '关联ID',
    'intent': '意图',
    'thin client': '瘦客户端',
    'full node': '完整节点',
    'circuit relay': '电路中继',
    'rendezvous': '会合',
    'forwarding': '转发',
    'peer-to-peer': '点对点',
    'local-first': '本地优先',
    'cryptographic': '加密',
    'auditability': '可审计性',
    'interoperability': '互操作性',
    'federated': '联合',
    'delegation': '委托',
    'orchestration': '编排',
    'attribution': '归属',
    'semantic firewall': '语义防火墙',
    'policy engine': '策略引擎',
    'bond engine': '绑定引擎',
    'task runtime': '任务运行时',
    'inbound guard': '入站防护',
    'model router': '模型路由器',
    'vault inbox': '保险库收件箱',
    'profile directory': '资料目录',
    'bootstrap': '引导',
    'listen': '监听',
    'connectivity': '连通性',
    'reachability': '可达性',
    'video call': '视频通话',
    'screen sharing': '屏幕共享',
    'read receipt': '已读回执',
    'delivery indicator': '送达指示器',
    'thread': '线程',
    'group chat': '群聊',
    'room': '房间',
    'membership': '成员资格',
    'admin': '管理员',
    'mute': '静音',
    'privacy': '隐私',
    'display name': '显示名称',
    'avatar': '头像',
    'thumbnail': '缩略图',
    'gallery': '相册',
    'bio': '简介',
    'bond request': '绑定请求',
    'bond tier': '绑定等级',
    'introduction': '介绍',
    'proof': '证明',
    'proof text': '证明文本',
    'out of band': '带外',
    'upgrade': '升级',
    'downgrade': '降级',
    'revoke': '撤销',
    'rotate': '轮换',
    'latency': '延迟',
    'timeout': '超时',
    'pending': '待处理',
    'stale': '过期',
    'purge': '清除',
    'archive': '归档',
    'export': '导出',
    'backup': '备份',
    'recovery': '恢复',
    'migration': '迁移',
    'configuration': '配置',
    'settings': '设置',
    'deploy': '部署',
    'fleet': '集群',
    'monitor': '监控',
    'diagnosis': '诊断',
    'troubleshooting': '故障排除',
    'logging': '日志记录',
    'debug': '调试',
    'audit trail': '审计跟踪',
    'audit log': '审计日志',
    'journal': '日志',
    'activity': '活动',
    'allow': '允许',
    'deny': '拒绝',
    'outcome': '结果',
    'summary': '摘要',
    'remote': '远程',
    'local': '本地',
    'endpoint': '端点',
    'port': '端口',
    'session': '会话',
    'token': '令牌',
    'encryption': '加密',
    'integrity': '完整性',
    'abuse': '滥用',
    'metadata': '元数据',
    'label': '标签',
    'tag': '标签',
    'keyword': '关键词',
    'index': '索引',
    'indexing': '索引',
    'retrieval': '检索',
    'chunk': '块',
    'note': '笔记',
    'document': '文档',
    'web content': '网络内容',
    'visibility': '可见性',
    'publish': '发布',
    'browse': '浏览',
    'view': '查看',
    'edit': '编辑',
    'compose': '撰写',
    'draft': '草稿',
    'suggestion': '建议',
    'assistance': '辅助',
    'copy': '复制',
    'paste': '粘贴',
    'share': '分享',
    'send': '发送',
    'receive': '接收',
    'resend': '重新发送',
    'resume': '恢复',
    'split': '分割',
    'merge': '合并',
    'invite': '邀请',
    'accept': '接受',
    'reject': '拒绝',
    'request': '请求',
    'grant': '授予',
    'enable': '启用',
    'disable': '禁用',
    'toggle': '切换',
    'configure': '配置',
    'setup': '设置',
    'install': '安装',
    'uninstall': '卸载',
    'update': '更新',
    'upgrade': '升级',
    'build': '构建',
    'source': '源代码',
    'release': '发布',
    'installer': '安装程序',
    'disk image': '磁盘镜像',
    'channel': '渠道',
    'prerequisites': '前提条件',
    'system requirements': '系统要求',
    'memory': '内存',
    'file permission': '文件权限',
    'path': '路径',
    'directory': '目录',
    'folder': '文件夹',
    'data directory': '数据目录',
    'application data': '应用数据',
    'profile data': '资料数据',
    'extension': '扩展',
    'plugin': '插件',
    'sidecar': '侧车',
    'attack surface': '攻击面',
    'minimal': '最小',
    'essential': '基本',
    'curated': '精选',
    'full': '完整',
    'slim': '精简',
    'bundle': '捆绑',
    'mirror': '镜像',
    'remote control': '遥控器',
    'sync': '同步',
    'cached': '缓存',
    'read-only': '只读',
    'read-write': '读写',
    'write-back': '写回',
    'row': '行',
    'column': '列',
    'table': '表格',
    'comparison': '比较',
    'matrix': '矩阵',
    'shape': '形状',
    'architecture': '架构',
    'system overview': '系统概览',
    'hierarchy': '层次结构',
    'property': '属性',
    'diagram': '图表',
    'figure': '图',
    'caption': '标题',
}

SECTION_HEADINGS = {
    '# EnvoyMesh Guidebook': '# EnvoyMesh 指南',
    '**Version:**': '**版本:**',
    '**Edition:**': '**版本类型:**',
    '**Revised:**': '**修订日期:**',
    '**Languages:**': '**语言:**',
    '**Audience:**': '**受众:**',
    '**Purpose:**': '**目的:**',
    '> **Complete Guidebook Edition.**': '> **完整指南版。**',
    '## How to read this guide': '## 如何阅读本指南',
    '## Feature status labels': '## 功能状态标签',
    '## Product terminology used in this guide': '## 本指南使用的产品术语',
    '# Table of Contents': '# 目录',
    '## Part I — Discover EnvoyMesh': '## 第一部分 — 认识 EnvoyMesh',
    '### 1. Welcome to EnvoyMesh': '### 1. 欢迎来到 EnvoyMesh',
    '#### 1.1 A private network for people and AI agents': '#### 1.1 面向人类和AI智能体的私有网络',
    '#### 1.2 Local-first and peer-to-peer by design': '#### 1.2 设计上优先本地和点对点',
    '#### 1.3 No central account required': '#### 1.3 无需中央账户',
    '#### 1.4 Your identity, relationships, and data belong to you': '#### 1.4 您的身份、关系和数据属于您自己',
    '#### 1.5 Direct connections and optional relays': '#### 1.5 直接连接和可选中继',
    '#### 1.6 Personal agents and external agents': '#### 1.6 个人智能体和外部智能体',
    '#### 1.7 Trusted multi-agent collaboration': '#### 1.7 可信多智能体协作',
    '#### 1.8 Open protocols and interoperability': '#### 1.8 开放协议和互操作性',
    '#### 1.9 Major features at a glance': '#### 1.9 主要功能一览',
    '#### 1.10 Current availability and limitations': '#### 1.10 当前可用性和限制',
    '### 2. Why EnvoyMesh?': '### 2. 为什么选择 EnvoyMesh？',
    '#### 2.1 Private communication without a central platform': '#### 2.1 无需中央平台的私密通信',
    '#### 2.2 Self-sovereign identity across your devices': '#### 2.2 跨设备的自主身份',
    '#### 2.3 AI assistance under your control': '#### 2.3 由您掌控的AI助手',
    '#### 2.4 Trusted knowledge sharing': '#### 2.4 可信知识共享',
    '#### 2.5 Safe task delegation': '#### 2.5 安全的任务委托',
    '#### 2.6 Collaboration among agents you choose': '#### 2.6 您选择的智能体之间的协作',
    '#### 2.7 Local models, remote models, and external agents': '#### 2.7 本地模型、远程模型和外部智能体',
    '#### 2.8 Auditability instead of invisible automation': '#### 2.8 可审计性而非隐形自动化',
    '#### 2.9 When EnvoyMesh is the right choice': '#### 2.9 何时适合使用 EnvoyMesh',
    '#### 2.10 When another solution may be a better fit': '#### 2.10 何时其他解决方案更合适',
    '### 3. What You Can Do': '### 3. 您可以做什么',
    '#### 3.1 Connect with trusted people': '#### 3.1 与信任的人建立连接',
    '#### 3.2 Exchange private messages': '#### 3.2 交换私密消息',
    '#### 3.3 Create group conversations': '#### 3.3 创建群组对话',
    '#### 3.4 Send audio messages and make voice calls': '#### 3.4 发送语音消息和进行语音通话',
    '#### 3.5 Share files and profile photos': '#### 3.5 共享文件和资料照片',
    '#### 3.6 Talk to your personal AI agent': '#### 3.6 与您的个人AI智能体对话',
    '#### 3.7 Connect OpenClaw, HomeClaw, Hermes, or OpenHuman': '#### 3.7 连接 OpenClaw、HomeClaw、Hermes 或 OpenHuman',
    '#### 3.8 Search local and trusted knowledge': '#### 3.8 搜索本地和可信知识',
    '#### 3.9 Publish and browse mesh content': '#### 3.9 发布和浏览网络内容',
    '#### 3.10 Delegate work to another agent': '#### 3.10 将工作委托给另一个智能体',
    '#### 3.11 Run Team jobs across several agents': '#### 3.11 在多个智能体上运行团队任务',
    '#### 3.12 Connect MCP and A2A applications': '#### 3.12 连接 MCP 和 A2A 应用',
    '#### 3.13 Use terminals remotely': '#### 3.13 远程使用终端',
    '#### 3.14 Operate a private or community relay': '#### 3.14 运行私有或社区中继',
    '### 4. How EnvoyMesh Works': '### 4. EnvoyMesh 如何工作',
    '#### 4.1 A plain-language system overview': '#### 4.1 系统概览（通俗易懂版）',
    '#### 4.2 Owners, devices, agents, and peers': '#### 4.2 所有者、设备、智能体和对等节点',
    '#### 4.3 Contacts, bonds, and trust levels': '#### 4.3 联系人、绑定和信任等级',
    '#### 4.4 Signed messages and verifiable senders': '#### 4.4 签名消息和可验证发送者',
    '#### 4.5 Personal agents and external-agent bridges': '#### 4.5 个人智能体和外部智能体桥接',
    '#### 4.6 Local knowledge, the Library, and the Vault': '#### 4.6 本地知识、库和保险库',
    '#### 4.7 Tasks, mandates, and approvals': '#### 4.7 任务、授权和审批',
    '#### 4.8 Agent Network membership': '#### 4.8 智能体网络成员资格',
    '#### 4.9 Direct networking and relay assistance': '#### 4.9 直接网络和中继协助',
    '#### 4.10 Activity records and end-to-end auditing': '#### 4.10 活动记录和端到端审计',
    '### 5. Common Use Cases': '### 5. 常见用例',
    '#### 5.1 A private personal AI across devices': '#### 5.1 跨设备的私密个人AI',
    '#### 5.2 A family or friends mesh': '#### 5.2 家庭或朋友网络',
    '#### 5.3 Trusted research and knowledge exchange': '#### 5.3 可信研究和知识交流',
    '#### 5.4 A small-team Agent Network': '#### 5.4 小型团队智能体网络',
    '#### 5.5 Multi-agent planning and report generation': '#### 5.5 多智能体规划和报告生成',
    '#### 5.6 OpenClaw with trusted mesh contacts': '#### 5.6 与可信网络联系人一起使用 OpenClaw',
    '#### 5.7 HomeClaw as an external EnvoyMesh agent': '#### 5.7 将 HomeClaw 作为外部 EnvoyMesh 智能体',
    '#### 5.8 Hermes as an external EnvoyMesh agent': '#### 5.8 将 Hermes 作为外部 EnvoyMesh 智能体',
    '#### 5.9 OpenHuman as an external EnvoyMesh agent': '#### 5.9 将 OpenHuman 作为外部 EnvoyMesh 智能体',
    '#### 5.10 Claude Desktop using EnvoyMesh through MCP': '#### 5.10 通过 MCP 使用 EnvoyMesh 的 Claude Desktop',
    '#### 5.11 External A2A clients delegating tasks': '#### 5.11 委托任务的外部 A2A 客户端',
    '#### 5.12 A self-hosted relay fleet': '#### 5.12 自托管中继集群',
    '### 6. Product and Protocol Comparisons': '### 6. 产品和协议比较',
    '#### 6.1 EnvoyMesh and centralized messengers': '#### 6.1 EnvoyMesh 与集中式信使',
    '#### 6.2 EnvoyMesh and cloud AI assistants': '#### 6.2 EnvoyMesh 与云AI助手',
    '#### 6.3 EnvoyMesh and standalone OpenClaw': '#### 6.3 EnvoyMesh 与独立 OpenClaw',
    '#### 6.4 EnvoyMesh and external agent runtimes': '#### 6.4 EnvoyMesh 与外部智能体运行时',
    '#### 6.5 EnvoyMesh and MCP': '#### 6.5 EnvoyMesh 与 MCP',
    '#### 6.6 EnvoyMesh and A2A': '#### 6.6 EnvoyMesh 与 A2A',
    '#### 6.7 EnvoyMesh native Agent Network versus public marketplaces': '#### 6.7 EnvoyMesh 原生智能体网络与公共市场',
    '#### 6.8 Native protocols versus interoperability bridges': '#### 6.8 原生协议与互操作性桥接',
    '## Part II — Install and Get Started': '## 第二部分 — 安装和入门',
    '### 7. Choose Your Setup': '### 7. 选择您的设置',
    '#### 7.1 Desktop only': '#### 7.1 仅桌面',
    '#### 7.2 Desktop with EnvoyGo mobile access': '#### 7.2 桌面配合 EnvoyGo 移动访问',
    '#### 7.3 Desktop with the bundled EnvoyAI agent': '#### 7.3 桌面配合捆绑的 EnvoyAI 智能体',
    '#### 7.4 Desktop with an external agent': '#### 7.4 桌面配合外部智能体',
    '#### 7.5 Desktop with local or remote models': '#### 7.5 桌面配合本地或远程模型',
    '#### 7.6 Personal relay or community relay': '#### 7.6 个人中继或社区中继',
    '#### 7.7 Small-team and organization deployments': '#### 7.7 小型团队和组织部署',
    '#### 7.8 Recommended first-time setup': '#### 7.8 推荐的首次设置',
    '### 8. Install EnvoyMesh': '### 8. 安装 EnvoyMesh',
    '#### 8.1 System requirements': '#### 8.1 系统要求',
    '#### 8.2 Install on macOS': '#### 8.2 在 macOS 上安装',
    '#### 8.3 Install on Windows': '#### 8.3 在 Windows 上安装',
    '#### 8.4 Install EnvoyGo on iOS': '#### 8.4 在 iOS 上安装 EnvoyGo',
    '#### 8.5 Install EnvoyGo on Android': '#### 8.5 在 Android 上安装 EnvoyGo',
    '#### 8.6 Install from source': '#### 8.6 从源代码安装',
    '#### 8.7 Verify the installation': '#### 8.7 验证安装',
    '#### 8.8 Application data locations': '#### 8.8 应用数据位置',
    '#### 8.9 Update EnvoyMesh': '#### 8.9 更新 EnvoyMesh',
    '#### 8.10 Uninstall without losing identity or data': '#### 8.10 卸载而不丢失身份或数据',
    '### 9. Platform and Package Differences': '### 9. 平台和包差异',
    '#### 9.1 Desktop and mobile feature comparison': '#### 9.1 桌面和移动功能比较',
    '#### 9.2 macOS packaging': '#### 9.2 macOS 打包',
    '#### 9.3 Windows packaging': '#### 9.3 Windows 打包',
    '#### 9.4 OpenClaw extensions bundled on macOS': '#### 9.4 macOS 上捆绑的 OpenClaw 扩展',
    '#### 9.5 Essential OpenClaw extension selection on Windows': '#### 9.5 Windows 上的基本 OpenClaw 扩展选择',
    '#### 9.6 Full and slim desktop bundles': '#### 9.6 完整和精简桌面捆绑包',
    '#### 9.7 Optional IPFS sidecars': '#### 9.7 可选的 IPFS 侧车',
    '#### 9.8 Features requiring a home node': '#### 9.8 需要家庭节点的功能',
    '#### 9.9 Features available as an EnvoyGo mobile mirror': '#### 9.9 作为 EnvoyGo 移动镜像可用的功能',
    '#### 9.10 Legacy mobile experiments and current product boundaries': '#### 9.10 遗留移动实验和当前产品边界',
    '### 10. Create Your Identity': '### 10. 创建您的身份',
    '#### 10.1 What your EnvoyMesh identity represents': '#### 10.1 您的 EnvoyMesh 身份代表什么',
    '#### 10.2 Create an owner identity': '#### 10.2 创建所有者身份',
    '#### 10.3 Create your first device identity': '#### 10.3 创建您的第一个设备身份',
    '#### 10.4 Create or activate your agent identity': '#### 10.4 创建或激活您的智能体身份',
    '#### 10.5 Set your display profile': '#### 10.5 设置您的显示资料',
    '#### 10.6 Understand your DID': '#### 10.6 了解您的 DID',
    '#### 10.7 Protect your cryptographic keys': '#### 10.7 保护您的加密密钥',
    '#### 10.8 Back up identity and recovery data': '#### 10.8 备份身份和恢复数据',
    '#### 10.9 Add another device': '#### 10.9 添加另一个设备',
    '#### 10.10 Revoke a lost or compromised device': '#### 10.10 撤销丢失或受损的设备',
    '### 11. Tour the Application': '### 11. 应用导览',
    '#### 11.1 Home and node status': '#### 11.1 主页和节点状态',
    '#### 11.2 Conversations': '#### 11.2 对话',
    '#### 11.3 Contacts and discovery': '#### 11.3 联系人和发现',
    '#### 11.4 Groups': '#### 11.4 群组',
    '#### 11.5 Knowledge Base and Library': '#### 11.5 知识库和库',
    '#### 11.6 Browser': '#### 11.6 浏览器',
    '#### 11.7 Team jobs': '#### 11.7 团队任务',
    '#### 11.8 Terminals': '#### 11.8 终端',
    '#### 11.9 Approvals and activity': '#### 11.9 审批和活动',
    '#### 11.10 Profile': '#### 11.10 资料',
    '#### 11.11 Settings': '#### 11.11 设置',
    '#### 11.12 Connection and agent status indicators': '#### 11.12 连接和智能体状态指示器',
    '### 12. Connect Your First Contact': '### 12. 连接您的第一个联系人',
    '#### 12.1 What pairing and bonding do': '#### 12.1 配对和绑定的作用',
    '#### 12.2 Pair with a QR code': '#### 12.2 使用二维码配对',
    '#### 12.3 Pair with an invitation link': '#### 12.3 使用邀请链接配对',
    '#### 12.4 Pair on a local network': '#### 12.4 在本地网络上配对',
    '#### 12.5 Verify identity information': '#### 12.5 验证身份信息',
    '#### 12.6 Choose an appropriate trust level': '#### 12.6 选择适当的信任等级',
    '#### 12.7 Accept a bond request': '#### 12.7 接受绑定请求',
    '#### 12.8 Send the first message': '#### 12.8 发送第一条消息',
    '#### 12.9 Confirm direct or relay-assisted delivery': '#### 12.9 确认直接或中继辅助送达',
    '#### 12.10 Troubleshoot pairing': '#### 12.10 配对故障排除',
    '#### 12.11 Bundled sponsor contact': '#### 12.11 捆绑的赞助联系人',
    '### 13. Connect EnvoyGo': '### 13. 连接 EnvoyGo',
    '#### 13.1 How EnvoyGo works with a home node': '#### 13.1 EnvoyGo 如何与家庭节点配合工作',
    '#### 13.2 Pair the mobile app': '#### 13.2 配对移动应用',
    '#### 13.3 Confirm the home connection': '#### 13.3 确认家庭连接',
    '#### 13.4 Use chat and contacts': '#### 13.4 使用聊天和联系人',
    '#### 13.5 Use remote terminals': '#### 13.5 使用远程终端',
    '#### 13.6 View Team jobs': '#### 13.6 查看团队任务',
    '#### 13.7 Browse mesh content': '#### 13.7 浏览网络内容',
    '#### 13.8 Receive notifications': '#### 13.8 接收通知',
    '#### 13.9 Make and receive voice calls': '#### 13.9 拨打和接听语音通话',
    '#### 13.10 Revoke a lost phone': '#### 13.10 撤销丢失的手机',
    '#### 13.11 Current mobile limitations': '#### 13.11 当前移动限制',
    '### 14. First-Day Tutorials': '### 14. 首日教程',
    '#### 14.1 Send a private message': '#### 14.1 发送私密消息',
    '#### 14.2 Create a group conversation': '#### 14.2 创建群组对话',
    '#### 14.3 Send an audio message': '#### 14.3 发送语音消息',
    '#### 14.4 Make a voice call': '#### 14.4 进行语音通话',
    '#### 14.5 Share a file': '#### 14.5 共享文件',
    '#### 14.6 Ask EnvoyAI a question': '#### 14.6 向 EnvoyAI 提问',
    '#### 14.7 Add knowledge to your Library': '#### 14.7 向您的库添加知识',
    '#### 14.8 Search your Vault': '#### 14.8 搜索您的保险库',
    '#### 14.9 Ask a bonded agent for knowledge': '#### 14.9 向绑定的智能体请求知识',
    '#### 14.10 Approve a sensitive action': '#### 14.10 审批敏感操作',
    '#### 14.11 Start a simple Team job': '#### 14.11 启动简单的团队任务',
    '#### 14.12 Connect an external agent': '#### 14.12 连接外部智能体',
    '## Part III — People, Profiles, and Conversations': '## 第三部分 — 人员、资料和对话',
    '### 15. Contacts and Bonds': '### 15. 联系人和绑定',
    '#### 15.1 View and search contacts': '#### 15.1 查看和搜索联系人',
    '#### 15.2 Understand contact identity': '#### 15.2 了解联系人身份',
    '#### 15.3 Contact profiles and photos': '#### 15.3 联系人资料和照片',
    '#### 15.4 Online, offline, and connection states': '#### 15.4 在线、离线和连接状态',
    '#### 15.5 Direct, referred, public, and blocked trust': '#### 15.5 直接、推荐、公开和阻止信任',
    '#### 15.6 Change a contact’s trust level': '#### 15.6 更改联系人的信任等级',
    '#### 15.7 Refer or introduce a contact': '#### 15.7 推荐或介绍联系人',
    '#### 15.8 Mute, block, or remove a contact': '#### 15.8 静音、阻止或移除联系人',
    '#### 15.9 Restore a connection': '#### 15.9 恢复连接',
    '#### 15.10 Contact privacy and disclosure settings': '#### 15.10 联系人隐私和披露设置',
    '### 16. Private Messaging': '### 16. 私密消息',
    '#### 16.1 Start a conversation': '#### 16.1 开始对话',
    '#### 16.2 Human-to-human messages': '#### 16.2 人与人消息',
    '#### 16.3 Human-to-agent messages': '#### 16.3 人与智能体消息',
    '#### 16.4 Replies and conversation continuity': '#### 16.4 回复和对话连续性',
    '#### 16.5 Message delivery states': '#### 16.5 消息送达状态',
    '#### 16.6 Offline behavior and retries': '#### 16.6 离线行为和重试',
    '#### 16.7 Search conversation history': '#### 16.7 搜索对话历史',
    '#### 16.8 Draft assistance': '#### 16.8 草稿辅助',
    '#### 16.9 Manage conversation data': '#### 16.9 管理对话数据',
    '#### 16.10 Message privacy and security': '#### 16.10 消息隐私和安全',
    '### 17. Group Conversations': '### 17. 群组对话',
    '#### 17.1 Create a group': '#### 17.1 创建群组',
    '#### 17.2 Invite members': '#### 17.2 邀请成员',
    '#### 17.3 Send group messages': '#### 17.3 发送群组消息',
    '#### 17.4 Manage membership': '#### 17.4 管理成员',
    '#### 17.5 Leave a group': '#### 17.5 离开群组',
    '#### 17.6 Group trust boundaries': '#### 17.6 群组信任边界',
    '#### 17.7 Group delivery and offline members': '#### 17.7 群组送达和离线成员',
    '#### 17.8 Group troubleshooting': '#### 17.8 群组故障排除',
    '### 18. Audio and Voice Calls': '### 18. 音频和语音通话',
}

def translate_text(text):
    if not translator:
        return text
    
    placeholders = {}
    placeholder_counter = 0
    
    for term in PRESERVE_TERMS:
        if term in text:
            placeholder = f"__TERM_{placeholder_counter}__"
            placeholders[placeholder] = term
            text = text.replace(term, placeholder)
            placeholder_counter += 1
    
    try:
        result = translator.translate(text, dest='zh-CN')
        translated = result.text
    except Exception as e:
        print(f"Translation error: {e}")
        translated = text
    
    for placeholder, term in placeholders.items():
        translated = translated.replace(placeholder, term)
    
    return translated

def translate_file(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    in_code_block = False
    in_svg = False
    in_figure = False
    translated_lines = []
    
    for i, line in enumerate(lines):
        line = line.rstrip('\n')
        
        if line.startswith('```'):
            in_code_block = not in_code_block
            translated_lines.append(line)
            continue
        
        if in_code_block:
            translated_lines.append(line)
            continue
        
        if '<svg' in line:
            in_svg = True
            translated_lines.append(line)
            continue
        
        if in_svg:
            translated_lines.append(line)
            if '</svg>' in line:
                in_svg = False
            continue
        
        if '<figure' in line:
            in_figure = True
            translated_lines.append(line)
            continue
        
        if in_figure:
            translated_lines.append(line)
            if '</figure>' in line:
                in_figure = False
            continue
        
        if line in SECTION_HEADINGS:
            translated_lines.append(SECTION_HEADINGS[line])
            continue
        
        if line.startswith('#'):
            translated_lines.append(line)
            continue
        
        if line.startswith('|') and '|' in line[1:]:
            translated_lines.append(line)
            continue
        
        if line.startswith('http://') or line.startswith('https://'):
            translated_lines.append(line)
            continue
        
        if line.startswith('./') or line.startswith('../') or line.startswith('/'):
            translated_lines.append(line)
            continue
        
        if '.md' in line or '.json' in line or '.html' in line:
            translated_lines.append(line)
            continue
        
        if line.startswith('envoy://'):
            translated_lines.append(line)
            continue
        
        if line.startswith('envoy:'):
            translated_lines.append(line)
            continue
        
        if line.startswith('Phase'):
            translated_lines.append(line)
            continue
        
        if line.startswith('§'):
            translated_lines.append(line)
            continue
        
        if 'npm run' in line or 'npm install' in line:
            translated_lines.append(line)
            continue
        
        if line.startswith('(') and line.endswith(')'):
            translated_lines.append(line)
            continue
        
        if line == '':
            translated_lines.append(line)
            continue
        
        translated = translate_text(line)
        translated_lines.append(translated)
        
        time.sleep(0.05)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(translated_lines) + '\n')
    
    print(f"Translation complete. Input: {input_file}")
    print(f"Output: {output_file}")
    print(f"Total lines: {len(translated_lines)}")

if __name__ == '__main__':
    input_file = '/Users/shileipeng/Documents/mygithub/EnvoyMesh/EnvoyMesh_GuideBook_0.1.0.md'
    output_file = '/Users/shileipeng/Documents/mygithub/EnvoyMesh/EnvoyMesh_GuideBook_0.1.0.zh-CN.md'
    
    translate_file(input_file, output_file)