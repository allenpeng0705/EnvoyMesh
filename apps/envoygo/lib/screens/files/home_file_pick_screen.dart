import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/contact_provider.dart' show nodeServiceProvider;

/// Pick a file on the home node; pops with absolute path [String] or null.
class HomeFilePickScreen extends ConsumerStatefulWidget {
  const HomeFilePickScreen({super.key});

  @override
  ConsumerState<HomeFilePickScreen> createState() => _HomeFilePickScreenState();
}

class _HomeFilePickScreenState extends ConsumerState<HomeFilePickScreen> {
  bool _loading = true;
  String? _error;
  String _platform = 'other';
  String _currentPath = '';
  String? _parent;
  List<Map<String, dynamic>> _entries = const [];
  bool _showingRoots = false;
  List<String> _roots = const [];

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
        _roots = roots;
      });
      await _loadPath(homeDir);
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
      if (roots && _platform == 'win32') {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Attach home file'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Column(
        children: [
          if (_currentPath.isNotEmpty || _showingRoots)
            ListTile(
              dense: true,
              leading: const Icon(Icons.folder_open),
              title: Text(
                _showingRoots ? 'Drives' : _currentPath,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: (_parent != null || (_showingRoots == false && _platform == 'win32'))
                  ? IconButton(
                      icon: const Icon(Icons.arrow_upward),
                      onPressed: _loading
                          ? null
                          : () {
                              if (_parent != null) {
                                unawaited(_loadPath(_parent));
                              } else if (_platform == 'win32') {
                                unawaited(_loadPath(null, roots: true));
                              }
                            },
                    )
                  : null,
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    itemCount: _entries.length,
                    itemBuilder: (context, index) {
                      final e = _entries[index];
                      final name = e['name']?.toString() ?? '';
                      final kind = e['kind']?.toString() ?? 'file';
                      final path = e['path']?.toString() ?? '';
                      final isDir = kind == 'dir';
                      return ListTile(
                        leading: Icon(isDir ? Icons.folder : Icons.insert_drive_file),
                        title: Text(name),
                        onTap: () {
                          if (isDir) {
                            unawaited(_loadPath(path));
                          } else {
                            Navigator.of(context).pop(path);
                          }
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
