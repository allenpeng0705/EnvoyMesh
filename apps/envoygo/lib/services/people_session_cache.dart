import '../../models/peer_search_result.dart';
import 'parse_public_blog_index.dart';

enum PeopleSearchModeCache { topic, interest }

/// In-session People results so leaving Content and returning does not wipe the list.
class PeopleSessionCache {
  PeopleSessionCache._();

  static PeopleSearchModeCache mode = PeopleSearchModeCache.topic;
  static String query = '';
  static List<PeerSearchResult> results = const [];
  static bool fromSample = true;
  static String? error;
  static Map<String, List<PublicBlogPostLink>> blogPreviews = const {};
  static bool get hasResults => results.isNotEmpty;

  static void save({
    required PeopleSearchModeCache mode,
    required String query,
    required List<PeerSearchResult> results,
    required bool fromSample,
    required String? error,
    required Map<String, List<PublicBlogPostLink>> blogPreviews,
  }) {
    PeopleSessionCache.mode = mode;
    PeopleSessionCache.query = query;
    PeopleSessionCache.results = List.unmodifiable(results);
    PeopleSessionCache.fromSample = fromSample;
    PeopleSessionCache.error = error;
    PeopleSessionCache.blogPreviews = Map.unmodifiable(
      blogPreviews.map((k, v) => MapEntry(k, List.unmodifiable(v))),
    );
  }

  static void clear() {
    mode = PeopleSearchModeCache.topic;
    query = '';
    results = const [];
    fromSample = true;
    error = null;
    blogPreviews = const {};
  }
}
