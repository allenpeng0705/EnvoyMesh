import 'package:flutter/material.dart';

/// Badge showing the active node name and connection status.
class NodeStatusBadge extends StatelessWidget {
  final String nodeName;
  final bool isOnline;
  final String? transport;

  const NodeStatusBadge({
    super.key,
    required this.nodeName,
    required this.isOnline,
    this.transport,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: isOnline
            ? Colors.green.withValues(alpha: 0.1)
            : Colors.grey.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isOnline ? Icons.circle : Icons.circle_outlined,
            size: 8,
            color: isOnline ? Colors.green : Colors.grey,
          ),
          const SizedBox(width: 6),
          Text(
            nodeName,
            style: TextStyle(
              color: isOnline ? Colors.green : Colors.grey,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (transport != null) ...[
            const SizedBox(width: 4),
            Text(
              '· $transport',
              style: const TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}
