#!/usr/bin/env python3
"""Second-pass cleanup of English fragments in GuideBook zh-CN sections 44-67."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZH = ROOT / "EnvoyMesh_GuideBook_0.1.0.zh-CN.md"

HEADING_FIXES = {
    "#### 45.2 Enable 加入智能体网络": "#### 45.2 启用加入智能体网络",
    "#### 65.1 Created": "#### 65.1 已创建",
    "#### 65.3 Discovering": "#### 65.3 发现中",
    "#### 65.4 Negotiating": "#### 65.4 协商中",
    "#### 65.5 Waiting for a peer": "#### 65.5 等待对等节点",
    "#### 65.6 Waiting for the owner": "#### 65.6 等待所有者",
    "#### 65.7 Running": "#### 65.7 运行中",
    "#### 65.8 Partial": "#### 65.8 部分完成",
    "#### 65.9 Synthesizing": "#### 65.9 综合中",
    "#### 65.10 Completed": "#### 65.10 已完成",
    "#### 65.11 Failed": "#### 65.11 已失败",
    "#### 65.12 Cancelled": "#### 65.12 已取消",
}

REPLACEMENTS = [
    ("多跳 commerce", "多跳商业"),
    ("标注为 Planned、Parked 或 Deferred", "标注为「计划中」「暂缓」或「延期」"),
    ("软 tie-breaker", "软决胜因素"),
    ("wire 意图", "协议意图"),
    ("以便规划器 realistic 拆解", "以便规划器合理拆解"),
    ("批准后再 dispatch", "批准后再下发"),
    ("规划会 early fail", "规划会提前失败"),
    ("仅在 prerequisite 完成", "仅在先决条件完成"),
    ("那些控制 justify 额外延迟", "那些控制值得额外延迟"),
    ("并在 accept 前收集", "并在接受前收集"),
    ("由所有者选择 accept", "由所有者选择接受"),
    ("对其他 bidder 或重新分配", "对其他竞标者或重新分配"),
    ("以供 re-offer 或回退", "以供再次报价或回退"),
    ("高成本 accept 可能", "高成本接受可能"),
    ("审计记录 capture bid 金额、accepted 对等节点", "审计记录捕获 bid 金额、被接受对等节点"),
    ("crossing 高成本阈值", "跨越高成本阈值"),
    ("注意 waiting-for-所有者 状态", "注意 `waiting_for_owner` 状态"),
    ("accept 后工作节点", "接受后工作节点"),
    ("缺失心跳 feed 停滞检测", "缺失心跳会触发停滞检测"),
    ("收到 cancel 意图", "收到取消意图"),
    ("`iterationState` blob", "`iterationState` 数据块"),
    ("评审 always-stop 或 seal 失败", "评审「始终停止」或 seal 失败"),
    ("所有者 Continue/Accept 决策", "所有者「继续/接受」决策"),
    ("而非 unlimited 所有者权限转移", "而非无限制的所有者权限转移"),
    ("父协调者应 reclaim 分配", "父协调者应收回分配"),
    ("从各 awarded 工作节点收集", "从各已授予工作节点收集"),
    ("JSON 或 typed 记录", "JSON 或类型化记录"),
    ("接收时 validator 检查形状", "接收时校验器检查结构"),
    ("复合交付物 bundling", "复合交付物捆绑"),
    ("emphasize 更高信心", "突出更高信心"),
    ("best-effort 合并后", "尽力合并后"),
    ("增加重新分配 churn", "增加重新分配周转"),
    ("隐藏成本 UI 不 remove 账本跟踪", "隐藏成本 UI 不取消账本跟踪"),
    ("同步时 inline 阅读", "同步时内联阅读"),
    ("有意 omit 这些 mutating RPC", "有意省略这些会改变状态的 RPC"),
    ("**所有者授权** authorize 请求的", "**所有者授权**授权请求的"),
    ("downgrade 或拒绝", "降级或拒绝"),
    ("exfiltrate 到 public", "外泄到 public"),
    ("无法 bypass 审批队列", "无法绕过审批队列"),
    ("远程协调者 never 收到", "远程协调者从不收到"),
    ("circuit 路径", "电路路径"),
    ("terminate TLS", "终止 TLS"),
    ("若加入开关不 stick", "若加入开关不生效"),
    ("运行 solo 多智能体 fiction", "假装单节点多智能体执行"),
    ("可能 unblock", "可能解除阻塞"),
    ("显示 deny vs fail 原因", "显示拒绝与失败原因"),
    ("然后 resume", "然后继续"),
    ("父节点应 fail over 或取消", "父节点应故障转移或取消"),
    ("best-effort 终止策略", "尽力终止策略"),
    ("early `task.reject`", "过早 `task.reject`"),
    ("触发 production executor", "触发生产执行器"),
    ("daemon 入站 handler", "守护进程入站处理器"),
    ("令牌按所有者 scope", "令牌按所有者范围"),
    ("Created 表示任务记录", "「已创建」表示任务记录"),
    ("Task planned 表示节点", "「任务已规划」表示节点"),
    ("源 schema 将此状态", "源 schema 将此状态"),
    ("归咎 mesh  outage 前先", "归咎 mesh 中断前先"),
    ("counter-offer 超过授权", "还价超过授权"),
    ("Brain/保险箱 隔离", "Brain/保险箱 隔离"),
    ("工作节点 lineage", "工作节点谱系"),
    ("Completed 为终端", "「已完成」为终端状态"),
    ("Failed 为终端", "「已失败」为终端状态"),
    ("Cancelled 在所有者", "「已取消」在所有者"),
    ("可验证 envelope", "可验证边界"),
    ("production executor 使用", "生产执行器使用"),
    ("拒绝 mid-execution 会调用", "拒绝执行中会调用"),
    ("建联策略 normally 允许", "建联策略通常允许"),
    ("fan-out 任务需", "扇出任务需"),
    ("智能体由 stated 所有者授权", "智能体由所述所有者授权"),
    ("不 bypass Bonds 检查", "不绕过 Bonds 检查"),
    ("可含 media type", "可含媒体类型"),
    ("不需结构化 schema", "不需结构化 schema"),
    ("可选名称、media type 与大小", "可选名称、媒体类型与大小"),
    ("使协作任务归因 survive 综合", "使协作任务归因在综合后仍保留"),
    ("经家庭桥或中继 proxy 上", "经家庭桥或中继代理上"),
    ("gateway URI 而非", "网关 URI 而非"),
    ("敏感度外 handed 跨层级", "敏感度外向跨层级"),
    ("direct 保险箱 路径", "direct 保险箱路径"),
    ("MCP 服务器 adapter 反向", "MCP 服务器适配器反向"),
]

def main() -> None:
    lines = ZH.read_text(encoding="utf-8").splitlines(keepends=True)
    start = next(i for i, l in enumerate(lines) if l.startswith("## 第 VII 部分"))
    end = next(i for i, l in enumerate(lines) if l.startswith("## 第 IX 部分"))
    chunk = "".join(lines[start:end])
    for old, new in HEADING_FIXES.items():
        chunk = chunk.replace(old + "\n", new + "\n")
    for old, new in REPLACEMENTS:
        chunk = chunk.replace(old, new)
    lines[start:end] = [chunk]
    ZH.write_text("".join(lines), encoding="utf-8")
    print(f"Cleaned lines {start+1}-{end} ({len(REPLACEMENTS)} replacements, {len(HEADING_FIXES)} headings)")

if __name__ == "__main__":
    main()
