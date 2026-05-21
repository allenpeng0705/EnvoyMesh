import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

let _heliaPackageVersion: string | undefined;

/** Node / desktop — resolves installed helia semver from node_modules. */
export function readHeliaPackageVersionSync(): string {
  if (_heliaPackageVersion) return _heliaPackageVersion;
  try {
    const req = createRequire(import.meta.url);
    const heliaMain = req.resolve("helia");
    const pkgJson = join(dirname(heliaMain), "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgJson, "utf8")) as { version: string };
    _heliaPackageVersion = pkg.version;
    return _heliaPackageVersion;
  } catch {
    return "unknown";
  }
}
