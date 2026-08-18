# 改进 EnvoyMesh 的 Agent Network —— 设计文档

> 一份让 EnvoyMesh mesh 层的 agent 编排(OpenClaw、Pi、Hermes、Codex 以及未来任何 HTTP/JSON-RPC/CLI agent)在异构 runtime 之间干净协作的设计文档。
>
> 配套文件:[`improving-agent-network.en.md`](./improving-agent-network.en.md)(英文版)
>
> 范围:**Mesh Adapter Pattern(MAP)** 这一非侵入性增量层 + 每个 agent 自己的 verifier + 三元组 reputation + 跨 agent 验证 + 联邦自进化。基础是 `apps/node/src/chain-*.ts` 和 `packages/protocol/src/agent-network*.ts` 里实际读到的代码。

---

## 0. 为什么需要这份文档

EnvoyMesh 是一个 **P2P mesh 节点网络**,每个节点跑**一个 agent**(OpenClaw、Pi、Hermes、Codex 或未来的 runtime)。chain orchestrator(`apps/node/src/chain-orchestrator.ts`,2700 行)通过给 bonding peer 分派 `ChainSubtask` 来协调多节点的 team job,根据 `capabilityTag` 字符串和 `reputationScore` 数字来挑选。

**今天,mesh 通过同一个视角看所有 agent:`ChainProvider { peerId, capabilities: string[], reputationScore: number }`。** Orchestrator 知道某个 peer *能做* 一件事,不知道这个 peer *用的是哪个 agent runtime*、*结果会是什么形状*、*怎么用 runtime 合适的方式验证结果*。

当每个节点跑同一个 agent 时,这是 OK 的。但当节点跑不同的 agent,**这就是异构性税(heterogeneity tax)**:

- OpenClaw worker 返回 chat 风格的字符串。Hermes worker 返回带 reasoning 的 code diff。Pi worker 返回 extension 风格的结果。Orchestrator 必须知道每种 shape 才能合并。
- OpenClaw 的"通过"(worker 写了一篇连贯的总结)跟 Hermes 的"通过"(diff 语义正确)**不是同一种证据**。今天没办法表达这个区别。
- Reputation 是 peer 的一个数字。"Alice 擅长翻译"把她的 OpenClaw 跑分和 Hermes 跑分混在一起,当成同一类工作。

**修复方案是 Mesh Adapter Pattern(MAP)—— 一层薄的、增量性的中间层,介于 orchestrator 和 per-node agent runtime 之间,把 capability 广播、结果交付、验证在跨 runtime 上归一化。** Orchestrator 保持它的状态机不变;变的是它看到的 *seam*。

这同时也是 `harness-design/design.md` 里 "verifier 一等公民" 银弹 和 agent-runtime 级别"联邦自进化"的天然归属。

---

## 1. 当前状态 —— EnvoyMesh 已经有了什么

这一节是后面所有内容的事实基础,基于直接读到的代码。

### 1.1 Chain orchestrator

`apps/node/src/chain-orchestrator.ts` 是 2700 行的中心件。状态机是:

```
planChain → launchChain → evaluateBids → trackChain (heartbeat)
  → synthesizeChain → publishChainReport
```

从文件头注释(line 1-27)读到的关键属性:

- **多轮协商**:最多 3 轮。第 1 轮授标;第 3 轮若没有可接受的 bid 等 owner 复核。
- **Cancel-before-accept**:每个 `handleOrchestratorAccept` 先查取消,后发 `task.chain.accept`。这是让"延迟到达的 award"可以安全忽略的基础。
- **Trust gating**:worker 必须是 `direct` trust 才能 bid;orchestrator 必须是 `referred` 才能发 `task.chain.mandate`。
- **Budget 集成**:`chain-budget-ledger.ts` 强制 `Σ workerAllocations.committedUsd + synthesisSpendUsd ≤ maxChainCostUsd`(line 19-22 的不变量)。

### 1.2 Arbitration store

`apps/node/src/chain-arbitration.ts` 是一个 append-only、按 `subtaskId` 索引的 per-chain ledger。对本设计最重要的两个属性(line 17-22):

> - The store is append-only; we never mutate entries in place.
> - `applyArbitration` is idempotent (re-applying the same payload is a no-op).

**这正好是 verifier verdict 需要的数据形状** —— append-only,idempotent,带签。Verdict 只是这个 store 的另一种 entry type。

### 1.3 Budget ledger

`apps/node/src/chain-budget-ledger.ts` 跟踪 `maxChainCostUsd`,有 `reserve()` / `tryCommit()` / `release()` / `finalize()`。这是教科书式的 saga。**Verification budget 可以用同一个原语** —— 跑 verifier 之前 reserve,通过就 commit,不通过就 release。

### 1.4 Sensitivity gate

`apps/node/src/chain-sensitivity-gate.ts` 已经在强制 bond-level × sensitivity-level 的批准。`SENSITIVITY_RANK` 常量和 `bondMaxSensitivity()` 函数是扩展 `MIN_REP_FOR_SENSITIVITY` 的正确形状。

### 1.5 本地 worker 执行

`apps/node/src/chain-worker-executor.ts` 和 `chain-llm.ts` 一起拼装 worker 的本地 agent。两个事实:

- **Default engine 是 OpenClaw**(`chain-worker-executor.ts:4`):*"Default Agent Network engine = Built-in OpenClaw."*
- **Ext Agent 是 node-owner-only option**(`agentNetworkWorkerEngine`)。根据你的澄清:每个节点一次跑一个 agent。

本地 OpenClaw runtime 在 `packages/openclaw-runtime/src/index.ts`,暴露 `discoverOpenClaw()` + `OpenClawRuntime` API,接受 `OpenClawMessage` 返回文本响应。

### 1.6 Protocol 里已经有的

`packages/protocol/src/agent-network-profile.ts` 和 `agent-network-handoff.ts` 已经存在。Protocol 层有一个 "agent network profile" 概念。**下面的 MAP 设计要在结构上跟它兼容 —— 扩展,不是替换。**

### 1.7 异构性税 —— 缺口在哪

> **已核对(2026-08-18):** 本节之前把接缝描述为 `agent-chain-orchestrator.ts:48-55`
> 的 `findProviders / executeStep`。该模块是 **Phase 24B 遗留代码,现在已是死代码**
> —— 生产代码没有任何地方 import `runAgentChain`(唯一引用是一个 Phase 23-25 遗留测试)。
> 真正的接缝在 **两端**:

**Worker 侧** —— `chain-worker.ts:107-111` 的 `ChainWorkerHandlerDeps.executeSubtask`:

```ts
executeSubtask?: (
  subtask: ChainSubtask,
  onPartial: (partial: TaskChainPartialPayload) => Promise<void>,
  opts?: { inputArtifacts?: NamedArtifact[] },
) => Promise<{ ok: boolean; finalNote?: string }>
```

两个生产实现是 `chain-worker-executor.ts:139-178` 的
`createOpenClawChainSubtaskExecutor` 和 `createExtAgentChainSubtaskExecutor`,
它们都建立在 `createEngineChainSubtaskExecutor`(`chain-worker-executor.ts:180-271`)
的 `{ isReady, ask }` 契约上。执行期间通过 `task.chain.partial` 事件流式上报
`ChainSubtaskPartial`(`note` + `confidence` + Phase 53 named artifacts),
并在 `node-service-chain-orchestration.ts:942-957` 根据节点的
`agentNetworkWorkerEngine` 配置接线。

**Orchestrator 侧** —— `ChainOrchestratorSendDeps.findWorkers(capability) → Promise<string[]>` 加
线上协商(`task.chain.propose` → `task.chain.bid` → `task.chain.accept` → heartbeat →
`task.chain.partial`)。任务通过 **线协议** 分发;orchestrator 从不进程内运行 worker 的 agent。

`ChainProvider`(`capabilities: string[]`)和 `string | null` 的 `executeStep`
只存在于已死的 `agent-chain-orchestrator.ts`。**真正的异构性税** 是:

- worker 的结果通道是 `ChainSubtaskPartial`(`note` + `artifactFragment` + `namedArtifacts`)。
  今天每个引擎产出的都是 **text** artifact。想返回结构化数据或文件引用的运行时,
  只能硬挤进同一个 text 形状的管道(`chain-worker-executor.ts:123-133` 把一切裁成 `{ kind: "text" }`)。
- 就绪状态是布尔值(`isOpenClawReady` / `isExtAgentBridgeReady`);没有按 skill 的能力声明,
  说不出引擎*擅长什么*。
- worker 在 partial 里自报 `confidence`;没有经过验证的 verdict。

MAP adapter 用 `AgentAdapter.execute → SignedAgentResult`(typed `ContentBlock[]`)
替换 worker 侧的 `{ isReady, ask }` 契约,并新增 `AgentAdapter.verify` 供 orchestrator 出 verdict。
`chain-map.ts` 是桥梁,把 `ChainSubtask ↔ ExecuteInput` 和
`SignedAgentResult → ChainSubtaskPartial` 映射好,orchestrator 的线协议不变。

