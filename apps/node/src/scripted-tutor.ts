/**
 * Scripted onboarding tutor — provides helpful responses when no LLM model is
 * configured (`modelProviders.mode === "disabled"`).
 *
 * Without this fallback, a new user who skipped AI config gets an error when
 * they message the assistant. With it, the assistant responds with state-aware
 * onboarding guidance — every new user can interact with EnvoyAI for help,
 * even without a cloud API key.
 *
 * The tutor pattern-matches the user's message against common onboarding
 * intents (find contacts, what can you do, get started, configure AI) and
 * returns a templated response. When no intent matches, it returns a generic
 * helpful response that suggests connecting a model for full AI capabilities.
 *
 * Supports localization: intent keywords match English + Chinese; responses
 * are localized via a translation map. Falls back to English for untranslated
 * locales.
 *
 * Once the user configures a real model, the OpenClaw gateway takes over and
 * this fallback is never reached.
 */

export interface ScriptedTutorState {
  /** Number of bonded contacts (0 = brand-new user). */
  bondCount: number;
  /** Number of interests the user selected during setup. */
  interestCount: number;
  /** Whether the user has configured any model provider. */
  hasModel: boolean;
  /** Locale code (e.g. "en", "zh"). Defaults to "en". */
  locale?: string;
}

// ---------------------------------------------------------------------------
// Localized response templates
// ---------------------------------------------------------------------------

type ResponseTemplates = {
  findContacts: (interestCount: number) => string;
  whatCanDo: () => string;
  getStarted: (bondCount: number, hasModel: boolean) => string;
  configModel: () => string;
  chains: () => string;
  privacy: () => string;
  generic: (hasModel: boolean) => string;
};

const EN_TEMPLATES: ResponseTemplates = {
  findContacts: (n) => {
    const hint = n > 0
      ? ` You selected ${n} interests during setup — we've already searched for people who share them.`
      : " Try selecting a few interests in your profile so we can match you with like-minded people.";
    return [
      "📋 **Finding contacts on EnvoyMesh**",
      "",
      "Here are the ways to find people:",
      "",
      "1. **Discover tab** — Open Discover to see people who share your interests, "
        + "search by name/topic/location, or scan the same Wi-Fi for nearby peers.",
      "2. **Contact link** — If a friend sent you an `envoy://contact?...` link, "
        + "paste it into Discover → Paste a contact link.",
      "3. **Company invite** — If your team uses EnvoyMesh, paste an "
        + "`envoy://invite?token=...` link into Discover.",
      "",
      hint.trim(),
      "",
      "Once you say hello and they accept, they'll appear in your Chat sidebar.",
    ].join("\n");
  },
  whatCanDo: () =>
    [
      "✨ **What EnvoyMesh can do**",
      "",
      "**Communication:**",
      "• Direct chat + group chats with bonded contacts",
      "• Voice notes (record and send in any chat)",
      "• Voice/video calls (peer-to-peer, no central server)",
      "• File sharing with policy-gated access",
      "",
      "**AI Agent (that's me!):**",
      "• Answer questions using your vault (RAG)",
      "• Help draft messages and summarize conversations",
      "• Run multi-agent chains across your contacts' agents",
      "• Search the mesh for knowledge",
      "",
      "**Privacy & ownership:**",
      "• Your keys, your data — no central account server",
      "• Trust tiers control what each contact can access",
      "• Everything is signed and auditable on your device",
      "",
      "Connect a model (Settings → AI) to unlock my full capabilities!",
    ].join("\n"),
  getStarted: (bondCount, hasModel) => {
    const steps: string[] = ["🚀 **Getting started with EnvoyMesh**", ""];
    if (bondCount === 0) {
      steps.push("1. **Find your first contact** — Go to Discover and say hello to someone who shares your interests.");
    } else {
      steps.push(`1. ✅ You have ${bondCount} contact(s) — start chatting!`);
    }
    if (!hasModel) {
      steps.push("2. **Connect an AI model** (optional) — Settings → AI → Configure. I can do much more with a model.");
    } else {
      steps.push("2. ✅ AI model configured — ask me anything!");
    }
    steps.push("3. **Explore** — Try the Library (your files), Chains (multi-agent tasks), and Settings.");
    steps.push("");
    steps.push("Take your time — there's no rush. Ask me anything along the way!");
    return steps.join("\n");
  },
  configModel: () =>
    [
      "🔧 **Connecting an AI model**",
      "",
      "To unlock my full capabilities, connect a model provider:",
      "",
      "1. Go to **Settings → AI**",
      "2. Under **Model provider**, choose:",
      "   • **OpenAI-compatible** — OpenAI, Groq, Together, etc.",
      "   • **Anthropic-compatible** — Claude models",
      "   • **Ollama** — local models (free, runs on your machine)",
      "   • **LiteLLM** — proxy to any provider",
      "3. Enter the endpoint, model name, and API key",
      "4. Save and I'll be fully powered!",
      "",
      "**Tip:** Ollama is free and private — install from ollama.com, pull a model like `llama3.2`.",
    ].join("\n"),
  chains: () =>
    [
      "🔗 **Multi-agent chains**",
      "",
      "Chains let your agent decompose a complex goal across your contacts' agents.",
      "",
      "To start a chain:",
      "1. Open the **Chains** tab",
      "2. Click **New chain**",
      "3. Describe your goal (e.g. 'Research local LLM benchmarks and summarize the top 3')",
      "4. Preview the plan, then start",
      "",
      "You need at least one bonded contact with an active agent for chains to work.",
    ].join("\n"),
  privacy: () =>
    [
      "🔒 **Privacy & security on EnvoyMesh**",
      "",
      "• **No central server** — your identity is cryptographic, not an account",
      "• **Signed messages** — every message is Ed25519-signed",
      "• **Trust tiers** — each contact has a tier that controls access",
      "• **Local-first** — your data stays on your device unless you share it",
      "",
      "You're in control. Block any contact from the chat sidebar menu.",
    ].join("\n"),
  generic: (hasModel) => {
    const note = hasModel ? "" : "\n\n💡 *I'm running in limited mode. Connect a model in Settings → AI for full AI capabilities.*";
    return [
      "I'm your Envoy assistant! I can help you find contacts, explain features, and guide you through EnvoyMesh.",
      "",
      "Try asking:",
      "• \"How do I find contacts?\"",
      "• \"What can EnvoyMesh do?\"",
      "• \"Help me get started\"",
      "• \"How do I connect an AI model?\"",
      note,
    ].filter(Boolean).join("\n");
  },
};

