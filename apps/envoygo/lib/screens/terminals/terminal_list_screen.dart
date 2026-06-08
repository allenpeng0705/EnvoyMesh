import 'package:flutter/material.dart';

/// Terminal sessions list.
class TerminalListScreen extends StatelessWidget {
  const TerminalListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // TODO(31G): Wire to TerminalProvider
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.terminal, size: 64, color: Colors.grey),
          SizedBox(height: 16),
          Text(
            'No terminal sessions',
            style: TextStyle(fontSize: 18, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}