---

## 2. 目标

按优先级排(每条针对一个具体失败模式):

1. **Orchestrator 绝不应该知道另一边跑的是哪个 agent runtime。** 它看到的是归一化的 `CapabilityManifest`、`AgentResult`、`Verdict`。(避免:"Hermes 返回 X,OpenClaw 返回 Y,我得在 merge step 里处理两种"。)
2. **每个 agent runtime 有自己的 verifier。** OpenClaw 的 pass(连贯总结)跟 Hermes 的 pass(语义正确的 diff)不是同一种证据。(避免:"universal verifier 假装一条规则适合所有 runtime"。)
3. **Reputation 以 `(peerId, agentRuntime, skillId)` 三元组为 key,不是 `peerId`。** (避免:"Alice 的 OpenClaw translate 分数污染她的 Hermes translate 分数"。)
4. **自进化发生在 agent-runtime 级别。** 每个 runtime 有自己的 scoreboard;mesh 在跑同一 runtime 的 peer 之间联邦 *opt-in* 规则。(避免:"agent 在生产里改自己 prompt,审计轨迹不透明"。)
5. **跨 agent 验证对关键任务以显式代价可用。** 两个 runtime 跑同一任务,结果是它们的交集。(避免:"不管用不用都得付双倍 cost"。)
6. **改动是非侵入性的。** 加新包;现有 chain orchestrator 继续工作,直到 seam 被迁移。(避免:"为了发这个,重写 orchestrator"。)
7. **Owner 控制自己节点上跑什么。** 加新 adapter 是 node-config 改动,不是 protocol 改动。(避免:"加新 agent runtime 要全 mesh 升级"。)

---

## 3. 架构:Mesh Adapter Pattern(MAP)

```
┌─────────────────────── Node A ─────────────────────────┐
│                                                         │
│  ┌─ OpenClawAdapter ─────────────────────────────────┐  │
│  │  getCapabilities()  → CapabilityManifest         │  │
│  │  execute(task, mandate) → AgentResult             │  │
│  │  verify(result)  → Verdict                       │  │
│  │  (own verifier: chat-coherence + completeness)   │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌─ Manifest Broadcast (signed by owner) ────────┐    │
│  │  { runtime: "openclaw", version, skills, ...}  │    │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
└───────────────────────┼─────────────────────────────────┘
                        │  (libp2p / circuit relay)
                        │
┌─────────────────────── Node B ─────────────────────────┐
│  ┌─ PiAdapter ─────────────────────────────────────┐    │
│  │  getCapabilities()  → CapabilityManifest         │    │
│  │  execute(...) → AgentResult                      │    │
│  │  verify(result)  → Verdict                       │    │
│  │  (own verifier: command-sequence + loop-detect)  │    │
│  └────────────────────┬──────────────────────────────┘    │
└───────────────────────┼─────────────────────────────────┘
                        │
                        ▼
       ┌────────────────────────────────────┐
       │  MAP Interop Layer                  │
       │  • 归一化 manifests (skill set)    │
       │  • 归一化 results (content blocks) │
       │  • 归一化 verdicts (Verdict)       │
       │  • reputation: per (peer, runtime,  │
       │    skill)                           │
       └────────────────┬───────────────────┘
                        │
                        ▼
       ┌────────────────────────────────────┐
       │  Chain Orchestrator                 │
       │  (现有的 chain-orchestrator.ts)     │
       │  • 状态机不变                       │
       │  • findProviders: by skillId        │
       │  • executeStep: 拿 AgentResult     │
       │  • trackChain: 喂 Verdict          │
       └────────────────────────────────────┘
```

**Orchestrator 的状态机不变。** 变的是它的 *seam*:`findProviders` 返回的类型,`executeStep` 返回的类型,`trackChain` 喂进去的数据。Merge step(`synthesizeChain`)在归一化的 `ContentBlock[]` 上操作,不是不透明字符串。

### 3.1 什么放在哪

| 组件 | 位置 | 责任 |
|---|---|---|
| **CapabilityManifest / AgentResult / Verdict schemas** | `packages/protocol/src/agent-adapter.ts`(新)| 线协议、签名 envelope |
| **AgentAdapter interface** | `packages/agent-adapter/src/agent-adapter.ts`(新)| 通用 surface:`getCapabilities`、`execute`、`verify` |
| **Per-runtime adapters** | `packages/agent-adapter/src/{openclaw,pi,hermes,codex}-adapter.ts`(新)| Runtime 特有 I/O,runtime 特有 verifier |
| **Adapter registry** | `packages/agent-adapter/src/adapter-registry.ts`(新)| 根据 `settings.json` 选一个 adapter |
| **MAP interop layer** | `apps/node/src/chain-map.ts`(新)| Worker 侧桥梁:`ChainSubtask → ExecuteInput`、`SignedAgentResult → ChainSubtaskPartial`、advisory `adapter.verify` 闸门。影子模式对比 adapter 路径 vs 遗留引擎路径 |
| **Adapter broadcast** | `apps/node/src/agent-adapter-broadcast.ts`(新)| 周期签名 manifest 广播 |
| **3-tuple reputation** | `apps/node/src/chain-reputation-3tuple.ts`(新)| 从 `ArbitrationStore` 读,暴露 `getScore(peer, runtime, skill)` |
| **Cross-agent verifier** | `packages/agent-adapter/src/cross-agent-verifier.ts`(新)| 两个 runtime 对比 |
| **Per-agent scoreboard** | `apps/node/src/verifier-scoreboard.ts`(新)| 本地 append-only,runtime 级别 5 步自进化 |
| **Mesh-federated scoreboard** | `apps/node/src/mesh-scoreboard.ts`(新)| 公开、opt-in 拉取同 runtime peer 的规则 |
| **Modified worker executor** | `apps/node/src/chain-worker-executor.ts`(`createEngineChainSubtaskExecutor` 的 `{ isReady, ask }` 契约)| 增加走 `chain-map.ts` 的 adapter 变体;状态机不变 |

### 3.2 硬性要求

- **到处 append-only。** Verdicts、scoreboard entries、reputation 变化 —— 全部 append-only。沿用 `chain-arbitration.ts` 的纪律。
- **Owner 签名。** 每个 manifest、result、verdict 都用节点的 owner 私钥做 Ed25519 签。沿用 `AGENTS.md:102-119` 的 `EnvoyEnvelope` 纪律。
- **失败模式是显式的。** 每个 result 带一个 `Verdict` 判别字段;reputation 是 verdict 历史的函数,不是自报的数字。
- **Adapter 是 per-node 的,不是 per-mesh。** 每个节点根据自己 config 选一个 adapter。Mesh 看到的是 adapter 的 manifest,不是 config。
- **MAP 是 orchestrator 唯一碰的 seam。** Orchestrator 绝不直接从 `openclaw-runtime` import;它走 `chain-map.ts`。

---

## 4. 三个新 schema

放在 `packages/protocol/src/agent-adapter.ts`。**它们是增量的;现有 schema 不动。**

### 4.1 `CapabilityManifest`

节点向 mesh 广播自己会做什么。**替换**(不删除)当前 `ChainProvider.capabilities: string[]`。

```ts
import { z } from 'zod'

export const SkillIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/)
export type SkillId = z.infer<typeof SkillIdSchema>

export const AgentRuntimeSchema = z.enum([
  'openclaw',
  'pi',
  'hermes',
  'codex',
  'codex-cli',
  'openhuman',
  // 新 runtime 通过 packages/agent-adapter/src/runtime-registry.ts 注册
  // Mesh 把未知 runtime 当作不透明(只广播 capability)
])
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>

export const SkillDescriptorSchema = z.object({
  skillId: SkillIdSchema,
  /** 给 owner UX 和 marketplace UI 用的人类可读描述。 */
  description: z.string().min(1).max(280),
  /**
   * Adapter 愿意跑这个 skill 的 cost 上限。
   * 软信号 —— orchestrator 的 chain-budget-ledger 是权威门槛。
   */
  costCeilingUsd: z.number().positive().optional(),
  /**
   * 这个 skill 可以操作的最高 sensitivity。
   * 对应 ChainMandate.maxSensitivity。
   */
  maxSensitivity: z.enum(['public', 'friends', 'private']).default('friends'),
  /**
   * Adapter 定义的 tag,用于 marketplace 筛选。
   * 例子:['code', 'analysis', 'translate', 'review']。
   */
  tags: z.array(z.string()).default([]),
})
export type SkillDescriptor = z.infer<typeof SkillDescriptorSchema>

export const ReputationScoreSchema = z.number().min(0).max(1)
export type ReputationScore = z.infer<typeof ReputationScoreSchema>

export const CapabilityManifestSchema = z.object({
  /** 这个 adapter 包的哪个 runtime。 */
  runtime: AgentRuntimeSchema,
  /** Runtime 版本(semver-ish;owner 控制)。 */
  runtimeVersion: z.string(),
  /** 拥有这个节点的 peerId。 */
  peerId: z.string(),
  /** Owner 的 ownerId(通过 mandate 交叉验证)。 */
  ownerId: z.string(),
  /** 节点愿意跑的 skills。 */
  skills: z.array(SkillDescriptorSchema).min(1),
  /**
   * 每个 skill 的历史 reputation。从该节点上的 ArbitrationStore
   * verdicts 算出来;在 manifest 的 TTL 窗口内缓存。
   */
  reputationBySkill: z.record(SkillIdSchema, ReputationScoreSchema).default({}),
  /** ISO 时间戳;manifests 在一个 TTL 内有效(默认 5 分钟)。 */
  issuedAt: z.string().datetime(),
  /** TTL 秒数。 */
  ttlSeconds: z.number().int().positive().default(300),
})
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>

export const SignedCapabilityManifestSchema = CapabilityManifestSchema.extend({
  signature: z.string(), // Ed25519 over unsigned manifest 的 canonical JSON
})
export type SignedCapabilityManifest = z.infer<typeof SignedCapabilityManifestSchema>
```

