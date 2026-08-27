// Regression test for the "EnvoyGo active chain detail shows no way to
// resolve a stuck speculation disagreement" bug.
//
// Symptom: when a Team job step runs in `dual-award` mode and the two
// workers return disagreeing or failing finals, the chain pauses waiting
// for the owner to resolve. On Social (desktop) the chain detail panel
// shows a banner with `Pick` / `Reassign` actions. On EnvoyGo (mobile)
// the same banner was missing — chain was stuck with no recourse. Apple
// App Review flagged this as a UX gap analogous to the pairing spinner
// rejection vector.
//
// Fix (apps/envoygo/lib/screens/chains/active_chain_detail_screen.dart):
//   1. Render a `Card` with tertiary container color when
//      `state.speculationReview.isNotEmpty`. The banner shows the
//      disagreement reason (disagree / none_pass) and an icon.
//   2. Single "Resolve automatically" `FilledButton.icon` that calls
//      `chainResolveSpeculation({ action: "auto" })` — the user asked
//      for a single-button UX, not the Social two-button banner. The
//      mobile pattern is "let the orchestrator pick" (default Phase 63
//      behavior on the home node), with the chain not blocked.
//   3. Track `_resolvingSpeculation` state so the button shows a
//      spinner and is disabled during the RPC.
//   4. `_resolveSpeculationAuto` loops over reviews until one succeeds
//      (handles multiple disagreements in the same step), then
//      refreshes the chain state.
//
// Pairs with the backend `autoResolveSpeculativeDisagreement` (Phase 63)
// which picks the cheaper verified attempt on disagreement and
// reassigns the step on `none_pass`. The wire + RPC integration is
// already covered by `chain-speculation-auto-resolve.test.ts` and the
// existing `chain-speculation-wire.test.ts`; this file pins the
// mobile-side structure so the banner cannot regress to "no UI".
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const _screenPath = 'lib/screens/chains/active_chain_detail_screen.dart';
const _modelPath = 'lib/models/chain_active.dart';
const _clientPath = 'lib/services/node_service_client.dart';
const _enArbPath = 'lib/l10n/app_en.arb';

String _readSrc(String path) => File(path).readAsStringSync();