const ZH_TEMPLATES: ResponseTemplates = {
  findContacts: (n) => {
    const hint = n > 0
      ? ` 你在设置时选择了 ${n} 个兴趣 — 我们已经帮你搜索了兴趣相投的人。`
      : " 试着在个人资料中选择几个兴趣，这样我们就能帮你匹配志同道合的人。";
    return [
      "📋 **在 EnvoyMesh 上找联系人**",
      "",
      "以下是几种找人的方式：",
      "",
      "1. **发现页** — 打开「发现」查看与你兴趣相投的人，按姓名/话题/位置搜索，或扫描同一 Wi-Fi 上的附近用户。",
      "2. **联系人链接** — 如果朋友发给你 `envoy://contact?...` 链接，粘贴到「发现」→ 粘贴联系人链接。",
      "3. **公司邀请** — 如果你的团队使用 EnvoyMesh，粘贴 `envoy://invite?token=...` 链接到「发现」。",
      "",
      hint.trim(),
      "",
      "打招呼后对方接受，他们就会出现在你的聊天侧边栏。",
    ].join("\n");
  },
  whatCanDo: () =>
    [
      "✨ **EnvoyMesh 能做什么**",
      "",
      "**通讯：**",
      "• 与绑定的联系人私聊和群聊",
      "• 语音消息（在任何聊天中录制和发送）",
      "• 语音/视频通话（点对点，无中央服务器）",
      "• 基于策略的文件共享",
      "",
      "**AI 代理（就是我！）：**",
      "• 用你的知识库回答问题（RAG）",
      "• 帮你起草消息、总结对话",
      "• 跨联系人的代理运行多智能体任务链",
      "• 在网格上搜索知识",
      "",
      "**隐私与自主权：**",
      "• 你的密钥、你的数据 — 无中央账户服务器",
      "• 信任等级控制每个联系人能访问什么",
      "• 所有操作都可签名、可审计",
      "",
      "连接一个模型（设置 → AI）来解锁我的全部能力！",
    ].join("\n"),
  getStarted: (bondCount, hasModel) => {
    const steps: string[] = ["🚀 **EnvoyMesh 新手入门**", ""];
    if (bondCount === 0) {
      steps.push("1. **找到你的第一个联系人** — 去「发现」向兴趣相投的人打招呼。");
    } else {
      steps.push(`1. ✅ 你已有 ${bondCount} 个联系人 — 开始聊天吧！`);
    }
    if (!hasModel) {
      steps.push("2. **连接 AI 模型**（可选）— 设置 → AI → 配置。有了模型我能做得更多。");
    } else {
      steps.push("2. ✅ AI 模型已配置 — 随便问我什么！");
    }
    steps.push("3. **探索** — 试试「资料库」（你的文件）、「Chains」（多智能体任务）和「设置」。", "", "慢慢来 — 不着急。随时问我任何问题！");
    return steps.join("\n");
  },
  configModel: () =>
    [
      "🔧 **连接 AI 模型**",
      "",
      "要解锁我的全部能力，连接一个模型提供商：",
      "",
      "1. 进入 **设置 → AI**",
      "2. 在 **模型提供商** 下选择：",
      "   • **OpenAI 兼容** — OpenAI、Groq、Together 等",
      "   • **Anthropic 兼容** — Claude 模型",
      "   • **Ollama** — 本地模型（免费，在你的机器上运行）",
      "   • **LiteLLM** — 代理到任何提供商",
      "3. 输入端点、模型名称和 API 密钥",
      "4. 保存，我就完全启用了！",
      "",
      "**提示：** Ollama 免费且私密 — 从 ollama.com 安装，拉取一个模型如 `llama3.2`。",
    ].join("\n"),
  chains: () =>
    [
      "🔗 **多智能体任务链**",
      "",
      "任务链让你的代理把一个复杂目标分解给你的联系人的代理。",
      "",
      "启动一个任务链：",
      "1. 打开 **Chains** 标签",
      "2. 点击 **新建任务链**",
      "3. 描述你的目标（如「研究本地 LLM 基准测试并总结前 3 个」）",
      "4. 预览计划，然后启动",
      "",
      "你需要至少一个有活跃代理的绑定联系人才能使用任务链。",
    ].join("\n"),
  privacy: () =>
    [
      "🔒 **EnvoyMesh 的隐私与安全**",
      "",
      "• **无中央服务器** — 你的身份是加密的，不是账户",
      "• **签名消息** — 每条消息都经过 Ed25519 签名",
      "• **信任等级** — 每个联系人都有等级，控制其访问权限",
      "• **本地优先** — 你的数据留在你的设备上，除非你主动分享",
      "",
      "一切由你掌控。在聊天侧边栏菜单中拉黑任何联系人。",
    ].join("\n"),
  generic: (hasModel) => {
    const note = hasModel ? "" : "\n\n💡 *我正在有限模式下运行。在设置 → AI 中连接模型以获得完整的 AI 能力。*";
    return [
      "我是你的 Envoy 助手！我可以帮你找联系人、解释功能、引导你使用 EnvoyMesh。",
      "",
      "试试问我：",
      "• \"如何找联系人？\"",
      "• \"EnvoyMesh 能做什么？\"",
      "• \"帮我入门\"",
      "• \"如何连接 AI 模型？\"",
      note,
    ].filter(Boolean).join("\n");
  },
};