### 4.2 `AgentResult`

节点跑完一个 skill 后返回给 orchestrator。**替换**(不删除)当前 `executeStep` 的 `Promise<string | null>`。

```ts
export const ContentBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal('file'),
    vaultPath: z.string(),
    contentHash: z.string(),
    displayName: z.string().optional(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal('structured'),
    schemaRef: z.string(), // e.g. 'envoymesh://chain-report/v1'
    data: z.unknown(),
  }),
  z.object({
    kind: z.literal('image'),
    vaultPath: z.string(),
    contentHash: z.string(),
    mimeType: z.string(),
    altText: z.string().optional(),
  }),
])
export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const CitationSchema = z.object({
  /** Agent 声称的来源。格式由 adapter 定义。 */
  source: z.string(),
  /** Citation 指向的 result 中的 block(按 index)。 */
  blockIndex: z.number().int().nonnegative(),
  /** 可选的结构化引用(如 vault path、URL、peer id)。 */
  ref: z.unknown().optional(),
})
export type Citation = z.infer<typeof CitationSchema>

export const AgentMetricsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative(),
})
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>

export const AgentResultSchema = z.object({
  /** 产生这个结果的 skill。必须跟 manifest 匹配。 */
  skillId: SkillIdSchema,
  /** 是哪个 runtime 产生的。 */
  runtime: AgentRuntimeSchema,
  /** 节点 peerId。 */
  peerId: z.string(),
  /** 这个 result 属于哪条 chain(correlation)。 */
  correlationId: z.string(),
  /**
   * 实际内容。**永远是类型化的 block 数组,不是不透明字符串。**
   * Orchestrator 的 merge step (synthesizeChain) 直接消费它。
   */
  content: z.array(ContentBlockSchema).min(0),
  /** Agent 给自己 content blocks 挂的引用。 */
  citations: z.array(CitationSchema).default([]),
  /** 运行指标。 */
  metrics: AgentMetricsSchema,
  /**
   * Adapter 私有的原始输出。**Orchestrator 绝不能读。**
   * 存进 audit log 用来 debug;signature 覆盖它,所以恶意的 adapter
   * 不能事后编辑它。
   */
  raw: z.unknown().optional(),
  /** 完成时的 ISO 时间戳。 */
  completedAt: z.string().datetime(),
})
export type AgentResult = z.infer<typeof AgentResultSchema>

export const SignedAgentResultSchema = AgentResultSchema.extend({
  signature: z.string(), // Ed25519 over unsigned result 的 canonical JSON
})
export type SignedAgentResult = z.infer<typeof SignedAgentResultSchema>
```

### 4.3 `Verdict`

Verifier 对 result 的判断。**替换当前"没有 verdict"的状态**(orchestrator 今天只信 result 自己的 `ok` boolean)。

```ts
export const VerdictSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pass'),
    score: z.number().min(0).max(1),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal('partial'),
    score: z.number().min(0).max(1),
    reason: z.string(),
    /** 哪些 block(按 index)能用。 */
    usableBlocks: z.array(z.number().int().nonnegative()).optional(),
  }),
  z.object({
    kind: z.literal('fail'),
    reason: z.string(),
    /** Orchestrator 是否应该 release 掉 cost reserve。 */
    rollback: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('disputed'),
    needsHuman: z.literal(true),
    /** Verifier 不确定的原因。 */
    signals: z.array(z.string()),
  }),
])
export type Verdict = z.infer<typeof VerdictSchema>

export const VerifierSourceSchema = z.enum([
  'rule',     // 确定性规则引擎。快、便宜、没 LLM。
  'llm',      // 次级 verifier LLM。慢、贵、概率性。
  'human',    // Owner 或指定的人类评审。
  'cross',    // 两个 runtime 对比(cross-agent disagreement)。
])
export type VerifierSource = z.infer<typeof VerifierSourceSchema>

export const VerdictEntrySchema = z.object({
  /** 这个 verdict 属于哪条 chain。 */
  chainId: z.string(),
  /** chain 里的 subtask。 */
  subtaskId: z.string(),
  /** 哪个 worker 的 result 在被评判。 */
  workerPeerId: z.string(),
  /** Worker 用的 runtime。 */
  workerRuntime: AgentRuntimeSchema,
  /** 跑的哪个 skill。 */
  skillId: SkillIdSchema,
  /** Verdict 本身。 */
  verdict: VerdictSchema,
  /** 这个 verdict 来自哪里。 */
  source: VerifierSourceSchema,
  /** 如果 `source === 'llm'`,产生它的 model。 */
  verifierModel: z.string().optional(),
  /** 如果 `source === 'human'`,产生它的 owner。 */
  verifierOwnerId: z.string().optional(),
  /** Orchestrator 的 peerId(发出 verdict 的那个)。 */
  issuedBy: z.string(),
  /** ISO 时间戳。 */
  issuedAt: z.string().datetime(),
  signature: z.string(),
})
export type VerdictEntry = z.infer<typeof VerdictEntrySchema>
```

`VerdictEntry` 设计成可以塞进现有的 `ArbitrationStore`(`chain-arbitration.ts:35` 定义了 `type ArbitrationStore = Map<string, ChainArbitrationEntry>`)。现有 store 的 `append-only` + `idempotent` 不变量不用改。

### 4.4 为什么是三个 schema,不是一个

拆分是有意为之:

- `CapabilityManifest` 是**节点声明自己会做什么**。跨 run 稳定;只在 adapter 或 config 变化时变。
- `AgentResult` 是**节点为某个具体 subtask 产出的东西**。每次都不一样。
- `Verdict` 是**orchestrator 对那个 result 的判断**。由 orchestrator 侧的 verifier 发出,不是 worker。

Worker 不能自证(`source: 'rule'` 或 `'llm'` 或 `'human'` 都在 orchestrator 侧)。**Worker 签自己的 `AgentResult`;Orchestrator 对它发一个 `Verdict`。** 这就是 reputation 流动的接缝。

---

## 5. Per-agent adapter 设计

### 5.1 `AgentAdapter` 接口

`packages/agent-adapter/src/agent-adapter.ts`:

```ts
import type {
  AgentRuntime,
  CapabilityManifest,
  SignedAgentResult,
  SkillDescriptor,
  Verdict,
  VerdictEntry,
} from '@envoymesh/protocol'

export interface AgentAdapter {
  /** 这个 adapter 包的 runtime。 */
  readonly runtime: AgentRuntime

  /**
   * 这个 adapter 能跑的 skills。**Adapter 自己决定。**
   * Orchestrator 只能看到 manifest;manifest 是从这里构建的。
   */
  describeSkills(): SkillDescriptor[]

  /**
   * 构建签名 manifest 用于广播。Owner 的 signing key 签 envelope,
   * 不是 adapter 自己。
   */
  buildManifest(input: {
    peerId: string
    ownerId: string
    reputationBySkill: Record<string, number>
  }): Promise<CapabilityManifest>

  /**
   * 跑一个 skill。Mandate 是归一化输入;adapter 翻译成它 runtime
   * 期望的形状。
   *
   * **Adapter 是唯一知道 runtime 细节的地方。** Orchestrator 不知道。
   */
  execute(input: {
    skillId: string
    objective: string
    inputArtifacts: ReadonlyArray<NamedArtifact>
    costCeilingUsd: number
    deadlineMs: number
    correlationId: string
    signal: AbortSignal
  }): Promise<SignedAgentResult>

  /**
   * Runtime 特有的 verifier。**每个 adapter 自带。**
   * Orchestrator 不知道怎么验 Pi 结果 vs Hermes 结果;adapter 知道。
   *
   * 返回一个或多个 verdicts。多个 verdicts 跟同一 result 由
   * orchestrator OR-组合(任何 'pass' 短路到 pass;
   * 任何 'fail' 短路到 fail;只有全部不确定才是 'disputed')。
   */
  verify(input: {
    result: SignedAgentResult
    objective: string
  }): Promise<Verdict[]>
}
```

