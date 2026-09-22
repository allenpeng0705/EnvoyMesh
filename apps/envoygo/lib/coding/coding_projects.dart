/// Client-side Coding project registry (port of Social coding-projects.ts).
///
/// Home-node Project registry comes later — paths live in SharedPreferences
/// and are seeded from existing task cwds.
library;

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const kCodingProjectsKey = 'envoymesh.codingProjects';
const kCodingProjectsDismissedKey = 'envoymesh.codingProjects.dismissed';
const kCodingDefaultsKey = 'envoymesh.coding.defaults';
const kCodingLastPrefillKey = 'envoymesh.coding.lastWorkspacePrefill';

class CodingProject {
  const CodingProject({
    required this.path,
    required this.label,
    required this.addedAt,
    this.defaultHarness,
    this.defaultModel,
    this.defaultProviderKind,
    this.defaultEndpoint,
    this.defaultApiKey,
  });

  final String path;
  final String label;
  final String addedAt;
  final String? defaultHarness;
  final String? defaultModel;
  final String? defaultProviderKind;
  final String? defaultEndpoint;
  final String? defaultApiKey;

  Map<String, dynamic> toJson() => {
        'path': path,
        'label': label,
        'addedAt': addedAt,
        if (defaultHarness != null) 'defaultHarness': defaultHarness,
        if (defaultModel != null) 'defaultModel': defaultModel,
        if (defaultProviderKind != null)
          'defaultProviderKind': defaultProviderKind,
        if (defaultEndpoint != null) 'defaultEndpoint': defaultEndpoint,
        if (defaultApiKey != null) 'defaultApiKey': defaultApiKey,
      };

  factory CodingProject.fromJson(Map<String, dynamic> json) {
    final path = normalizeCodingProjectPath(
      (json['path'] as String?) ?? '',
    );
    return CodingProject(
      path: path,
      label: (json['label'] as String?)?.trim() ?? '',
      addedAt: (json['addedAt'] as String?)?.trim() ??
          DateTime.now().toUtc().toIso8601String(),
      defaultHarness: (json['defaultHarness'] as String?)?.trim(),
      defaultModel: (json['defaultModel'] as String?)?.trim(),
      defaultProviderKind: (json['defaultProviderKind'] as String?)?.trim(),
      defaultEndpoint: (json['defaultEndpoint'] as String?)?.trim(),
      defaultApiKey: (json['defaultApiKey'] as String?)?.trim(),
    );
  }

  CodingProject copyWith({
    String? label,
    String? defaultHarness,
    String? defaultModel,
    String? defaultProviderKind,
    String? defaultEndpoint,
    String? defaultApiKey,
    bool clearHarness = false,
    bool clearModel = false,
  }) {
    return CodingProject(
      path: path,
      label: label ?? this.label,
      addedAt: addedAt,
      defaultHarness:
          clearHarness ? null : (defaultHarness ?? this.defaultHarness),
      defaultModel: clearModel ? null : (defaultModel ?? this.defaultModel),
      defaultProviderKind: defaultProviderKind ?? this.defaultProviderKind,
      defaultEndpoint: defaultEndpoint ?? this.defaultEndpoint,
      defaultApiKey: defaultApiKey ?? this.defaultApiKey,
    );
  }
}

class CodingDefaults {
  const CodingDefaults({
    this.harness = 'envoy-harness',
    this.model = '',
    this.providerKind = '',
    this.endpoint = '',
    this.apiKey = '',
  });

  final String harness;
  final String model;
  final String providerKind;
  final String endpoint;
  final String apiKey;

  Map<String, dynamic> toJson() => {
        'harness': harness,
        'model': model,
        'providerKind': providerKind,
        'endpoint': endpoint,
        'apiKey': apiKey,
      };

  factory CodingDefaults.fromJson(Map<String, dynamic> json) {
    return CodingDefaults(
      harness: (json['harness'] as String?)?.trim().isNotEmpty == true
          ? (json['harness'] as String).trim()
          : 'envoy-harness',
      model: (json['model'] as String?)?.trim() ?? '',
      providerKind: (json['providerKind'] as String?)?.trim() ?? '',
      endpoint: (json['endpoint'] as String?)?.trim() ?? '',
      apiKey: (json['apiKey'] as String?)?.trim() ?? '',
    );
  }
}

class CodingTaskPrefill {
  const CodingTaskPrefill({
    required this.harness,
    this.model = '',
    this.providerKind = '',
    this.endpoint = '',
    this.apiKey = '',
    this.cwd = '',
  });

