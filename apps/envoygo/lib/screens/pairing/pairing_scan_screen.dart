import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../l10n/app_localizations.dart';
import '../../services/pairing_service.dart';
import '../../utils/open_external_url.dart';
import 'pairing_confirm_screen.dart';

/// Desktop EnvoyMesh release page (Mac/Windows installers). Open in browser
/// so the user can download on a computer — not an in-app mobile install.
const kEnvoyMeshDesktopReleasesUrl =
    'https://github.com/allenpeng0705/EnvoyMesh/releases';

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
      if (uri == null) continue;
      final trimmed = uri.trim();
      if (trimmed.startsWith('envoy://pair') ||
          trimmed.startsWith('envoy://invite') ||
          trimmed.startsWith('invite?')) {
        _hasScanned = true;
        _handleUri(trimmed);
        return;
      }
    }
  }

  void _handleUri(String uri) {
    final data = PairingService.parsePairingUri(uri);
    if (data == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).pairingInvalidQr)),
      );
      _hasScanned = false;
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => PairingConfirmScreen(
          nodeName: defaultHomeNodeDisplayName,
          data: data,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.pairingScanTitle)),
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
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    l10n.pairingNeedHomeHint,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                    textAlign: TextAlign.center,
                  ),
                  TextButton(
                    onPressed: () => openExternalUrl(kEnvoyMeshDesktopReleasesUrl),
                    child: Text(l10n.pairingDownloadEnvoyMesh),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.pairingPasteUri,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _manualController,
                    decoration: InputDecoration(
                      hintText: l10n.pairingUriHint,
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.link),
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