### 5.2 `OpenClawAdapter`(canonical,因为我们最熟)

`packages/agent-adapter/src/openclaw-adapter.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process'
import { OpenClawRuntime, discoverOpenClaw, type OpenClawModelConfig } from '@envoymesh/openclaw-runtime'
import type { AgentAdapter } from './agent-adapter.js'
import type { AgentResult, ContentBlock, SkillDescriptor, Verdict, SignedAgentResult } from '@envoymesh/protocol'
import { signCanonicalPayload } from '@envoymesh/identity'

const OPENCLAW_SKILLS: SkillDescriptor[] = [
  {
    skillId: 'translate',
    description: 'Translate text between natural languages.',
    costCeilingUsd: 5,
    maxSensitivity: 'friends',
    tags: ['language', 'text'],
  },
  {
    skillId: 'summarize',
    description: 'Produce a structured summary of a long document or chat thread.',
    costCeilingUsd: 3,
    maxSensitivity: 'private',
    tags: ['text', 'analysis'],
  },
  {
    skillId: 'chat-assist',
    description: 'Conversational assistance with the owner\'s contacts.',
    costCeilingUsd: 2,
    maxSensitivity: 'friends',
    tags: ['chat', 'support'],
  },
]

export class OpenClawAdapter implements AgentAdapter {
  readonly runtime = 'openclaw' as const

  constructor(
    private readonly runtime_: OpenClawRuntime,
    private readonly modelConfig: OpenClawModelConfig | null,
  ) {}

  describeSkills(): SkillDescriptor[] {
    return OPENCLAW_SKILLS
  }

  async buildManifest(input: {
    peerId: string
    ownerId: string
    reputationBySkill: Record<string, number>
  }): Promise<CapabilityManifest> {
    const unsigned = {
      runtime: this.runtime,
      // NOTE: 真实 `OpenClawRuntime` 没有 `version()` 方法。runtime 版本是
      // adapter 从 `settings.json`(`openclawConfig.runtimeVersion`)读取的配置字符串,
      // 缺省 `"unknown"` —— 见 chain-map.ts 第一版。
      runtimeVersion: await this.runtimeVersion_(),
      peerId: input.peerId,
      ownerId: input.ownerId,
      skills: this.describeSkills(),
      reputationBySkill: input.reputationBySkill,
      issuedAt: new Date().toISOString(),
      ttlSeconds: 300,
    }
    return signCanonicalPayload(unsigned, /* owner private key */)
  }

  async execute(input: {
    skillId: string
    objective: string
    inputArtifacts: ReadonlyArray<NamedArtifact>
    costCeilingUsd: number
    deadlineMs: number
    correlationId: string
    signal: AbortSignal
  }): Promise<SignedAgentResult> {
    const prompt = this.buildPrompt(input)

    // 已核对(2026-08-18):真实 `OpenClawRuntime` 没有 `prompt()` 方法。
    // 生产执行走 `askOpenClawViaRuntime`(apps/node/src/node-service-openclaw-runtime.ts:1733):
    //   - 先确保 runtime 就绪(`ensureOpenClawReadyViaRuntime`),
    //   - 组装 EnvoyMesh 策略 prompt + RAG context,
    //   - 在 per-ask 锁下走 webhook bridge。
    // adapter 包装的是这个函数(外加 `isOpenClawReady()`),不是裸的
    // child-process runtime。`buildOpenClawSubtaskPrompt`(已在
    // chain-worker-executor.ts)负责格式化 constraints/role/thread/artifacts。
    const text = await this.askViaRuntime_(prompt, {
      ownerApproved: true,
      // deadlineMs/signal 若 host 支持则透传;否则回退 runtime 的 responseTimeoutMs。
    })

    const content: ContentBlock[] = [{ kind: 'text', text, mimeType: 'text/markdown' }]
    const unsigned: AgentResult = {
      skillId: input.skillId,
      runtime: this.runtime,
      // NOTE: `OpenClawRuntime` 没有 `peerId` —— adapter 把节点 agent peerId
      // 作为构造参数传入(同现有 createOpenClawChainSubtaskExecutor({ workerPeerId }))。
      peerId: this.workerPeerId_,
      correlationId: input.correlationId,
      content,
      citations: [],
      metrics: { durationMs: /* now - startedAt */, costUsd: /* runtime-reported or 0 */ },
      completedAt: new Date().toISOString(),
    }
    return signCanonicalPayload(unsigned, /* owner private key */)
  }

  async verify(input: {
    result: SignedAgentResult
    objective: string
  }): Promise<Verdict[]> {
    // OpenClaw 特有 verifier。组合规则;默认没有 LLM。
    const rules = [
      new OutputMatchesObjectiveRule(),       // 结果文本真的针对 objective 吗?
      new NonEmptyContentRule(),              // 结果非空?
      new MarkdownStructureRule(),            // markdown 结构合理?
      new OwnerAllowedTopicsRule(),           // 结果没超出 owner policy?
    ]
    const verdicts: Verdict[] = []
    for (const rule of rules) {
      const v = await rule.check(input.result, input.objective)
      if (v) verdicts.push(v)
    }
    return verdicts
  }

  private buildPrompt(input: { /* ... */ }): string {
    // 把 (skillId, objective, inputArtifacts) 翻译成 OpenClaw 期望的
    // prompt 形状。今天 `chain-llm.ts` 里的 DECOMPOSE_SYSTEM_PROMPT /
    // MERGE_SYSTEM_PROMPT 就是干这个的。把它搬到这里,seam 集中。
    return /* ... */
  }
}
```

**这是唯一知道 OpenClaw 的地方。** Orchestrator 看到 `AgentResult`;verifier 看到的也是它。

### 5.3 其他 adapter 草图

**`PiAdapter`(草图)**:通过 Pi CLI 调用 `pi -p <objective>`;结果解析为 JSON。Verifier:`CommandSequenceVerifier`(调的工具对吗?)、`LoopDetectionVerifier`(同一个文件被读 5 次了吗?)。

**`HermesAdapter`(草图)**:HTTP POST 到 Hermes 本地 server;结果包含 reasoning trace。Verifier:`ReasoningTraceVerifier`(trace 是不是绕圈?)、`CodeDiffVerifier`(diff 是不是合理?)。

**`CodexAdapter`(草图)**:HTTP 到 Codex 本地 API;结果是 code diff。Verifier:`DiffAppliesVerifier`(diff 干净吗?)、`TestCoverageDeltaVerifier`(coverage 变化合理吗?)。

**形状完全一样,内部不同。这正是要点。**

### 5.4 `AdapterRegistry`

`packages/agent-adapter/src/adapter-registry.ts`:

```ts
export class AdapterRegistry {
  private adapters = new Map<AgentRuntime, AgentAdapter>()

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.runtime, adapter)
  }

  /** Per-node:根据 settings.json 的 `agentRuntime` 选 adapter。 */
  forNode(settings: NodeSettings): AgentAdapter {
    const runtime = settings.agentRuntime ?? 'openclaw' // 默认
    const adapter = this.adapters.get(runtime)
    if (!adapter) {
      throw new Error(
        `No adapter registered for runtime "${runtime}". ` +
        `Available: ${[...this.adapters.keys()].join(', ')}`,
      )
    }
    return adapter
  }

  /**
   * Orchestrator 用这个来路由。今天 orchestrator 跟 adapter 在同一节点,
   * 所以实际只有 `forNode()` 在用。`byRuntime()` 是为了未来:
   * 跨 orchestrator 想给一个具体 runtime class 派 subtask。
   */
  byRuntime(runtime: AgentRuntime): AgentAdapter | null {
    return this.adapters.get(runtime) ?? null
  }
}
```

**Owner 端配置**在 `~/.envoymesh/settings.json` 变成:

```json
{
  "agentRuntime": "openclaw",  // 或 "pi" / "hermes" / "codex"
  "openclawConfig": { /* ... */ },
  "piConfig": { /* ... */ }
}
```

新 runtime 作为一个新 adapter 文件进 `packages/agent-adapter/src/`。**没有 protocol 改动,没有 orchestrator 改动,没有 mesh 升级。**

---

## 6. Per-agent verifier 设计

### 6.1 为什么 universal verifier 是错的

想象一个"worker 干完活没"的 universal verifier:

- OpenClaw 返回 chat 字符串。Universal verifier 看:非空、针对 objective、连贯。通过。
- Hermes 返回 code diff 加 reasoning。Universal verifier 看:非空、针对 objective、连贯。通过。
- **但 Hermes 的 diff 编译不过。OpenClaw 字符串错但看似合理。** 同样的 verdict,不同的质量。

Universal verifier 不知道这个区别。它在结构上对 runtime 特有的失败模式是盲的。

### 6.2 `CompositeVerifier` 模式

`packages/agent-adapter/src/verifier.ts`:

