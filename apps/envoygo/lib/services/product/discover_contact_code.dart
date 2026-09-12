/// Parse Discover paste: peer IDs, multiaddrs, and `envoy://contact` links.
///
/// Mirrors Social `discover-contact-code.ts` (peer-id + contact subset).
library;

/// True for typical libp2p peer IDs (base58btc, often Qm… or 12D3…).
bool looksLikePeerId(String value) {
  final trimmed = value.trim();
  if (trimmed.length < 32 || trimmed.length > 128) return false;
  if (!RegExp(r'^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$')
      .hasMatch(trimmed)) {
    return false;
  }
  return trimmed.startsWith('Qm') || trimmed.startsWith('12D3');
}

sealed class ParsedDiscoverCode {
  const ParsedDiscoverCode();
}

class DiscoverPeerIdCode extends ParsedDiscoverCode {
  const DiscoverPeerIdCode(this.peerId);
  final String peerId;
}

class DiscoverContactCode extends ParsedDiscoverCode {
  const DiscoverContactCode({
    required this.contactUri,
    this.peerId,
    this.ownerId,
    this.displayName,
    this.joinToken,
  });
  final String contactUri;
  final String? peerId;
  final String? ownerId;
  final String? displayName;
  final String? joinToken;
}

class DiscoverInvalidCode extends ParsedDiscoverCode {
  const DiscoverInvalidCode(this.message);
  final String message;
}

/// Extract peer ID / contact fields from pasted Discover input.
ParsedDiscoverCode parseDiscoverContactCode(String input) {
  final trimmed = input.trim();
  if (trimmed.isEmpty) {
    return const DiscoverInvalidCode(
      'Paste a peer ID or an envoy://contact link from Share contact card.',
    );
  }

  if (trimmed.startsWith('envoy://contact') || trimmed.startsWith('contact?')) {
    try {
      final uri = trimmed.startsWith('envoy://')
          ? Uri.parse(trimmed)
          : Uri.parse('envoy://$trimmed');
      if (uri.scheme != 'envoy' || uri.host != 'contact') {
        return const DiscoverInvalidCode('Expected an envoy://contact link.');
      }
      final peerId = uri.queryParameters['peerId']?.trim();
      final ownerId = uri.queryParameters['ownerId']?.trim();
      final displayName = uri.queryParameters['name']?.trim();
      final joinRaw = uri.queryParameters['join']?.trim();
      if ((peerId == null || peerId.isEmpty) &&
          (joinRaw == null || joinRaw.isEmpty) &&
          (ownerId == null || ownerId.isEmpty)) {
        return const DiscoverInvalidCode(
          'That contact link is missing peerId or ownerId.',
        );
      }
      return DiscoverContactCode(
        contactUri:
            trimmed.startsWith('envoy://') ? trimmed : 'envoy://$trimmed',
        peerId: (peerId != null && peerId.isNotEmpty) ? peerId : null,
        ownerId: (ownerId != null && ownerId.isNotEmpty) ? ownerId : null,
        displayName:
            (displayName != null && displayName.isNotEmpty) ? displayName : null,
        joinToken: (joinRaw != null && joinRaw.isNotEmpty) ? joinRaw : null,
      );
    } catch (_) {
      return const DiscoverInvalidCode('That contact link looks invalid.');
    }
  }

  final p2p = RegExp(r'/p2p/([^/\s?#]+)').firstMatch(trimmed);
  if (p2p != null && p2p.group(1) != null) {
    return DiscoverPeerIdCode(p2p.group(1)!);
  }

  if (looksLikePeerId(trimmed)) {
    return DiscoverPeerIdCode(trimmed);
  }

  if (trimmed.startsWith('envoy:owner:')) {
    return DiscoverContactCode(
      contactUri: trimmed,
      ownerId: trimmed,
    );
  }

  return const DiscoverInvalidCode(
    'That does not look like a peer ID or contact link.',
  );
}

/// True when the query should use peer-ID / contact lookup instead of topic.
bool looksLikeDiscoverIdOrLink(String input) {
  final t = input.trim();
  if (t.isEmpty) return false;
  if (t.startsWith('envoy://contact') || t.startsWith('contact?')) return true;
  if (t.startsWith('envoy:owner:')) return true;
  if (t.contains('/p2p/')) return true;
  return looksLikePeerId(t);
}
