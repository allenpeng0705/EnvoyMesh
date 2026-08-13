import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/node_provider.dart';
import 'home_file_preview_screen.dart';

/// Owner-only browser for files on the paired home node.
class HomeFilesScreen extends ConsumerStatefulWidget {
  const HomeFilesScreen({super.key});

  @override
  ConsumerState<HomeFilesScreen> createState() => _HomeFilesScreenState();
}

class _HomeFilesScreenState extends ConsumerState<HomeFilesScreen> {
  bool _loading = true;
  String? _error;
  String _platform = 'other';
  String _homeDir = '';
  String _currentPath = '';
  String? _parent;
  List<Map<String, dynamic>> _entries = const [];
  bool _showingRoots = false;
  List<String> _roots = const [];
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Not connected to home node';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final info = await client.getHomeFsInfo();
      final platform = info['platform']?.toString() ?? 'other';
      final homeDir = info['homeDir']?.toString() ?? '';
      final roots = (info['roots'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const <String>[];
      if (!mounted) return;
      setState(() {
        _platform = platform;
        _homeDir = homeDir;
        _roots = roots;
      });
      await _loadPath(homeDir.isNotEmpty ? homeDir : (roots.isNotEmpty ? roots.first : '/'));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadPath(String? path, {bool roots = false}) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (roots) {
        if (_platform != 'win32' && _roots.length == 1) {
          final result = await client.listHomeFsEntries(path: _roots.first);
          if (!mounted) return;
          setState(() {
            _showingRoots = false;
            _currentPath = result['path']?.toString() ?? '';
            _parent = result['parent']?.toString();
            _entries = (result['entries'] as List<dynamic>? ?? const [])
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList();
            _loading = false;
          });
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
      final result = await client.listHomeFsEntries(path: path);
      final entries = (result['entries'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      if (!mounted) return;
      setState(() {
        _showingRoots = false;
        _currentPath = result['path']?.toString() ?? '';
        _parent = result['parent']?.toString();
        _entries = entries;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _openFile(String path) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _opening) return;
    setState(() => _opening = true);
    try {
      final preview = await client.previewHomeFsFile(path);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => HomeFilePreviewScreen(preview: preview),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  IconData _iconFor(Map<String, dynamic> entry) {
    if (entry['kind']?.toString() == 'dir') return Icons.folder;
    final name = entry['name']?.toString().toLowerCase() ?? '';
    if (name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.gif') ||
        name.endsWith('.webp')) {
      return Icons.image_outlined;
    }
    if (name.endsWith('.pdf')) return Icons.picture_as_pdf_outlined;
    if (name.endsWith('.md') || name.endsWith('.txt')) {
      return Icons.description_outlined;
    }
    if (name.endsWith('.docx') ||
        name.endsWith('.xlsx') ||
        name.endsWith('.pptx') ||
        name.endsWith('.doc') ||
        name.endsWith('.xls') ||
        name.endsWith('.ppt')) {
      return Icons.article_outlined;
    }
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isOwner = ref.watch(nodeProvider).isOwnerProfile;
    if (!isOwner) {
      return Scaffold(
        appBar: AppBar(title: const Text('Home files')),
        body: Center(child: Text(l10n.chatAiDisabledFamily)),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Home files'),
        actions: [
          if (_opening)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
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
                  ? (_platform == 'win32'
                      ? l10n.homeFolderDrives
                      : l10n.homeFolderComputer)
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
                : RefreshIndicator(
                    onRefresh: () => _loadPath(
                      _showingRoots ? null : _currentPath,
                      roots: _showingRoots,
                    ),
                    child: ListView(
                      children: [
                        if (!_showingRoots &&
                            (_platform == 'win32' ||
                                !_roots.contains(_currentPath)))
                          ListTile(
                            leading: const Icon(Icons.storage),
                            title: Text(
                              _platform == 'win32'
                                  ? l10n.homeFolderDrives
                                  : l10n.homeFolderComputer,
                            ),
                            onTap: () => _loadPath(null, roots: true),
                          ),
                        if (!_showingRoots &&
                            _homeDir.isNotEmpty &&
                            _currentPath != _homeDir)
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
                            leading: Icon(_iconFor(entry)),
                            title: Text(entry['name']?.toString() ?? ''),
                            onTap: () {
                              final p = entry['path']?.toString();
                              if (p == null || p.isEmpty) return;
                              if (entry['kind']?.toString() == 'dir') {
                                _loadPath(p);
                              } else {
                                _openFile(p);
                              }
                            },
                          ),
                        if (!_loading && _entries.isEmpty)
                          ListTile(title: Text(l10n.homeFolderNoSubfolders)),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
