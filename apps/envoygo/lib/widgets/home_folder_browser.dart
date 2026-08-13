import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../services/node_service_client.dart';

/// Browse and select a folder on the paired home node (owner-only RPCs).
///
/// Starts at homeDir. Use Computer (/) or Drives, Home, and Parent to navigate
/// outside the home directory (same model as Social HomeFolderBrowserModal).
class HomeFolderBrowser extends StatefulWidget {
  const HomeFolderBrowser({
    super.key,
    required this.client,
    this.initialPath,
    this.title = 'Choose project folder',
  });

  final NodeServiceClient client;
  final String? initialPath;
  final String title;

  /// Opens a full-screen browser; returns absolute path or null if cancelled.
  static Future<String?> open(
    BuildContext context, {
    required NodeServiceClient client,
    String? initialPath,
    String title = 'Choose project folder',
  }) {
    return Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => HomeFolderBrowser(
          client: client,
          initialPath: initialPath,
          title: title,
        ),
      ),
    );
  }

  @override
  State<HomeFolderBrowser> createState() => _HomeFolderBrowserState();
}

class _HomeFolderBrowserState extends State<HomeFolderBrowser> {
  bool _loading = true;
  String? _error;
  String _platform = 'other';
  String _homeDir = '';
  String _currentPath = '';
  String? _parent;
  List<Map<String, dynamic>> _entries = const [];
  bool _showingRoots = false;
  List<String> _roots = const [];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final info = await widget.client.getHomeFsInfo();
      final platform = info['platform']?.toString() ?? 'other';
      final homeDir = info['homeDir']?.toString() ?? '';
      final roots = (info['roots'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const <String>[];
      final start = widget.initialPath?.trim().isNotEmpty == true
          ? widget.initialPath!.trim()
          : (homeDir.isNotEmpty ? homeDir : (roots.isNotEmpty ? roots.first : '/'));
      if (!mounted) return;
      setState(() {
        _platform = platform;
        _homeDir = homeDir;
        _roots = roots;
      });
      await _loadPath(start);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadPath(String? path, {bool roots = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (roots) {
        // macOS/Linux: only `/` — open it directly.
        if (_platform != 'win32' && _roots.length == 1) {
          final result = await widget.client.listHomeFsEntries(
            path: _roots.first,
            dirsOnly: true,
          );
          _applyListing(result);
          return;
        }
        if (!mounted) return;
        setState(() {
          _showingRoots = true;
          _currentPath = '';
          _parent = null;
          _entries = _roots
              .map((r) => {'name': r, 'kind': 'dir', 'path': r})
              .toList();
          _loading = false;
        });
        return;
      }
      final result = await widget.client.listHomeFsEntries(
        path: path,
        dirsOnly: true,
      );
      _applyListing(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _applyListing(Map<String, dynamic> result) {
    final entries = (result['entries'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => e['kind']?.toString() == 'dir')
        .toList();
    if (!mounted) return;
    setState(() {
      _showingRoots = false;
      _currentPath = result['path']?.toString() ?? '';
      _parent = result['parent']?.toString();
      _entries = entries;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final rootsLabel =
        _platform == 'win32' ? l10n.homeFolderDrives : l10n.homeFolderComputer;
    final atRoot =
        !_showingRoots && _roots.isNotEmpty && _roots.contains(_currentPath);
    final showRootsJump =
        !_showingRoots && (_platform == 'win32' || !atRoot);
    final showHomeJump =
        !_showingRoots && _homeDir.isNotEmpty && _currentPath != _homeDir;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          TextButton(
            onPressed: _currentPath.isEmpty || _showingRoots
                ? null
                : () => Navigator.of(context).pop(_currentPath),
            child: Text(l10n.commonConfirm),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(
              _showingRoots
                  ? rootsLabel
                  : (_currentPath.isEmpty ? '…' : _currentPath),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontFamily: 'monospace',
                  ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    children: [
                      if (showRootsJump)
                        ListTile(
                          leading: const Icon(Icons.storage),
                          title: Text(rootsLabel),
                          onTap: () => _loadPath(null, roots: true),
                        ),
                      if (showHomeJump)
                        ListTile(
                          leading: const Icon(Icons.home_outlined),
                          title: Text(l10n.homeFolderHome),
                          onTap: () => _loadPath(_homeDir),
                        ),
                      if (_parent != null && !_showingRoots)
                        ListTile(
                          leading: const Icon(Icons.arrow_upward),
                          title: Text(l10n.homeFolderParent),
                          onTap: () => _loadPath(_parent),
                        ),
                      for (final entry in _entries)
                        ListTile(
                          leading: const Icon(Icons.folder),
                          title: Text(entry['name']?.toString() ?? ''),
                          onTap: () =>
                              _loadPath(entry['path']?.toString()),
                        ),
                      if (!_loading && _entries.isEmpty)
                        ListTile(
                          title: Text(l10n.homeFolderNoSubfolders),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
