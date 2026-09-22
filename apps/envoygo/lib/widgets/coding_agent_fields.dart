import 'dart:async';

import 'package:flutter/material.dart';

import '../coding/coding_harness_probe.dart';
import '../coding/coding_projects.dart';
import '../l10n/app_localizations.dart';
import '../screens/coding/coding_new_task_sheet.dart';
import '../services/product/node_service_client.dart';

/// Shared Coding agent + model + provider value (Social CodingAgentModelProviderFields).
class CodingAgentFieldsValue {
  const CodingAgentFieldsValue({
    required this.harness,
    this.model = '',
    this.providerKind = '',
    this.endpoint = '',
    this.apiKey = '',
  });

  final CodingHarnessChoice harness;
  final String model;
  final String providerKind;
  final String endpoint;
  final String apiKey;

  CodingAgentFieldsValue copyWith({
    CodingHarnessChoice? harness,
    String? model,
    String? providerKind,
    String? endpoint,
    String? apiKey,
  }) {
    return CodingAgentFieldsValue(
      harness: harness ?? this.harness,
      model: model ?? this.model,
      providerKind: providerKind ?? this.providerKind,
      endpoint: endpoint ?? this.endpoint,
      apiKey: apiKey ?? this.apiKey,
    );
  }
}

typedef CodingAgentFieldsChanged = void Function(CodingAgentFieldsValue next);

/// Agent / model / provider controls for new task, project, and task settings.
class CodingAgentFields extends StatefulWidget {
  const CodingAgentFields({
    super.key,
    required this.value,
    required this.onChanged,
    required this.enabledHarnesses,
    required this.probes,
    this.client,
    this.homeModels = const [],
    this.busy = false,
    this.harnessAsRadios = false,
    this.showHarness = true,
    this.harnessTitle,
  });

  final CodingAgentFieldsValue value;
  final CodingAgentFieldsChanged onChanged;
  final List<CodingHarnessChoice> enabledHarnesses;
  final Map<CodingHarnessChoice, CodingHarnessProbeResult> probes;
  final NodeServiceClient? client;
  final List<String> homeModels;
  final bool busy;
  final bool harnessAsRadios;
  final bool showHarness;
  final String Function(CodingHarnessChoice)? harnessTitle;

  @override
  State<CodingAgentFields> createState() => _CodingAgentFieldsState();
}

class _CodingAgentFieldsState extends State<CodingAgentFields> {
  late final TextEditingController _modelController;
  late final TextEditingController _endpointController;
  late final TextEditingController _apiKeyController;
  var _modelsLoading = false;
  List<String> _catalogModels = const [];
  String? _catalogFor;

