import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../screens/onboarding/setup_guide_screen.dart';

/// AppBar info action that opens the EnvoyGo ↔ EnvoyMesh setup guide.
class SetupGuideButton extends StatelessWidget {
  const SetupGuideButton({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return IconButton(
      tooltip: l10n.setupGuideTitle,
      icon: const Icon(Icons.info_outline),
      onPressed: () => showSetupGuide(context),
    );
  }
}
