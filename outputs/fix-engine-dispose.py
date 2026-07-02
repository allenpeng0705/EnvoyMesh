"""Fix AI Engine dispose() formatting (was added after class close)."""
from pathlib import Path
p = Path("apps/envoygo/lib/screens/settings/ai_engine_settings_screen.dart")
c = p.read_text()
old = """  }
}
  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }"""
new = """  }

  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
}"""
if old not in c:
    print("anchor not found")
    raise SystemExit(1)
c = c.replace(old, new, 1)
p.write_text(c)
print("OK: AI Engine dispose() properly indented inside the State class")
print()
print("Last 15 lines:")
print("\n".join(c.split("\n")[-15:]))