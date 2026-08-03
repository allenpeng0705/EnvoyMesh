#!/bin/sh
# sqlite3 native-asset frameworks from sqflite_common_ffi (dev) can be copied
# into the app with an adhoc signature, which iOS rejects (0xe8008014).
# Production uses sqflite_darwin; system SQLite is linked via hooks — remove
# any leftover adhoc sqlite3.framework before install.
set -e
APP_FW="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"
if [ -d "${APP_FW}/sqlite3.framework" ]; then
  SIG=$(codesign -d --verbose=2 "${APP_FW}/sqlite3.framework" 2>&1 | grep -E 'Signature=(adhoc|$)' || true)
  if echo "$SIG" | grep -q 'adhoc'; then
    echo "note: removing adhoc-signed sqlite3.framework (not needed; system SQLite)"
    rm -rf "${APP_FW}/sqlite3.framework"
  fi
fi
