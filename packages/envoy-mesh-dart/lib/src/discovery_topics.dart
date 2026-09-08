/// Discovery topic vocabulary — parity with `apps/node/src/capability-discovery.ts`.
library;

/// Preset interest/topic chips — keep in sync with Social `SUGGESTED_TOPICS`
/// (`apps/social/src/lib/display.ts`).
const List<String> suggestedDiscoveryTopics = [
  'music',
  'tech',
  'art',
  'science',
  'gaming',
  'movies',
  'books',
  'travel',
  'food',
  'fitness',
  'news',
  'sports',
  'fashion',
  'photography',
  'coding',
];

/// Slugify free-text into a DHT-safe topic segment (Unicode letters/numbers).
String slugifyTopic(String value) {
  final slug = value
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  return slug;
}

/// Canonical `interest:<slug>` topic (idempotent if already prefixed).
String interestTopicFor(String rawInterest) {
  final trimmed = rawInterest.trim();
  if (trimmed.toLowerCase().startsWith('interest:')) {
    final rest = trimmed.substring('interest:'.length);
    final slug = slugifyTopic(rest);
    return slug.isEmpty ? '' : 'interest:$slug';
  }
  final slug = slugifyTopic(trimmed);
  return slug.isEmpty ? '' : 'interest:$slug';
}

/// Canonical `displayname:<slug>` topic (idempotent if already prefixed).
String displayNameTopicFor(String rawDisplayName) {
  final trimmed = rawDisplayName.trim();
  if (trimmed.toLowerCase().startsWith('displayname:')) {
    final rest = trimmed.substring('displayname:'.length);
    final slug = slugifyTopic(rest);
    return slug.isEmpty ? '' : 'displayname:$slug';
  }
  final slug = slugifyTopic(trimmed);
  return slug.isEmpty ? '' : 'displayname:$slug';
}

/// Build interest topics from profile hobbies + knowledge.
List<String> buildInterestTopics({
  List<String>? hobbies,
  List<String>? knowledge,
}) {
  final tags = <String>{};
  for (final hobby in hobbies ?? const <String>[]) {
    final t = interestTopicFor(hobby);
    if (t.isNotEmpty) tags.add(t);
  }
  for (final item in knowledge ?? const <String>[]) {
    final t = interestTopicFor(item);
    if (t.isNotEmpty) tags.add(t);
  }
  return tags.toList()..sort();
}

/// Public discovery topics for a phone human profile.
List<String> computePhoneDiscoveryTopics(Map<String, dynamic> profile) {
  final topics = <String>{};
  final displayName = profile['displayName'] as String?;
  if (displayName != null && displayName.trim().isNotEmpty) {
    final t = displayNameTopicFor(displayName);
    if (t.isNotEmpty) topics.add(t);
  }
  final username = profile['username'] as String?;
  if (username != null && username.trim().isNotEmpty) {
    final handle = username.trim().replaceFirst(RegExp(r'^@'), '');
    if (handle.isNotEmpty) topics.add('username:$handle');
  }
  final hobbies = (profile['hobbies'] as List?)
          ?.map((e) => e.toString())
          .toList() ??
      const <String>[];
  final knowledge = (profile['knowledge'] as List?)
          ?.map((e) => e.toString())
          .toList() ??
      const <String>[];
  final interests = (profile['interests'] as List?)
          ?.map((e) => e.toString())
          .toList() ??
      const <String>[];
  topics.addAll(buildInterestTopics(
    hobbies: [...hobbies, ...interests],
    knowledge: knowledge,
  ));
  return topics.toList()..sort();
}

/// Expand a user query into DHT/relay topic keys (search side).
List<String> expandDiscoveryTopicQueries({
  String? topic,
  List<String>? interests,
}) {
  final out = <String>{};
  final t = topic?.trim() ?? '';
  if (t.isNotEmpty) {
    if (t.contains(':')) {
      out.add(t);
    } else {
      final interest = interestTopicFor(t);
      if (interest.isNotEmpty) out.add(interest);
      final display = displayNameTopicFor(t);
      if (display.isNotEmpty) out.add(display);
      final slug = slugifyTopic(t);
      if (slug.isNotEmpty) {
        out.add(slug);
        out.add('capability:$slug');
      }
    }
  }
  for (final raw in interests ?? const <String>[]) {
    final interest = interestTopicFor(raw);
    if (interest.isNotEmpty) out.add(interest);
  }
  return out.toList();
}
