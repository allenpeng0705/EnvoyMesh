import 'package:flutter/material.dart';
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
              Text(
                'Peer: ${widget.data.peerId.length > 20 ? '${widget.data.peerId.substring(0, 10)}...' : widget.data.peerId}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (widget.data.lanIp != null) ...[
                const SizedBox(height: 4),
                Text('LAN: ${widget.data.lanIp}:${widget.data.wsPort}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
              if (widget.data.relayWsUrl != null) ...[
                const SizedBox(height: 4),
                Text('Relay: available',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                  textAlign: TextAlign.center,
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
      final tempNode = StoredNode(
        id: '',
        name: widget.data.name ?? 'Home Node',
        ownerId: '',
        homePeerId: widget.data.peerId,
        lanIp: widget.data.lanIp,
        wsPort: widget.data.wsPort,
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
