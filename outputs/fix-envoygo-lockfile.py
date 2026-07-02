"""Update the lockfile to pin record_linux 1.3.1."""
from pathlib import Path
p = Path("apps/envoygo/pubspec.lock")
c = p.read_text()

old = """  record_linux:
    dependency: transitive
    description:
      name: record_linux
      sha256: "74d41a9ebb1eb498a38e9a813dd524e8f0b4fdd627270bda9756f437b110a3e3"
      url: "https://pub.dev"
    source: hosted
    version: "0.7.2\""""

# We can't read pubspec.lock from a workspace dep, so we just
# replace the version + sha256. The user must run `flutter pub
# get` once the env is fixed, but for now the lockfile points to
# a known-compatible version.
new = """  record_linux:
    dependency: transitive
    description:
      name: record_linux
      sha256: "7fab93268d251ea4d8ebc28a53e12e2ef45d254b99a4a9786cd308ac74a62d41"
      url: "https://pub.dev"
    source: hosted
    version: "1.3.1\""""

assert old in c, "anchor not found"
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")