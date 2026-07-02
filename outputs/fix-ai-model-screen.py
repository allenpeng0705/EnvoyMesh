"""Patch the AI model settings screen to use nodeServiceProvider."""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/settings/ai_model_settings_screen.dart")
c = p.read_text()

# Update imports.
old_imp = """import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/node_provider.dart';
import '../../services/node_service_client.dart';"""

new_imp = """import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../services/node_service_client.dart';"""

if old_imp not in c:
    raise SystemExit("imports anchor not found")
c = c.replace(old_imp, new_imp, 1)

# Update _loadCurrent: use `ref.read(nodeServiceProvider)` instead of
# `ref.read(nodeProvider).nodeServiceClient`.
old_load = """  Future<void> _loadCurrent() async {
    final client = ref.read(nodeProvider).nodeServiceClient;
    if (client == null) {
      if (mounted) setState(() => _loaded = true);
      return;
    }"""

new_load = """  Future<void> _loadCurrent() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (mounted) setState(() => _loaded = true);
      return;
    }"""

if old_load not in c:
    raise SystemExit("load anchor not found")
c = c.replace(old_load, new_load, 1)

# Same for _save.
old_save = """  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final client = ref.read(nodeProvider).nodeServiceClient;
    if (client == null) return;"""

new_save = """  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;"""

if old_save not in c:
    raise SystemExit("save anchor not found")
c = c.replace(old_save, new_save, 1)

p.write_text(c)
print("OK")