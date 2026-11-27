#!/usr/bin/env python3
"""Inject Step 1–6 UX l10n getters into generated AppLocalizations files."""

from __future__ import annotations

ANCHOR = "  String get connTooltipError;"
ANCHOR_EN = "  String get connTooltipError => 'Connection error';"
ANCHOR_ZH = "  String get connTooltipError => '连接错误';"
# Other locales currently mirror English for this key.
ANCHOR_OTHER = ANCHOR_EN

ABSTRACT = '''
  /// Home node error / offline UX (EnvoyGo UX steps).
  String get homeErrorUnauthorized;
  String get homeErrorTransport;
  String get homeErrorNoCandidates;
  String get homeErrorOffline;
  String get homeErrorGeneric;
  String get homeOfflineBannerTitle;
  String get homeOfflineBannerSubtitle;
  String get homeOfflineBannerReconnecting;
  String get meHomeFiles;
  String get meHomeFilesHint;
  String get meSectionDailyTools;
  String get meSectionHomeAi;
  String get meSectionAccount;
  String get meOwnerProfileHint;
  String get meFamilyProfileHint;
  String get meCodingMovedTip;
  String get meCodingMovedTipDismiss;
  String get meThemeLight;
  String get meThemeDark;
  String get meThemeSystem;
  String get meThemeTitle;
  String codingNotReadySummary(int count);
  String get codingOpenCodingTools;
  String get codingGatedFamilyHint;
  String get knowledgeEmptyTitle;
  String get knowledgeEmptyBody;
  String get knowledgeEmptyCta;
  String get termEmptyTitle;
  String get termEmptyBody;
  String get termEmptyCta;
  String get inboxIntroApprove;
  String get inboxIntroDecline;
  String get inboxIntroEmptyReal;
  String get inboxIntroApproveFailed;
  String get inboxIntroHelloFailed;
  String get inboxIntroDeclineFailed;
'''

EN = '''
  @override
  String get homeErrorUnauthorized => 'Session expired — scan the home QR again.';
  @override
  String get homeErrorTransport => 'Can\\'t reach your home computer. Try the same Wi‑Fi, or check that the home app is running.';
  @override
  String get homeErrorNoCandidates => 'No way to reach home yet. Add a public address, or open the home app on the same network.';
  @override
  String get homeErrorOffline => 'You\\'re offline. Reconnect when you have network again.';
  @override
  String get homeErrorGeneric => 'Couldn\\'t connect to home. Try again in a moment.';
  @override
  String get homeOfflineBannerTitle => 'Home is unreachable';
  @override
  String get homeOfflineBannerSubtitle => 'Tap for details and reconnect';
  @override
  String get homeOfflineBannerReconnecting => 'Reconnecting to home…';
  @override
  String get meHomeFiles => 'Home files';
  @override
  String get meHomeFilesHint => 'Browse files on your home computer';
  @override
  String get meSectionDailyTools => 'Daily tools';
  @override
  String get meSectionHomeAi => 'Home & AI';
  @override
  String get meSectionAccount => 'Account';
  @override
  String get meOwnerProfileHint => 'Owner · full home tools';
  @override
  String get meFamilyProfileHint => 'Family · Chats and Me';
  @override
  String get meCodingMovedTip => 'Coding moved here from the bottom bar. Open it anytime from Me.';
  @override
  String get meCodingMovedTipDismiss => 'Got it';
  @override
  String get meThemeLight => 'Light';
  @override
  String get meThemeDark => 'Dark';
  @override
  String get meThemeSystem => 'System';
  @override
  String get meThemeTitle => 'Appearance';
  @override
  String codingNotReadySummary(int count) => '$count more agents aren’t ready on this computer.';
  @override
  String get codingOpenCodingTools => 'Open Coding tools';
  @override
  String get codingGatedFamilyHint => 'Ask the home owner to turn on Coding for your profile in Family settings.';
  @override
  String get knowledgeEmptyTitle => 'No knowledge yet';
  @override
  String get knowledgeEmptyBody => 'Notes and library items from your home node appear here. Create a note to get started.';
  @override
  String get knowledgeEmptyCta => 'New note';
  @override
  String get termEmptyTitle => 'No terminals yet';
  @override
  String get termEmptyBody => 'Open a shell on your home computer from here. Coding agents live under Me → Coding.';
  @override
  String get termEmptyCta => 'New terminal';
  @override
  String get inboxIntroApprove => 'Approve';
  @override
  String get inboxIntroDecline => 'Decline';
  @override
  String get inboxIntroEmptyReal => 'No intro proposals waiting.';
  @override
  String get inboxIntroApproveFailed => 'Couldn\\'t approve that intro. Try again.';
  @override
  String get inboxIntroDeclineFailed => 'Couldn\\'t decline that intro. Try again.';
'''

