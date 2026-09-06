// Regression test for the "EnvoyGo pairing UX — 2-3 minute bare spinner" bug.
//
// Symptom: tapping Pair in the confirm screen showed a bare
// `CircularProgressIndicator` for the full 2-3 minute pairing
// handshake. No elapsed time, no stage hints, no way to cancel
// (the back button was also disabled by the existing _pairing state
// in the confirm screen). Apple App Review rejected the build
// because the user is left stranded on an unresponsive-looking
// spinner for minutes.
//
// Fix:
//   1. New `PairingProgressScreen`
//      (apps/envoygo/lib/screens/pairing/pairing_progress_screen.dart):
//      - Title + subtitle naming the home node
//      - Large spinner so the app doesn't look frozen
//      - `Timer.periodic` updating an elapsed-time counter every second
//      - Stage label + stage hint that evolve with elapsed time
//        (initial → connecting → handshaking → verifying, with
//        increasingly direct troubleshooting hints after 60-90 s)
//      - Cancel button that shows a confirmation dialog and calls
//        `NodeNotifier.cancelPairing()` to force-close the transport
//      - `PopScope(canPop: false)` so the system back button doesn't
//        dismiss mid-handshake
//      - Returns a `PairingProgressResult` (cancelled / error / success)
//        so the confirm screen can react appropriately
//
//   2. New `NodeNotifier.cancelPairing()`
//      (apps/envoygo/lib/providers/node_provider.dart):
//      - Idempotent, only acts when state is `connecting`
//      - Disposes the in-flight transport so the pending RPC throws
//      - Resets state to `disconnected`
//
//   3. `PairingConfirmScreen._pair()` now pushes the progress screen
//      (via `Navigator.push<PairingProgressResult>(...)`) and
//      `await`s the result, instead of showing an inline spinner.
//
// This test pins all of the above at the source level. The
// user-visible behaviour (visible timer, visible cancel button,
// responsive stage hints) is a direct consequence of the source
// structure: removing the Timer.periodic or the cancel button would
// silently regress to the old UX. The source-level guard catches
// the regression in <5 ms without mounting a widget tree.

// These source-level guards read the Dart sources with plain relative paths
// (CWD == apps/envoygo under `flutter test`). To stay robust when the test is
// launched from another CWD (repo root, CI wrapper, IDEs that run from a
// subdirectory), resolve the EnvoyGo package root against [Directory.current]
// (see [_envoygoAppRoot]). That anchors both in-package files and the
// extracted thin-client package file
// (`../../packages/envoy-thin-client-dart/...`) to the real package root
// instead of the process CWD.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Directory that contains `lib/screens/pairing/pairing_progress_screen.dart`
/// (the EnvoyGo app root), resolved from [Directory.current] robustly:
///   1. `<cwd>/lib/screens/pairing/pairing_progress_screen.dart` — CWD is the
///      EnvoyGo app itself (`flutter test` from apps/envoygo).
///   2. `<ancestor>/apps/envoygo/lib/screens/pairing/pairing_progress_screen.dart`
///      while walking up from the CWD — CWD is the EnvoyMesh repo root (or any
///      directory beneath it), where the app lives BELOW the CWD.
/// Falls back to [Directory.current] (historical behavior) when neither is
/// found.
String _envoygoAppRoot() {
  var dir = Directory.current;
  while (true) {
    if (File(
      '${dir.path}/lib/screens/pairing/pairing_progress_screen.dart',
    ).existsSync()) {
      return dir.path;
    }
    if (File(
      '${dir.path}/apps/envoygo/lib/screens/pairing/pairing_progress_screen.dart',
    ).existsSync()) {
      return '${dir.path}/apps/envoygo';
    }
    final parent = dir.parent;
    if (parent.path == dir.path) break; // reached the filesystem root
    dir = parent;
  }
  return Directory.current.path;
}

const _progressRel = 'lib/screens/pairing/pairing_progress_screen.dart';
const _confirmRel = 'lib/screens/pairing/pairing_confirm_screen.dart';
const _nodeProviderRel = 'lib/providers/node_provider.dart';
const _homeRemoteClientRel =
    '../../packages/envoy-thin-client-dart/lib/services/home_remote_client.dart';

String _readSrc(String relPath) {
  return File('${_envoygoAppRoot()}/$relPath').readAsStringSync();
}

