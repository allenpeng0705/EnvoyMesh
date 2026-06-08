import 'package:flutter/material.dart';

/// Terminal PTY output widget — renders ANSI-colored text.
class TerminalWidget extends StatelessWidget {
  final String output;
  final bool autoScroll;

  const TerminalWidget({
    super.key,
    this.output = '',
    this.autoScroll = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.all(12),
      child: SingleChildScrollView(
        child: Text(
          output.isEmpty ? '\$ _' : output,
          style: const TextStyle(
            color: Colors.green,
            fontFamily: 'monospace',
            fontSize: 14,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}
