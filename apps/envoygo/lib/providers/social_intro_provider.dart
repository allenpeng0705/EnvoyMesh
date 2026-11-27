import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'contact_provider.dart' show nodeServiceProvider;

/// Result of one-tap intro approve (+ outbound hello).
enum SocialIntroApproveOutcome {
  /// Commitment accepted and hello sent.
  success,

  /// `approveSocialIntroCommitment` failed — proposal stays pending.
  approveFailed,

  /// Commitment accepted but `sendHello` failed — proposal leaves the queue.
  helloFailed,
}

/// Pending social intro proposal from the home node.
class SocialIntroProposal {
  const SocialIntroProposal({
    required this.messageId,
    required this.candidateOwnerId,
    this.candidateDisplayName,
    this.candidatePeerId,
  });

  final String messageId;
  final String candidateOwnerId;
  final String? candidateDisplayName;
  final String? candidatePeerId;

  factory SocialIntroProposal.fromJson(Map<String, dynamic> json) {
    final messageId = (json['messageId'] ?? '').toString().trim();
    final candidateOwnerId = (json['candidateOwnerId'] ??
            json['fromOwnerId'] ??
            '')
        .toString()
        .trim();
    return SocialIntroProposal(
      messageId: messageId,
      candidateOwnerId: candidateOwnerId,
      candidateDisplayName: (json['candidateDisplayName'] ??
              json['fromDisplayName'] ??
              json['displayName'])
          ?.toString(),
      candidatePeerId: json['candidatePeerId']?.toString(),
    );
  }
}

class SocialIntroState {
  const SocialIntroState({
    this.items = const [],
    this.loading = false,
    this.error,
    this.busyMessageId,
  });

  final List<SocialIntroProposal> items;
  final bool loading;
  final String? error;
  final String? busyMessageId;

  SocialIntroState copyWith({
    List<SocialIntroProposal>? items,
    bool? loading,
    String? error,
    String? busyMessageId,
    bool clearError = false,
    bool clearBusy = false,
  }) {
    return SocialIntroState(
      items: items ?? this.items,
      loading: loading ?? this.loading,
      error: clearError ? null : (error ?? this.error),
      busyMessageId:
          clearBusy ? null : (busyMessageId ?? this.busyMessageId),
    );
  }
}

class SocialIntroNotifier extends StateNotifier<SocialIntroState> {
  SocialIntroNotifier(this._ref) : super(const SocialIntroState());

  final Ref _ref;

  Future<void> refresh() async {
    final client = _ref.read(nodeServiceProvider);
    if (client == null) {
      state = const SocialIntroState();
      return;
    }
    state = state.copyWith(loading: true, clearError: true);
    try {
      final raw = await client.listPendingSocialIntroProposals();
      final items = [
        for (final row in raw)
          SocialIntroProposal.fromJson(row),
      ].where((p) => p.messageId.isNotEmpty && p.candidateOwnerId.isNotEmpty);
      state = SocialIntroState(items: items.toList());
    } catch (e) {
      state = state.copyWith(loading: false, error: '$e');
    }
  }

  /// Approve the intro commitment, then send hello (Social’s two taps in one).
  ///
  /// If approve succeeds but hello fails, the proposal is still dropped from
  /// the pending queue — commitment is already accepted on the home node.
  Future<SocialIntroApproveOutcome> approve(
    SocialIntroProposal proposal,
  ) async {
    final client = _ref.read(nodeServiceProvider);
    if (client == null) return SocialIntroApproveOutcome.approveFailed;
    state = state.copyWith(busyMessageId: proposal.messageId, clearError: true);

    try {
      await client.approveSocialIntroCommitment(proposal.messageId);
    } catch (e) {
      state = state.copyWith(error: '$e', clearBusy: true);
      return SocialIntroApproveOutcome.approveFailed;
    }

    List<SocialIntroProposal> withoutProposal() => [
          for (final p in state.items)
            if (p.messageId != proposal.messageId) p,
        ];

    try {
      final profile = await client.getHumanProfile();
      final hobbies =
          (profile['hobbies'] as List?)?.map((e) => e.toString()).toList() ??
              const <String>[];
      final knowledge =
          (profile['knowledge'] as List?)?.map((e) => e.toString()).toList() ??
              const <String>[];
      // HelloProfile shape — same as Social Inbox / Explore (not raw profile).
      await client.sendHello(
        targetOwnerId: proposal.candidateOwnerId,
        profile: {
          'displayName': (profile['displayName'] as String?) ?? 'Envoy user',
          'bio': (profile['bio'] as String?) ?? '',
          'interests': [...hobbies, ...knowledge],
          'whatShares': <String>[],
        },
        message: "Hi — I'd like to connect on Envoy.",
        introProposalMessageId: proposal.messageId,
      );
      state = state.copyWith(
        items: withoutProposal(),
        clearBusy: true,
      );
      return SocialIntroApproveOutcome.success;
    } catch (e) {
      // Commitment already accepted — clear the queue row; hello is retryable.
      state = state.copyWith(
        items: withoutProposal(),
        error: '$e',
        clearBusy: true,
      );
      return SocialIntroApproveOutcome.helloFailed;
    }
  }

  Future<bool> decline(SocialIntroProposal proposal) async {
    final client = _ref.read(nodeServiceProvider);
    if (client == null) return false;
    state = state.copyWith(busyMessageId: proposal.messageId, clearError: true);
    try {
      await client.declineSocialIntroProposal(proposal.messageId);
      state = state.copyWith(
        items: [
          for (final p in state.items)
            if (p.messageId != proposal.messageId) p,
        ],
        clearBusy: true,
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: '$e', clearBusy: true);
      return false;
    }
  }
}

final socialIntroProvider =
    StateNotifierProvider<SocialIntroNotifier, SocialIntroState>(
  (ref) => SocialIntroNotifier(ref),
);