```ts
import type { Verdict, AgentResult } from '@envoymesh/protocol'

/** 一条规则。便宜、确定性。 */
export interface VerifierRule {
  readonly name: string
  check(input: { result: AgentResult; objective: string }): Promise<Verdict | null>
}

/** 一个完整的 verifier:一组规则。 */
export abstract class CompositeVerifier {
  protected abstract rules(): VerifierRule[]

  async verify(input: { result: AgentResult; objective: string }): Promise<Verdict[]> {
    const verdicts: Verdict[] = []
    for (const rule of this.rules()) {
      const v = await rule.check(input)
      if (v !== null) verdicts.push(v)
    }
    return verdicts
  }
}
```

Orchestrator 的 `trackChain` 调 adapter 的 `verify(result, objective)`。Adapter 返回一个或多个 verdicts。Orchestrator 用 **pass 取 OR、fail 取 AND、都不确定取 disputed** 组合:

```ts
// 在 chain-orchestrator.ts 里(增量;不改现有状态机)
function combineVerdicts(verdicts: Verdict[]): Verdict {
  if (verdicts.some(v => v.kind === 'fail')) {
    return verdicts.find(v => v.kind === 'fail')!
  }
  if (verdicts.length === 0) {
    return { kind: 'disputed', needsHuman: true, signals: ['verifier produced no verdicts'] }
  }
  if (verdicts.every(v => v.kind === 'pass')) {
    const scores = verdicts.filter(v => v.kind === 'pass').map(v => v.score)
    return {
      kind: 'pass',
      score: scores.reduce((a, b) => a + b, 0) / scores.length,
      confidence: scores.length >= 3 ? 'high' : 'medium',
    }
  }
  // 有 pass 有 partial:降级到 partial。
  return { kind: 'partial', score: 0.5, reason: 'verifier disagreement' }
}
```

### 6.3 四个 verifier source

| Source | 何时 | 成本 | 信任度 |
|---|---|---|---|
| `rule` | 永远先跑 | ~免费 | 确定性;只标记已知失败模式 |
| `llm` | 当 `rule` 返回 `partial` 或 `disputed` | $$(独立 budget)| 概率性;需要自己的 model 选择 |
| `human` | 当 `llm` 也返回 `disputed` | UX 成本 | 权威;但慢 |
| `cross` | 当任务关键(owner 标记)| 2× 成本 | 最强;用两个 runtime |

默认流程是 **`rule → llm → human`**,不确定性上升级。**`cross` 是 per-task opt-in**(owner 在 chain proposal 里加 `"verifyWith": "cross-agent"`)。

### 6.4 Cross-agent disagreement verifier

`packages/agent-adapter/src/cross-agent-verifier.ts`:

```ts
import type { AgentResult, Verdict, SignedAgentResult, AgentRuntime } from '@envoymesh/protocol'

export class CrossAgentDisagreementVerifier {
  /**
   * 两个 runtime,同一任务,同一 objective。
   * 如果它们结论一致(语义相似度高),pass。
   * 如果不一致,disputed。
   */
  async verify(input: {
    objective: string
    resultA: SignedAgentResult
    resultB: SignedAgentResult
  }): Promise<Verdict> {
    if (input.resultA.runtime === input.resultB.runtime) {
      // 同一个 runtime 来两次不是 "cross"
      return { kind: 'disputed', needsHuman: true, signals: ['cross-agent verifier requires two distinct runtimes'] }
    }

    const similarity = await this.semanticSimilarity(
      this.extractConclusion(input.resultA),
      this.extractConclusion(input.resultB),
    )

    if (similarity >= 0.85) {
      return { kind: 'pass', score: similarity, confidence: 'high', notes: 'two runtimes agreed' }
    }
    if (similarity >= 0.5) {
      return { kind: 'partial', score: similarity, reason: 'partial agreement across runtimes' }
    }
    return {
      kind: 'disputed',
      needsHuman: true,
      signals: [
        `runtime ${input.resultA.runtime} and ${input.resultB.runtime} disagreed`,
        `semantic similarity: ${similarity.toFixed(2)}`,
      ],
    }
  }

  private extractConclusion(result: SignedAgentResult): string {
    // 文本 result 取最后一个 text block。结构化 result 取特定字段。
    // Adapter 特有;fallback 到全部 content 拼起来。
    const lastText = [...result.content].reverse().find(b => b.kind === 'text')
    return lastText?.kind === 'text' ? lastText.text : JSON.stringify(result.content)
  }

  private async semanticSimilarity(a: string, b: string): Promise<number> {
    // Embedding 相似度。用小专用 model(比如 text-embedding-3-small);
    // verifier LLM 选择是 node-level config,不在这里硬编码。
    return /* ... */
  }
}
```

**为什么重要**:Pi worker 和 Hermes worker 独立 review 同一份代码,比任何一方单独 review **强得多**。代价是双倍,但"我该不该签这份 5 万的合同"任务,值得。

---

## 7. Reputation:三元组 key

### 7.1 现状

```ts
// chain-orchestrator.ts:21
export interface ChainProvider {
  ownerId: string
  peerId: string
  capabilities: string[]
  reputationScore: number   // ← 一个 peer 一个数字
}
```

这是错的,因为:

- 它把"Alice 的 OpenClaw translate 分数"和"Alice 的 Hermes translate 分数"混在一起。
- 它由 *worker* 自己更新(自报),或者由一个不分维度的数字更新。
- 它不能成为"Alice 能做 private-sensitivity 任务"的基础,因为我们不知道她擅长什么。

### 7.2 新形状

`apps/node/src/chain-reputation-3tuple.ts`:

```ts
import type { AgentRuntime, SkillId, ReputationScore } from '@envoymesh/protocol'

/**
 * Reputation 是 verdict 历史的函数,不是自报的数字。
 * Key 是 (peerId, runtime, skillId) —— OpenClaw translate 和
 * Hermes translate 分别跟踪。
 */
export type ReputationKey = `${string}::${AgentRuntime}::${string}`

export class ReputationBook3Tuple {
  private scores = new Map<ReputationKey, ReputationScore>()
  private readonly windowSize: number

  constructor(windowSize = 50) {
    this.windowSize = windowSize
  }

  key(peerId: string, runtime: AgentRuntime, skillId: SkillId): ReputationKey {
    return `${peerId}::${runtime}::${skillId}`
  }

  /**
   * 从一个 verdict entry 更新。**这是 reputation 变化的唯一来源。**
   * Verdicts 是 append-only;滚动窗口给出 live score。
   */
  recordVerdict(entry: VerdictEntry): void {
    const key = this.key(entry.workerPeerId, entry.workerRuntime, entry.skillId)
    // 实现:为每个 key 维护最近 N 个 verdicts 的循环 buffer,
    // 算 score = (pass + 0.5 * partial) / total,按时间近因加权。
    // Fail 比 pass 权重高(防御性偏置)。
    /* ... */
  }

  getScore(peerId: string, runtime: AgentRuntime, skillId: SkillId): ReputationScore {
    return this.scores.get(this.key(peerId, runtime, skillId)) ?? 0
  }

  /** 给 manifest 广播用。 */
  snapshotFor(peerId: string, runtime: AgentRuntime): Record<SkillId, ReputationScore> {
    const out: Record<string, ReputationScore> = {}
    for (const skill of this.allSkillsFor(peerId, runtime)) {
      out[skill] = this.getScore(peerId, runtime, skill as SkillId)
    }
    return out
  }
}
```

### 7.3 存储:从 `ArbitrationStore` 派生

`VerdictEntry` 进现有的 `ArbitrationStore`(append-only,idempotent —— `chain-arbitration.ts:17-22`)。**Reputation book 是派生状态,读时从 store 算,不是单独的写目标。** 这很关键:**单一真相源,两种视图**。

```ts
// 在 chain-arbitration.ts 里(增量方法)
export function getVerdictsFor(store: ArbitrationStore, criteria: {
  workerPeerId?: string
  workerRuntime?: AgentRuntime
  skillId?: SkillId
}): VerdictEntry[] {
  // 遍历 store;过滤;按 issuedAt 排序返回。
  /* ... */
}
```

### 7.4 Sensitivity gate 扩展

`chain-sensitivity-gate.ts` 现在只有 `MIN_REP` 不存在,只 gate 在 bond level 上。加 reputation-as-gate:

```ts
// 在 chain-sensitivity-gate.ts 里(增量)
const MIN_REP_FOR_SENSITIVITY: Record<SensitivityLevel, number> = {
  'public': 0.0,    // 任何 direct bond
  'friends': 0.6,   // 60%+ 通过率,滚动窗口内
  'private': 0.85,  // 85%+ 且窗口内至少 10 个 verdicts
}

export function requiresReputationApproval(
  mandate: ChainMandate,
  workerRuntime: AgentRuntime,
  workerReputation: ReputationScore,
  workerVerdictCount: number,
): { required: boolean; reason?: string } {
  const minRep = MIN_REP_FOR_SENSITIVITY[mandate.maxSensitivity as SensitivityLevel]
  if (mandate.maxSensitivity === 'public') {
    return { required: false }
  }
  if (workerVerdictCount < 10 && mandate.maxSensitivity === 'private') {
    return {
      required: true,
      reason: `worker has only ${workerVerdictCount} verdicts; need ≥10 for private-sensitivity work`,
    }
  }
  if (workerReputation < minRep) {
    return {
      required: true,
      reason: `worker ${workerRuntime} reputation ${workerReputation} < required ${minRep} for ${mandate.maxSensitivity}`,
    }
  }
  return { required: false }
}
```

