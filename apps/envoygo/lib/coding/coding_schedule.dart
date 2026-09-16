/// Phase 68-C7 — Coding schedules (Dart port of packages/api coding-schedule).
library;

import 'coding_heartbeat.dart';

const maxCodingSchedules = 20;

class CodingSchedule {
  const CodingSchedule({
    required this.id,
    required this.name,
    required this.cron,
    required this.prompt,
    required this.cwd,
    required this.harness,
    required this.enabled,
    required this.runCount,
    required this.createdAt,
    required this.updatedAt,
    this.timezone,
    this.maxRuns,
    this.lastFiredAt,
    this.lastError,
    this.lastTaskId,
  });

  final String id;
  final String name;
  final String cron;
  final String? timezone;
  final String prompt;
  final String cwd;
  final String harness;
  final bool enabled;
  final int? maxRuns;
  final int runCount;
  final String? lastFiredAt;
  final String? lastError;
  final String? lastTaskId;
  final String createdAt;
  final String updatedAt;

  factory CodingSchedule.fromJson(Map<String, dynamic> json) {
    return CodingSchedule(
      id: (json['id'] as String?)?.trim() ?? '',
      name: (json['name'] as String?)?.trim() ?? '',
      cron: (json['cron'] as String?)?.trim() ?? '',
      timezone: (json['timezone'] as String?)?.trim(),
      prompt: (json['prompt'] as String?)?.trim() ?? '',
      cwd: (json['cwd'] as String?)?.trim() ?? '',
      harness: (json['harness'] as String?)?.trim() ?? 'envoy-harness',
      enabled: json['enabled'] != false,
      maxRuns: json['maxRuns'] is int ? json['maxRuns'] as int : null,
      runCount: json['runCount'] is int ? json['runCount'] as int : 0,
      lastFiredAt: (json['lastFiredAt'] as String?)?.trim(),
      lastError: (json['lastError'] as String?)?.trim(),
      lastTaskId: (json['lastTaskId'] as String?)?.trim(),
      createdAt: (json['createdAt'] as String?)?.trim() ?? '',
      updatedAt: (json['updatedAt'] as String?)?.trim() ?? '',
    );
  }

  Map<String, dynamic> toCreateJson() => {
        'name': name,
        'cron': cron,
        if (timezone != null && timezone!.isNotEmpty) 'timezone': timezone,
        'prompt': prompt,
        'cwd': cwd,
        'harness': harness,
        'enabled': enabled,
        if (maxRuns != null) 'maxRuns': maxRuns,
      };
}

class CreateCodingScheduleInput {
  const CreateCodingScheduleInput({
    required this.name,
    required this.cron,
    required this.prompt,
    required this.cwd,
    required this.harness,
    this.timezone,
    this.enabled = true,
    this.maxRuns,
  });

  final String name;
  final String cron;
  final String? timezone;
  final String prompt;
  final String cwd;
  final String harness;
  final bool enabled;
  final int? maxRuns;

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'cron': cron.trim(),
        if (timezone != null && timezone!.trim().isNotEmpty)
          'timezone': timezone!.trim(),
        'prompt': prompt.trim(),
        'cwd': cwd.trim(),
        'harness': harness.trim(),
        'enabled': enabled,
        if (maxRuns != null) 'maxRuns': maxRuns,
      };
}

bool isValidCodingScheduleCron(String cron) =>
    isValidCodingHeartbeatCron(cron);
