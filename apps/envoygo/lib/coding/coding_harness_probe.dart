/// Probe Coding harness readiness — EnvoyDev-aligned Ready / Not ready.
library;

import '../services/product/node_service_client.dart';

/// Transient UI state while measuring; never a lasting verdict.
enum CodingHarnessProbeBadge {
  checking,
  ready,
  /// User-facing collapse of install / not-ready / unknown → show "Not ready".
  notReady,
}

/// Why a row is not ready (evidence behind the chip).
enum CodingHarnessNotReadyReason {
  /// Binary missing — run install steps.
  absent,
  /// Present but needs adapter / auth / warm-up (connector-style).
  connector,
  /// Missing env / API key.
  env,
  /// Product cannot drive this agent yet.
  ourGap,
  /// Probe failed or unknown.
  unlooked,
}

enum CodingHarnessGuideKind {
  steps,
  environment,
  app,
  nothing,
}

class CodingHarnessProbeResult {
  const CodingHarnessProbeResult({
    required this.badge,
    this.reason,
    this.line,
    this.hint,
    this.installCommand,
    this.installLink,
    this.startHint,
    this.guideKind = CodingHarnessGuideKind.steps,
  });

  final CodingHarnessProbeBadge badge;
  final CodingHarnessNotReadyReason? reason;
  /// One actionable line under the name (EnvoyDev row line).
  final String? line;
  final String? hint;
  final String? installCommand;
  final String? installLink;
  final String? startHint;
  final CodingHarnessGuideKind guideKind;

  bool get isReady => badge == CodingHarnessProbeBadge.ready;
  bool get needsResolve => badge == CodingHarnessProbeBadge.notReady;
}

/// Collapse wire evidence to the two user-facing verdicts (plus Checking…).
CodingHarnessProbeBadge codingHarnessUserBadge(CodingHarnessProbeBadge badge) {
  return switch (badge) {
    CodingHarnessProbeBadge.checking => CodingHarnessProbeBadge.checking,
    CodingHarnessProbeBadge.ready => CodingHarnessProbeBadge.ready,
    CodingHarnessProbeBadge.notReady => CodingHarnessProbeBadge.notReady,
  };
}

