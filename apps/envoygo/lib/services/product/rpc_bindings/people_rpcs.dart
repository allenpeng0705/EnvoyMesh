import '../../../models/contact.dart';
import '../../../models/content_engage_notification.dart';
import '../../../models/feed_notification.dart';
import '../../../models/peer_search_result.dart';
import '../../home_rpc_session.dart';

/// People bindings: bonds, peer profiles, public profile, discovery and the inbox.
mixin PeopleRpcs on HomeRpcSession {
  // -- Contacts & bonds --

  Future<List<Contact>> getBonds() async {
    final result = await homeClient.call('getBonds');
    final list = result as List<dynamic>;
    return list
        .map((e) => Contact.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> getPeerProfile(String ownerId) async {
    return await homeClient.call('getPeerProfile', {'ownerId': ownerId})
        as Map<String, dynamic>;
  }

  // -- Chat — direct messages --

  Future<List<Map<String, dynamic>>> listPendingSocialIntroProposals() async {
    final result = await homeClient.call('listPendingSocialIntroProposals');
    return (result as List<dynamic>)
        .map((e) => e as Map<String, dynamic>)
        .toList();
  }

  /// Phase 45E — list persisted inbound `feed.notify` rows from the home.
  Future<List<FeedNotification>> listFeedNotifications() async {
    final result = await homeClient.call('listFeedNotifications');
    return (result as List<dynamic>)
        .map((e) => FeedNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Phase 45E — dismiss one inbox row by id.
  Future<void> dismissFeedNotification(String id) async {
    await homeClient.call('dismissFeedNotification', {'id': id});
  }

  Future<void> dismissAllFeedNotifications() async {
    await homeClient.call('dismissAllFeedNotifications', {});
  }

  /// Unread stars/comments on the owner's Feed/Blog (Content badges).
  Future<List<ContentEngageNotification>>
  listContentEngageNotifications() async {
    final result = await homeClient.call('listContentEngageNotifications');
    return (result as List<dynamic>)
        .map(
          (e) => ContentEngageNotification.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  /// Clear Content engagement badges for a surface or all.
  Future<void> dismissContentEngageNotifications({
    String surface = 'all',
  }) async {
    await homeClient.call('dismissContentEngageNotifications', {
      'surface': surface,
    });
  }

  // -- Terminal PTY I/O --

  Future<Map<String, dynamic>> getHumanProfile() async {
    return await homeClient.call('getHumanProfile') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateHumanProfile(
    Map<String, dynamic> patch,
  ) async {
    return await homeClient.call('updateHumanProfile', patch)
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setPublicProfileThumbnail({
    required String contentBase64,
    required String mimeType,
  }) async {
    return await homeClient.call('setPublicProfileThumbnail', {
          'contentBase64': contentBase64,
          'mimeType': mimeType,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> upsertProfileGalleryPhoto({
    required String contentBase64,
    required String mimeType,
    String visibility = 'public',
    String? label,
    String? photoId,
  }) async {
    return await homeClient.call('upsertProfileGalleryPhoto', {
          'contentBase64': contentBase64,
          'mimeType': mimeType,
          'visibility': visibility,
          if (label != null) 'label': label,
          if (photoId != null) 'photoId': photoId,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> removeProfileGalleryPhoto({
    required String vaultRelativePath,
  }) async {
    return await homeClient.call('removeProfileGalleryPhoto', {
          'vaultRelativePath': vaultRelativePath,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProfileGalleryPhotoVisibility({
    required String vaultRelativePath,
    required String visibility,
  }) async {
    return await homeClient.call('updateProfileGalleryPhotoVisibility', {
          'vaultRelativePath': vaultRelativePath,
          'visibility': visibility,
        })
        as Map<String, dynamic>;
  }

  Future<void> syncProfileToBonds() async {
    await homeClient.call('syncProfileToBonds');
  }

  // -- Discovery / People (Explore) --

  /// DHT / mesh peer search (topic, interests, geo topics).
  Future<List<PeerSearchResult>> searchPeers({
    String? topic,
    List<String>? topics,
    List<String>? interests,
    String? peerId,
    int maxResults = 20,
  }) async {
    final params = <String, dynamic>{
      'maxResults': maxResults,
      if (topic != null) 'topic': topic,
      if (topics != null) 'topics': topics,
      if (interests != null) 'interests': interests,
      if (peerId != null && peerId.trim().isNotEmpty) 'peerId': peerId.trim(),
    };
    final result = await homeClient.call('searchPeers', params);
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .map((e) => PeerSearchResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Kick capability discovery so `searchPeers` has fresher publishers.
  Future<void> runCapabilityDiscovery({bool find = true}) async {
    await homeClient.call('runCapabilityDiscovery', {'find': find});
  }

  /// Send a Say Hello (bond request) to [targetOwnerId].
  Future<Map<String, dynamic>> sendHello({
    required String targetOwnerId,
    required Map<String, dynamic> profile,
    required String message,
  }) async {
    return await homeClient.call('sendHello', {
          'targetOwnerId': targetOwnerId,
          'profile': profile,
          'message': message,
        })
        as Map<String, dynamic>;
  }

  // -- Web content (Phase 45 Content tab) --
}
