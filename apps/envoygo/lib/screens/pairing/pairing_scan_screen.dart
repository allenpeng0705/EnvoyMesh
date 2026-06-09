import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../services/pairing_service.dart';
import 'pairing_confirm_screen.dart';

/// QR code scanner screen for pairing with a home node.
///
/// Uses the device camera to scan the `envoy://pair?...` QR code
/// displayed on the home node. Also provides a manual URI entry
/// fallback for web or when the camera isn't available.
class PairingScanScreen extends StatefulWidget {
  const PairingScanScreen({super.key});

  @override
  State<PairingScanScreen> createState() => _PairingScanScreenState();
}

class _PairingScanScreenState extends State<PairingScanScreen> {
  final _manualController = TextEditingController();
  MobileScannerController? _scannerController;
  bool _hasScanned = false;

  @override
  void initState() {
    super.initState();
    _scannerController = MobileScannerController();
  }

  @override
  void dispose() {
    _scannerController?.dispose();
    _manualController.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_hasScanned) return;
    for (final barcode in capture.barcodes) {
      final uri = barcode.rawValue;
      if (uri != null && uri.startsWith('envoy://pair')) {
        _hasScanned = true;
        _handleUri(uri);
        return;
      }
    }
  }

  void _handleUri(String uri) {
    final data = PairingService.parsePairingUri(uri);
    if (data == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid pairing QR code')),
      );
      _hasScanned = false;
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => PairingConfirmScreen(
          nodeName: data.agentName ?? 'Home Node',
          data: data,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pair with Node')),
      body: Column(
        children: [
          // QR scanner view.
          Expanded(
            flex: 3,
            child: MobileScanner(
              controller: _scannerController!,
              onDetect: _onDetect,
            ),
          ),
          // Manual URI entry fallback.
          Expanded(
            flex: 2,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(height: 8),
                  Text(
                    'Or paste pairing URI',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _manualController,
                    decoration: const InputDecoration(
                      hintText: 'envoy://pair?token=...',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.link),
                    ),
                    onSubmitted: (value) {
                      _handleUri(value.trim());
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
