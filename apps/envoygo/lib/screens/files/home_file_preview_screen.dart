import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// Renders a home-node file preview from `previewHomeFsFile` RPC payload.
class HomeFilePreviewScreen extends StatefulWidget {
  const HomeFilePreviewScreen({
    super.key,
    required this.preview,
  });

  final Map<String, dynamic> preview;

  @override
  State<HomeFilePreviewScreen> createState() => _HomeFilePreviewScreenState();
}

class _HomeFilePreviewScreenState extends State<HomeFilePreviewScreen> {
  String? _error;

  String get _title =>
      widget.preview['title']?.toString() ??
      widget.preview['path']?.toString() ??
      'Preview';

  String? get _kind => widget.preview['kind']?.toString();

  @override
  Widget build(BuildContext context) {
    final error = widget.preview['error']?.toString();
    final kind = _kind;
    if (kind == 'error' || kind == 'unsupported') {
      return Scaffold(
        appBar: AppBar(title: Text(_title)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              error ?? 'Preview unavailable',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final html = widget.preview['html']?.toString();
    final b64 = widget.preview['contentBase64']?.toString();
    final mediaType =
        widget.preview['mediaType']?.toString() ?? 'application/octet-stream';

    String? dataHtml;
    if (html != null && html.isNotEmpty) {
      dataHtml = html;
    } else if (kind == 'image' && b64 != null && b64.isNotEmpty) {
      dataHtml =
          '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;height:auto}</style></head><body><img src="data:$mediaType;base64,$b64" alt=""/></body></html>';
    } else if (kind == 'pdf' && b64 != null && b64.isNotEmpty) {
      dataHtml =
          '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{font-family:sans-serif;margin:16px}embed{width:100%;height:90vh;border:0}</style></head><body><p>PDF preview</p><embed type="application/pdf" src="data:application/pdf;base64,$b64"/></body></html>';
    }

    if (dataHtml == null) {
      return Scaffold(
        appBar: AppBar(title: Text(_title)),
        body: Center(child: Text(error ?? 'Nothing to display')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: Stack(
        children: [
          InAppWebView(
            initialData: InAppWebViewInitialData(
              data: dataHtml,
              mimeType: 'text/html',
              encoding: 'utf-8',
            ),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: false,
              supportZoom: true,
              builtInZoomControls: true,
              displayZoomControls: false,
            ),
            onReceivedError: (controller, request, error) {
              setState(() => _error = error.description);
            },
          ),
          if (_error != null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Material(
                color: Theme.of(context).colorScheme.errorContainer,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(_error!),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