void main() {
  group('EnvoyGo active chain detail — speculation banner (Phase 63)', () {
    test(
      'screen renders a Card with the speculationReview list (not nullable)',
      () {
        final src = _readSrc(_screenPath);
        expect(
          src,
          contains('st.speculationReview.isNotEmpty'),
          reason:
              'active chain detail must check `st.speculationReview.isNotEmpty` '
              'to render the banner. The list defaults to `const []` so the '
              'check is non-nullable.',
        );
        // The Card with tertiaryContainer color is the banner — pins the
        // visible structure that Apple reviewers see.
        expect(
          src,
          contains('theme.colorScheme.tertiaryContainer'),
          reason:
              'banner must use tertiaryContainer color so it stands out '
              'from the regular status card (which uses surface colors).',
        );
      },
    );

    test(
      'single "Resolve automatically" FilledButton.icon calls _resolveSpeculationAuto',
      () {
        final src = _readSrc(_screenPath);
        expect(
          src,
          contains('FilledButton.icon'),
          reason:
              'banner must use FilledButton.icon (the only action surface '
              'in the banner). Per user request: "active only + auto button", '
              'no separate Pick / Reassign buttons on mobile.',
        );
        expect(
          src,
          contains('_resolveSpeculationAuto'),
          reason:
              'button onPressed must call _resolveSpeculationAuto which '
              'invokes the chainResolveSpeculation RPC with action: "auto".',
        );
        // The icon must suggest automation (sparkles) so the user
        // understands the orchestrator decides, not them.
        expect(
          src,
          contains('Icons.auto_awesome'),
          reason:
              'button icon should be `Icons.auto_awesome` to telegraph '
              '"the orchestrator handles this" rather than the default '
              'check icon (which would suggest user confirmation).',
        );
      },
    );

    test(
      'tracks _resolvingSpeculation state to disable button + show spinner',
      () {
        final src = _readSrc(_screenPath);
        expect(
          src,
          contains('bool _resolvingSpeculation'),
          reason:
              'screen must declare `_resolvingSpeculation` to prevent '
              'double-tap during the RPC. The button is disabled and '
              'shows a spinner when this is true.',
        );
        // The state must actually be read in the button onPressed.
        expect(
          RegExp(r'_resolvingSpeculation\s*\?\s*null\s*:\s*_resolveSpeculationAuto')
              .hasMatch(src),
          isTrue,
          reason:
              'button onPressed must short-circuit to null when '
              '_resolvingSpeculation is true, so the user cannot double-tap.',
        );
      },
    );

    test(
      '_resolveSpeculationAuto calls chainResolveSpeculation with action: "auto"',
      () {
        final src = _readSrc(_screenPath);
        // The method body must include the literal action string.
        expect(
          src,
          contains("action: 'auto'"),
          reason:
              '_resolveSpeculationAuto must call client.chainResolveSpeculation '
              "with `action: 'auto'` — the new Phase 63 RPC value that the "
              'home node maps to the deterministic auto-resolver.',
        );
        // Method must refresh state after a successful resolve.
        expect(
          RegExp(r'_resolveSpeculationAuto[\s\S]{0,2000}await\s+_refresh')
              .hasMatch(src),
          isTrue,
          reason:
              '_resolveSpeculationAuto must call `_refresh()` after a '
              'successful auto-resolve so the UI updates without a manual '
              'pull-to-refresh.',
        );
      },
    );

    test(
      'ChainActiveSummary exposes speculationReview (non-nullable, defaults to [])',
      () {
        final src = _readSrc(_modelPath);
        expect(
          src,
          contains('final List<ChainSpeculationReview> speculationReview'),
          reason:
              'model must expose a non-nullable List<ChainSpeculationReview> '
              'speculationReview field. The wire payload may be missing; '
              'the fromJson default of `const []` keeps UI checks trivial.',
        );
        // The default in the constructor — pins the non-nullable contract.
        expect(
          RegExp(r'speculationReview\s*=\s*const\s*\[\]').hasMatch(src),
          isTrue,
          reason:
              'model constructor must default speculationReview to `const []` '
              'so callers never have to null-check it.',
        );
        // fromJson must read the field with a fallback.
        expect(
          src,
          contains("json['speculationReview']"),
          reason:
              'model must read `json["speculationReview"]` in fromJson '
              'so the wire field name matches the protocol shape.',
        );
      },
    );

    test(
      'NodeServiceClient exposes chainResolveSpeculation RPC method',
      () {
        final src = _readSrc(_clientPath);
        expect(
          src,
          contains('Future<Map<String, dynamic>> chainResolveSpeculation'),
          reason:
              'NodeServiceClient must expose chainResolveSpeculation so '
              'the screen can call it. The signature is: chainId, subtaskId, '
              'action (pick|reassign|auto), attemptId (optional).',
        );
        // The method must call the right RPC method name (matches server).
        expect(
          RegExp(r"_client\.call\('chainResolveSpeculation'").hasMatch(src),
          isTrue,
          reason:
              'client must call `_client.call("chainResolveSpeculation", ...)`. '
              'Method name must match the JSON-RPC router on the home node.',
        );
      },
    );

    test(
      '7 l10n keys present in app_en.arb (title/body/none_pass/disagree/auto/resolved/failed)',
      () {
        final src = _readSrc(_enArbPath);
        for (final key in const [
          'chainsSpeculationReviewTitle',
          'chainsSpeculationReviewBody',
          'chainsSpeculationReviewNonePass',
          'chainsSpeculationReviewDisagree',
          'chainsSpeculationReviewAutoResolve',
          'chainsSpeculationReviewResolved',
          'chainsSpeculationReviewFailed',
        ]) {
          expect(
            src,
            contains('"$key":'),
            reason:
                'app_en.arb must define `$key` for the speculation banner. '
                'Missing keys fall back to a hardcoded English placeholder in '
                'Flutter gen-l10n but the user-facing string would be wrong '
                'in build artifacts and other locales get empty strings.',
          );
        }
      },
    );
  });
}
