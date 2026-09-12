import '../../../models/family_attachment.dart';
import '../../home_rpc_session.dart';

/// Family/market bindings: profile-bound pairing, the family network
/// (profiles, invites, family rooms, attachments) and the home shop/market.
mixin FamilyMarketRpcs on HomeRpcSession {
  // -- Connection & pairing --

  Future<Map<String, dynamic>> pairWithHomeNode({
    required String pairingToken,
    required String deviceName,
    required String platform,
    String? deviceId,
    String? profileId,
    String? profileName,
    String? profileAvatarColor,
  }) async {
    return await homeClient.call(
          'pairThinClient',
          {
            'pairingToken': pairingToken,
            'deviceName': deviceName,
            'platform': platform,
            if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
            if (profileId != null && profileId.isNotEmpty) 'profileId': profileId,
            if (profileName != null && profileName.isNotEmpty)
              'profileName': profileName,
            if (profileAvatarColor != null && profileAvatarColor.isNotEmpty)
              'profileAvatarColor': profileAvatarColor,
          },
          // Pairing can involve family-store + session writes on a busy home.
          const Duration(seconds: 60),
        ) as Map<String, dynamic>;
  }

  /// Phase 51 — list selectable profiles for a family invite (pre-auth).
  Future<List<Map<String, dynamic>>> previewFamilyInvite({
    required String pairingToken,
    String? deviceId,
  }) async {
    final result =
        await homeClient.call('previewFamilyInvite', {
              'pairingToken': pairingToken,
              if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
            })
            as Map<String, dynamic>;
    final raw = result['profiles'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  // -- Phase 51 Family Network --

  Future<Map<String, dynamic>> listFamilyProfiles() async {
    return await homeClient.call('listFamilyProfiles') as Map<String, dynamic>;
  }

  // -- Phase 63A Envoy Market (local shop on home) --

  Future<Map<String, dynamic>> shopGetProfile() async {
    return await homeClient.call('shopGetProfile') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> shopListListings({String? status}) async {
    return await homeClient.call('shopListListings', {
          if (status != null && status.isNotEmpty) 'status': status,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> shopUpsertListing({
    String? listingId,
    required String title,
    String? description,
    String? category,
    List<String>? tags,
    String? condition,
    String? status,
    String? visibility,
    required String priceAmount,
    String? priceCurrency,
    List<String>? mediaPaths,
  }) async {
    return await homeClient.call('shopUpsertListing', {
          if (listingId != null && listingId.isNotEmpty) 'listingId': listingId,
          'title': title,
          if (description != null) 'description': description,
          if (category != null) 'category': category,
          if (tags != null) 'tags': tags,
          if (condition != null) 'condition': condition,
          if (status != null) 'status': status,
          if (visibility != null) 'visibility': visibility,
          'priceAmount': priceAmount,
          if (priceCurrency != null) 'priceCurrency': priceCurrency,
          if (mediaPaths != null) 'mediaPaths': mediaPaths,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> shopSetListingStatus({
    required String listingId,
    required String status,
  }) async {
    return await homeClient.call('shopSetListingStatus', {
          'listingId': listingId,
          'status': status,
        })
        as Map<String, dynamic>;
  }

  /// Phase 63E — draft listing fields from notes / photo filename.
  Future<Map<String, dynamic>> shopDraftListing({
    String? notes,
    String? photoFileName,
  }) async {
    return await homeClient.call('shopDraftListing', {
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          if (photoFileName != null && photoFileName.isNotEmpty)
            'photoFileName': photoFileName,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> shopSaveListingMedia({
    required String filename,
    required String contentBase64,
    String? mimeType,
  }) async {
    return await homeClient.call('shopSaveListingMedia', {
          'filename': filename,
          'contentBase64': contentBase64,
          if (mimeType != null && mimeType.isNotEmpty) 'mimeType': mimeType,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> shopGetListingMedia({
    required String listingId,
    String? mediaPath,
  }) async {
    return await homeClient.call('shopGetListingMedia', {
          'listingId': listingId,
          if (mediaPath != null && mediaPath.isNotEmpty) 'mediaPath': mediaPath,
        })
        as Map<String, dynamic>;
  }

  /// Phase 63B — browse peer MarketCache on home (bonded announces).
  Future<Map<String, dynamic>> marketSearch({
    String? query,
    int? limit,
    String? category,
    String? minPrice,
    String? maxPrice,
    String? currency,
  }) async {
    return await homeClient.call('marketSearch', {
          if (query != null && query.isNotEmpty) 'query': query,
          if (limit != null) 'limit': limit,
          if (category != null && category.isNotEmpty) 'category': category,
          if (minPrice != null && minPrice.isNotEmpty) 'minPrice': minPrice,
          if (maxPrice != null && maxPrice.isNotEmpty) 'maxPrice': maxPrice,
          if (currency != null && currency.isNotEmpty) 'currency': currency,
        })
        as Map<String, dynamic>;
  }

  /// Phase 63D — Browse chips + default fill.
  Future<Map<String, dynamic>> marketBrowseSuggestions() async {
    return await homeClient.call('marketBrowseSuggestions') as Map<String, dynamic>;
  }

  /// Phase 63D — clear Browse search-history suggestion chips.
  Future<Map<String, dynamic>> marketClearSearchHistory() async {
    return await homeClient.call('marketClearSearchHistory') as Map<String, dynamic>;
  }

  /// Phase 63C — report seller (audit + local block).
  Future<void> marketReportSeller({
    required String sellerOwnerId,
    String? listingId,
    String? reason,
  }) async {
    await homeClient.call('marketReportSeller', {
      'sellerOwnerId': sellerOwnerId,
      if (listingId != null && listingId.isNotEmpty) 'listingId': listingId,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    });
  }

  Future<void> blockPeer(String peerOwnerId) async {
    await homeClient.call('blockPeer', {'peerOwnerId': peerOwnerId});
  }

  Future<Map<String, dynamic>> marketShareListing(String listingId) async {
    return await homeClient.call('marketShareListing', {
          'listingId': listingId,
        })
        as Map<String, dynamic>;
  }

  /// Phase 63E — seller FAQ reply from listing text (propose / approve).
  Future<Map<String, dynamic>> marketSuggestSellerReply({
    required String listingId,
    required String buyerMessage,
  }) async {
    return await homeClient.call('marketSuggestSellerReply', {
          'listingId': listingId,
          'buyerMessage': buyerMessage,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createFamilyProfile({
    required String name,
    String? avatarColor,
  }) async {
    return await homeClient.call('createFamilyProfile', {
          'name': name,
          if (avatarColor != null) 'avatarColor': avatarColor,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateFamilyProfile({
    required String id,
    String? name,
    String? avatarColor,
    bool? active,
    List<Map<String, dynamic>>? aiBots,
    bool? extAgentEnabled,
    bool? codingEnabled,
  }) async {
    return await homeClient.call('updateFamilyProfile', {
          'id': id,
          if (name != null) 'name': name,
          if (avatarColor != null) 'avatarColor': avatarColor,
          if (active != null) 'active': active,
          if (aiBots != null) 'aiBots': aiBots,
          if (extAgentEnabled != null) 'extAgentEnabled': extAgentEnabled,
          if (codingEnabled != null) 'codingEnabled': codingEnabled,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteFamilyProfile(String id) async {
    return await homeClient.call('deleteFamilyProfile', {'id': id})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> generateFamilyInviteToken({
    int? expiresInHours,
    String? note,
  }) async {
    return await homeClient.call('generateFamilyInviteToken', {
          if (expiresInHours != null) 'expiresInHours': expiresInHours,
          if (note != null) 'note': note,
        })
        as Map<String, dynamic>;
  }

  /// Phase 51C — local family DM (never leaves the home node).
  ///
  /// v0.3 (§3.1): [text] may be omitted when [attachments] is present; each
  /// element of [attachments] is a metadata descriptor `{id, filename,
  /// mimeType, sizeBytes, contentHash?}` whose bytes were already uploaded
  /// via [uploadFamilyAttachment].
  Future<Map<String, dynamic>> sendFamilyMessage({
    required String toProfileId,
    String? text,
    List<Map<String, dynamic>>? attachments,
  }) async {
    _guardFamilySendParams(text: text, attachments: attachments);
    return await homeClient.call('sendFamilyMessage', {
          'toProfileId': toProfileId,
          if (text != null) 'text': text,
          if (attachments != null && attachments.isNotEmpty)
            'attachments': attachments,
        })
        as Map<String, dynamic>;
  }

  /// v0.3 §3.2 — upload family-media bytes before referencing them in a
  /// family message. [scope] is a DM pair (`dm`) or a family room (`room`);
  /// returns the metadata descriptor `{id, filename, mimeType, sizeBytes,
  /// contentHash}` to pass as an `attachments` entry on
  /// [sendFamilyMessage] / [sendFamilyRoomMessage].
  ///
  /// Storage stays in the profile `family-media` area — never the owner vault,
  /// never the mesh. Each upload creates a fresh attachment id (no server-side
  /// content-hash dedupe today); clients send the returned descriptor verbatim.
  Future<Map<String, dynamic>> uploadFamilyAttachment({
    required FamilyAttachmentScope scope,
    required String filename,
    required String mimeType,
    required String contentBase64,
  }) async {
    scope.validate();
    return await homeClient.call(
          'uploadFamilyAttachment',
          {
            'scope': scope.toJson(),
            'filename': filename,
            'mimeType': mimeType,
            'contentBase64': contentBase64,
          },
          const Duration(seconds: 120),
        )
        as Map<String, dynamic>;
  }

  /// v0.3 §3.3 — read stored family-media bytes lazily (on demand).
  ///
  /// Reads are ALWAYS sliced: pass [offset] + [maxBytes] for a range read;
  /// when [offset] is set, [sizeBytes] in the result is the full stored size
  /// and [truncated] is true while more bytes remain beyond
  /// `offset + maxBytes`. Omitting both starts at offset 0 with the server's
  /// default slice — the home node caps every response at 1 MiB
  /// (`FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES`), so a large file must be fetched
  /// in multiple range reads (see `fetchFamilyAttachmentContent`). There is no
  /// whole-file read.
  Future<Map<String, dynamic>> readFamilyAttachment({
    required String id,
    int? offset,
    int? maxBytes,
  }) async {
    final trimmedId = id.trim();
    if (trimmedId.isEmpty) {
      throw ArgumentError.value(id, 'id', 'readFamilyAttachment requires a non-empty attachment id');
    }
    return await homeClient.call('readFamilyAttachment', {
          'id': trimmedId,
          if (offset != null) 'offset': offset,
          if (maxBytes != null) 'maxBytes': maxBytes,
        })
        as Map<String, dynamic>;
  }

  /// v0.3 §3.1 — attachment-aware family sends must carry at least a message
  /// body or one attachment descriptor.
  void _guardFamilySendParams({
    String? text,
    List<Map<String, dynamic>>? attachments,
  }) {
    final hasText = text != null && text.trim().isNotEmpty;
    final hasAttachments = attachments != null && attachments.isNotEmpty;
    if (!hasText && !hasAttachments) {
      throw ArgumentError(
        'Family messages require text and/or at least one attachment '
        'descriptor (upload bytes via uploadFamilyAttachment first).',
      );
    }
  }

  Future<Map<String, dynamic>> listFamilyRooms() async {
    return await homeClient.call('listFamilyRooms') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createFamilyRoom({
    required String title,
    required List<String> memberProfileIds,
  }) async {
    return await homeClient.call('createFamilyRoom', {
          'title': title,
          'memberProfileIds': memberProfileIds,
        })
        as Map<String, dynamic>;
  }

  /// Phase 51C — local family room message (never leaves the home node).
  ///
  /// v0.3 (§3.1): same optional [attachments] semantics as
  /// [sendFamilyMessage], scoped to the room.
  Future<Map<String, dynamic>> sendFamilyRoomMessage({
    required String roomId,
    String? text,
    List<Map<String, dynamic>>? attachments,
  }) async {
    _guardFamilySendParams(text: text, attachments: attachments);
    return await homeClient.call('sendFamilyRoomMessage', {
          'roomId': roomId,
          if (text != null) 'text': text,
          if (attachments != null && attachments.isNotEmpty)
            'attachments': attachments,
        })
        as Map<String, dynamic>;
  }
}
