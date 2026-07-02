with open('apps/envoygo/pubspec.yaml') as f:
    c = f.read()
old = '''  # For sqflite on web in tests
  sqflite_common_ffi: ^2.3.4

flutter:'''
new = '''  # For sqflite on web in tests
  sqflite_common_ffi: ^2.3.4

# Force a record_linux version that's compatible with
# record_platform_interface ^1.6.0. record_linux 0.7.x was published
# before the platform interface added startStream() and the
# hasPermission(request:) named-arg, so building fails with
# "missing implementations for these members" otherwise.
# (See apps/envoygo/pubspec.lock for the locked record_linux 0.7.2.)
dependency_overrides:
  record_linux: ^1.3.0

flutter:'''
assert old in c, "anchor not found"
c = c.replace(old, new, 1)
with open('apps/envoygo/pubspec.yaml', 'w') as f:
    f.write(c)
print("OK")