**效果**:一个全新的跑 Pi 的 peer 可以立即投标 `public`-sensitivity 任务。它必须先攒到 60%+ 通过率才能接 `friends` 任务,然后 85%+ 加 10+ 个 verdicts 才能接 `private`。**这就是渐进信任,落地版。**

---

## 8. 跨 agent 验证("两个医生"模式)

### 8.1 何时启用

跨 agent 验证 cost 双倍。**在以下情况启用**:

1. Owner 把任务标记为 critical(`chain proposal metadata: { criticality: 'high' }`)。
2. Mandate 的 `maxSensitivity === 'private'` 且 cost 超过一个阈值(比如 $20)。
3. Orchestrator 的 verifier 已经返回 `partial`(用不同 runtime 重跑来 tie-break)。

默认:**只跑 rule-based**。LLM 和 cross 都是显式 opt-in。

### 8.2 Cost 模型

在 `chain-budget-ledger.ts` 加一条 verification budget:

```ts
// 增量加到 ChainBudgetLedgerState
export interface ChainBudgetLedgerState {
  // ... 现有字段 ...
  /** 给 verifier cost 留的(LLM 调用、跨 agent 跑)。 */
  verificationReservedUsd: number
  /** 已经花在 verifier 上的。 */
  verificationCommittedUsd: number
}
```

`maxChainCostUsd` 包括 verification。**如果 verifier 吃光了 budget,orchestrator 降级到 rule-only,继续。**

### 8.3 流程

```
orchestrator.trackChain(step, result)
  │
  ├─► adapter.verify(result, objective)              // adapter 自带规则
  │   └─► rule verdicts
  │
  ├─► combineVerdicts(rule verdicts)
  │   ├─ pass  → continue
  │   ├─ fail  → release budget,标 subtask failed
  │   └─ partial / disputed → 升级
  │
  ├─► 如果需要升级 && criticality == high:
  │   ├─► 在 manifest pool 找另一个 runtime
  │   ├─► orchestrator.executeStep(secondManifest, same step)
  │   ├─► CrossAgentDisagreementVerifier.verify(resultA, resultB)
  │   └─► combineVerdicts(... )
  │
  └─► 如果还 disputed:
      └─► 返回给 owner 人类评审
```

---

## 9. 联邦自进化

这部分来自 Penguin 的 `self-evolve.ts`(5 步协议),用在 **agent-runtime** 级别,加上 mesh 层共享。

### 9.1 本地 scoreboard(per node, per runtime)

`apps/node/src/verifier-scoreboard.ts`:

```ts
import { z } from 'zod'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const EntrySchema = z.object({
  version: z.number().int().positive(), // 单调递增,per runtime
  hypothesis: z.string(),
  rulesetHash: z.string(),              // 当前 active 的 verifier ruleset hash
  meanScore: z.number().min(0).max(1),
  passRateBefore: z.number().min(0).max(1),
  passRateAfter: z.number().min(0).max(1),
  nRuns: z.number().int().nonnegative(),
  status: z.enum(['kept', 'reverted']),
  ownerSignature: z.string(),           // Ed25519 of owner (污染防护)
  createdAt: z.string().datetime(),
})
type Entry = z.infer<typeof EntrySchema>

export class VerifierScoreboard {
  constructor(
    private readonly filePath: string,    // e.g. ~/.envoymesh/agent-state/<peer>/verifier-scoreboard.yaml
  ) {}

  async append(entry: Entry): Promise<void> {
    // Append-only。YAML 给人读。Owner 签。
    /* ... */
  }

  async readAll(): Promise<Entry[]> {
    // 5 步协议的 "evaluate" 步用。
    /* ... */
  }

  async latest(): Promise<Entry | null> {
    // "当前 ruleset 版本是什么"
    /* ... */
  }
}
```

**这就是 Penguin 的 5 步协议,但 *目标* 是 verifier ruleset,不是 `AGENTS.md`。** 协议本身完全一样:

```
1. SNAPSHOT      — 把当前 ruleset 拷贝到 /snapshots/v<n>.json
2. HYPOTHESIZE   — model:"verifier 在 10 个 case 里挂 4 个,缺规则 X"
3. CANDIDATE     — 把规则 X 加到本地 ruleset
4. EVALUATE      — 用 candidate ruleset 重跑 50 个 task
5. COMMIT/REVERT — pass rate 严格更高;否则还原
```

污染防护(Penguin 纪律):**optimizer 永远看不到 rubric**。**Optimizer 看到 scoreboard 和失败 task 描述。** Rubric(私有评测标准)只 owner 看。

### 9.2 Mesh-federated scoreboard(公开、opt-in)

`apps/node/src/mesh-scoreboard.ts`:

```ts
const FederatedEntrySchema = z.object({
  runtime: AgentRuntimeSchema,
  ruleVersion: z.number().int().positive(),
  hypothesis: z.string(),
  /** 在 N 个采用这条规则的 peer 上聚合的统计。 */
  federatedPasses: z.number().int().nonnegative(),
  federatedFailures: z.number().int().nonnegative(),
  meanImprovement: z.number(),         // vs 上一版本
  /** 哪些 peer 贡献了数据。 */
  contributingPeers: z.array(z.string()),
  /** Rule JSON 的 hash,这样 peer 可以拉它。 */
  rulesetHash: z.string(),
  /** 联邦开始跟踪的时间。 */
  federatedAt: z.string().datetime(),
  signature: z.string(),                // mesh-wide trust anchor (这里略)
})
```

跑 `pi` 的 peer 可以 **opt-in 从 peer A 拉 rule v7**(这个 rule 已经在 47 个其他 Pi 节点上验证过)。在本地节点,rule 走本地 5 步协议;过了就进本地 scoreboard;不过就拒绝 pull。

**这是 skill / rule 共享,不是 model 共享。** 风险面比"共享 model 权重"小得多。Rule 是个 JSON 文件;最坏情况是本地 evaluator 抓到一个坏 rule。

### 9.3 什么不共享

- **对话内容。** Federated scoreboard 带假设和统计,不带 user data。
- **Owner mandates。** Trust policy 是 per-node 的;联邦从不覆盖它。
- **Agent 的 runtime config。** 不同节点有不同 model config、sensitivity policy、cost 限制。

---

## 10. 迁移计划(3 个 sprint)

### Sprint 1:MAP 协议 + OpenClawAdapter,增量(4 周)

> **状态(2026-08-18):已实现。** `packages/agent-adapter/src/openclaw-adapter.ts`(规范 adapter,通过注入的 `askViaRuntime` 包住生产 ask 路径)和 worker 侧 interop 层 `apps/node/src/chain-map.ts` 已存在并有单测。`node-service-chain-orchestration.ts` 的 `executeSubtask` 接线在 `ENVOYMESH_MAP_SHADOW=1` 时,以影子模式在遗留 OpenClaw 路径旁跑 MAP adapter 路径 —— 结果仍由 legacy 路径投递,差异以 `chain.map_shadow` 审计事件记录。默认关闭。

**目标**:manifest 被广播,`AgentResult` 被返回,orchestrator 现有路径不变。

第 1-2 周:新包

- 创建 `packages/protocol/src/agent-adapter.ts` 带三个新 schema
- 创建 `packages/agent-adapter/` 包带 `AgentAdapter` interface、`AdapterRegistry`、`OpenClawAdapter`
- 测试:schema 往返、manifest 签名、OpenClawAdapter 的 verifier 规则

第 2-3 周:接线

- `agent-adapter-broadcast.ts`:周期签名 manifest 广播(每 TTL/2,默认 2.5 分钟)
- `chain-map.ts`:MAP interop 层;今天它 *也* 跑旧引擎路径(`createOpenClawChainSubtaskExecutor`),记录差异
- Settings:`settings.json` 里的 `agentRuntime` 字段

第 3-4 周:影子模式

- 影子模式,`chain-map.ts` 同时跑两条路径(旧引擎路径 `chain-worker-executor.ts` 和新 `OpenClawAdapter.execute`),比较结果
- Owner 看到"MAP shadow"日志条目但行为不变
- **成功标准**:1-2 周影子后,≥95% 任务结果相同。(如果不是,adapter 把 runtime 建模错了;迭代。)

### Sprint 2:切到 adapter 路径;per-(peer, runtime, skill) reputation(3 周)

