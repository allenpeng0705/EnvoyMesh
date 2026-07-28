import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Open an https URL in the system browser (best-effort).
Future<bool> openExternalUrl(String url) async {
  final uri = Uri.tryParse(url.trim());
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
    return false;
  }
  try {
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (e) {
    debugPrint('openExternalUrl failed: $e');
    return false;
  }
}