  final String harness;
  final String model;
  final String providerKind;
  final String endpoint;
  final String apiKey;
  final String cwd;
}

String normalizeCodingProjectPath(String path) {
  return path.replaceAll('\\', '/').replaceAll(RegExp(r'/+$'), '').trim();
}

String codingProjectLabelFromPath(String path) {
  final norm = normalizeCodingProjectPath(path);
  if (norm.isEmpty) return path;
  final i = norm.lastIndexOf('/');
  final base = i >= 0 ? norm.substring(i + 1) : norm;
  return base.isEmpty ? path : base;
}

/// Map Coding model + provider kind to an EH host model string (Social parity).
String? codingModelToEhHostModel(String? model, String? providerKind) {
  final m = (model ?? '').trim();
  if (m.isEmpty) return null;
  if (m.contains(':')) return m;
  final kind = (providerKind ?? '').trim();
  if (kind == 'openai-compatible') return 'openai:$m';
  if (kind == 'anthropic-compatible') return 'anthropic:$m';
  return m;
}

/// Prefill for an existing task's agent sheet (Social `codingTaskAgentValue`).
///
/// Strips `openai:` / `anthropic:` host prefixes into [providerKind] so the
/// compatible provider row matches what the desktop modal shows. API keys are
/// never prefilled.
({
  String model,
  String providerKind,
  String endpoint,
}) codingTaskAgentPrefill({
  String? model,
  String? providerKind,
  String? endpoint,
}) {
  var m = (model ?? '').trim();
  var kind = (providerKind ?? '').trim();
  if (kind != 'openai-compatible' && kind != 'anthropic-compatible') {
    kind = '';
  }
  if (kind.isEmpty && m.startsWith('openai:')) {
    kind = 'openai-compatible';
    m = m.substring('openai:'.length).trim();
  } else if (kind.isEmpty && m.startsWith('anthropic:')) {
    kind = 'anthropic-compatible';
    m = m.substring('anthropic:'.length).trim();
  }
  return (
    model: m,
    providerKind: kind,
    endpoint: (endpoint ?? '').trim(),
  );
}

/// Custom OpenAI/Anthropic endpoints: free-text model id only.
List<String> codingCompatibleModelSuggestions(String? providerKind) {
  return const [];
}

/// Models for Envoy Harness and Pi from this node's Settings → AI + EnvoyLocal.
List<String> codingEnvoyHarnessModelSuggestions({
  Map<String, dynamic>? modelProviders,
  List<String>? envoyLocalModelIds,
}) {
  final out = <String>[];
  final seen = <String>{};
  void push(String? raw) {
    final id = (raw ?? '').trim();
    if (id.isEmpty || seen.contains(id)) return;
    seen.add(id);
    out.add(id);
  }

  final providers = modelProviders;
  if (providers != null) {
    push(providers['modelName']?.toString());
    final models = providers['models'];
    if (models is List) {
      for (final row in models) {
        if (row is String) {
          push(row);
        } else if (row is Map) {
          push(row['id']?.toString() ?? row['name']?.toString());
        }
      }
    }
  }
  for (final id in envoyLocalModelIds ?? const <String>[]) {
    push(id);
  }
  return out;
}

/// Suggestions for the model field (Social codingModelSuggestionsForAgent).
List<String> codingModelSuggestionsForAgent({
  required String harness,
  String? providerKind,
  List<String>? catalogModels,
  List<String>? homeModels,
}) {
  final kind = (providerKind ?? '').trim();
  if (kind == 'openai-compatible' || kind == 'anthropic-compatible') {
    return const [];
  }
  final id = harness.trim();
  final source = (id == 'envoy-harness' || id == 'pi')
      ? (homeModels ?? const <String>[])
      : (catalogModels ?? const <String>[]);
  final seen = <String>{};
  final out = <String>[];
  for (final raw in source) {
    final s = raw.trim();
    if (s.isEmpty || seen.contains(s)) continue;
    seen.add(s);
    out.add(s);
  }
  return out;
}

