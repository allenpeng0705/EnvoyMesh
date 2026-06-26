import 'package:flutter/material.dart';

import '../models/peer_connection_info.dart';
import '../utils/contact_reachability_label.dart';

/// Small online/offline indicator (dot + label) for contacts and chat headers.
class ContactReachabilityBadge extends StatelessWidget {
  final PeerConnectionInfo? info;
  final bool checking;
  final bool compact;

  const ContactReachabilityBadge({
    super.key,
    required this.info,
    this.checking = false,
    this.compact = false,
  });

  Color _dotColor(ColorScheme scheme) {
    if (checking && info == null) return scheme.outline;
    if (info == null) return scheme.outline;
    if (!info!.connected) return scheme.error;
    if (info!.direct) return Colors.green;
    return Colors.orange;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = contactReachabilityLabel(info, checking: checking);
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: scheme.onSurfaceVariant,
        );

    if (compact) {
      return Tooltip(
        message: label,
        child: Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: _dotColor(scheme),
            shape: BoxShape.circle,
            border: Border.all(color: scheme.surface, width: 1.5),
          ),
        ),
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: _dotColor(scheme),
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label,
            style: style,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
