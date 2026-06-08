import 'package:flutter/material.dart';

/// Terminal PTY view — full-screen terminal with input bar.
class TerminalDetailScreen extends StatelessWidget {
  final String sessionId;
  final String sessionName;

  const TerminalDetailScreen({
    super.key,
    required this.sessionId,
    required this.sessionName,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(sessionName),
        actions: [
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () {
              // TODO(31G): Close terminal session
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // PTY output area
          Expanded(
            child: Container(
              color: Colors.black,
              padding: const EdgeInsets.all(12),
              child: const SingleChildScrollView(
                child: Text(
                  // TODO(31G): Stream PTY output from terminal:rx events
                  '\$ _',
                  style: TextStyle(
                    color: Colors.green,
                    fontFamily: 'monospace',
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
          // Input bar
          SafeArea(
            child: Container(
              color: Colors.grey[900],
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      style: const TextStyle(
                        color: Colors.white,
                        fontFamily: 'monospace',
                      ),
                      decoration: const InputDecoration(
                        hintText: '\$ ',
                        hintStyle: TextStyle(
                          color: Colors.grey,
                          fontFamily: 'monospace',
                        ),
                        border: InputBorder.none,
                      ),
                      onSubmitted: (text) {
                        // TODO(31G): Send keystrokes
                      },
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.control_camera,
                        color: Colors.grey, size: 20),
                    onPressed: () {
                      // TODO(31G): Ctrl+C
                    },
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
