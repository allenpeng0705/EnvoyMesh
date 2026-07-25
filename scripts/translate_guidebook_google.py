#!/usr/bin/env python3
import re
import time
from googletrans import Translator

translator = Translator()

CODE_BLOCK_PATTERN = re.compile(r'```(.*?)```', re.DOTALL)
INLINE_CODE_PATTERN = re.compile(r'`([^`]+)`')
SVG_PATTERN = re.compile(r'<svg[^>]*>.*?</svg>', re.DOTALL)
FIGURE_PATTERN = re.compile(r'<figure[^>]*>.*?</figure>', re.DOTALL)

PRESERVE_TERMS = [
    'EnvoyMesh', 'EnvoyGo', 'EnvoyAI', 'OpenClaw', 'HomeClaw', 'Hermes', 'OpenHuman',
    'Ed25519', 'DID', 'MCP', 'A2A', 'libp2p', 'JSON-RPC', 'WebSocket', 'HTTP',
    'TCP', 'QUIC', 'mDNS', 'DHT', 'NAT', 'IPFS', 'PTY', 'Zod', 'RAG', 'JSONL',
    'SHA256', 'Obsidian', 'Flutter', 'React', 'Tauri', 'Capacitor',
    'Social', 'HomeClaw', 'LiteLLM', 'Anthropic', 'OpenAI', 'Filecoin', 'Node.js',
    'npm', 'git', 'bash', 'python', 'curl', 'jq', 'envoy://', '.envoy', 'web/',
    'localhost', '127.0.0.1', 'github.com', 'homeclaw.cn', 'hermes-agent.nousresearch.com',
    'openhuman.dev', 'obsidian.md', 'trae-cn.mchost.guru', 'index.md', 'web-content',
    'knowledge.query', 'library.read', 'mesh.findKnowledge', 'mesh.sendMessage',
    'agent-card.json', '.well-known', 'envoy:owner:', 'envoy:device:', 'envoy:agent:',
    'envoy_', 'envoygo://', 'pair', 'profile', 'blog', 'PhotoWall', 'markdown',
    'terminal', 'browser', 'relay', 'bond', 'trust', 'signature', 'envelope',
    'voucher', 'mandate', 'approval', 'task', 'intent', 'schema', 'audit', 'journal',
    'sensitivity', 'knowledge', 'vault', 'library', 'node', 'peer', 'contact',
    'owner', 'device', 'agent', 'policy', 'conversation', 'message', 'group',
    'audio', 'voice', 'video', 'file', 'photo', 'model', 'provider', 'tool',
    'session', 'memory', 'trigger', 'schedule', 'digest', 'escalation',
    'bridge', 'registry', 'artifact', 'result', 'discovery', 'rendezvous',
    'forwarding', 'circuit', 'bootstrap', 'fleet', 'hierarchical', 'endpoint',
    'runtime', 'process', 'thread', 'lifecycle', 'state', 'phase', 'configuration',
    'setting', 'preference', 'preset', 'compatibility', 'interoperability',
    'protocol', 'validation', 'authentication', 'pairing', 'fingerprint',
    'hash', 'storage', 'database', 'filesystem', 'disk', 'path', 'directory',
    'folder', 'inbox', 'note', 'import', 'publish', 'browse', 'feed', 'notification',
    'push', 'pull', 'fetch', 'transfer', 'share', 'dispute', 'diagnose', 'trace',
    'correlation', 'latency', 'outcome', 'allowed', 'denied', 'record', 'logging',
    'log', 'terminal', 'shell', 'remote', 'exposure', 'privilege', 'restrict',
    'access', 'control', 'configure', 'advertise', 'listen', 'address',
    'deployment', 'production', 'beta', 'experimental', 'availability',
    'limitation', 'feature', 'capability', 'functionality', 'operate', 'operation',
    'operator', 'admin', 'maintain', 'run', 'execute', 'enable', 'disable',
    'start', 'stop', 'install', 'uninstall', 'setup', 'upgrade', 'downgrade',
    'backup', 'restore', 'lose', 'stranded', 'account', 'registration', 'username',
    'password', 'credentials', 'certificate', 'revocation', 'delegate', 'cost',
    'budget', 'spending', 'expiry', 'timeout', 'heartbeat', 'cancel', 'long-running',
    'accountable', 'legible', 'black box', 'automation', 'opt-in', 'membership',
    'marketplace', 'anonymous', 'plan', 'decompose', 'assign', 'bid', 'negotiation',
    'rebalance', 'monitor', 'iteration', 'handoff', 'merge', 'report', 'recipe',
    'defaults', 'connectivity', 'troubleshooting', 'status', 'label', 'available',
    'planned', 'deferred', 'desktop', 'mobile', 'operations', 'terminology',
    'guidebook', 'version', 'revision', 'language', 'audience', 'purpose',
    'summary', 'overview', 'introduction', 'welcome', 'comparisons', 'platform',
    'package', 'tour', 'tutorials', 'private', 'messaging', 'topics',
    'dashboard', 'chat', 'search', 'settings', 'network', 'direct', 'peer-to-peer',
    'end-to-end', 'centralized', 'decentralized', 'hosted', 'vendor', 'service',
    'server', 'client', 'thin client', 'full node', 'daemon', 'CLI', 'command-line',
    'API', 'REST', 'gRPC', 'stream', 'channel', 'socket', 'connection', 'port',
    'IP', 'DNS', 'SSL', 'TLS', 'encryption', 'decryption', 'key exchange',
    'signature verification', 'cryptographic', 'cryptography', 'public key',
    'private key', 'keypair', 'signature scheme', 'hash function', 'digest',
    'certificate', 'chain of trust', 'token', 'JWT', 'oauth', 'session', 'cookie',
    'cache', 'persistence', 'replication', 'sync', 'conflict', 'resolution',
    'locking', 'transaction', 'atomic', 'consistency', 'partition tolerance',
    'CAP', 'ACID', 'BASE', 'event', 'event-driven', 'pub/sub', 'queue',
    'message broker', 'topic', 'subscription', 'handler', 'middleware', 'hook',
    'callback', 'trigger', 'schedule', 'cron', 'job', 'workflow', 'orchestration',
    'choreography', 'pipeline', 'stage', 'step', 'action', 'condition', 'branch',
    'loop', 'parallel', 'sequential', 'dependencies', 'dependency graph',
    'deadlock', 'race condition', 'thread safety', 'concurrency', 'parallelism',
    'async', 'promise', 'future', 'generator', 'iterator', 'reactive',
    'observable', 'backpressure', 'buffer', 'stack', 'heap', 'memory leak',
    'garbage collection', 'reference counting', 'scope', 'closure', 'module',
    'framework', 'SDK', 'interface', 'abstract', 'concrete', 'implementation',
    'design pattern', 'singleton', 'factory', 'builder', 'decorator', 'proxy',
    'facade', 'adapter', 'bridge', 'composite', 'strategy', 'template method',
    'observer', 'visitor', 'mediator', 'memento', 'command', 'prototype',
    'flyweight', 'interpreter', 'chain of responsibility', 'code review',
    'testing', 'unit test', 'integration test', 'e2e', 'mock', 'stub', 'fixture',
    'assertion', 'coverage', 'linting', 'CI', 'CD', 'artifact', 'deployment',
    'container', 'Docker', 'Kubernetes', 'helm', 'service mesh', 'Istio',
    'Envoy', 'sidecar', 'pod', 'ingress', 'egress', 'load balancing', 'scaling',
    'auto-scaling', 'health check', 'metrics', 'monitoring', 'alerting',
    'logging', 'tracing', 'distributed tracing', 'OpenTelemetry', 'Prometheus',
    'Grafana', 'ELK', 'Loki', 'Jaeger', 'Zipkin', 'security', 'threat',
    'vulnerability', 'exploit', 'attack', 'defense', 'penetration test',
    'compliance', 'GDPR', 'CCPA', 'HIPAA', 'SOC2', 'ISO27001', 'hashing',
    'salting', 'bcrypt', 'argon2', 'OAuth', 'SAML', 'OpenID', 'PKCE', 'MFA',
    '2FA', 'biometric', 'fingerprint', 'face recognition', 'iris scan',
    'voice recognition', 'access control', 'RBAC', 'ABAC', 'MAC', 'DAC', 'ACL',
    'WAF', 'IDS', 'IPS', 'SIEM', 'SOAR', 'zero trust', 'least privilege',
    'principle of least privilege', 'defense in depth', 'separation of duties',
    'fail-safe', 'fail-open', 'fail-close', 'resilience', 'availability',
    'redundancy', 'disaster recovery', 'high availability', 'fault tolerance',
    'graceful degradation', 'circuit breaker', 'retry', 'fallback', 'timeout',
    'rate limiting', 'throttling', 'bulkhead', 'degradation', 'chaos engineering',
    'canary', 'blue-green', 'rolling', 'A/B', 'feature flag', 'dark launch',
    'shadow traffic', 'rollback', 'hotfix', 'patch', 'release', 'versioning',
    'semver', 'changelog', 'release notes', 'documentation', 'API docs', 'README',
    'wiki', 'tutorial', 'guide', 'reference', 'FAQ', 'support', 'help',
    'community', 'forum', 'discord', 'slack', 'telegram', 'matrix', 'issue',
    'bug', 'feature request', 'pull request', 'contribution', 'code of conduct',
    'license', 'MIT', 'Apache', 'GPL', 'BSD', 'LGPL', 'AGPL', 'MPL', 'CC',
    'creative commons', 'commercial', 'open source', 'proprietary', 'freemium',
    'SaaS', 'PaaS', 'IaaS', 'FaaS', 'serverless', 'edge computing', 'cloud',
    'on-premise', 'hybrid', 'multi-cloud', 'public cloud', 'private cloud',
    'virtual private cloud', 'VPC', 'data center', 'colocation', 'bare metal',
    'virtual machine', 'VM', 'microservices', 'monolith', 'service-oriented',
    'SOA', 'RESTful', 'graphQL', 'MQTT', 'CoAP', 'AMQP', 'Kafka', 'RabbitMQ',
    'NATS', 'Redis', 'Memcached', 'PostgreSQL', 'MySQL', 'MongoDB', 'Cassandra',
    'DynamoDB', 'Elasticsearch', 'SQL', 'NoSQL', 'eventual consistency',
    'strong consistency', 'transactions', 'index', 'query', 'join', 'sharding',
    'partitioning', 'caching', 'denormalization', 'ETL', 'data pipeline',
    'stream processing', 'batch processing', 'real-time', 'near real-time',
    'throughput', 'bandwidth', 'QPS', 'TPS', 'response time', 'jitter',
    'uptime', 'downtime', 'SLA', 'SLO', 'SLI', 'error rate', 'failure rate',
    'mean time to failure', 'MTTF', 'mean time to recovery', 'MTTR',
    'mean time between failures', 'MTBF', 'reliability', 'scalability',
    'horizontal scaling', 'vertical scaling', 'elasticity', 'capacity planning',
    'performance', 'optimization', 'profiling', 'benchmarking', 'load testing',
    'stress testing', 'soak testing', 'spike testing', 'infrastructure as code',
    'IaC', 'Terraform', 'CloudFormation', 'Ansible', 'Chef', 'Puppet',
    'Docker Compose', 'Helm', 'Argo CD', 'Flux', 'Jenkins', 'GitLab CI',
    'GitHub Actions', 'CircleCI', 'Travis CI', 'Buildkite', 'CodeShip', 'GoCD',
    'Drone', 'Concourse', 'Tekton', 'Spinnaker', 'Harness', 'Octopus Deploy',
    'DeployHub', 'continuous integration', 'continuous delivery',
    'continuous deployment', 'DevOps', 'SRE', 'platform engineering',
    'observability', 'dashboard', 'visualization', 'grafana', 'prometheus',
    'loki', 'tempo', 'jaeger', 'zipkin', 'opentelemetry', 'elastic', 'splunk',
    'datadog', 'new relic', 'dynatrace', 'sentry', 'bugsnag', 'rollbar',
    'raygun', 'error tracking', 'crash reporting', 'APM', 'RUM',
    'synthetic monitoring', 'real user monitoring', 'network monitoring',
    'infrastructure monitoring', 'application monitoring', 'database monitoring',
    'container monitoring', 'kubernetes monitoring', 'cloud monitoring',
    'cost monitoring', 'security monitoring', 'compliance monitoring',
    'audit logging', 'access logging', 'application logging', 'system logging',
    'network logging', 'structured logging', 'unstructured logging',
    'log aggregation', 'log analysis', 'log correlation', 'log filtering',
    'log forwarding', 'log storage', 'log retention', 'log rotation',
    'trace context', 'trace propagation', 'span', 'trace', 'baggage',
    'trace sampling', 'trace aggregation', 'metric collection',
    'metric aggregation', 'metric storage', 'metric query',
    'metric visualization', 'alerting rules', 'alerting policies',
    'alerting channels', 'alerting escalation', 'on-call', 'incident management',
    'incident response', 'post-mortem', 'blameless', 'durability',
    'weak consistency', 'causal consistency', 'sequential consistency',
    'linearizability', 'serializability', 'read committed', 'repeatable read',
    'snapshot isolation', 'optimistic locking', 'pessimistic locking',
    'livelock', 'starvation', 'atomic operation', 'transaction log',
    'checkpoint', 'two-phase commit', 'three-phase commit', 'distributed transaction',
    'XA', 'Saga', 'outbox pattern', 'saga pattern', 'compensating transaction',
    'event sourcing', 'CQRS', 'command', 'query', 'aggregate', 'entity',
    'value object', 'domain event', 'domain model', 'bounded context',
    'ubiquitous language', 'repository', 'application service', 'domain service',
    'infrastructure service', 'hexagonal architecture', 'clean architecture',
    'onion architecture', 'layered architecture', 'microservices architecture',
    'serverless architecture', 'event-driven architecture', 'CQRS architecture',
    'event sourcing architecture', 'EDA', 'API gateway', 'rate limiter',
    'reverse proxy', 'CDN', 'edge caching', 'content delivery', 'DNS resolution',
    'DNS caching', 'DNS load balancing', 'Anycast', 'Unicast', 'Multicast',
    'Broadcast', 'UDP', 'HTTPS', 'HTTP/2', 'HTTP/3', 'SOAP', 'XML-RPC',
    'message queue', 'document database', 'key-value store', 'column-family store',
    'graph database', 'time-series database', 'search engine', 'full-text search',
    'inverted index', 'vector database', 'embedding', 'vector search',
    'retrieval', 'generation', 'LLM', 'AI', 'machine learning', 'deep learning',
    'neural network', 'transformer', 'attention', 'prompt', 'fine-tuning',
    'few-shot', 'zero-shot', 'chain of thought', 'tool use', 'planning',
    'memory', 'reflection', 'evaluation', 'reward', 'reinforcement learning',
    'supervised learning', 'unsupervised learning', 'semi-supervised learning',
    'self-supervised learning', 'transfer learning', 'multimodal',
    'computer vision', 'natural language processing', 'NLP', 'speech recognition',
    'text-to-speech', 'speech-to-text', 'translation', 'sentiment analysis',
    'entity recognition', 'NER', 'summarization', 'question answering', 'QA',
    'recommendation', 'classification', 'regression', 'clustering',
    'dimensionality reduction', 'feature engineering', 'model training',
    'model inference', 'model serving', 'model registry', 'model versioning',
    'model monitoring', 'model drift', 'data drift', 'concept drift',
    'fairness', 'bias', 'explainability', 'interpretability', 'AI ethics',
    'AI safety', 'AI governance', 'AI compliance', 'prompt injection',
    'jailbreak', 'adversarial attack', 'data poisoning', 'model extraction',
    'model inversion', 'membership inference', 'inference attack',
    'privacy preserving', 'differential privacy', 'federated learning',
    'homomorphic encryption', 'secure multi-party computation', 'MPC',
    'zero-knowledge proof', 'ZK', 'proof of work', 'PoW', 'proof of stake',
    'PoS', 'proof of authority', 'PoA', 'proof of history', 'PoH',
    'blockchain', 'distributed ledger', 'smart contract',
    'decentralized application', 'DApp', 'token', 'cryptocurrency', 'NFT',
    'DAO', 'DeFi', 'DEX', 'CEX', 'stablecoin', 'yield farming', 'staking',
    'liquidity', 'liquidity pool', 'AMM', 'swap', 'bridge', 'cross-chain',
    'layer 1', 'layer 2', 'L1', 'L2', 'rollup', 'ZK rollup',
    'optimistic rollup', 'state channel', 'plasma', 'sidechain', 'shard',
    'validator', 'proposer', 'attester', 'aggregator', 'committee', 'stake',
    'slashing', 'reward', 'penalty', 'inflation', 'deflation', 'burn', 'mint',
    'transfer', 'wrap', 'unwrap', 'stake delegation', 'liquid staking', 'LSD',
    'restaking', 'decentralized finance', 'automated market maker', 'CPMM',
    'CFMM', 'LP', 'impermanent loss', 'IL', 'slippage', 'gas', 'fees',
    'swap fee', 'withdrawal fee', 'deposit fee', 'management fee',
    'performance fee', 'yield', 'APY', 'APR', 'TVL', 'total value locked',
    'protocol controlled value', 'PCV', 'treasury', 'governance',
    'governance token', 'proposal', 'voting', 'quorum', 'majority',
    'supermajority', 'execution', 'timelock', 'vesting', 'cliff',
    'linear vesting', 'lockup', 'farming', 'mining', 'liquidity mining',
    'staking rewards', 'airdrop', 'merkle airdrop', 'claim',
    'vesting schedule', 'tokenomics', 'supply', 'circulating supply',
    'total supply', 'max supply', 'inflation rate', 'deflation rate',
    'burn rate', 'utility', 'value capture', 'fee model', 'revenue model',
    'monetization', 'business model', 'unit economics', 'cost structure',
    'customer acquisition cost', 'CAC', 'lifetime value', 'LTV', 'LTV/CAC',
    'payback period', 'churn rate', 'retention rate', 'engagement rate',
    'conversion rate', 'funnel', 'acquisition', 'activation', 'retention',
    'referral', 'growth hacking', 'product-market fit', 'PMF', 'traction',
    'metrics', 'KPI', 'OKR', 'SMART', 'North Star metric', 'leading indicator',
    'lagging indicator', 'vanity metric', 'actionable metric', 'cohort analysis',
    'retention curve', 'funnel analysis', 'A/B testing', 'multivariate testing',
    'hypothesis testing', 'statistical significance', 'power analysis',
    'confidence interval', 'p-value', 'Type I error', 'Type II error',
    'false positive', 'false negative', 'precision', 'recall', 'F1 score',
    'accuracy', 'ROC curve', 'AUC', 'confusion matrix', 'CNN', 'RNN', 'LSTM',
    'GPT', 'BERT', 'T5', 'ViT', 'Diffusion', 'GAN', 'VAE', 'autoencoder',
    'Q-learning', 'policy gradient', 'PPO', 'DDPG', 'TD3', 'SAC', 'MARL',
    'multi-agent', 'agent-based modeling', 'simulation', 'digital twin',
    'optimization', 'linear programming', 'integer programming',
    'dynamic programming', 'greedy algorithm', 'heuristic', 'metaheuristic',
    'genetic algorithm', 'simulated annealing', 'particle swarm optimization',
    'ant colony optimization', 'tabu search', 'local search', 'global search',
    'constraint satisfaction', 'SAT', 'SAT solving', 'SMT', 'model checking',
    'formal verification', 'theorem proving', 'automated reasoning',
    'knowledge representation', 'ontology', 'semantic web', 'RDF', 'OWL',
    'SPARQL', 'knowledge graph', 'graph traversal', 'shortest path',
    'Dijkstra', 'A*', 'Bellman-Ford', 'Floyd-Warshall',
    'minimum spanning tree', 'Prim', 'Kruskal', 'network flow', 'max flow',
    'min cut', 'Ford-Fulkerson', 'Edmonds-Karp'
]

