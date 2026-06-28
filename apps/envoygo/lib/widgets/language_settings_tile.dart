import 'package:flutter/material.dart';
import 'package:envoygo/l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/locale_provider.dart';

/// Language picker for Me → Language.
class LanguageSettingsTile extends ConsumerWidget {
  const LanguageSettingsTile({super.key});

  static const _options = [
    (code: 'system', labelKey: 'languageSystem'),
    (code: 'en', labelKey: 'languageEnglish'),
    (code: 'zh', labelKey: 'languageChinese'),
    (code: 'ko', labelKey: 'languageKorean'),
    (code: 'ja', labelKey: 'languageJapanese'),
    (code: 'fr', labelKey: 'languageFrench'),
    (code: 'de', labelKey: 'languageGerman'),
    (code: 'it', labelKey: 'languageItalian'),
  ];

  String _label(AppLocalizations l10n, String key) {
    switch (key) {
      case 'languageSystem':
        return l10n.languageSystem;
      case 'languageEnglish':
        return l10n.languageEnglish;
      case 'languageChinese':
        return l10n.languageChinese;
      case 'languageKorean':
        return l10n.languageKorean;
      case 'languageJapanese':
        return l10n.languageJapanese;
      case 'languageFrench':
        return l10n.languageFrench;
      case 'languageGerman':
        return l10n.languageGerman;
      case 'languageItalian':
        return l10n.languageItalian;
      default:
        return key;
    }
  }

  String _currentSelection(AppLocalizations l10n, Locale? selected, Locale system) {
    final code = selected?.languageCode ?? 'system';
    for (final opt in _options) {
      if (opt.code == code) return _label(l10n, opt.labelKey);
    }
    return l10n.languageSystem;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final selected = ref.watch(localeProvider);
    final system = Localizations.localeOf(context);

    return Card(
      child: ListTile(
        leading: const Icon(Icons.language),
        title: Text(l10n.language),
        subtitle: Text(_currentSelection(l10n, selected, system)),
        trailing: const Icon(Icons.chevron_right),
        onTap: () async {
          final picked = await showModalBottomSheet<String>(
            context: context,
            showDragHandle: true,
            builder: (ctx) {
              final sheetL10n = AppLocalizations.of(ctx);
              final current = ref.read(localeProvider)?.languageCode ?? 'system';
              return SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        sheetL10n.language,
                        style: Theme.of(ctx).textTheme.titleMedium,
                      ),
                    ),
                    ..._options.map((opt) {
                      return RadioListTile<String>(
                        value: opt.code,
                        groupValue: current,
                        title: Text(_label(sheetL10n, opt.labelKey)),
                        onChanged: (v) => Navigator.pop(ctx, v),
                      );
                    }),
                    const SizedBox(height: 8),
                  ],
                ),
              );
            },
          );
          if (picked != null) {
            await ref
                .read(localeProvider.notifier)
                .setLocaleCode(picked == 'system' ? null : picked);
          }
        },
      ),
    );
  }
}