/// [wireId] is `envoy-harness` | `pi` | Tier B id (`claudecode`, `minimax-code`, …).
/// [extAgentId] overrides the Ext Agent probe id when it differs from [wireId].
Future<CodingHarnessProbeResult> probeCodingHarnessByWireId(
  NodeServiceClient client, {
  required String wireId,
  String? extAgentId,
}) async {
  final id = wireId.trim();
  try {
    if (id == 'envoy-harness') {
      final s = await client.getEnvoyHarnessStatus();
      final state = s['state']?.toString() ?? '';
      if (state == 'ready') {
        return const CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.ready,
          line: 'Ready on this home computer.',
        );
      }
      if (state == 'disabled') {
        return CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.notReady,
          reason: CodingHarnessNotReadyReason.env,
          guideKind: CodingHarnessGuideKind.app,
          line: 'Disabled — enable in Settings → AI.',
          hint: s['error']?.toString() ??
              'Configure Envoy Harness in Settings → AI.',
          startHint: 'Settings → AI',
        );
      }
      final err = s['error']?.toString().trim();
      return CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.notReady,
        reason: CodingHarnessNotReadyReason.unlooked,
        guideKind: CodingHarnessGuideKind.app,
        line: (err != null && err.isNotEmpty)
            ? err
            : 'Envoy Harness is not ready yet.',
        hint: (err != null && err.isNotEmpty)
            ? err
            : 'Envoy Harness is not ready yet.',
        startHint: 'Settings → AI',
      );
    }

    if (id == 'pi') {
      final s = await client.getPiStatus();
      final state = s['state']?.toString() ?? '';
      final err = s['error']?.toString().trim();
      // stopped/starting: sendToPi / restartPi can bring it up → Ready for picker.
      if (state == 'ready' || state == 'stopped' || state == 'starting') {
        return CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.ready,
          line: state == 'ready'
              ? 'Ready on this home computer.'
              : 'Will start when you send a message.',
        );
      }
      if (state == 'disabled') {
        return const CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.notReady,
          reason: CodingHarnessNotReadyReason.env,
          guideKind: CodingHarnessGuideKind.app,
          line: 'Disabled — enable in Settings → AI.',
          hint: 'Pi is disabled. Enable it in Settings → AI (Coding agents).',
          startHint: 'Settings → AI → Coding agents',
        );
      }
      if (state == 'not-installed') {
        return const CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.notReady,
          reason: CodingHarnessNotReadyReason.absent,
          guideKind: CodingHarnessGuideKind.nothing,
          line: 'Not bundled on this home node (slim build).',
          hint: 'Pi sidecar is not bundled on this home node (slim build).',
          startHint: 'Use a full desktop build, or pick Envoy / another agent.',
        );
      }
      return CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.notReady,
        reason: CodingHarnessNotReadyReason.unlooked,
        guideKind: CodingHarnessGuideKind.app,
        line: (err != null && err.isNotEmpty)
            ? err
            : 'Pi is not ready.',
        hint: (err != null && err.isNotEmpty)
            ? err
            : 'Pi is not ready. Check Settings → AI model config.',
        startHint: 'Settings → AI',
      );
    }

    final agentId = (extAgentId ?? id).trim();
    final r = await client.probeExtAgent(agentId: agentId);
    final installState = r['installState']?.toString() ?? '';
    final guide = r['installGuide'];
    String? cmd;
    String? link;
    String? startHint;
    String? binaryName;
    if (guide is Map) {
      cmd = guide['installCommand']?.toString().trim();
      link = guide['installLink']?.toString().trim() ??
          guide['homepageUrl']?.toString().trim();
      startHint = guide['startHint']?.toString().trim();
      binaryName = guide['command']?.toString().trim();
    }

    if (installState == 'unsupported') {
      return CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.notReady,
        reason: CodingHarnessNotReadyReason.ourGap,
        guideKind: CodingHarnessGuideKind.nothing,
        line: 'EnvoyGo cannot drive this agent on this machine yet.',
        hint: startHint ?? 'This agent is not supported on this platform.',
        startHint: startHint,
      );
    }

    if (installState == 'not-installed' ||
        (guide is Map && guide['installed'] == false)) {
      final issues = <String>[];
      if (guide is Map && guide['commonIssues'] is List) {
        for (final row in guide['commonIssues'] as List) {
          final s = row?.toString().trim() ?? '';
          if (s.isNotEmpty) issues.add(s);
        }
      }
      final lineCmd =
          (cmd != null && cmd.isNotEmpty) ? cmd : 'Not installed';
      final hint = (startHint != null && startHint.isNotEmpty)
          ? startHint
          : (issues.isNotEmpty
              ? issues.first
              : 'Install this agent on your home computer.');
      return CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.notReady,
        reason: CodingHarnessNotReadyReason.absent,
        guideKind: CodingHarnessGuideKind.steps,
        line: lineCmd,
        hint: hint,
        installCommand: (cmd != null && cmd.isNotEmpty) ? cmd : null,
        installLink: (link != null && link.isNotEmpty) ? link : null,
        startHint: startHint ?? hint,
      );
    }

    if (installState == 'installed' || r['reachable'] == true) {
      // Installed but not reachable → connector / auth style guidance.
      if (r['reachable'] != true &&
          startHint != null &&
          startHint.isNotEmpty) {
        final looksEnv = startHint.contains('API_KEY') ||
            startHint.contains('auth login') ||
            startHint.contains('environment');
        return CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.notReady,
          reason: looksEnv
              ? CodingHarnessNotReadyReason.env
              : CodingHarnessNotReadyReason.connector,
          guideKind: looksEnv
              ? CodingHarnessGuideKind.environment
              : CodingHarnessGuideKind.steps,
          line: looksEnv
              ? startHint
              : 'Installed — needs a short setup step.',
          hint: startHint,
          installCommand: (cmd != null && cmd.isNotEmpty) ? cmd : null,
          installLink: (link != null && link.isNotEmpty) ? link : null,
          startHint: startHint,
        );
      }
      return CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.ready,
        line: binaryName != null && binaryName.isNotEmpty
            ? 'Ready ($binaryName).'
            : 'Ready on this home computer.',
        hint: startHint,
      );
    }

    return CodingHarnessProbeResult(
      badge: CodingHarnessProbeBadge.notReady,
      reason: CodingHarnessNotReadyReason.unlooked,
      guideKind: CodingHarnessGuideKind.steps,
      line: startHint ?? 'Could not confirm install status.',
      hint: startHint ?? 'Could not confirm install status.',
      installCommand: (cmd != null && cmd.isNotEmpty) ? cmd : null,
      installLink: (link != null && link.isNotEmpty) ? link : null,
      startHint: startHint,
    );
  } catch (e) {
    return CodingHarnessProbeResult(
      badge: CodingHarnessProbeBadge.notReady,
      reason: CodingHarnessNotReadyReason.unlooked,
      guideKind: CodingHarnessGuideKind.app,
      line: e.toString().replaceFirst('Exception: ', ''),
      hint: e.toString().replaceFirst('Exception: ', ''),
    );
  }
}