function getTemplates(locale?: string): ResponseTemplates {
  if (locale?.startsWith("zh")) return ZH_TEMPLATES;
  return EN_TEMPLATES;
}

// ---------------------------------------------------------------------------
// Intent keywords — match English + Chinese
// ---------------------------------------------------------------------------

type Intent = {
  keywords: RegExp;
  respond: (state: ScriptedTutorState, templates: ResponseTemplates) => string;
};

const INTENTS: Intent[] = [
  {
    keywords: /how.{0,5}(do|i|to).{0,10}(find|get|add|meet).{0,10}(contact|friend|people|peer|connect)/i,
    respond: (s, t) => t.findContacts(s.interestCount),
  },
  {
    // Chinese: 如何/怎么 找/加 联系人/朋友
    keywords: /(如何|怎么|怎样).{0,6}(找|加|添加|认识).{0,6}(联系人|朋友|人|伙伴)/,
    respond: (s, t) => t.findContacts(s.interestCount),
  },
  {
    keywords: /what.{0,10}(can|do).{0,10}(you|envoy|envoymesh).{0,10}(do|help|offer)/i,
    respond: (_s, t) => t.whatCanDo(),
  },
  {
    // Chinese: 能做什么/有什么功能/帮助
    keywords: /(能做什么|有什么功能|有什么用|能帮我|介绍)/,
    respond: (_s, t) => t.whatCanDo(),
  },
  {
    keywords: /(get started|getting started|new here|begin|setup|onboard|入门|新手|开始)/i,
    respond: (s, t) => t.getStarted(s.bondCount, s.hasModel),
  },
  {
    keywords: /(config|setup|connect|add).{0,10}(model|ai|openai|anthropic|ollama|provider)/i,
    respond: (_s, t) => t.configModel(),
  },
  {
    // Chinese: 配置/设置 模型/AI
    keywords: /(如何|怎么).{0,4}(配置|设置|连接).{0,6}(模型|AI|人工智能)/,
    respond: (_s, t) => t.configModel(),
  },
  {
    keywords: /(chain|multi.?agent|task|orchestrat)/i,
    respond: (_s, t) => t.chains(),
  },
  {
    keywords: /(任务链|多智能体|协作链|chain)/i,
    respond: (_s, t) => t.chains(),
  },
  {
    keywords: /(safe|secure|privacy|private|trust|encrypt)/i,
    respond: (_s, t) => t.privacy(),
  },
  {
    keywords: /(安全|隐私|私密|信任|加密)/,
    respond: (_s, t) => t.privacy(),
  },
];

/**
 * Try to produce a scripted tutor reply. Returns the response string, or
 * `null` when the caller should use the LLM / native planner instead.
 *
 * **Only active when no model is configured** (`hasModel === false`). When a
 * model IS configured, always returns `null`.
 *
 * When `hasModel === false`, always returns a response (never null) so the
 * user gets feedback even for non-onboarding messages.
 */
export function getScriptedTutorReply(
  message: string,
  state: ScriptedTutorState,
): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  // If a model is configured, the scripted tutor is never used.
  if (state.hasModel) return null;

  const templates = getTemplates(state.locale);

  // No model — try intent matching for onboarding questions.
  for (const intent of INTENTS) {
    if (intent.keywords.test(trimmed)) {
      return intent.respond(state, templates);
    }
  }

  // No intent matched + no model → generic helpful response.
  return templates.generic(state.hasModel);
}
