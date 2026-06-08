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

class _EnvoyGoRootState extends ConsumerState<_EnvoyGoRoot> {
  @override
  void initState() {
    super.initState();
    // Load paired nodes on app start.
    Future.microtask(() {
      ref.read(nodeProvider.notifier).loadPairedNodes();
    });
  }

  @override
  Widget build(BuildContext context) {
    return const EnvoyGoApp();
  }
}
