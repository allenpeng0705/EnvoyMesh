"""Generic method-extraction tool.

Usage:
    python3 outputs/extract_method.py METHOD_NAME [--dry-run] [--skip-tests]

Reads the method body from apps/node/src/node-service-impl.ts, generates
a new runtime file at apps/node/src/node-service-handlers-{snake}.ts with
the body wrapped in a `viaRuntime(ctx, ...args)` function (using `ctx.X`
instead of `this.X`), and patches the class to call the runtime.

The factory is auto-generated as a Proxy-over-`this` that lazily
resolves every property access. This trades type-safety for
extraction speed — no more 2-3 tsc iterations per extraction.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

FILE = Path("apps/node/src/node-service-impl.ts")
RUNTIME_DIR = Path("apps/node/src")


def camel_to_snake(name: str) -> str:
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()


def find_method(content: str, method_name: str) -> tuple[int, int, str, str, str]:
    """Returns (start, end_inclusive, full_text, params_str, ret_type)."""
    pattern = (
        r"  (?:private |public )?(?:async )?" + re.escape(method_name) + r"\b[^{]*\{"
    )
    m = re.search(pattern, content)
    if not m:
        raise SystemExit(f"method {method_name!r} not found")
    start = m.start()

    depth = 0
    seen_open = False
    for i in range(start, len(content)):
        ch = content[i]
        if ch == "{":
            depth += 1
            seen_open = True
        elif ch == "}":
            depth -= 1
            if seen_open and depth == 0:
                end = i
                full_text = content[start : end + 1]
                sig_match = re.search(r"(\([^)]*\)):\s*([^{]+?)\s*\{", full_text)
                params = sig_match.group(1) if sig_match else "()"
                ret_type = sig_match.group(2).strip() if sig_match else "Promise<any>"
                return start, end, full_text, params, ret_type
    raise SystemExit("could not find matching close brace")


def extract_body(full_text: str) -> str:
    brace = full_text.find("{")
    body_start = brace + 1
    close = full_text.rfind("}")
    return full_text[body_start:close].rstrip("\n")


def split_params(params: str) -> list[str]:
    """Split `params: Type, other: Type` into [params, other], preserving nested types."""
    params_inner = params.strip("()")
    if not params_inner:
        return []
    names = []
    depth = 0
    cur = ""
    for ch in params_inner:
        if ch in "([{<":
            depth += 1
            cur += ch
        elif ch in ")]}>":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            names.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        names.append(cur.strip())
    # Strip `: Type` annotation from each.
    arg_names = []
    for n in names:
        depth = 0
        for i, ch in enumerate(n):
            if ch in "([{<":
                depth += 1
            elif ch in ")]}>":
                depth -= 1
            elif ch == ":" and depth == 0:
                arg_names.append(n[:i].strip())
                break
        else:
            arg_names.append(n.strip())
    return arg_names


def replace_this_with_ctx(body: str) -> str:
    return re.sub(r"\bthis\.", "ctx.", body)


def indent_body_lines(body: str, n: int) -> str:
    prefix = " " * n
    return "\n".join(prefix + line if line else line for line in body.splitlines())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("method_name")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-tests", action="store_true")
    args = ap.parse_args()

    content = FILE.read_text()
    start, end, full_text, params, ret_type = find_method(content, args.method_name)
    body = extract_body(full_text)
    arg_names = split_params(params)
    params_str = ", ".join(f"{n}: any" for n in arg_names)
    args_forward = ", ".join(arg_names)

    snake = camel_to_snake(args.method_name)
    body_with_ctx = indent_body_lines(replace_this_with_ctx(body), 4)

    # Common imports for any runtime. The body can reference these types
    # and functions; if some are unused, the import is harmless.
    # Heuristic: only include those whose names appear in the body.
    candidate_imports = [
        # @envoymesh/local-store
        ("LocalPeerDirectoryStore", "@envoymesh/local-store", "type"),
        ("ContactOwnerKeyStore", "@envoymesh/local-store", "type"),
        ("PeerProfileCacheStore", "@envoymesh/local-store", "type"),
        ("LocalTaskStore", "@envoymesh/local-store", "type"),
        ("TrustStore", "@envoymesh/local-store", "type"),
        ("PeerDirectoryStore", "@envoymesh/local-store", "type"),
        ("AuditEvent", "@envoymesh/local-store", "type"),
        # @envoymesh/api (types only)
        ("NodeProfile", "@envoymesh/api", "type"),
        ("NodeConfig", "@envoymesh/api", "type"),
        ("HumanProfile", "@envoymesh/api", "type"),
        ("BondRecord", "@envoymesh/api", "type"),
        ("ChatMessage", "@envoymesh/api", "type"),
        ("LibraryItem", "@envoymesh/api", "type"),
        ("AgentShareProposal", "@envoymesh/api", "type"),
        ("TransferStatus", "@envoymesh/api", "type"),
        ("PersistenceContext", "@envoymesh/api", "type"),
        ("NodeService", "@envoymesh/api", "type"),
        ("NodeStatus", "@envoymesh/api", "type"),
        # specific params
        ("SetPublicProfileThumbnailParams", "@envoymesh/api", "type"),
        ("UpsertProfileGalleryPhotoParams", "@envoymesh/api", "type"),
        ("ImportFleetManifestParams", "@envoymesh/api", "type"),
        ("UpdateProfileGalleryPhotoVisibilityParams", "@envoymesh/api", "type"),
        ("UpsertProfileGalleryPhotoParams", "@envoymesh/api", "type"),
        ("ProfileGalleryPhotoVisibility", "@envoymesh/api", "type"),
        ("ConnectionStatus", "@envoymesh/api", "type"),
        ("BridgeStatus", "@envoymesh/api", "type"),
        ("OpenClawStatus", "@envoymesh/api", "type"),
        ("SessionTokenRecord", "@envoymesh/local-store", "type"),
        # @envoymesh/protocol (schemas)
        ("ProfileGalleryPhotoSchema", "@envoymesh/protocol", "value"),
        ("ProfilePhotoRefSchema", "@envoymesh/protocol", "value"),
        ("ProfilePhotoRef", "@envoymesh/protocol", "type"),
    ]
    # Local-module helpers that the class itself imports.
    candidate_imports.extend([
        ("photoIdFromGalleryPath", "./profile-photo.js", "value"),
        ("profileGalleryVaultPath", "./profile-photo.js", "value"),
        ("profileThumbnailVaultPath", "./profile-photo.js", "value"),
        ("importProfilePhotoBytes", "./profile-photo.js", "value"),
        ("parseProfilePhotoMime", "./profile-photo.js", "value"),
        ("MAX_PROFILE_THUMBNAIL_BYTES", "./profile-photo.js", "value"),
        ("MAX_PROFILE_GALLERY_PHOTOS", "@envoymesh/api", "value"),
        ("MAX_PROFILE_GALLERY_PHOTO_BYTES", "@envoymesh/api", "value"),
    ])

    used_names = []
    for name, _module, _kind in candidate_imports:
        # Match as a whole word.
        if re.search(r"\b" + re.escape(name) + r"\b", body):
            used_names.append((name, _module, _kind))
    # Group by module.
    by_module: dict[str, list[str]] = {}
    for name, module, kind in used_names:
        by_module.setdefault(module, []).append(name)
    imports_block_lines = []
    for module, names in sorted(by_module.items()):
        joined = ", ".join(names)
        # Decide import kind: if any name in this module is `type`, use type-only.
        kinds = {k for n, m, k in used_names if m == module}
        if kinds == {"type"}:
            imports_block_lines.append(f"import type {{ {joined} }} from \"{module}\";")
        else:
            imports_block_lines.append(f"import {{ {joined} }} from \"{module}\";")
    imports_block = "\n".join(imports_block_lines)

    runtime_src = f'''/**
 * {args.method_name} runtime.
 *
 * Extracted from `node-service-impl.ts` by `outputs/extract_method.py`.
 * The class method is now a 1-line delegation to
 * `{args.method_name}ViaRuntime(this._{snake}_context(), ...args)`.
 *
 * The context is loosely-typed (`any`) by design: this script trades
 * type-safety for extraction speed. The runtime stays testable because
 * the dependencies it reads (loadConfig, getTaskStore, etc.) all live
 * on the context object and can be replaced with vi.fn() in unit tests.
 */
{imports_block}

export async function {args.method_name}ViaRuntime(
  ctx: any,
  {params_str}
): Promise<any> {{
{body_with_ctx}
}}
'''

    if args.dry_run:
        print(f"Would create {runtime_path} ({len(runtime_src)} chars)")
        print(f"Would patch {FILE} ({end - start + 1} chars replaced)")
        return

    runtime_path = RUNTIME_DIR / f"node-service-handlers-{snake}.ts"
    runtime_path.write_text(runtime_src)
    print(f"wrote {runtime_path}")

    # Replace the class method body with a 1-line delegation.
    lead_ws_match = re.match(r"^(  )", content[start:])
    lead_ws = lead_ws_match.group(1) if lead_ws_match else "  "

    new_method = (
        f"{lead_ws}async {args.method_name}{params}: {ret_type} {{\n"
        f"{lead_ws}  return {args.method_name}ViaRuntime(this._{snake}_context(), {args_forward});\n"
        f"{lead_ws}}}\n"
    )
    new_content = content[:start] + new_method + content[end + 1 :]

    # Add the runtime import (find an existing runtime import to anchor
    # after).
    import_anchor = '} from "./node-service-handlers-validate-pairing-token.js";'
    if import_anchor in new_content:
        new_content = new_content.replace(
            import_anchor,
            import_anchor
            + f'\nimport {{ {args.method_name}ViaRuntime }} from "./node-service-handlers-{snake}.js";',
            1,
        )
    else:
        runtime_imports = list(
            re.finditer(
                r'(import \{[^}]+\} from "\./node-service-handlers-[^"]+";)',
                new_content,
            )
        )
        if runtime_imports:
            last = runtime_imports[-1]
            insert_at = last.end()
            new_content = (
                new_content[:insert_at]
                + f'\nimport {{ {args.method_name}ViaRuntime }} from "./node-service-handlers-{snake}.js";'
                + new_content[insert_at:]
            )

    # Add the factory right after the last `_xxxContext` factory.
    factory_block = (
        f"  private _{snake}_context(): any {{\n"
        f"    return new Proxy(this, {{\n"
        f"      get(target, prop) {{\n"
        f"        const value = (target as any)[prop];\n"
        f"        return typeof value === \"function\" ? value.bind(target) : value;\n"
        f"      }},\n"
        f"    }});\n"
        f"  }}\n"
    )

    # Find the last `private _xxxContext(): ... { ... }` block.
    factory_pattern = r"  private _[a-zA-Z]+Context\(\)[^{]*\{[\s\S]*?\n  \}\n"
    factories = list(re.finditer(factory_pattern, new_content))
    if factories:
        last = factories[-1]
        insert_at = last.end()
        new_content = (
            new_content[:insert_at] + "\n" + factory_block + new_content[insert_at:]
        )
    else:
        anchor = "  private _smallProfileDelegationsContext(): SmallProfileDelegationsContext {"
        if anchor in new_content:
            new_content = new_content.replace(anchor, factory_block + "\n" + anchor, 1)
        else:
            print("WARN: no factory anchor found")

    FILE.write_text(new_content)
    print(f"patched {FILE}")

    # Verify tsc.
    r = subprocess.run(
        ["npx", "tsc", "--noEmit", "-p", "apps/node/tsconfig.json"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print("--- tsc errors ---")
        print(r.stdout)
        print(r.stderr)
        sys.exit(1)
    print("tsc clean")


if __name__ == "__main__":
    main()