> **状态(2026-08-18):reputation 融合 seam 进行中。** `chain-plan-assign.ts` 现在把 per-skill reputation(`PlanAssignRosterEntry.reputationBySkill`,软加项 `+0.2×rep`)融入 `scoreFor` / `bestPeerForRole`,并把它暴露在 Assigner prompt 里。喂给 roster 的三元组 `ArbitrationStore` 读取器(`chain-reputation-3tuple.ts`)还没写。

第 1 周:切换 seam

- Worker 侧:`node-service-chain-orchestration.ts` 的 `executeSubtask` 接线改走 `chain-map.ts`(adapter-backed executor);`chain-worker-executor.ts` 保留为 legacy 路径(Sprint 1 影子模式对比)
- Orchestrator 侧:`findWorkers` 从 `Promise<string[]>`(capability 标签池)扩展为携带 manifest 的 worker 池(Sprint 2)
- `synthesizeChain` 消费归一化的 `ContentBlock[]`/named artifacts(Sprint 2)
- Orchestrator 状态机不变

第 2 周:三元组 reputation

- 加 `chain-reputation-3tuple.ts`
- 扩展 `chain-sensitivity-gate.ts` 加 `requiresReputationApproval`
- `VerdictEntry` 成为 `ArbitrationStore` 里的新 entry type

第 3 周:发布

- Owner 通过 `settings.json: { "useMAP": true }` opt-in
- 两周监控期;rollback 旗标准备好

### Sprint 3:第二个 adapter + 跨 agent 验证(4 周)

第 1-2 周:第二个 adapter(比如 Pi)

- 加 `packages/agent-adapter/src/pi-adapter.ts`
- Pi 特有 verifier(命令序列、loop 检测)
- 测试:跟 Hermes/OpenClaw 同一任务对比

第 2-3 周:跨 agent 验证

- `CrossAgentDisagreementVerifier`
- `chain-budget-ledger.ts` 里的 verification budget
- Owner UI:在 chain proposal 里标记 `criticality: 'high'`

第 3-4 周:联邦 scoreboard(初始)

- `verifier-scoreboard.ts`(本地,per-runtime)
- `mesh-scoreboard.ts`(联邦,opt-in)
- 一个 peer-to-peer pull 在更广发布前手动测试

**总计:11 周,2 个工程师,约 3000 行新代码,不重写现有 orchestrator。**

### 风险评估

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| Adapter 漏掉 runtime 特有失败模式 | 中 | 高 | Sprint 1 影子模式抓偏差 |
| Reputation-book-3tuple 偏离 `ArbitrationStore` | 低 | 高 | Append-only store 是单一源;book 是派生的 |
| 跨 agent verifier 成本爆 budget | 中 | 中 | Verification budget cap;降级到 rule-only |
| 联邦 scoreboard 拉到坏 rule | 中 | 中 | 本地 5 步协议把关;联邦仅 opt-in |
| `chain-orchestrator.ts` 状态机需要我们没注意到的改动 | 低 | 高 | 2700 行文件;1 周 PR 重构;已有充分测试覆盖 |

---

## 11. 具体文件改动

这一节是 Sprint 1 字面的"要敲什么"。

### 新文件

| 路径 | LoC(估)| 用途 |
|---|---|---|
| `packages/protocol/src/agent-adapter.ts` | 200 | 三个新 schema,签名 envelopes |
| `packages/protocol/test/agent-adapter.test.ts` | 150 | Schema 往返、签名验证 |
| `packages/agent-adapter/package.json` | 30 | 新包,peer dep on `@envoymesh/protocol` |
| `packages/agent-adapter/src/agent-adapter.ts` | 80 | `AgentAdapter` interface |
| `packages/agent-adapter/src/verifier.ts` | 60 | `CompositeVerifier` + `VerifierRule` |
| `packages/agent-adapter/src/adapter-registry.ts` | 60 | `AdapterRegistry` |
| `packages/agent-adapter/src/openclaw-adapter.ts` | 280 | Canonical adapter |
| `packages/agent-adapter/src/verifier-rules/output-matches-objective.ts` | 60 | 一条规则,export |
| `packages/agent-adapter/src/verifier-rules/non-empty-content.ts` | 30 | 一条规则,export |
| `packages/agent-adapter/src/verifier-rules/markdown-structure.ts` | 60 | 一条规则,export |
| `packages/agent-adapter/src/verifier-rules/owner-allowed-topics.ts` | 80 | 一条规则,owner-policy-aware |
| `packages/agent-adapter/test/openclaw-adapter.test.ts` | 250 | Adapter + verifier 测试 |
| `apps/node/src/agent-adapter-broadcast.ts` | 120 | 周期 manifest 广播 |
| `apps/node/src/chain-map.ts` | 220 | MAP interop 层 —— worker 侧桥梁:`ChainSubtask → ExecuteInput`、`SignedAgentResult → ChainSubtaskPartial`、advisory verify 闸门(Sprint 1)|
| `apps/node/test/chain-map.test.ts` | 150 | chain-map 桥梁 + 影子模式等价性测试 |

**Sprint 1 总计:~1700 行,主要是测试。**

### 改动文件

| 路径 | 改动 |
|---|---|
| `packages/protocol/src/index.ts` | 从 `agent-adapter.ts` export 新 schema |
| `packages/api/src/agent-network-settings.ts`(如果存在)| 加 `agentRuntime: AgentRuntime` 字段 |
| `apps/node/src/node-service-chain-orchestration.ts`(line ~942,`executeSubtask` 接线)| 节点跑 MAP runtime 时,worker 侧执行器走 `chain-map.ts`(adapter 变体)(Sprint 1 影子 / Sprint 2 切换)|
| `apps/node/src/chain-worker-executor.ts`(`createEngineChainSubtaskExecutor` 契约)| 与 adapter 共享 prompt/artifact 格式化;增加 adapter 执行器变体(Sprint 1)|
| `apps/node/src/chain-arbitration.ts`(`ChainArbitrationEntry` 联合)| 加 `VerdictEntry` 作为成员(Sprint 2)|
| `apps/node/src/chain-sensitivity-gate.ts` | 加 `requiresReputationApproval`(Sprint 2)|
| `apps/node/src/chain-budget-ledger.ts` | 加 `verificationReservedUsd` / `verificationCommittedUsd`(Sprint 3)|
| `apps/node/src/chain-plan-assign.ts`(`scoreFor` / `bestPeerForRole`)| 把 3-tuple reputation 融入 role/skill 打分(Sprint 2)|
| `apps/node/src/agent-chain-orchestrator.ts`(line 21,`ChainProvider` interface)| **死代码**(Phase 24B 遗留;生产没有任何地方 import `runAgentChain`)。新 manifest 优先于 `ChainProvider`;该遗留文件标记删除,不改(Sprint 2)|

> **已核对(2026-08-18):** `chain-orchestrator.ts` 的 `findProviders` / `executeStep`
> **不是**要改的接缝 —— 那个接缝在已死的 `agent-chain-orchestrator.ts`。Orchestrator
> 侧的改动是 `findWorkers`(capability 字符串 → manifest 池),worker 侧改动是上面的执行器接线。

### 明确不改的文件

- `packages/identity/src/*` —— 签名/验证原语不动
- `packages/network/src/*` —— libp2p 层不动
- `packages/bonds/src/*` —— trust tier 逻辑不动
- `apps/node/src/chain-llm.ts` —— Sprint 1 影子模式期间保留;Sprint 2 deprecate
- `apps/node/src/inbound-guard.ts` —— 不动;新 schema 沿用同样签名约定

---

## 12. 测试策略

### 12.1 单元测试

每个 adapter,写一个三类测试套件:

- **Happy path**:已知输入 → 已知输出。每个 skill 至少 10 个 case。
- **Rule triggers**:手搓应该触发每条 verifier rule 的结果(比如空 content → `OutputMatchesObjectiveRule` 返回 `fail`)。
- **跨 adapter 等价**:同一任务、两个 adapter,结果比较。OpenClaw adapter 和一个 stub Pi adapter 在同一任务上应该产出语义相似的 `ContentBlock[]`。

### 12.2 集成测试

在 `apps/node/test/`:

- **MAP 影子模式等价性**:同一条 chain 在旧引擎路径(`createOpenClawChainSubtaskExecutor` / `chain-worker-executor.ts`)和新 adapter 路径(`chain-map.ts` + `OpenClawAdapter.execute`)下各跑 100 次。断言 ≥95% content 等价(文本块语义相似度 ≥0.9)。
- **Reputation 3-tuple 独立性**:模拟 50 个 verdicts 给 `(peerA, openclaw, translate)` 通过率 0.9,50 个给 `(peerA, hermes, translate)` 通过率 0.4。断言两个分数分开跟踪。
- **Sensitivity gate 扩展**:一个 reputation 0.5 的 peer 在 `private`-sensitivity mandate 上被拦;reputation 0.9 通过。

### 12.3 E2E 测试(orchestrator 级别)

在 `apps/node/test/e2e/`:

