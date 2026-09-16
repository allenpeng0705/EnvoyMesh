import 'dart:convert';

import 'package:archive/archive.dart';

/// Parse a pairing or invite URI from the home node.
///
/// Parses `envoy://pair?...` (owner QR) and `envoy://invite?...` (family /
/// company invite) URIs from the home node.
///
/// Two pair URI formats are supported:
///
/// 1. **Compressed token format** (preferred, used by Social app >= Phase 12):
///    `envoy://pair?pairing=<base64url-gzip-json>`
///
/// 2. **Legacy query-param format**:
///    `envoy://pair?wsUrl=...&token=...&ownerId=...&...`
///
/// Family invites use `envoy://invite?token=...&wsUrl=...` (Phase 51).
PairingData? parsePairingUri(String uri) {
  final trimmed = uri.trim();
  if (trimmed.isEmpty) return null;

  // Lenient paste: bare `invite?token=...` (Social paste box style).
  final normalized = trimmed.startsWith('invite?')
      ? 'envoy://$trimmed'
      : trimmed;

  final parsed = Uri.tryParse(normalized);
  if (parsed == null) return null;

  final host = parsed.host.toLowerCase();
  final isInvite = host == 'invite' ||
      normalized.startsWith('envoy://invite');

  if (!isInvite && !normalized.startsWith('envoy://pair')) {
    return null;
  }

  if (!isInvite) {
    // Try compressed token format first.
    final compressedToken = parsed.queryParameters['pairing']?.trim();
    if (compressedToken != null && compressedToken.isNotEmpty) {
      try {
        final decoded = _decodePairingToken(compressedToken);
        if (decoded != null) return decoded;
      } catch (_) {
        // Fall through to legacy parsing.
      }
    }
  }

  return _parseLegacyPairingUri(parsed, isInviteUri: isInvite);
}

// ─── Compressed token decoding ─────────────────────────────────────────────

/// Ceiling on the *compressed* pairing blob (base64-decoded bytes) accepted
/// by [_decodePairingToken]. QR codes top out around 3 KiB; even a pasted
/// invite stays well under this. Bounding the input first keeps a hostile
/// (or corrupt) blob from driving a decompression-bomb allocation.
const int _maxPairingCompressedBytes = 8 * 1024;

/// Ceiling on the decompressed pairing JSON. A real blob is ~1–2 KiB;
/// anything larger is not a pairing payload, so refuse it rather than parse
/// it (defense against inflated gzip output).
const int _maxPairingDecompressedBytes = 64 * 1024;

PairingData? _decodePairingToken(String token) {
  if (token.isEmpty) return null;

  final trimmed = token.trim();
  final decompressed = _gzipDecompress(trimmed);
  if (decompressed == null) return null;

  String json;
  try {
    json = utf8.decode(decompressed);
  } catch (_) {
    return null;
  }

  Map<String, dynamic> obj;
  try {
    obj = jsonDecode(json) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }

  final v = obj['v'];
  if (v != 1) return null;

  final ws = obj['ws'] as String?;
  final tok = obj['tok'] as String?;
  final oid = obj['oid'] as String?;

  if (ws == null || ws.isEmpty) return null;
  if (tok == null || tok.isEmpty) return null;
  if (oid == null || oid.isEmpty) return null;

  final relayWsUrl = obj['rel'] as String?;
  final lanWsUrl = obj['lan'] as String?;
  final homeNodePeerId = obj['tid'] as String?;
  final agentPeerId = obj['apid'] as String?;
  final agentName = obj['aname'] as String?;
  // Which app minted the code (`app`). A phone app belongs to one product, so it must
  // refuse another product's code — see `pairingAppMismatch` below.
  final app = obj['app'] as String?;
  final bpnRaw = obj['bpn'];
  final relsRaw = obj['rels'];

  List<String>? bootstrapPresetNames;
  if (bpnRaw is List) {
    final filtered = bpnRaw
        .whereType<String>()
        .where((s) => s.isNotEmpty)
        .toList();
    bootstrapPresetNames = filtered.isEmpty ? null : filtered;
  }

  List<String>? relayWsUrls;
  if (relsRaw is List) {
    final primaryBase = _stripRelayQuery(relayWsUrl);
    final seen = <String>{if (primaryBase != null) primaryBase};
    final extras = <String>[];
    for (final raw in relsRaw.whereType<String>()) {
      final base = _stripRelayQuery(raw);
      if (base == null || base.isEmpty || seen.contains(base)) continue;
      seen.add(base);
      extras.add(base);
      if (extras.length >= 8) break;
    }
    relayWsUrls = extras.isEmpty ? null : extras;
  }

  final bootstrapPeers = relayWsUrls;

  return PairingData(
    token: tok,
    wsUrl: ws,
    relayWsUrl: relayWsUrl?.isNotEmpty == true ? relayWsUrl! : ws,
    lanWsUrl: lanWsUrl?.isNotEmpty == true ? lanWsUrl : null,
    ownerId: oid,
    homeNodePeerId: homeNodePeerId?.isNotEmpty == true ? homeNodePeerId : null,
    agentPeerId: agentPeerId?.isNotEmpty == true ? agentPeerId : null,
    agentName: agentName?.isNotEmpty == true ? agentName : null,
    bootstrapPeers: bootstrapPeers,
    bootstrapPresetNames: bootstrapPresetNames,
    relayWsUrls: relayWsUrls,
    app: app?.isNotEmpty == true ? app : null,
    isInviteUri: false,
  );
}