/// Model ids published by an Ext Agent catalog (`probeModels: true`).
List<String> codingCatalogModelsFromResponse(Map<String, dynamic>? catalog) {
  if (catalog == null) return const [];
  final seen = <String>{};
  final out = <String>[];
  void push(String? raw) {
    final id = (raw ?? '').trim();
    if (id.isEmpty || seen.contains(id)) return;
    seen.add(id);
    out.add(id);
  }

  final models = catalog['models'];
  if (models is List) {
    for (final row in models) {
      if (row is String) {
        push(row);
      } else if (row is Map) {
        push(row['id']?.toString() ?? row['model']?.toString());
      }
    }
  }
  final options = catalog['configOptions'] ?? catalog['sessionModels'];
  if (options is List) {
    for (final row in options) {
      if (row is Map) {
        final id = row['id']?.toString() ?? '';
        if (id.contains('model') || row['type']?.toString() == 'model') {
          final current = row['currentValue'] ?? row['value'];
          if (current is String) push(current);
          final values = row['options'] ?? row['values'];
          if (values is List) {
            for (final v in values) {
              if (v is String) {
                push(v);
              } else if (v is Map) {
                push(v['value']?.toString() ?? v['id']?.toString());
              }
            }
          }
        }
      }
    }
  }
  return out;
}

Future<List<CodingProject>> loadCodingProjects() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingProjectsKey);
    if (raw == null || raw.isEmpty) return const [];
    final parsed = jsonDecode(raw);
    if (parsed is! List) return const [];
    final out = <CodingProject>[];
    final seen = <String>{};
    for (final row in parsed) {
      if (row is! Map) continue;
      final p = CodingProject.fromJson(Map<String, dynamic>.from(row));
      if (p.path.isEmpty || seen.contains(p.path)) continue;
      seen.add(p.path);
      out.add(
        p.label.isEmpty
            ? CodingProject(
                path: p.path,
                label: codingProjectLabelFromPath(p.path),
                addedAt: p.addedAt,
                defaultHarness: p.defaultHarness,
                defaultModel: p.defaultModel,
                defaultProviderKind: p.defaultProviderKind,
                defaultEndpoint: p.defaultEndpoint,
                defaultApiKey: p.defaultApiKey,
              )
            : p,
      );
    }
    out.sort((a, b) => b.addedAt.compareTo(a.addedAt));
    return out;
  } catch (_) {
    return const [];
  }
}

Future<void> _saveProjects(List<CodingProject> projects) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingProjectsKey,
    jsonEncode(projects.map((p) => p.toJson()).toList()),
  );
}

Future<Set<String>> _loadDismissed() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingProjectsDismissedKey);
    if (raw == null || raw.isEmpty) return {};
    final parsed = jsonDecode(raw);
    if (parsed is! List) return {};
    return {
      for (final row in parsed)
        if (row != null &&
            normalizeCodingProjectPath(row.toString()).isNotEmpty)
          normalizeCodingProjectPath(row.toString()),
    };
  } catch (_) {
    return {};
  }
}

Future<void> _saveDismissed(Set<String> paths) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingProjectsDismissedKey,
    jsonEncode(paths.toList()),
  );
}

Future<CodingProject> addCodingProject(
  String path, {
  String? label,
  String? defaultHarness,
  String? defaultModel,
  String? defaultProviderKind,
  String? defaultEndpoint,
  String? defaultApiKey,
}) async {
  final p = normalizeCodingProjectPath(path);
  if (p.isEmpty) throw StateError('path required');
  final all = List<CodingProject>.from(await loadCodingProjects());
  final existing = all.indexWhere((x) => x.path == p);
  if (existing >= 0) {
    final cur = all[existing];
    if (defaultHarness == null &&
        defaultModel == null &&
        defaultProviderKind == null &&
        defaultEndpoint == null &&
        defaultApiKey == null) {
      return cur;
    }
    // Fill empty defaults only (match Social addCodingProject).
    all[existing] = cur.copyWith(
      defaultHarness: (defaultHarness ?? '').trim().isNotEmpty &&
              (cur.defaultHarness ?? '').isEmpty
          ? defaultHarness!.trim()
          : null,
      defaultModel: (defaultModel ?? '').trim().isNotEmpty &&
              (cur.defaultModel ?? '').isEmpty
          ? defaultModel!.trim()
          : null,
      defaultProviderKind: (defaultProviderKind ?? '').trim().isNotEmpty &&
              (cur.defaultProviderKind ?? '').isEmpty
          ? defaultProviderKind!.trim()
          : null,
      defaultEndpoint: (defaultEndpoint ?? '').trim().isNotEmpty &&
              (cur.defaultEndpoint ?? '').isEmpty
          ? defaultEndpoint!.trim()
          : null,
      defaultApiKey: (defaultApiKey ?? '').trim().isNotEmpty &&
              (cur.defaultApiKey ?? '').isEmpty
          ? defaultApiKey!.trim()
          : null,
    );
    await _saveProjects(all);
    return all[existing];
  }
  final dismissed = await _loadDismissed();
  dismissed.remove(p);
  await _saveDismissed(dismissed);
  final project = CodingProject(
    path: p,
    label: label?.trim().isNotEmpty == true
        ? label!.trim()
        : codingProjectLabelFromPath(p),
    addedAt: DateTime.now().toUtc().toIso8601String(),
    defaultHarness: (defaultHarness ?? '').trim().isEmpty
        ? null
        : defaultHarness!.trim(),
    defaultModel:
        (defaultModel ?? '').trim().isEmpty ? null : defaultModel!.trim(),
    defaultProviderKind: (defaultProviderKind ?? '').trim().isEmpty
        ? null
        : defaultProviderKind!.trim(),
    defaultEndpoint: (defaultEndpoint ?? '').trim().isEmpty
        ? null
        : defaultEndpoint!.trim(),
    defaultApiKey:
        (defaultApiKey ?? '').trim().isEmpty ? null : defaultApiKey!.trim(),
  );
  all.insert(0, project);
  await _saveProjects(all);
  return project;
}