  @override
  void initState() {
    super.initState();
    _modelController = TextEditingController(text: widget.value.model);
    _endpointController = TextEditingController(text: widget.value.endpoint);
    _apiKeyController = TextEditingController(text: widget.value.apiKey);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_loadCatalog(widget.value.harness));
    });
  }

  @override
  void didUpdateWidget(covariant CodingAgentFields oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value.harness != widget.value.harness ||
        oldWidget.value.providerKind != widget.value.providerKind) {
      if (_modelController.text != widget.value.model) {
        _modelController.text = widget.value.model;
      }
      if (_endpointController.text != widget.value.endpoint) {
        _endpointController.text = widget.value.endpoint;
      }
      if (_apiKeyController.text != widget.value.apiKey) {
        _apiKeyController.text = widget.value.apiKey;
      }
    } else {
      if (widget.value.model != _modelController.text &&
          widget.value.model != oldWidget.value.model) {
        _modelController.text = widget.value.model;
      }
      if (widget.value.endpoint != _endpointController.text &&
          widget.value.endpoint != oldWidget.value.endpoint) {
        _endpointController.text = widget.value.endpoint;
      }
      if (widget.value.apiKey != _apiKeyController.text &&
          widget.value.apiKey != oldWidget.value.apiKey) {
        _apiKeyController.text = widget.value.apiKey;
      }
    }
    if (oldWidget.value.harness != widget.value.harness) {
      unawaited(_loadCatalog(widget.value.harness));
    }
  }

  @override
  void dispose() {
    _modelController.dispose();
    _endpointController.dispose();
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog(CodingHarnessChoice harness) async {
    final client = widget.client;
    final wire = codingHarnessWireId(harness);
    if (client == null ||
        harness == CodingHarnessChoice.envoyHarness ||
        harness == CodingHarnessChoice.pi) {
      if (mounted) {
        setState(() {
          _catalogModels = const [];
          _catalogFor = wire;
          _modelsLoading = false;
        });
      }
      return;
    }
    setState(() {
      _modelsLoading = true;
      _catalogFor = wire;
    });
    try {
      final catalog = await client.getExtAgentCommandCatalog(
        agentId: codingHarnessToExtAgentId(harness) ?? wire,
        probeModels: true,
      );
      if (!mounted || _catalogFor != wire) return;
      setState(() {
        _catalogModels = codingCatalogModelsFromResponse(catalog);
        _modelsLoading = false;
      });
    } catch (_) {
      if (!mounted || _catalogFor != wire) return;
      setState(() {
        _catalogModels = const [];
        _modelsLoading = false;
      });
    }
  }

  String _title(AppLocalizations l10n, CodingHarnessChoice h) {
    if (widget.harnessTitle != null) return widget.harnessTitle!(h);
    return switch (h) {
      CodingHarnessChoice.envoyHarness => l10n.chatsCodingEh,
      CodingHarnessChoice.pi => l10n.chatsCodingPi,
      CodingHarnessChoice.minimaxCode => l10n.codingHarnessMinimax,
      _ => codingHarnessDisplayName(h),
    };
  }

  void _patch(CodingAgentFieldsValue next) => widget.onChanged(next);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final value = widget.value;
    final listed = <CodingHarnessChoice>[
      for (final h in widget.enabledHarnesses)
        if (widget.probes[h]?.badge == CodingHarnessProbeBadge.ready ||
            h == value.harness)
          h,
    ];
    final showCompat = value.providerKind == 'openai-compatible' ||
        value.providerKind == 'anthropic-compatible';
    final suggestions = codingModelSuggestionsForAgent(
      harness: codingHarnessWireId(value.harness),
      providerKind: value.providerKind,
      catalogModels: _catalogModels,
      homeModels: widget.homeModels,
    );
    final modelOptions = <String>[
      if (value.model.trim().isNotEmpty &&
          !suggestions.contains(value.model.trim()))
        value.model.trim(),
      ...suggestions,
    ];
    final showModelSelect = !showCompat && suggestions.isNotEmpty;
    final selectValue = value.model.trim().isEmpty
        ? ''
        : (modelOptions.contains(value.model.trim()) ? value.model.trim() : '');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.showHarness) ...[
          Text(
            l10n.codingHarnessLabel,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 6),
          if (listed.isEmpty)
            Text(
              l10n.codingHarnessNoneReady,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            )
          else if (widget.harnessAsRadios)
            Column(
              children: [
                for (final h in listed)
                  RadioListTile<CodingHarnessChoice>(
                    dense: true,
                    title: Text(_title(l10n, h)),
                    value: h,
                    groupValue: value.harness,
                    onChanged: widget.busy
                        ? null
                        : (next) {
                            if (next == null) return;
                            _patch(
                              value.copyWith(
                                harness: next,
                                model: '',
                                providerKind: '',
                                endpoint: '',
                                apiKey: '',
                              ),
                            );
                          },
                  ),
              ],
            )
          else
            DropdownButtonFormField<CodingHarnessChoice>(
              value: listed.contains(value.harness) ? value.harness : listed.first,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              items: [
                for (final h in listed)
                  DropdownMenuItem(value: h, child: Text(_title(l10n, h))),
              ],
              onChanged: widget.busy
                  ? null
                  : (next) {
                      if (next == null) return;
                      _patch(
                        value.copyWith(
                          harness: next,
                          model: '',
                          providerKind: '',
                          endpoint: '',
                          apiKey: '',
                        ),
                      );
                    },
            ),
          const SizedBox(height: 12),
        ],
        Text(
          l10n.codingProviderLabel,
          style: Theme.of(context).textTheme.labelLarge,
        ),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          value: value.providerKind.isEmpty ? '' : value.providerKind,
          decoration: const InputDecoration(border: OutlineInputBorder()),
          items: [
            DropdownMenuItem(value: '', child: Text(l10n.codingProviderNone)),
            DropdownMenuItem(
              value: 'openai-compatible',
              child: Text(l10n.codingProviderOpenai),
            ),
            DropdownMenuItem(
              value: 'anthropic-compatible',
              child: Text(l10n.codingProviderAnthropic),
            ),
          ],
          onChanged: widget.busy
              ? null
              : (next) {
                  final kind = next ?? '';
                  _patch(
                    value.copyWith(
                      providerKind: kind,
                      model: '',
                      endpoint: kind.isEmpty ? '' : value.endpoint,
                      apiKey: kind.isEmpty ? '' : value.apiKey,
                    ),
                  );
                },
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 12),
          child: Text(
            l10n.codingProviderHint,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ),
        Text(
          l10n.codingModelLabel,
          style: Theme.of(context).textTheme.labelLarge,
        ),
        const SizedBox(height: 6),
        if (showModelSelect)
          DropdownButtonFormField<String>(
            value: selectValue,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: [
              DropdownMenuItem(
                value: '',
                child: Text(l10n.codingModelEmptyOption),
              ),
              for (final id in modelOptions)
                DropdownMenuItem(value: id, child: Text(id)),
            ],
            onChanged: widget.busy
                ? null
                : (next) => _patch(value.copyWith(model: next ?? '')),
          )
        else
          TextField(
            controller: _modelController,
            enabled: !widget.busy,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              hintText: l10n.codingModelHint,
            ),
            onChanged: (next) => _patch(value.copyWith(model: next)),
          ),
        if (_modelsLoading)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              l10n.codingModelLoading,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ),
        if (showCompat) ...[
          const SizedBox(height: 12),
          Text(
            l10n.codingEndpointLabel,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 6),
          TextField(
            controller: _endpointController,
            enabled: !widget.busy,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              hintText: l10n.codingEndpointHint,
            ),
            onChanged: (next) => _patch(value.copyWith(endpoint: next)),
          ),
          const SizedBox(height: 12),
          Text(
            l10n.codingApiKeyLabel,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 6),
          TextField(
            controller: _apiKeyController,
            enabled: !widget.busy,
            obscureText: true,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              hintText: l10n.codingApiKeyHint,
            ),
            onChanged: (next) => _patch(value.copyWith(apiKey: next)),
          ),
        ],
      ],
    );
  }
}
