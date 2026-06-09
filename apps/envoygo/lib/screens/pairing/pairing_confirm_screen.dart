import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/stored_node.dart';
import '../../providers/node_provider.dart';
import '../../services/candidate_resolver.dart';
import '../../services/pairing_service.dart';

/// Confirmation screen shown after scanning a pairing QR code.
class PairingConfirmScreen extends ConsumerStatefulWidget {
  final String nodeName;
  final PairingData data;

  const PairingConfirmScreen({
    super.key,
    required this.nodeName,
    required this.data,
  });

  @override
  ConsumerState<PairingConfirmScreen> createState() =>
      _PairingConfirmScreenState();
}

class _PairingConfirmScreenState
    extends ConsumerState<PairingConfirmScreen> {
  bool _pairing = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Confirm Pairing')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.link, size: 48, color: Colors.blue),
              const SizedBox(height: 16),
              Text(
                'Connect to ${widget.nodeName}?',
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              if (widget.data.homeNodePeerId != null)
                Text(
                  'Peer: ${widget.data.homeNodePeerId!.length > 20 ? widget.data.homeNodePeerId!.substring(0, 10) : widget.data.homeNodePeerId}...',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              if (widget.data.lanWsUrl != null) ...[
                const SizedBox(height: 4),
                Text('LAN: available',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
              if (widget.data.wsUrl.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text('Relay: available',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.error_outline,
                              size: 18,
                              color: Theme.of(context).colorScheme.error),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Pairing failed',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      SelectableText(
                        _error!,
                        textAlign: TextAlign.start,
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.onErrorContainer,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: () {
                            // Copy error to clipboard
                            Clipboard.setData(ClipboardData(text: _error!));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Copied')),
                            );
                          },
                          icon: const Icon(Icons.copy, size: 16),
                          label: const Text('Copy'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 24),
              _pairing
                  ? const CircularProgressIndicator()
                  : FilledButton.icon(
                      onPressed: _pair,
                      icon: const Icon(Icons.link),
                      label: const Text('Pair'),
                    ),
              const SizedBox(height: 8),
              TextButton(
                onPressed:
                    _pairing ? null : () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pair() async {
    setState(() {
      _pairing = true;
      _error = null;
    });

    try {
      // Build candidates from pairing data.
      // relayWsUrl is the clean relay endpoint without routing params.
      final tempNode = StoredNode(
        id: '',
        name: widget.data.agentName ?? 'Home Node',
        ownerId: widget.data.ownerId ?? '',
        homePeerId: widget.data.homeNodePeerId ?? '',
        lanIp: widget.data.lanWsUrl,
        wsPort: 3030,
        relayWsUrl: widget.data.relayWsUrl,
        pairedAt: DateTime.now(),
      );
      final resolver = CandidateResolver();
      final candidates = resolver.resolve(tempNode);

      final notifier = ref.read(nodeProvider.notifier);
      await notifier.pairWithNode(
        widget.data,
        'EnvoyGo',
        candidates,
      );

      if (mounted) {
        // Pop back to home screen.
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    } catch (e) {
      setState(() {
        _pairing = false;
        _error = 'Pairing failed: $e';
      });
    }
  }
}