SECTION_TRANSLATIONS = {
    'EnvoyMesh Guidebook': 'EnvoyMesh 指南',
    'How to read this guide': '如何阅读本指南',
    'Feature status labels': '功能状态标签',
    'Product terminology used in this guide': '本指南使用的产品术语',
    'Table of Contents': '目录',
    'Part I — Discover EnvoyMesh': '第一部分 — 认识 EnvoyMesh',
    '1. Welcome to EnvoyMesh': '1. 欢迎来到 EnvoyMesh',
    '1.1 A private network for people and AI agents': '1.1 面向人类和AI智能体的私有网络',
    '1.2 Local-first and peer-to-peer by design': '1.2 设计上优先本地和点对点',
    '1.3 No central account required': '1.3 无需中央账户',
    '1.4 Your identity, relationships, and data belong to you': '1.4 您的身份、关系和数据属于您自己',
    '1.5 Direct connections and optional relays': '1.5 直接连接和可选中继',
    '1.6 Personal agents and external agents': '1.6 个人智能体和外部智能体',
    '1.7 Trusted multi-agent collaboration': '1.7 可信多智能体协作',
    '1.8 Open protocols and interoperability': '1.8 开放协议和互操作性',
    '1.9 Major features at a glance': '1.9 主要功能一览',
    '1.10 Current availability and limitations': '1.10 当前可用性和限制',
    '2. Why EnvoyMesh?': '2. 为什么选择 EnvoyMesh？',
    '2.1 Private communication without a central platform': '2.1 无需中央平台的私密通信',
    '2.2 Self-sovereign identity across your devices': '2.2 跨设备的自主身份',
    '2.3 AI assistance under your control': '2.3 由您掌控的AI助手',
    '2.4 Trusted knowledge sharing': '2.4 可信知识共享',
    '2.5 Safe task delegation': '2.5 安全的任务委托',
    '2.6 Collaboration among agents you choose': '2.6 您选择的智能体之间的协作',
    '2.7 Local models, remote models, and external agents': '2.7 本地模型、远程模型和外部智能体',
    '2.8 Auditability instead of invisible automation': '2.8 可审计性而非隐形自动化',
    '2.9 When EnvoyMesh is the right choice': '2.9 何时适合使用 EnvoyMesh',
    '2.10 When another solution may be a better fit': '2.10 何时其他解决方案更合适',
    '3. What You Can Do': '3. 您可以做什么',
    '3.1 Connect with trusted people': '3.1 与信任的人建立连接',
    '3.2 Exchange private messages': '3.2 交换私密消息',
    '3.3 Create group conversations': '3.3 创建群组对话',
    '3.4 Send audio messages and make voice calls': '3.4 发送语音消息和进行语音通话',
    '3.5 Share files and profile photos': '3.5 共享文件和资料照片',
    '3.6 Talk to your personal AI agent': '3.6 与您的个人AI智能体对话',
    '3.7 Connect OpenClaw, HomeClaw, Hermes, or OpenHuman': '3.7 连接 OpenClaw、HomeClaw、Hermes 或 OpenHuman',
    '3.8 Search local and trusted knowledge': '3.8 搜索本地和可信知识',
    '3.9 Publish and browse mesh content': '3.9 发布和浏览网络内容',
    '3.10 Delegate work to another agent': '3.10 将工作委托给另一个智能体',
    '3.11 Run Team jobs across several agents': '3.11 在多个智能体上运行团队任务',
    '3.12 Connect MCP and A2A applications': '3.12 连接 MCP 和 A2A 应用',
    '3.13 Use terminals remotely': '3.13 远程使用终端',
    '3.14 Operate a private or community relay': '3.14 运行私有或社区中继',
    '4. How EnvoyMesh Works': '4. EnvoyMesh 如何工作',
    '4.1 A plain-language system overview': '4.1 系统概览（通俗易懂版）',
    '4.2 Owners, devices, agents, and peers': '4.2 所有者、设备、智能体和对等节点',
    '4.3 Contacts, bonds, and trust levels': '4.3 联系人、绑定和信任等级',
    '4.4 Signed messages and verifiable senders': '4.4 签名消息和可验证发送者',
    '4.5 Personal agents and external-agent bridges': '4.5 个人智能体和外部智能体桥接',
    '4.6 Local knowledge, the Library, and the Vault': '4.6 本地知识、库和保险库',
    '4.7 Tasks, mandates, and approvals': '4.7 任务、授权和审批',
    '4.8 Agent Network membership': '4.8 智能体网络成员',
    '4.9 Direct networking and relay assistance': '4.9 直接网络和中继协助',
    '4.10 Activity records and end-to-end auditing': '4.10 活动记录和端到端审计',
    '5. Common Use Cases': '5. 常见用例',
    '5.1 A private personal AI across devices': '5.1 跨设备的私密个人AI',
    '5.2 A family or friends mesh': '5.2 家庭或朋友网络',
    '5.3 Trusted research and knowledge exchange': '5.3 可信研究和知识交流',
    '5.4 A small-team Agent Network': '5.4 小型团队智能体网络',
    '5.5 Multi-agent planning and report generation': '5.5 多智能体规划和报告生成',
    '5.6 OpenClaw with trusted mesh contacts': '5.6 与可信网络联系人一起使用 OpenClaw',
    '5.7 HomeClaw as an external EnvoyMesh agent': '5.7 将 HomeClaw 作为外部 EnvoyMesh 智能体',
    '5.8 Hermes as an external EnvoyMesh agent': '5.8 将 Hermes 作为外部 EnvoyMesh 智能体',
    '5.9 OpenHuman as an external EnvoyMesh agent': '5.9 将 OpenHuman 作为外部 EnvoyMesh 智能体',
    '5.10 Claude Desktop using EnvoyMesh through MCP': '5.10 通过 MCP 使用 EnvoyMesh 的 Claude Desktop',
    '5.11 External A2A clients delegating tasks': '5.11 委托任务的外部 A2A 客户端',
    '5.12 A self-hosted relay fleet': '5.12 自托管中继集群',
    '6. Product and Protocol Comparisons': '6. 产品和协议比较',
    '6.1 EnvoyMesh and centralized messengers': '6.1 EnvoyMesh 与集中式信使',
    '6.2 EnvoyMesh and cloud AI assistants': '6.2 EnvoyMesh 与云AI助手',
    '6.3 EnvoyMesh and standalone OpenClaw': '6.3 EnvoyMesh 与独立 OpenClaw',
    '6.4 EnvoyMesh and external agent runtimes': '6.4 EnvoyMesh 与外部智能体运行时',
    '6.5 EnvoyMesh and MCP': '6.5 EnvoyMesh 与 MCP',
    '6.6 EnvoyMesh and A2A': '6.6 EnvoyMesh 与 A2A',
    '6.7 EnvoyMesh native Agent Network versus public marketplaces': '6.7 EnvoyMesh 原生智能体网络与公共市场',
    '6.8 Native protocols versus interoperability bridges': '6.8 原生协议与互操作性桥接',
    'Part II — Install and Get Started': '第二部分 — 安装和入门',
    '7. Choose Your Setup': '7. 选择您的设置',
    '7.1 Desktop only': '7.1 仅桌面',
    '7.2 Desktop with EnvoyGo mobile access': '7.2 桌面 + EnvoyGo 移动访问',
    '7.3 Desktop with the bundled EnvoyAI agent': '7.3 桌面 + 捆绑的 EnvoyAI 智能体',
    '7.4 Desktop with an external agent': '7.4 桌面 + 外部智能体',
    '7.5 Desktop with local or remote models': '7.5 桌面 + 本地或远程模型',
    '7.6 Personal relay or community relay': '7.6 个人中继或社区中继',
    '7.7 Small-team and organization deployments': '7.7 小型团队和组织部署',
    '7.8 Recommended first-time setup': '7.8 推荐的首次设置',
    '8. Install EnvoyMesh': '8. 安装 EnvoyMesh',
    '8.1 System requirements': '8.1 系统要求',
    '8.2 Install on macOS': '8.2 在 macOS 上安装',
    '8.3 Install on Windows': '8.3 在 Windows 上安装',
    '8.4 Install EnvoyGo on iOS': '8.4 在 iOS 上安装 EnvoyGo',
    '8.5 Install EnvoyGo on Android': '8.5 在 Android 上安装 EnvoyGo',
    '8.6 Install from source': '8.6 从源代码安装',
    '8.7 Verify the installation': '8.7 验证安装',
    '8.8 Application data locations': '8.8 应用数据位置',
    '8.9 Update EnvoyMesh': '8.9 更新 EnvoyMesh',
    '8.10 Uninstall without losing identity or data': '8.10 卸载但不丢失身份或数据',
    '9. Platform and Package Differences': '9. 平台和包差异',
    '9.1 Desktop and mobile feature comparison': '9.1 桌面和移动功能比较',
    '9.2 macOS packaging': '9.2 macOS 打包',
    '9.3 Windows packaging': '9.3 Windows 打包',
    '9.4 OpenClaw extensions bundled on macOS': '9.4 macOS 上捆绑的 OpenClaw 扩展',
    '9.5 Essential OpenClaw extension selection on Windows': '9.5 Windows 上必要的 OpenClaw 扩展选择',
    '9.6 Full and slim desktop bundles': '9.6 完整和精简桌面捆绑包',
    '9.7 Optional IPFS sidecars': '9.7 可选的 IPFS 边车',
    '9.8 Features requiring a home node': '9.8 需要家庭节点的功能',
    '9.9 Features available as an EnvoyGo mobile mirror': '9.9 可作为 EnvoyGo 移动镜像使用的功能',
    '9.10 Legacy mobile experiments and current product boundaries': '9.10 遗留移动实验和当前产品边界',
    '10. Create Your Identity': '10. 创建您的身份',
    '10.1 What your EnvoyMesh identity represents': '10.1 您的 EnvoyMesh 身份代表什么',
    '10.2 Create an owner identity': '10.2 创建所有者身份',
    '10.3 Create your first device identity': '10.3 创建您的第一个设备身份',
    '10.4 Create or activate your agent identity': '10.4 创建或激活您的智能体身份',
    '10.5 Set your display profile': '10.5 设置您的显示资料',
    '10.6 Understand your DID': '10.6 理解您的 DID',
    '10.7 Protect your cryptographic keys': '10.7 保护您的加密密钥',
    '10.8 Back up identity and recovery data': '10.8 备份身份和恢复数据',
    '10.9 Add another device': '10.9 添加另一台设备',
    '10.10 Revoke a lost or compromised device': '10.10 撤销丢失或受损的设备',
    '11. Tour the Application': '11. 应用导览',
    '11.1 Home and node status': '11.1 首页和节点状态',
    '11.2 Conversations': '11.2 对话',
    '11.3 Contacts and discovery': '11.3 联系人和发现',
    '11.4 Groups': '11.4 群组',
    '11.5 Knowledge Base and Library': '11.5 知识库和库',
    '11.6 Browser': '11.6 浏览器',
    '11.7 Team jobs': '11.7 团队任务',
    '11.8 Terminals': '11.8 终端',
    '11.9 Approvals and activity': '11.9 审批和活动',
    '11.10 Profile': '11.10 资料',
    '11.11 Settings': '11.11 设置',
    '11.12 Connection and agent status indicators': '11.12 连接和智能体状态指示器',
    '12. Connect Your First Contact': '12. 连接您的第一个联系人',
    '12.1 What pairing and bonding do': '12.1 配对和绑定的作用',
    '12.2 Pair with a QR code': '12.2 使用二维码配对',
    '12.3 Pair with an invitation link': '12.3 使用邀请链接配对',
    '12.4 Pair on a local network': '12.4 在本地网络上配对',
    '12.5 Verify identity information': '12.5 验证身份信息',
    '12.6 Choose an appropriate trust level': '12.6 选择合适的信任等级',
    '12.7 Accept a bond request': '12.7 接受绑定请求',
    '12.8 Send the first message': '12.8 发送第一条消息',
    '12.9 Confirm direct or relay-assisted delivery': '12.9 确认直接或中继协助交付',
    '12.10 Troubleshoot pairing': '12.10 配对故障排除',
    '12.11 Bundled sponsor contact': '12.11 捆绑的赞助联系人',
    '13. Connect EnvoyGo': '13. 连接 EnvoyGo',
    '13.1 How EnvoyGo works with a home node': '13.1 EnvoyGo 如何与家庭节点配合工作',
    '13.2 Pair the mobile app': '13.2 配对移动应用',
    '13.3 Confirm the home connection': '13.3 确认家庭连接',
    '13.4 Use chat and contacts': '13.4 使用聊天和联系人',
    '13.5 Use remote terminals': '13.5 使用远程终端',
    '13.6 View Team jobs': '13.6 查看团队任务',
    '13.7 Browse mesh content': '13.7 浏览网络内容',
    '13.8 Receive notifications': '13.8 接收通知',
    '13.9 Make and receive voice calls': '13.9 拨打和接听语音通话',
    '13.10 Revoke a lost phone': '13.10 撤销丢失的手机',
    '13.11 Current mobile limitations': '13.11 当前移动限制',
    '14. First-Day Tutorials': '14. 第一天教程',
    '14.1 Send a private message': '14.1 发送私密消息',
    '14.2 Create a group conversation': '14.2 创建群组对话',
    '14.3 Send an audio message': '14.3 发送语音消息',
    '14.4 Make a voice call': '14.4 进行语音通话',
    '14.5 Share a file': '14.5 共享文件',
    '14.6 Ask EnvoyAI a question': '14.6 向 EnvoyAI 提问',
    '14.7 Add knowledge to your Library': '14.7 向您的库添加知识',
    '14.8 Search your Vault': '14.8 搜索您的保险库',
    '14.9 Ask a bonded agent for knowledge': '14.9 向已绑定的智能体请求知识',
    '14.10 Approve a sensitive action': '14.10 批准敏感操作',
    '14.11 Start a simple Team job': '14.11 启动简单的团队任务',
    '14.12 Connect an external agent': '14.12 连接外部智能体',
    'Part III — People, Profiles, and Conversations': '第三部分 — 人员、资料和对话',
    '15. Contacts and Bonds': '15. 联系人和绑定',
    '15.1 View and search contacts': '15.1 查看和搜索联系人',
    '15.2 Understand contact identity': '15.2 理解联系人身份',
    '15.3 Contact profiles and photos': '15.3 联系人资料和照片',
    '15.4 Online, offline, and connection states': '15.4 在线、离线和连接状态',
    '15.5 Direct, referred, public, and blocked trust': '15.5 直接、推荐、公开和阻止信任',
    '15.6 Change a contact\'s trust level': '15.6 更改联系人的信任等级',
    '15.7 Refer or introduce a contact': '15.7 推荐或介绍联系人',
    '15.8 Mute, block, or remove a contact': '15.8 静音、阻止或移除联系人',
    '15.9 Restore a connection': '15.9 恢复连接',
    '15.10 Contact privacy and disclosure settings': '15.10 联系人隐私和披露设置',
    '16. Private Messaging': '16. 私密消息',
    '16.1 Start a conversation': '16.1 开始对话',
    '16.2 Human-to-human messages': '16.2 人与人消息',
    '16.3 Human-to-agent messages': '16.3 人与智能体消息',
    '16.4 Replies and conversation continuity': '16.4 回复和对话连续性',
    '16.5 Message delivery states': '16.5 消息传递状态',
    '16.6 Offline behavior and retries': '16.6 离线行为和重试',
    '16.7 Search conversation history': '16.7 搜索对话历史',
    '16.8 Draft assistance': '16.8 草稿协助',
    '16.9 Manage conversation data': '16.9 管理对话数据',
    '16.10 Message privacy and security': '16.10 消息隐私和安全',
    '17. Group Conversations': '17. 群组对话',
    '17.1 Create a group': '17.1 创建群组',
    '17.2 Invite members': '17.2 邀请成员',
    '17.3 Send group messages': '17.3 发送群组消息',
    '17.4 Manage membership': '17.4 管理成员',
    '17.5 Leave a group': '17.5 离开群组',
    '17.6 Group trust boundaries': '17.6 群组信任边界',
    '17.7 Group delivery and offline members': '17.7 群组传递和离线成员',
}