Future<void> removeCodingProject(String path) async {
  final p = normalizeCodingProjectPath(path);
  final next =
      (await loadCodingProjects()).where((x) => x.path != p).toList();
  await _saveProjects(next);
  final dismissed = await _loadDismissed();
  dismissed.add(p);
  await _saveDismissed(dismissed);
}

Future<void> updateCodingProject(
  String path, {
  String? label,
  String? defaultHarness,
  String? defaultModel,
  String? defaultProviderKind,
  String? defaultEndpoint,
  String? defaultApiKey,
}) async {
  final normalized = normalizeCodingProjectPath(path);
  final all = List<CodingProject>.from(await loadCodingProjects());
  final i = all.indexWhere((x) => x.path == normalized);
  if (i < 0) return;
  all[i] = all[i].copyWith(
    label: label,
    defaultHarness: defaultHarness,
    defaultModel: defaultModel,
    defaultProviderKind: defaultProviderKind,
    defaultEndpoint: defaultEndpoint,
    defaultApiKey: defaultApiKey,
    clearHarness: defaultHarness != null && defaultHarness.trim().isEmpty,
    clearModel: defaultModel != null && defaultModel.trim().isEmpty,
  );
  await _saveProjects(all);
}

/// Seed harness/model defaults on first use (Social seedCodingProjectDefaultsIfEmpty).
Future<CodingProject?> seedCodingProjectDefaultsIfEmpty(
  String path, {
  required String harness,
  String? model,
  String? providerKind,
  String? endpoint,
  String? apiKey,
}) async {
  await addCodingProject(path);
  final projects = await loadCodingProjects();
  final normalized = normalizeCodingProjectPath(path);
  CodingProject? project;
  for (final p in projects) {
    if (p.path == normalized) {
      project = p;
      break;
    }
  }
  if (project == null) return null;
  if ((project.defaultHarness ?? '').trim().isNotEmpty) return project;

  final m = (model ?? '').trim();
  final ep = (endpoint ?? '').trim();
  final key = (apiKey ?? '').trim();
  final pk = (providerKind ?? '').trim();
  await updateCodingProject(
    normalized,
    defaultHarness: harness,
    defaultModel: m.isNotEmpty && (project.defaultModel ?? '').isEmpty ? m : null,
    defaultProviderKind:
        pk.isNotEmpty && (project.defaultProviderKind ?? '').isEmpty ? pk : null,
    defaultEndpoint:
        ep.isNotEmpty && (project.defaultEndpoint ?? '').isEmpty ? ep : null,
    defaultApiKey:
        key.isNotEmpty && (project.defaultApiKey ?? '').isEmpty ? key : null,
  );
  final next = await loadCodingProjects();
  for (final p in next) {
    if (p.path == normalized) return p;
  }
  return project;
}

/// Seed registry from live task cwds (skip dismissed).
Future<void> ensureCodingProjectsFromCwds(Iterable<String> cwds) async {
  final dismissed = await _loadDismissed();
  final all = List<CodingProject>.from(await loadCodingProjects());
  final seen = {for (final p in all) p.path};
  var changed = false;
  for (final raw in cwds) {
    final path = normalizeCodingProjectPath(raw);
    if (path.isEmpty || seen.contains(path) || dismissed.contains(path)) {
      continue;
    }
    all.add(
      CodingProject(
        path: path,
        label: codingProjectLabelFromPath(path),
        addedAt: DateTime.now().toUtc().toIso8601String(),
      ),
    );
    seen.add(path);
    changed = true;
  }
  if (changed) await _saveProjects(all);
}

