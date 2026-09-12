/// Peer Blog retrieval bounds — mirror `@envoymesh/api` BLOG_* constants.
library;

/// Max rows publishers write into `blog/index.md` (newest-first).
const int blogIndexMaxPosts = 50;

/// Peer Blog UI: how many index rows to show / enrich per page.
const int blogPeerPageSize = 20;