- **Two-doctor cross-agent**:一条 `criticality: 'high'` 的 chain 跑同一任务,两个不同 runtime,断言 `CrossAgentDisagreementVerifier` 在结果一致时返回 `pass`,不一致时 `disputed`。
- **联邦 scoreboard pull**:peer A 发一条规则,peer B(跑同一 runtime)opt-in 拉,断言规则在采用前先过本地验证。
- **影子模式 parity**:一条 chain 在影子模式下跑 2 周;断言 orchestrator 行为跟非影子模式完全一致。

### 12.4 测试数据

- 50 条 chain task 的冻结、owner 签 fixture(各种 skills、sensitivities、costs),用于影子模式等价性测试。放在 `apps/node/test/fixtures/chain-tasks/`。
- 100 个结果的冻结、owner 签 fixture(有些 pass、有些 fail、有些 partial),用于 verifier rule 测试。

---

## 13. 开放问题(已解决,2026-08-18)

这些是设计期间的开放问题。六个全部在 2026-08-18、在 `improve_agent_network` 分支上解决。原始问题和推荐答案保留,决议以 blockquote 形式记录在每条问题正下方。§14 末尾的"还没解决(延后)"清单涵盖了仍然开放的事项。

1. **每个 agent runtime 的 stable surface。** OpenClaw:`openclaw-runtime` 已经暴露 TS API。Pi:目前只有 CLI 调用。Hermes:HTTP。Codex:HTTP。**对于非 OpenClaw 的 adapter,我们是把 agent 的本地 HTTP/CLI surface 包起来,还是让 agent 暴露一个 stable TS API?** 我建议包。包意味着 adapter 完全控制输入塑形和结果解析;把 API 推进每个 agent 是更多工作量、更慢。

   > **决议 (2026-08-18):包。** `envoy-harness-adapter`(Package 3,唯一知道 mesh 的地方)在 v0 用 `child_process.spawn` 把 CLI surface 包起来。adapter 是唯一知道 runtime 细节的地方。如果非 OpenClaw 团队后来暴露了 TS API,adapter 可以切到进程内形态,不需要改 `AgentAdapter` interface。envoy-harness 设计 §11(`EnvoyHarnessAdapter`)就是这个"包 CLI"模式的 canonical 例子。

2. **Verifier LLM 选择。** `llm` source 需要一个 model。选项:在 `settings.json` 里的一个 dedicated `verifier-llm` config;或者 fall through 到 owner 的 primary model;或者用一个独立小 model。**我建议**:独立 config,默认 owner 的 primary model,owner 可覆盖。**用一个比 worker 更便宜的 model**(比如 worker 用 `claude-opus-4`,verifier 用 `claude-haiku`)。直觉:verifier 在检查 worker 的声称,worker 是更贵的那一个。

   > **决议 (2026-08-18):按建议。** envoy-harness 设计 §12(`CompositeVerifier`)和 §14(Cost tracking)已经对齐。`settings.json` 里有 `verifier-llm` config,默认 owner 的 primary model,owner 可覆盖。"用比 worker 更便宜的 model"是软默认,每个 adapter 可改。

3. **默认 reputation seeding。** 一个全新节点没有 verdicts。Sensitivity gate 应该在 `public` 上放它过(reputation 阈值 0.0)。**它在 `friends` 上应该有个非零默认(比如 0.5)来 bootstrap 吗?** 我倾向不 —— 渐进信任的意义就是你得挣。但一个在线 30 天、从来没产出过 verdict 的节点,至少应该显示"无记录"而不是"0.0"。所以:gate 也用一个独立的"是否有记录"boolean。

   > **决议 (2026-08-18):按建议。** `friends` 不 bootstrap 默认 —— reputation 必须挣。"是否有记录"boolean 是 gate 上的独立字段,在 UX 上暴露为独立状态(不和"reputation = 0"混在一起)。envoy-harness 设计 §7(三元组 reputation)直接继承这一点。

4. **Per-runtime cost 模型。** 今天 `OpenClawRuntime.prompt` 有 `costUsd` 字段但外部设。**谁付 verifier LLM 的钱?** 三个选项:(a) 从 chain 的 `maxChainCostUsd`(worker 间接付);(b) 从 mandate 的独立 `verificationBudgetUsd` 字段;(c) 从 orchestrator 自己节点(免费,owner 吸收)。**我建议 (b)** —— 显式 per-chain verification budget —— 因为这让选择 criticality 的 owner 看到 cost。

   > **决议 (2026-08-18):(b)。** envoy-harness 设计 §14(Cost tracking)和 §15(Sub-agent protocol)已经对齐 —— orchestrator 传 `verificationBudgetUsd` 跟 `maxChainCostUsd` 分开,budget-ledger 在 chain 开始时两边都 reserve。Owner 在 chain summary 里看到 verification cost,跟 worker cost 分开。

5. **联邦 scoreboard 信任。** Mesh-federated scoreboard 今天"任何 peer 可以声称任何规则"。**联邦 entry 的信任模型是什么?** 选项:已知 contributor 签(这里略,需要一个还不存在的 mesh-wide identity 层);或者贡献 peer 之间的投票;或者基于 stake。**我建议**:把联邦 scoreboard 推迟到本地 3-tuple reputation 在生产里跑了一个季度之后。在那之前,只有本地自进化。

   > **决议 (2026-08-18):延后。** envoy-harness 设计 §9.2(联邦自进化)说"opt-in,等本地 3-tuple reputation 在生产里跑一个季度之后。"同样的意图、同样的延后。等真的接这个工作时,信任模型大概率是基于签名的(需要一个还不存在的 mesh-wide identity 层)—— 但在那个 identity 层存在之前,我们不承诺具体模型。

6. **Legacy 路径。** `chain-llm.ts` 有现有的 `DECOMPOSE_SYSTEM_PROMPT` 和 `MERGE_SYSTEM_PROMPT` 写死。**新 `OpenClawAdapter` 是复用它们还是替换它们?** 我建议:抽到 `prompt-templates/` 目录里,新旧路径都用。**避免漂移;新路径在影子模式证明更好之前,旧路径的 prompt 模板是金标准。**

   > **决议 (2026-08-18):按建议,范围限定 OpenClaw。** envoy-harness 用不同的 prompt 模板(为 CLI 流程设计,不是为进程内 OpenClaw runtime),不跟 legacy 路径共享 `prompt-templates/` 目录。抽取是给 `apps/node/src/chain-llm.ts` → `OpenClawAdapter` 迁移用的,是一个独立 work item。

---

## 14. 进一步阅读

### 这份文档依赖什么

- `apps/node/src/chain-orchestrator.ts`(2700 行,orchestrator)
- `apps/node/src/chain-arbitration.ts`(append-only per-chain ledger,line 17-22 不变量)
- `apps/node/src/chain-budget-ledger.ts`(saga 式 budget 强制)
- `apps/node/src/chain-sensitivity-gate.ts`(sensitivity × bond level gate)
- `apps/node/src/chain-worker-executor.ts`(line 4:default engine 是 OpenClaw)
- `apps/node/src/chain-llm.ts`(line 30-58:现有 prompt 模板)
- `apps/node/src/external-agent-gateway.ts`(现有 ext agent surface)
- `packages/protocol/src/agent-network-profile.ts`(现有 profile schema)
- `packages/protocol/src/agent-network-handoff.ts`(现有 handoff schema)
- `packages/openclaw-runtime/src/index.ts`(OpenClaw runtime API)

### 这份文档 supersede / 扩展什么

- `../harness-design/design.md` —— 单节点 verifier 设计是这里设计的一个 *子情况*(per-adapter verifier)。5 步自进化协议变成 §9.1 的 per-runtime scoreboard。
- `../harness-design/design.md` §10(分布式)—— 在 §5-9 扩展,带具体 schema 和 adapter 实现。

### 灵感来源(跟这份文档一起读)

- **DeepSeek-Harness** —— `Registrations are effects`(未来 work item,延后)
- **Penguin-Harness** —— 5 步自进化协议(§9.1)和污染防护(§9.1 结尾)
- **Pi** —— `TaggedError` + `Result`(`Verdict` schema §4.3 是判别联合模式)
- **Cordis paper** —— 形式化 effect,证明到处 append-only 的合理性

### 还没解决(延后)

- **Registrations are effects**(DeepSeek)。值得做,但要等 MAP 进了生产。
- **HMR / hot reload**(DeepSeek、Pi)。Pi 的 `/reload` 是正确思路;EnvoyMesh 的对应物是"adapter 重新加载时重新广播 manifest"。
- **Agent Skills 标准**(Pi)。`OpenClawAdapter` 稳定后值得做;格式 adapter 很小。
- **Trace observability UI**(Penguin)。另一个项目;数据结构在 `chain-arbitration.ts`。
- **`run_subagent` 干净 API**(Penguin)。新 `AgentAdapter.execute` *就是* 这个干净 API。不用再做什么;只是暴露。