Future<CodingDefaults> loadCodingDefaults() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingDefaultsKey);
    if (raw == null || raw.isEmpty) return const CodingDefaults();
    final parsed = jsonDecode(raw);
    if (parsed is! Map) return const CodingDefaults();
    return CodingDefaults.fromJson(Map<String, dynamic>.from(parsed));
  } catch (_) {
    return const CodingDefaults();
  }
}

Future<void> saveCodingDefaults(CodingDefaults defaults) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(kCodingDefaultsKey, jsonEncode(defaults.toJson()));
}

Future<CodingTaskPrefill?> loadCodingLastUsedPrefill() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(kCodingLastPrefillKey);
    if (raw == null || raw.isEmpty) return null;
    final parsed = jsonDecode(raw);
    if (parsed is! Map) return null;
    final m = Map<String, dynamic>.from(parsed);
    final harness = (m['harness'] as String?)?.trim() ?? '';
    if (harness.isEmpty) return null;
    return CodingTaskPrefill(
      harness: harness,
      model: (m['model'] as String?)?.trim() ?? '',
      providerKind: (m['providerKind'] as String?)?.trim() ?? '',
      endpoint: (m['endpoint'] as String?)?.trim() ?? '',
      apiKey: (m['apiKey'] as String?)?.trim() ?? '',
      cwd: normalizeCodingProjectPath((m['cwd'] as String?) ?? ''),
    );
  } catch (_) {
    return null;
  }
}

Future<void> saveCodingLastUsedPrefill(CodingTaskPrefill prefill) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(
    kCodingLastPrefillKey,
    jsonEncode({
      'harness': prefill.harness,
      'model': prefill.model,
      'providerKind': prefill.providerKind,
      'endpoint': prefill.endpoint,
      'apiKey': prefill.apiKey,
      'cwd': normalizeCodingProjectPath(prefill.cwd),
    }),
  );
}

/// Resolve prefill: project defaults → global defaults → last used → system.
Future<CodingTaskPrefill> resolveCodingPrefill({
  String? cwd,
  CodingProject? project,
}) async {
  final defaults = await loadCodingDefaults();
  final last = await loadCodingLastUsedPrefill();
  final projects = await loadCodingProjects();
  final harness = project?.defaultHarness?.trim().isNotEmpty == true
      ? project!.defaultHarness!.trim()
      : (defaults.harness.trim().isNotEmpty
          ? defaults.harness.trim()
          : (last?.harness.trim().isNotEmpty == true
              ? last!.harness.trim()
              : 'envoy-harness'));

  // Prefer an explicit path, then the project, then last-used *if it is still
  // a registered project*, then the newest registered project. Never leave the
  // sheet on a stale home-node default (e.g. EnvoyMesh repo) when the user has
  // already registered folders like aiNote.
  var path = normalizeCodingProjectPath(cwd ?? '');
  if (path.isEmpty && project != null) {
    path = normalizeCodingProjectPath(project.path);
  }
  if (path.isEmpty) {
    final lastCwd = normalizeCodingProjectPath(last?.cwd ?? '');
    if (lastCwd.isNotEmpty && projects.any((p) => p.path == lastCwd)) {
      path = lastCwd;
    } else if (projects.isNotEmpty) {
      path = projects.first.path;
    }
  }

  return CodingTaskPrefill(
    harness: harness,
    model: project?.defaultModel?.trim().isNotEmpty == true
        ? project!.defaultModel!.trim()
        : (defaults.model.trim().isNotEmpty
            ? defaults.model.trim()
            : (last?.model ?? '')),
    providerKind: project?.defaultProviderKind?.trim().isNotEmpty == true
        ? project!.defaultProviderKind!.trim()
        : (defaults.providerKind.trim().isNotEmpty
            ? defaults.providerKind.trim()
            : (last?.providerKind ?? '')),
    endpoint: project?.defaultEndpoint?.trim().isNotEmpty == true
        ? project!.defaultEndpoint!.trim()
        : (defaults.endpoint.trim().isNotEmpty
            ? defaults.endpoint.trim()
            : (last?.endpoint ?? '')),
    apiKey: project?.defaultApiKey?.trim().isNotEmpty == true
        ? project!.defaultApiKey!.trim()
        : (defaults.apiKey.trim().isNotEmpty
            ? defaults.apiKey.trim()
            : (last?.apiKey ?? '')),
    cwd: path,
  );
}
