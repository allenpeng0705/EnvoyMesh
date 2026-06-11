import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
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
    Future.microtask(() {
      ref.read(nodeProvider.notifier).loadPairedNodes();
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
      final notifier = ref.read(nodeProvider.notifier);
      final nodeState = ref.read(nodeProvider);
      if (nodeState.connectionState == NodeConnectionState.disconnected &&
          nodeState.activeNode != null) {
        notifier.connectToNode(nodeState.activeNode!);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return const EnvoyGoApp();
  }
}