ZH = '''
  @override
  String get homeErrorUnauthorized => '会话已过期——请重新扫描家中节点的二维码。';
  @override
  String get homeErrorTransport => '无法连到家中电脑。请确认同一 Wi‑Fi，或家中应用正在运行。';
  @override
  String get homeErrorNoCandidates => '暂时没有可达路径。请添加公网地址，或在同一网络打开家中应用。';
  @override
  String get homeErrorOffline => '当前离线。有网络后再重连。';
  @override
  String get homeErrorGeneric => '无法连接家中节点，请稍后再试。';
  @override
  String get homeOfflineBannerTitle => '家中节点不可达';
  @override
  String get homeOfflineBannerSubtitle => '点按查看详情并重连';
  @override
  String get homeOfflineBannerReconnecting => '正在重连家中节点…';
  @override
  String get meHomeFiles => '家中文件';
  @override
  String get meHomeFilesHint => '浏览家中电脑上的文件';
  @override
  String get meSectionDailyTools => '日常工具';
  @override
  String get meSectionHomeAi => '家中与 AI';
  @override
  String get meSectionAccount => '账户';
  @override
  String get meOwnerProfileHint => '所有者 · 完整家中工具';
  @override
  String get meFamilyProfileHint => '家庭成员 · 聊天与我';
  @override
  String get meCodingMovedTip => '编程已从底部栏移到这里。随时可从「我」打开。';
  @override
  String get meCodingMovedTipDismiss => '知道了';
  @override
  String get meThemeLight => '浅色';
  @override
  String get meThemeDark => '深色';
  @override
  String get meThemeSystem => '跟随系统';
  @override
  String get meThemeTitle => '外观';
  @override
  String codingNotReadySummary(int count) => '另有 $count 个智能体在本机尚未就绪。';
  @override
  String get codingOpenCodingTools => '打开编程工具';
  @override
  String get codingGatedFamilyHint => '请让家中所有者在家庭设置里为你的资料开启编程。';
  @override
  String get knowledgeEmptyTitle => '还没有知识库内容';
  @override
  String get knowledgeEmptyBody => '家中节点上的笔记和资料会出现在这里。可以先新建一条笔记。';
  @override
  String get knowledgeEmptyCta => '新建笔记';
  @override
  String get termEmptyTitle => '还没有终端';
  @override
  String get termEmptyBody => '从这里打开家中电脑的 shell。编程代理在「我 → 编程」。';
  @override
  String get termEmptyCta => '新建终端';
  @override
  String get inboxIntroApprove => '同意';
  @override
  String get inboxIntroDecline => '拒绝';
  @override
  String get inboxIntroEmptyReal => '暂无待处理的介绍提议。';
  @override
  String get inboxIntroApproveFailed => '无法同意该介绍，请重试。';
  @override
  String get inboxIntroDeclineFailed => '无法拒绝该介绍，请重试。';
'''


def inject(path: str, anchor: str, block: str) -> None:
    text = open(path, encoding="utf-8").read()
    if "homeErrorUnauthorized" in text:
        print(f"skip (already present): {path}")
        return
    if anchor not in text:
        raise SystemExit(f"anchor missing in {path}")
    # Insert after the full getter line (and blank line that follows when present).
    idx = text.index(anchor) + len(anchor)
    # Keep following newline(s)
    text = text[:idx] + "\n" + block + text[idx:]
    open(path, "w", encoding="utf-8").write(text)
    print(f"updated: {path}")


def main() -> None:
    base = "apps/envoygo/lib/l10n"
    inject(f"{base}/app_localizations.dart", ANCHOR, ABSTRACT)
    inject(f"{base}/app_localizations_en.dart", ANCHOR_EN, EN)
    inject(f"{base}/app_localizations_zh.dart", ANCHOR_ZH, ZH)
    for loc in ("de", "fr", "it", "ja", "ko"):
        # Prefer locale-specific anchor if translated; else English string.
        path = f"{base}/app_localizations_{loc}.dart"
        text = open(path, encoding="utf-8").read()
        if "String get connTooltipError =>" not in text:
            raise SystemExit(f"no connTooltipError in {path}")
        # Find the exact line
        for line in text.splitlines():
            if line.startswith("  String get connTooltipError =>"):
                inject(path, line, EN)
                break


if __name__ == "__main__":
    main()
