import 'package:flutter/material.dart';
import 'package:envoygo/l10n/app_localizations.dart';

import '../widgets/ai_engine_section.dart';

/// Shorthand for `AppLocalizations.of(context)`.
extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

String localizedModelProviderMode(AppLocalizations l10n, String mode) {
  switch (mode) {
    case 'openai-compatible':
      return l10n.modelProviderModeOpenAi;
    case 'anthropic-compatible':
      return l10n.modelProviderModeAnthropic;
    case 'disabled':
      return l10n.modelProviderModeDisabled;
    case 'mock':
    default:
      return l10n.modelProviderModeMock;
  }
}

String localizedAiEngineMode(AppLocalizations l10n, AiEngineMode mode) {
  switch (mode) {
    case AiEngineMode.both:
      return l10n.aiEngineModeBoth;
    case AiEngineMode.openclawOnly:
      return l10n.aiEngineModeOpenclawOnly;
    case AiEngineMode.extOnly:
      return l10n.aiEngineModeExtOnly;
    case AiEngineMode.off:
      return l10n.aiEngineModeOff;
  }
}

String localizedEndpointHint(AppLocalizations l10n, String mode) {
  switch (mode) {
    case 'openai-compatible':
      return l10n.endpointHintOpenAi;
    case 'anthropic-compatible':
      return l10n.endpointHintAnthropic;
    default:
      return l10n.endpointHintDefault;
  }
}

String localizedExtAgentHint(AppLocalizations l10n, String agentId) {
  switch (agentId) {
    case 'homeclaw':
      return l10n.extAgentHintHomeclaw;
    case 'hermes':
      return l10n.extAgentHintHermes;
    case 'openhuman':
      return l10n.extAgentHintOpenhuman;
    default:
      return l10n.extAgentHintCustom;
  }
}
