import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_harness_probe.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../utils/open_external_url.dart';
import '../coding/coding_new_task_sheet.dart'
    show
        CodingHarnessChoice,
        codingHarnessDisplayName,
        codingHarnessToExtAgentId,
        codingHarnessWireId;
import 'pi_settings_screen.dart';

const _builtInChoices = <CodingHarnessChoice>[
  CodingHarnessChoice.envoyHarness,
  CodingHarnessChoice.pi,
];

const _externalChoices = <CodingHarnessChoice>[
  CodingHarnessChoice.claudeCode,
  CodingHarnessChoice.codex,
  CodingHarnessChoice.openCode,
  CodingHarnessChoice.cursor,
  CodingHarnessChoice.codeWhale,
  CodingHarnessChoice.minimaxCode,
];

const _allHarnessChoices = <CodingHarnessChoice>[
  ..._builtInChoices,
  ..._externalChoices,
];

/// Settings → Coding tools — built-in Envoy/Pi + external CLIs Coding can use.
class CodingAgentsSettingsScreen extends ConsumerStatefulWidget {
  const CodingAgentsSettingsScreen({super.key});

  @override
  ConsumerState<CodingAgentsSettingsScreen> createState() =>
      _CodingAgentsSettingsScreenState();
}

class _CodingAgentsSettingsScreenState
    extends ConsumerState<CodingAgentsSettingsScreen> {
  var _probing = false;
  CodingHarnessChoice? _expanded;

  static bool _isFirstRunHint(String text) {
    final lower = text.toLowerCase();
    return lower.contains('fetched from npm') ||
        lower.contains('fetched from pypi');
  }
  Map<CodingHarnessChoice, CodingHarnessProbeResult> _probes = {
    for (final h in _allHarnessChoices)
      h: const CodingHarnessProbeResult(badge: CodingHarnessProbeBadge.checking),
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_probeAll());
    });
  }

  Future<void> _probeAll() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    setState(() {
      _probing = true;
      _probes = {
        for (final h in _allHarnessChoices)
          h: const CodingHarnessProbeResult(
            badge: CodingHarnessProbeBadge.checking,
          ),
      };
    });
    final next = <CodingHarnessChoice, CodingHarnessProbeResult>{};
    await Future.wait(
      _allHarnessChoices.map((h) async {
        next[h] = await probeCodingHarnessByWireId(
          client,
          wireId: codingHarnessWireId(h),
          extAgentId: codingHarnessToExtAgentId(h),
        );
      }),
    );
    if (!mounted) return;
    setState(() {
      _probes = next;
      _probing = false;
    });
  }

  String _name(AppLocalizations l10n, CodingHarnessChoice h) {
    return switch (h) {
      CodingHarnessChoice.minimaxCode => l10n.codingHarnessMinimax,
      CodingHarnessChoice.envoyHarness => l10n.chatsCodingEh,
      CodingHarnessChoice.pi => l10n.chatsCodingPi,
      _ => codingHarnessDisplayName(h),
    };
  }

  Future<void> _copyCmd(String cmd) async {
    await Clipboard.setData(ClipboardData(text: cmd));
    if (!mounted) return;
    final l10n = AppLocalizations.of(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l10n.codingHarnessCmdCopied)),
    );
  }

  Widget _verdictChip({
    required CodingHarnessChoice choice,
    required CodingHarnessProbeResult probe,
    required AppLocalizations l10n,
    required ColorScheme scheme,
  }) {
    final badge = probe.badge;
    if (badge == CodingHarnessProbeBadge.checking) {
      return Text(
        l10n.codingHarnessChecking,
        style: TextStyle(
          color: scheme.outline,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      );
    }
    if (badge == CodingHarnessProbeBadge.ready) {
      return Text(
        l10n.codingExtReady,
        style: TextStyle(
          color: scheme.primary,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      );
    }
    // Not ready — tappable, opens resolve panel (EnvoyDev pattern).
    final open = _expanded == choice;
    return TextButton(
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        foregroundColor: scheme.error,
      ),
      onPressed: () {
        setState(() => _expanded = open ? null : choice);
      },
      child: Text(
        l10n.codingHarnessNotReady,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
      ),
    );
  }

  Widget _guidePanel({
    required CodingHarnessChoice choice,
    required CodingHarnessProbeResult probe,
    required AppLocalizations l10n,
  }) {
    final name = _name(l10n, choice);
    final hint = probe.hint?.trim() ?? '';
    final start = probe.startHint?.trim() ?? '';
    final cmd = probe.installCommand?.trim() ?? '';
    final link = probe.installLink?.trim() ?? '';
    final showSteps = probe.guideKind == CodingHarnessGuideKind.steps ||
        probe.guideKind == CodingHarnessGuideKind.environment;
    final showNothing = probe.guideKind == CodingHarnessGuideKind.nothing;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            hint.isNotEmpty ? hint : l10n.codingHarnessResolveBody(name),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (start.isNotEmpty && start != hint) ...[
            const SizedBox(height: 8),
            Text(start, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (showSteps && cmd.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              _isFirstRunHint(hint) || _isFirstRunHint(start)
                  ? l10n.codingHarnessFirstRunCmd
                  : l10n.codingHarnessInstallCmd,
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 4),
            SelectableText(
              cmd,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => unawaited(_copyCmd(cmd)),
                child: Text(l10n.codingHarnessCopyCmd),
              ),
            ),
          ],
          if (showNothing) ...[
            const SizedBox(height: 8),
            Text(
              l10n.codingHarnessOurGap,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
          Row(
            children: [
              if (link.isNotEmpty && showSteps)
                TextButton(
                  onPressed: () => unawaited(openExternalUrl(link)),
                  child: Text(l10n.codingHarnessOpenDocs),
                ),
              if (choice == CodingHarnessChoice.pi)
                TextButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const PiSettingsScreen(),
                      ),
                    );
                  },
                  child: Text(l10n.codingAgentsPiSettings),
                ),
              const Spacer(),
              TextButton(
                onPressed: _probing ? null : () => unawaited(_probeAll()),
                child: Text(l10n.commonRefresh),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final client = ref.watch(nodeServiceProvider);
    final readyBuiltIn = _builtInChoices
        .where((h) => _probes[h]?.badge == CodingHarnessProbeBadge.ready)
        .length;
    final readyExternal = _externalChoices
        .where((h) => _probes[h]?.badge == CodingHarnessProbeBadge.ready)
        .length;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.codingAgentsSettingsTitle),
        actions: [
          if (_probing)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            IconButton(
              tooltip: l10n.codingAgentsRecheck,
              onPressed: client == null ? null : () => unawaited(_probeAll()),
              icon: const Icon(Icons.refresh),
            ),
        ],
      ),
      body: client == null
          ? Center(child: Text(l10n.settingsNotConnectedNode))
          : ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(
                    l10n.codingAgentsSettingsIntro,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(
                    l10n.codingAgentsGroupBuiltIn(
                      readyBuiltIn,
                      _builtInChoices.length,
                    ),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                for (final h in _builtInChoices) _agentRow(h, l10n, scheme),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Text(
                    l10n.codingAgentsGroupExternal(
                      readyExternal,
                      _externalChoices.length,
                    ),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text(
                    l10n.codingAgentsExternalHint,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ),
                for (final h in _externalChoices) _agentRow(h, l10n, scheme),
                const SizedBox(height: 24),
              ],
            ),
    );
  }

  Widget _agentRow(
    CodingHarnessChoice h,
    AppLocalizations l10n,
    ColorScheme scheme,
  ) {
    final probe = _probes[h]!;
    final name = _name(l10n, h);
    final line = probe.line?.trim() ?? '';
    final open =
        _expanded == h && probe.badge == CodingHarnessProbeBadge.notReady;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ListTile(
          title: Text(
            name,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: line.isEmpty
              ? null
              : Text(
                  line,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurfaceVariant,
                    fontFamily: probe.installCommand != null &&
                            line == probe.installCommand
                        ? 'monospace'
                        : null,
                  ),
                ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (h == CodingHarnessChoice.pi)
                IconButton(
                  tooltip: l10n.codingAgentsPiSettings,
                  icon: const Icon(Icons.tune, size: 20),
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const PiSettingsScreen(),
                      ),
                    );
                  },
                ),
              _verdictChip(
                choice: h,
                probe: probe,
                l10n: l10n,
                scheme: scheme,
              ),
            ],
          ),
          onTap: probe.badge == CodingHarnessProbeBadge.notReady
              ? () {
                  setState(() => _expanded = open ? null : h);
                }
              : null,
        ),
        if (open) _guidePanel(choice: h, probe: probe, l10n: l10n),
        const Divider(height: 1),
      ],
    );
  }
}
