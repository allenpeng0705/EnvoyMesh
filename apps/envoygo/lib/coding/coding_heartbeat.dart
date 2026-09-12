/// Phase 68-C6 — Coding heartbeats (Dart port of `packages/api/src/coding-heartbeat.ts`).
///
/// A heartbeat wakes an **existing** Coding workspace on a cron with a prompt.
/// Full Schedules (new workspace each run) are separate and not in this module.
library;

const maxCodingHeartbeats = 20;

/// UI presets → 5-field cron (UTC). Custom cron remains allowed.
const codingHeartbeatCronPresets = <String, String>{
  '5m': '*/5 * * * *',
  '15m': '*/15 * * * *',
  '1h': '0 * * * *',
  'daily': '0 9 * * *',
};

typedef CodingHeartbeatCronPreset = String;

sealed class CodingHeartbeatTarget {
  const CodingHeartbeatTarget();

  Map<String, dynamic> toJson();

  static CodingHeartbeatTarget? tryParse(Object? value) {
    if (value is! Map) return null;
    final m = Map<String, dynamic>.from(value);
    final kind = m['kind']?.toString();
    if (kind == 'eh') {
      final chatId = (m['chatId'] is String) ? (m['chatId'] as String).trim() : '';
      if (chatId.isEmpty) return null;
      return CodingHeartbeatTargetEh(chatId: chatId);
    }
    if (kind == 'pi') {
      final sessionId =
          (m['sessionId'] is String) ? (m['sessionId'] as String).trim() : '';
      if (sessionId.isEmpty) return null;
      return CodingHeartbeatTargetPi(sessionId: sessionId);
    }
    if (kind == 'ext') {
      final sessionId =
          (m['sessionId'] is String) ? (m['sessionId'] as String).trim() : '';
      final agentId =
          (m['agentId'] is String) ? (m['agentId'] as String).trim() : '';
      if (sessionId.isEmpty || agentId.isEmpty) return null;
      return CodingHeartbeatTargetExt(sessionId: sessionId, agentId: agentId);
    }
    return null;
  }
}

class CodingHeartbeatTargetEh extends CodingHeartbeatTarget {
  const CodingHeartbeatTargetEh({required this.chatId});

  final String chatId;

  @override
  Map<String, dynamic> toJson() => {'kind': 'eh', 'chatId': chatId.trim()};
}

class CodingHeartbeatTargetPi extends CodingHeartbeatTarget {
  const CodingHeartbeatTargetPi({required this.sessionId});

  final String sessionId;

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'pi',
        'sessionId': sessionId.trim(),
      };
}

class CodingHeartbeatTargetExt extends CodingHeartbeatTarget {
  const CodingHeartbeatTargetExt({
    required this.sessionId,
    required this.agentId,
  });

  final String sessionId;
  final String agentId;

  @override
  Map<String, dynamic> toJson() => {
        'kind': 'ext',
        'sessionId': sessionId.trim(),
        'agentId': agentId.trim(),
      };
}

class CodingHeartbeat {
  const CodingHeartbeat({
    required this.id,
    required this.name,
    required this.cron,
    required this.prompt,
    required this.target,
    required this.enabled,
    required this.runCount,
    required this.createdAt,
    required this.updatedAt,
    this.timezone,
    this.maxRuns,
    this.lastFiredAt,
    this.lastError,
  });

  final String id;
  final String name;
  final String cron;
  final String? timezone;
  final String prompt;
  final CodingHeartbeatTarget target;
  final bool enabled;
  final int? maxRuns;
  final int runCount;
  final String? lastFiredAt;
  final String? lastError;
  final String createdAt;
  final String updatedAt;

  factory CodingHeartbeat.fromJson(Map<String, dynamic> json) {
    final target = CodingHeartbeatTarget.tryParse(json['target']);
    if (target == null) {
      throw const FormatException('invalid coding heartbeat target');
    }
    return CodingHeartbeat(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      cron: json['cron']?.toString() ?? '',
      timezone: json['timezone']?.toString(),
      prompt: json['prompt']?.toString() ?? '',
      target: target,
      enabled: json['enabled'] == true,
      maxRuns: json['maxRuns'] is num ? (json['maxRuns'] as num).toInt() : null,
      runCount: json['runCount'] is num ? (json['runCount'] as num).toInt() : 0,
      lastFiredAt: json['lastFiredAt']?.toString(),
      lastError: json['lastError']?.toString(),
      createdAt: json['createdAt']?.toString() ?? '',
      updatedAt: json['updatedAt']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'cron': cron,
        if (timezone != null) 'timezone': timezone,
        'prompt': prompt,
        'target': target.toJson(),
        'enabled': enabled,
        if (maxRuns != null) 'maxRuns': maxRuns,
        'runCount': runCount,
        if (lastFiredAt != null) 'lastFiredAt': lastFiredAt,
        if (lastError != null) 'lastError': lastError,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class CreateCodingHeartbeatInput {
  const CreateCodingHeartbeatInput({
    required this.name,
    required this.cron,
    required this.prompt,
    required this.target,
    this.timezone,
    this.enabled,
    this.maxRuns,
  });

  final String name;
  final String cron;
  final String? timezone;
  final String prompt;
  final CodingHeartbeatTarget target;
  final bool? enabled;
  final int? maxRuns;

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'cron': cron.trim(),
        if (timezone != null && timezone!.trim().isNotEmpty)
          'timezone': timezone!.trim(),
        'prompt': prompt.trim(),
        'target': target.toJson(),
        if (enabled != null) 'enabled': enabled,
        if (maxRuns != null) 'maxRuns': maxRuns,
      };
}

/// Resolve a preset key or custom cron string.
String resolveCodingHeartbeatCron({
  required String presetOrCustom,
  String? customCron,
}) {
  if (presetOrCustom == 'custom') {
    return (customCron ?? '').trim();
  }
  return codingHeartbeatCronPresets[presetOrCustom] ?? presetOrCustom.trim();
}

/// Basic 5-field cron shape check (does not expand steps).
bool isValidCodingHeartbeatCron(String cron) {
  final parts = cron.trim().split(RegExp(r'\s+'));
  if (parts.length != 5) return false;
  for (final p in parts) {
    if (p == '*') continue;
    final stepMatch = RegExp(r'^\*/(\d+)$').firstMatch(p);
    if (stepMatch != null) {
      final step = int.tryParse(stepMatch.group(1)!);
      if (step == null || step <= 0) return false;
      continue;
    }
    final n = int.tryParse(p);
    if (n == null || n < 0) return false;
  }
  return true;
}

String codingHeartbeatTargetLabel(CodingHeartbeatTarget target) {
  if (target is CodingHeartbeatTargetEh) {
    final id = target.chatId;
    final short = id.length > 8 ? id.substring(0, 8) : id;
    return 'EH · $short';
  }
  if (target is CodingHeartbeatTargetPi) {
    final id = target.sessionId;
    final short = id.length > 8 ? id.substring(0, 8) : id;
    return 'Pi · $short';
  }
  if (target is CodingHeartbeatTargetExt) {
    final id = target.sessionId;
    final short = id.length > 8 ? id.substring(0, 8) : id;
    return '${target.agentId} · $short';
  }
  return '—';
}
