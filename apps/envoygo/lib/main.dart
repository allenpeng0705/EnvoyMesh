import 'dart:developer' as developer;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'providers/locale_provider.dart';
import 'providers/node_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const ProviderScope(
      child: _EnvoyGoRoot(),
    ),
  );
}

/// Root widget that initializes node loading on startup.
class _EnvoyGoRoot extends ConsumerStatefulWidget {
  const _EnvoyGoRoot();

  @override
  ConsumerState<_EnvoyGoRoot> createState() => _EnvoyGoRootState();
}

class _EnvoyGoRootState extends ConsumerState<_EnvoyGoRoot>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Load paired nodes on app start.
    Future.microtask(() async {
      try {
        await ref.read(localeProvider.notifier).loadSaved();
        await ref.read(nodeProvider.notifier).loadPairedNodes();
      } catch (e) {
        developer.log('[main] startup init threw: $e', name: 'EnvoyGo');
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Delegate to the supervisor via kickReconnect(). It already
      // short-circuits when connected, so calling it on every
      // resume (including transient notification-bar peeks) is
      // safe. The supervisor also picks up the new candidate
      // list if the user moved networks while backgrounded.
      ref.read(nodeProvider.notifier).kickReconnect();
    }
  }

  @override
  Widget build(BuildContext context) {
    return const EnvoyGoApp();
  }
}
