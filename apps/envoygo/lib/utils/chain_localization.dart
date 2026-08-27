import '../l10n/app_localizations.dart';

/// Localized label for live step states from `chainGetState.steps[].state`.
String chainStepStateLabel(AppLocalizations l10n, String state) {
  switch (state) {
    case 'pending':
      return l10n.chainsStepStatePending;
    case 'offered':
      return l10n.chainsStepStateOffered;
    case 'awarded':
      return l10n.chainsStepStateAwarded;
    case 'running':
      return l10n.chainsStepStateRunning;
    case 'done':
      return l10n.chainsStepStateDone;
    case 'failed':
      return l10n.chainsStepStateFailed;
    case 'cancelled':
      return l10n.chainsStepStateCancelled;
    default:
      return state;
  }
}

/// Localized label for speculation attempt roles.
String? chainSpeculationRoleLabel(AppLocalizations l10n, String? role) {
  switch (role) {
    case 'primary':
      return l10n.chainsSpeculationRolePrimary;
    case 'speculative':
      return l10n.chainsSpeculationRoleSpeculative;
    case 'replacement':
      return l10n.chainsSpeculationRoleReplacement;
    default:
      return null;
  }
}

/// Map known Team-job RPC / preview error codes to end-user copy.
String chainRpcErrorLabel(AppLocalizations l10n, String? code) {
  final key = code?.trim();
  if (key == null || key.isEmpty) return l10n.commonError;
  switch (key) {
    case 'no_workers':
      return l10n.chainsStartNoWorkers;
    case 'no_goal':
      return l10n.chainsStartGoalTooShort(8);
    case 'plan_failed':
      return l10n.chainsStartPreviewFailed;
    case 'not_found':
      return l10n.chainsActiveGone;
    case 'cancelled':
    case 'already_finalized':
      return l10n.chainsStatusCancelled;
    case 'policy_disabled':
      return l10n.chainsReassignUnavailable;
    case 'validation_failed':
      return l10n.commonError;
    default:
      if (key.startsWith('AN_ENGINE_FAIL:')) {
        return l10n.chainsWorkerEngineFailed;
      }
      return l10n.commonError;
  }
}

/// Map `chainResolveSpeculation` failure reasons when present.
String chainSpeculationResolveReasonLabel(AppLocalizations l10n, String? reason) {
  final key = reason?.trim();
  if (key == null || key.isEmpty) return l10n.chainsSpeculationReviewFailed;
  switch (key) {
    case 'not_locked':
    case 'already_locked':
    case 'no_finals':
      return l10n.chainsSpeculationReviewFailed;
    default:
      return chainRpcErrorLabel(l10n, key);
  }
}

/// Prefer localized labels for thrown RPC errors instead of raw `e.toString()`.
String chainCaughtErrorLabel(AppLocalizations l10n, Object error) {
  final raw = error.toString();
  const prefix = 'Exception: ';
  final message =
      raw.startsWith(prefix) ? raw.substring(prefix.length).trim() : raw.trim();
  if (message.isEmpty) return l10n.commonError;
  return chainRpcErrorLabel(l10n, message);
}