void main() {
  group('PairingProgressScreen — source-level regression guards', () {
    test(
      'screen is a ConsumerStatefulWidget (Riverpod + local ticker state)',
      () {
        final src = _readSrc(_progressRel);
        expect(
          src,
          contains('ConsumerStatefulWidget'),
          reason:
              'PairingProgressScreen must be a ConsumerStatefulWidget so it '
              'can read the NodeProvider AND hold its own ticker state. A '
              'plain StatelessWidget cannot hold a Timer.periodic.',
        );
      },
    );

    test(
      'Timer.periodic updates the elapsed counter every second',
      () {
        final src = _readSrc(_progressRel);
        // The progress feedback contract: an elapsed-time counter
        // visible to the user, updated at least once per second.
        final hasTicker = RegExp(
          r'Timer\.periodic\s*\(\s*const\s+Duration\s*\(\s*seconds:\s*1\s*\)',
        ).hasMatch(src);
        expect(
          hasTicker,
          isTrue,
          reason:
              'PairingProgressScreen must call `Timer.periodic(const '
              'Duration(seconds: 1))` and bump the elapsed counter, so the '
              'user sees time progressing during the 2-3 min handshake. '
              'Without this the spinner is silent and Apple reviewers flag '
              'the UX as unresponsive.',
        );
        // The counter must be displayed via the localized "Elapsed: {time}"
        // key — pins the visible-time contract.
        expect(
          src,
          contains('pairingElapsed('),
          reason:
              'PairingProgressScreen must render the elapsed counter via '
              '`l10n.pairingElapsed(...)` so the user sees real time '
              'progressing (not a fake percentage or no value at all).',
        );
      },
    );

    test(
      'stage hints evolve with elapsed time (4+ branches)',
      () {
        final src = _readSrc(_progressRel);
        // We need a stage function with at least 4 thresholds
        // (initial / connecting / handshaking / verifying) so the
        // user gets progressively more useful hints.
        final hasStageFn = RegExp(
          r'({)?\s*String\s+label\s*,\s*String\s+hint\s*}\)?\s*_stageFor',
        ).hasMatch(src);
        expect(
          hasStageFn,
          isTrue,
          reason:
              'PairingProgressScreen must define a `_stageFor(elapsed, l10n)` '
              'helper that returns a (label, hint) record. The label and '
              'hint change with elapsed time so the user sees what is '
              'happening at each stage of the handshake.',
        );
        // Count distinct stage labels used in the function — must be >=4.
        for (final label in const [
          'pairingStageInitial',
          'pairingStageConnecting',
          'pairingStageHandshaking',
          'pairingStageVerifying',
        ]) {
          expect(
            src,
            contains(label),
            reason:
                'PairingProgressScreen must reference the $label l10n key '
                'in its _stageFor function so the user sees evolving hints.',
          );
        }
      },
    );

    test(
      'live "now connecting via …" line is driven by the transport hook',
      () {
        final src = _readSrc(_progressRel);
        // The progress screen must pass the onConnectingCandidate hook into
        // pairWithNode so it learns which transport is being attempted
        // (LAN → P2P → relay) instead of only estimating by elapsed time.
        expect(
          src,
          contains('onConnectingCandidate: (candidate)'),
          reason:
              'PairingProgressScreen._runPairing must pass '
              '`onConnectingCandidate: (candidate)` into pairWithNode so the '
              'live transport line reflects the actual candidate being tried.',
        );
        // The mapping must cover the three transport families.
        for (final key in const [
          'pairingNowLan',
          'pairingNowP2p',
          'pairingNowRelay',
        ]) {
          expect(
            src,
            contains(key),
            reason:
                'PairingProgressScreen must map LAN / P2P / relay candidates '
                'to the $key l10n key so the user sees exactly what the app '
                'is doing at each stage.',
          );
        }
        // The live line must be rendered in the stage card with a signal
        // icon so it is visually distinct from the static stage hint.
        expect(
          src,
          contains('Icons.sensors'),
          reason:
              'The live transport line must be rendered with Icons.sensors '
              '(a live signal icon) so reviewers can see the app actively '
              'working, not just a timer.',
        );
      },
    );

    test(
      'reassurance banner and troubleshooting card appear at long-wait thresholds',
      () {
        final src = _readSrc(_progressRel);
        // Reassurance banner after ~30 s: tells the reviewer a slow first
        // pairing is expected and the app is still working.
        expect(
          src,
          contains('pairingStillWorking'),
          reason:
              'After ~30 s the screen must show the pairingStillWorking '
              'reassurance line so a slow pairing reads as expected rather '
              'than frozen.',
        );
        expect(
          src,
          contains('_elapsed.inSeconds >= 30'),
          reason:
              'The reassurance banner must be gated on _elapsed.inSeconds >= '
              '30 so it only appears once the fast-path budget is exceeded.',
        );
        // Troubleshooting card after ~2 min with actionable steps.
        expect(
          src,
          contains('pairingTroubleTitle'),
          reason:
              'After ~2 min the screen must show the pairingTroubleTitle '
              'troubleshooting header.',
        );
        expect(
          src,
          contains('pairingTroubleBody'),
          reason:
              'The troubleshooting card must include the pairingTroubleBody '
              'actionable checklist.',
        );
        expect(
          src,
          contains('_elapsed.inSeconds >= 120'),
          reason:
              'The troubleshooting card must be gated on _elapsed.inSeconds '
              '>= 120 so it only appears after a clearly excessive wait.',
        );
      },
    );

    test(
      'cancel button shows confirmation dialog before aborting',
      () {
        final src = _readSrc(_progressRel);
        // The cancel UX contract: tap Cancel → confirmation dialog →
        // user confirms → cancelPairing() is called.
        expect(
          src,
          contains('showDialog<bool>'),
          reason:
              'Cancel button must show a confirmation dialog (showDialog) '
              'before calling cancelPairing — accidentally tapping Cancel '
              'should not abort a 2-3 min handshake without confirmation.',
        );
        expect(
          src,
          contains('pairingCancelConfirmTitle'),
          reason:
              'Cancel confirmation dialog must use the localized '
              'pairingCancelConfirmTitle key.',
        );
        expect(
          src,
          contains('pairingCancelConfirmBody'),
          reason:
              'Cancel confirmation dialog must use the localized '
              'pairingCancelConfirmBody key (with explanation, not just a '
              'title).',
        );
        expect(
          src,
          contains('commonKeepWaiting'),
          reason:
              'Confirmation dialog must offer a "Keep waiting" escape so '
              'the user is not forced to cancel if they tapped Cancel by '
              'mistake.',
        );
        expect(
          src,
          contains('cancelPairing()'),
          reason:
              'When the user confirms, PairingProgressScreen must call '
              '`ref.read(nodeProvider.notifier).cancelPairing()` to '
              'force-close the in-flight transport.',
        );
      },
    );

    test(
      'system back is blocked during handshake (PopScope canPop: false)',
      () {
        final src = _readSrc(_progressRel);
        expect(
          src,
          contains('PopScope('),
          reason:
              'PairingProgressScreen must use `PopScope(canPop: false)` so '
              'the system back button does not dismiss the screen mid-'
              'handshake and leave the user on an orphan state. Without '
              'PopScope, Android users could accidentally abandon a 2-min '
              'handshake with no recourse.',
        );
        expect(
          src,
          contains('canPop: false'),
          reason:
              '`PopScope` must be set to `canPop: false` to actually block '
              'the back gesture. The presence of PopScope alone is not '
              'enough — this is the precise config that makes the back '
              'gesture a no-op.',
        );
      },
    );

    test(
      'screen returns PairingProgressResult so confirm screen can react',
      () {
        final src = _readSrc(_progressRel);
        // Define the result class with the three states.
        expect(
          src,
          contains('class PairingProgressResult'),
          reason:
              'PairingProgressScreen must define a PairingProgressResult '
              'class with success / cancelled / error variants so the '
              'confirm screen can branch on the outcome.',
        );
        for (final ctor in const [
          'PairingProgressResult.cancelled',
          'PairingProgressResult.success',
          'PairingProgressResult.error',
        ]) {
          expect(
            src,
            contains(ctor),
            reason:
                'PairingProgressResult must define a `$ctor` constructor so '
                'the screen can pop with the right outcome.',
          );
        }
        // The screen must pop with the result — not just dispose.
        expect(
          src,
          contains('Navigator.of(context).pop('),
          reason:
              'PairingProgressScreen must `Navigator.pop(...)` with a '
              'PairingProgressResult so the confirm screen receives the '
                'outcome (success / cancelled / error).',
        );
      },
    );

    test(
      'screen kicks off pairWithNode via postFrameCallback (no blank frame)',
      () {
        final src = _readSrc(_progressRel);
        // The handshake must start AFTER the first frame so the
        // spinner paints for at least one frame before any async work.
        final hasPostFrame = RegExp(
          r'addPostFrameCallback',
        ).hasMatch(src);
        expect(
          hasPostFrame,
          isTrue,
          reason:
              'PairingProgressScreen must schedule the pairWithNode call '
              'via `WidgetsBinding.addPostFrameCallback` so the spinner is '
              'visible immediately and the user does not see a blank frame '
              'before the await.',
        );
        expect(
          src,
          contains('pairWithNode('),
          reason:
              'PairingProgressScreen must call NodeNotifier.pairWithNode '
              'to do the actual handshake work — not reimplement the RPC.',
        );
      },
    );

    test(
      'file is well-formed Dart (braces balance)',
      () {
        final src = _readSrc(_progressRel);
        var open = 0;
        var inSingle = false;
        var inDouble = false;
        var inLineComment = false;
        var inBlockComment = false;
        var inTemplate = false;
        for (var i = 0; i < src.length; i++) {
          final c = src[i];
          final next = i + 1 < src.length ? src[i + 1] : '';
          if (inLineComment) {
            if (c == '\n') inLineComment = false;
            continue;
          }
          if (inBlockComment) {
            if (c == '*' && next == '/') {
              inBlockComment = false;
              i++;
            }
            continue;
          }
          if (inSingle) {
            if (c == '\\') {
              i++;
              continue;
            }
            if (c == '\'') inSingle = false;
            continue;
          }
          if (inDouble) {
            if (c == '\\') {
              i++;
              continue;
            }
            if (c == '"') inDouble = false;
            continue;
          }
          if (inTemplate) {
            if (c == '\\') {
              i++;
              continue;
            }
            if (c == '`') inTemplate = false;
            continue;
          }
          if (c == '/' && next == '/') {
            inLineComment = true;
            i++;
            continue;
          }
          if (c == '/' && next == '*') {
            inBlockComment = true;
            i++;
            continue;
          }
          if (c == '\'') {
            inSingle = true;
            continue;
          }
          if (c == '"') {
            inDouble = true;
            continue;
          }
          if (c == '`') {
            inTemplate = true;
            continue;
          }
          if (c == '{') open++;
          if (c == '}') open--;
        }
        expect(
          open,
          equals(0),
          reason:
              'pairing_progress_screen.dart has unbalanced braces '
              '(open=$open). The file is malformed Dart.',
        );
      },
    );
  });

  group('PairingConfirmScreen — old bare-spinner bug is gone', () {
    test(
      'old inline CircularProgressIndicator inside _pairing is removed',
      () {
        final src = _readSrc(_confirmRel);
        // The bug: `if (_pairing) CircularProgressIndicator() else FilledButton`
        // regresses to "2-3 min silent spinner with no cancel".
        final hasOldBranch = RegExp(
          r'if\s*\(\s*_pairing\s*\)\s*const\s+Center\s*\(\s*child\s*:\s*CircularProgressIndicator',
        ).hasMatch(src);
        expect(
          hasOldBranch,
          isFalse,
          reason:
              'PairingConfirmScreen must NOT show an inline spinner. The old '
              '`if (_pairing) CircularProgressIndicator() else FilledButton` '
              'pattern is the original bug — it stranded users on a 2-3 min '
              'silent spinner with no progress feedback and no way to cancel.',
        );
      },
    );

    test(
      'confirm screen no longer declares the _pairing field',
      () {
        final src = _readSrc(_confirmRel);
        final hasField = RegExp(
          r'bool\s+_pairing\s*=\s*false\s*;',
        ).hasMatch(src);
        expect(
          hasField,
          isFalse,
          reason:
              'PairingConfirmScreen no longer needs the _pairing field. '
              'PairingProgressScreen is the visible UI during the handshake; '
              'the confirm screen always shows the Pair button. Leaving the '
              'stale field in place risks a future regression.',
        );
      },
    );

    test(
      'confirm screen pushes PairingProgressScreen via Navigator.push',
      () {
        final src = _readSrc(_confirmRel);
        expect(
          src,
          contains("import 'pairing_progress_screen.dart'"),
          reason:
              'PairingConfirmScreen must import the new progress screen.',
        );
        expect(
          src,
          contains('Navigator.of(context).push<PairingProgressResult>'),
          reason:
              'PairingConfirmScreen._pair() must push PairingProgressScreen '
              'via Navigator.push<PairingProgressResult>(...) and await the '
              'result. The new UX is the dedicated progress screen — the '
              'confirm screen must hand off the work, not reimplement it.',
        );
        expect(
          src,
          contains('fullscreenDialog: true'),
          reason:
              'The pushed route should be a fullscreenDialog so it feels '
              'like a modal step (rather than a normal page that the user '
              'might mistake for an error screen).',
        );
        // After success, confirm screen pops to root.
        expect(
          src,
          contains('popUntil((route) => route.isFirst)'),
          reason:
              'On a successful result, the confirm screen must popUntil '
              'first so the user lands on the home screen, not back on the '
              'confirm or scan screen.',
        );
      },
    );
  });

  group('HomeRemoteClient.onCandidateTrying — transport hook', () {
    test(
      'options expose onCandidateTrying and it fires before each connect attempt',
      () {
        final src = _readSrc(_homeRemoteClientRel);
        expect(
          src,
          contains('onCandidateTrying'),
          reason:
              'HomeRemoteClientOptions must expose the onCandidateTrying '
              'callback so pairing can surface live "now connecting via …" '
              'feedback.',
        );
        expect(
          src,
          contains('this.onCandidateTrying'),
          reason:
              'HomeRemoteClientOptions must wire onCandidateTrying in its '
              'constructor.',
        );
        // The hook must fire with the candidate about to be tried, at the
        // top of the per-candidate loop in _connectInternal.
        expect(
          src,
          contains('_options.onCandidateTrying?.call(candidate)'),
          reason:
              '_connectInternal must invoke '
              '`_options.onCandidateTrying?.call(candidate)` before each '
              '_openSocket attempt so the UI learns which transport is being '
              'tried as the client walks LAN → P2P → relay.',
        );
      },
    );
  });

  group('NodeNotifier.cancelPairing — abort contract', () {
    test(
      'pairWithNode accepts and forwards onConnectingCandidate to the transport',
      () {
        final src = _readSrc(_nodeProviderRel);
        expect(
          src,
          contains(
              'void Function(HomeRemoteCandidate candidate)? onConnectingCandidate'),
          reason:
              'pairWithNode must accept an optional onConnectingCandidate '
              'callback so PairingProgressScreen can subscribe to live '
              'transport attempts.',
        );
        expect(
          src,
          contains('onCandidateTrying: onConnectingCandidate'),
          reason:
              'pairWithNode must forward onConnectingCandidate into '
              'HomeRemoteClientOptions.onCandidateTrying so the hook actually '
              'reaches the transport layer.',
        );
      },
    );

    test(
      'cancelPairing method is defined and idempotent on non-connecting state',
      () {
        final src = _readSrc(_nodeProviderRel);
        expect(
          src,
          contains('void cancelPairing()'),
          reason:
              'NodeNotifier must define a public `void cancelPairing()` so '
              'PairingProgressScreen can call it from the cancel button.',
        );
        // The early-return guard: don't touch state if not connecting.
        // This makes the method safe to call from anywhere (e.g. a
        // widget that was already torn down).
        final hasGuard = RegExp(
          r'void\s+cancelPairing\s*\(\s*\)\s*\{[^}]*if\s*\(\s*state\.connectionState\s*!=\s*NodeConnectionState\.connecting\s*\)\s*return\s*;',
        ).hasMatch(src);
        expect(
          hasGuard,
          isTrue,
          reason:
              'cancelPairing must early-return when '
              'state.connectionState != NodeConnectionState.connecting so '
              'it is safe to call from a torn-down widget. Without this '
              'guard, a stale cancelPairing() call from a disposed '
              'PairingProgressScreen could null out a healthy active '
              'connection.',
        );
      },
    );

    test(
      'cancelPairing disposes the in-flight transport (force-closes WebSocket)',
      () {
        final src = _readSrc(_nodeProviderRel);
        // The abort mechanism: disposing the transport causes the
        // pending RPC to throw, which pairWithNode's catch block
        // catches, and the awaiter in PairingProgressScreen then
        // pops with an error result.
        final cancelFnIdx = src.indexOf('void cancelPairing()');
        expect(
          cancelFnIdx,
          greaterThanOrEqualTo(0),
          reason: 'cancelPairing() must exist',
        );
        final snippet = src.substring(
          cancelFnIdx,
          cancelFnIdx + 800 > src.length ? src.length : cancelFnIdx + 800,
        );
        expect(
          snippet,
          contains('.dispose()'),
          reason:
              'cancelPairing must call `.dispose()` on the in-flight '
              'HomeRemoteClient so the pending `pairThinClient` RPC throws '
              'and the awaiter in PairingProgressScreen can pop with the '
              'error. Without the dispose, the RPC hangs until the '
              'per-attempt timeout, and the user waits minutes for the '
              'cancel to "take effect".',
        );
        expect(
          snippet,
          contains('_client = null'),
          reason:
              'cancelPairing must null out the _client field so '
              'pairWithNode\'s catch block does not call dispose() again on '
              'an already-disposed client.',
        );
      },
    );
  });
}