def translate_with_preservation(text):
    placeholders = {}
    counter = 0
    
    sorted_terms = sorted(PRESERVE_TERMS, key=len, reverse=True)
    for term in sorted_terms:
        if term in text:
            placeholder = f'__TERM_{counter}__'
            placeholders[placeholder] = term
            text = text.replace(term, placeholder)
            counter += 1
    
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
        content = f.read()
    
    figures = {}
    counter = 0
    for match in FIGURE_PATTERN.finditer(content):
        placeholder = f'__FIGURE_{counter}__'
        figures[placeholder] = match.group(0)
        content = content.replace(match.group(0), placeholder)
        counter += 1
    
    code_blocks = {}
    counter = 0
    for match in CODE_BLOCK_PATTERN.finditer(content):
        placeholder = f'__CODE_{counter}__'
        code_blocks[placeholder] = match.group(0)
        content = content.replace(match.group(0), placeholder)
        counter += 1
    
    inline_codes = {}
    counter = 0
    for match in INLINE_CODE_PATTERN.finditer(content):
        placeholder = f'__INLINE_{counter}__'
        inline_codes[placeholder] = match.group(0)
        content = content.replace(match.group(0), placeholder)
        counter += 1
    
    lines = content.split('\n')
    translated_lines = []
    
    for i, line in enumerate(lines):
        if line.startswith('#### '):
            header = line[5:]
            if header in SECTION_TRANSLATIONS:
                translated_lines.append(f'#### {SECTION_TRANSLATIONS[header]}')
            else:
                translated_lines.append(f'#### {translate_with_preservation(header)}')
        elif line.startswith('### '):
            header = line[4:]
            if header in SECTION_TRANSLATIONS:
                translated_lines.append(f'### {SECTION_TRANSLATIONS[header]}')
            else:
                translated_lines.append(f'### {translate_with_preservation(header)}')
        elif line.startswith('## '):
            header = line[3:]
            if header in SECTION_TRANSLATIONS:
                translated_lines.append(f'## {SECTION_TRANSLATIONS[header]}')
            else:
                translated_lines.append(f'## {translate_with_preservation(header)}')
        elif line.startswith('# '):
            header = line[2:]
            if header in SECTION_TRANSLATIONS:
                translated_lines.append(f'# {SECTION_TRANSLATIONS[header]}')
            else:
                translated_lines.append(f'# {translate_with_preservation(header)}')
        elif line.startswith('> '):
            quote = line[2:]
            translated_lines.append(f'> {translate_with_preservation(quote)}')
        elif line.startswith('- ') or line.startswith('* ') or line.startswith('+ '):
            bullet = line[2:]
            translated_lines.append(f'{line[:2]}{translate_with_preservation(bullet)}')
        elif line.strip() == '':
            translated_lines.append('')
        else:
            translated_lines.append(translate_with_preservation(line))
        
        if (i + 1) % 50 == 0:
            print(f'Translated {i + 1} lines...')
        time.sleep(0.05)
    
    translated_content = '\n'.join(translated_lines)
    
    for placeholder, figure in figures.items():
        translated_content = translated_content.replace(placeholder, figure)
    
    for placeholder, code in code_blocks.items():
        translated_content = translated_content.replace(placeholder, code)
    
    for placeholder, inline in inline_codes.items():
        translated_content = translated_content.replace(placeholder, inline)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(translated_content)
    
    print(f'Translation complete! Output written to {output_file}')

if __name__ == '__main__':
    input_file = 'EnvoyMesh_GuideBook_0.1.0.md'
    output_file = 'EnvoyMesh_GuideBook_0.1.0.zh-CN.md'
    translate_file(input_file, output_file)