String? _stripRelayQuery(String? url) {
  if (url == null) return null;
  final trimmed = url.trim();
  if (trimmed.isEmpty) return null;
  final q = trimmed.indexOf('?');
  return q >= 0 ? trimmed.substring(0, q) : trimmed;
}

List<int>? _gzipDecompress(String base64url) {
  try {
    String base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');
    while (base64.length % 4 != 0) {
      base64 += '=';
    }
    final bytes = base64Decode(base64);
    // Bound the compressed input before inflating (see constants above).
    if (bytes.length > _maxPairingCompressedBytes) return null;
    final archive = GZipDecoder().decodeBytes(bytes);
    if (archive.length > _maxPairingDecompressedBytes) return null;
    return archive;
  } catch (_) {
    return null;
  }
}

// ─── Legacy / invite query-param decoding ─────────────────────────────────

PairingData? _parseLegacyPairingUri(
  Uri parsed, {
  required bool isInviteUri,
}) {
  final token = parsed.queryParameters['token']?.trim();
  final wsUrl = parsed.queryParameters['wsUrl']?.trim();

  if (token == null || token.isEmpty) return null;
  if (wsUrl == null || wsUrl.isEmpty) return null;

  final relayWsUrl =
      _nullableTrim(parsed.queryParameters['relayWsUrl']) ?? wsUrl;
  final rels = _parseCsv(parsed.queryParameters['rels']);

  return PairingData(
    token: token,
    wsUrl: wsUrl,
    relayWsUrl: relayWsUrl,
    lanWsUrl: _nullableTrim(parsed.queryParameters['lanWsUrl']),
    ownerId: _nullableTrim(parsed.queryParameters['ownerId']),
    homeNodePeerId: _nullableTrim(parsed.queryParameters['homeNodePeerId']),
    agentPeerId: _nullableTrim(parsed.queryParameters['agentPeerId']),
    agentName: _nullableTrim(parsed.queryParameters['agentName']),
    relayPeerId: _nullableTrim(parsed.queryParameters['relayPeerId']),
    ownerPublicKey: _nullableTrim(parsed.queryParameters['ownerPublicKey']),
    bootstrapPeers:
        _parseBootstrapPeers(parsed.queryParameters['bootstrapPeers']),
    bootstrapPresetNames: _parseBootstrapPresetNames(
        parsed.queryParameters['bootstrapPresetNames']),
    relayWsUrls: rels,
    app: _nullableTrim(parsed.queryParameters['app']),
    inviteId: _nullableTrim(parsed.queryParameters['inviteId']),
    profileId: _nullableTrim(parsed.queryParameters['profileId']),
    isInviteUri: isInviteUri,
  );
}

