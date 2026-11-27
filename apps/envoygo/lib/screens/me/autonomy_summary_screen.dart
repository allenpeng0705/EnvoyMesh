import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;

/// Phase 69D1 — read-only “while you were away” summary from the home node.
class AutonomySummaryScreen extends ConsumerStatefulWidget {
  const AutonomySummaryScreen({super.key});

  @override
  ConsumerState<AutonomySummaryScreen> createState() =>
      _AutonomySummaryScreenState();
}

class _AutonomySummaryScreenState extends ConsumerState<AutonomySummaryScreen> {
  bool _loading = true;
  String? _error;
  String? _summaryText;
  List<String> _headlines = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final client = ref.read(nodeServiceProvider);
    final l10n = AppLocalizations.of(context)!;
    if (client == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = l10n.autonomySummaryOffline;
        _summaryText = null;
        _headlines = const [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await client.getAutonomyDigest();
      final ok = result['ok'] == true;
      final headlinesRaw = result['headlines'];
      final headlines = headlinesRaw is List
          ? headlinesRaw
                .whereType<String>()
                .map((s) => s.trim())
                .where((s) => s.isNotEmpty)
                .take(12)
                .toList()
          : <String>[];
      final summary = (result['summaryText'] as String?)?.trim();
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!ok) {
          _error =
              (result['error'] as String?)?.trim().isNotEmpty == true
                  ? result['error'] as String
                  : l10n.autonomySummaryUnavailable;
          _summaryText = null;
          _headlines = const [];
        } else {
          _error = null;
          _summaryText = (summary != null && summary.isNotEmpty) ? summary : null;
          _headlines = headlines;
        }
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = err.toString();
        _summaryText = null;
        _headlines = const [];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final empty = !_loading &&
        _error == null &&
        (_summaryText == null || _summaryText!.isEmpty) &&
        _headlines.isEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.autonomySummaryTitle),
        actions: [
          IconButton(
            tooltip: l10n.autonomySummaryRefresh,
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              l10n.autonomySummaryHint,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (empty)
              Text(
                l10n.autonomySummaryEmpty,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            if (_summaryText != null) ...[
              Text(
                _summaryText!,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 12),
            ],
            for (final line in _headlines)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('•  '),
                    Expanded(child: Text(line)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