String? _nullableTrim(String? raw) {
  if (raw == null) return null;
  final trimmed = raw.trim();
  return trimmed.isEmpty ? null : trimmed;
}

List<String>? _parseBootstrapPeers(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  return _parseCsv(raw);
}

List<String>? _parseCsv(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  final parts = trimmed
      .split(',')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  return parts.isEmpty ? null : parts;
}

List<String>? _parseBootstrapPresetNames(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  return trimmed
      .split(',')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
}

/// Parsed pairing / invite URI data from the home node.
class PairingData {
  final String token;
  final String wsUrl;
  final String relayWsUrl;
  final String? lanWsUrl;
  final String? ownerId;
  final String? homeNodePeerId;
  final String? agentPeerId;
  final String? agentName;
  final String? relayPeerId;
  final String? ownerPublicKey;
  final List<String>? bootstrapPeers;
  final List<String>? bootstrapPresetNames;
  final List<String>? relayWsUrls;

  /// Which app minted this code (`"EnvoyMesh"`, `"EnvoyDev"`, …), when the code says.
  ///
  /// A phone app belongs to the same product as the desktop app it pairs with, so it
  /// must refuse a code from another one. Check it with [pairingAppMismatch] **before**
  /// dialling anything: the node cannot refuse it for you, because the token inside the
  /// code is opaque and app-local, and all the node ever sees is its own token.
  final String? app;

  /// True when URI was `envoy://invite` (family / company invite).
  final bool isInviteUri;

  /// Optional invite id from the URI (audit / UI).
  final String? inviteId;

  /// Optional pre-selected family profile id (targeted invite / re-pair).
  final String? profileId;

  const PairingData({
    required this.token,
    required this.wsUrl,
    required this.relayWsUrl,
    this.lanWsUrl,
    this.ownerId,
    this.homeNodePeerId,
    this.agentPeerId,
    this.agentName,
    this.relayPeerId,
    this.ownerPublicKey,
    this.bootstrapPeers,
    this.bootstrapPresetNames,
    this.relayWsUrls,
    this.app,
    this.isInviteUri = false,
    this.inviteId,
    this.profileId,
  });
}

/// The app this client *is*, unless its launcher says otherwise.
///
/// The Dart twin of `@envoymesh/protocol`'s `resolveAppName`: a phone app passes its own
/// product name, and a product that renames itself does it in one place.
const String kDefaultAppName = 'EnvoyMesh';

/// Why a pairing code from another app must be refused, or `null` when it is fine.
///
/// The rule that makes "the dedicated mobile app pairs only with its corresponding
/// desktop app" true. **The client is the only side that can enforce it**: the pairing
/// token inside the code is opaque and app-local, so another product's node never
/// validates it, and all this node ever sees is its own token. What actually happens
/// without this check is that someone scans the wrong QR code and the app dutifully
/// dials the `wsUrl` inside it.
///
/// Returns a sentence for the **user**, not a code — they are the one who has to act on
/// it. `codeApp == null` means the code predates the field, and is accepted: refusing it
/// would break every QR already printed, and the phone still has to authenticate.
String? pairingAppMismatch(String? codeApp, String appName) {
  final claimed = _boundedAppLabel(codeApp);
  if (claimed == null) return null;
  final mine = _boundedAppLabel(appName) ?? kDefaultAppName;
  if (claimed == mine) return null;
  return 'That code was made by $claimed, and this is $mine. '
      'Open $claimed and show its pairing code, or install $claimed here.';
}

/// Bound untrusted text before it reaches a dialog.
///
/// The claimed name comes from a scanned code, so it is untrusted input on its way to a
/// screen someone is being asked to trust: control characters removed, length capped.
String? _boundedAppLabel(String? raw) {
  final trimmed = raw?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  // ignore: unnecessary_raw_strings
  final cleaned = trimmed.replaceAll(RegExp(r'[\x00-\x1f\x7f]'), '').trim();
  if (cleaned.isEmpty) return null;
  return cleaned.length > 40 ? '${cleaned.substring(0, 40)}\u2026' : cleaned;
}
