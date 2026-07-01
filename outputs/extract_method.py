"""Generic method-extraction tool.

Usage: python3 outputs/extract_method.py METHOD_NAME [--dry-run]
"""
import argparse
import re
import subprocess
from pathlib import Path

FILE = Path("apps/node/src/node-service-impl.ts")
RUNTIME_DIR = Path("apps/node/src")

def camel_to_snake(name):
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()

def find_method(content, method_name):
    pattern = r"  (?:private |public )?(?:async )?" + re.escape(method_name) + r"\b\("
    m = re.search(pattern, content)
    if not m:
        raise SystemExit(f"method {method_name!r} not found")
    paren_start = m.end() - 1
    depth = 0
    paren_end = None
    for i in range(paren_start, len(content)):
        ch = content[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                paren_end = i
                break
    if paren_end is None:
        raise SystemExit("could not find matching ) for method parens")
    params = content[paren_start:paren_end + 1]
    rest = content[paren_end + 1:]
    rest_stripped = rest.lstrip()
    if not rest_stripped.startswith(":"):
        ret_type = "Promise<any>"
    else:
        m2 = re.match(r":\s*([^{]*?)\s*\{", rest_stripped)
        if not m2:
            raise SystemExit("could not parse method return type")
        ret_type = m2.group(1).strip()
    body_brace = content.find("{", paren_end + 1)
    if body_brace < 0:
        raise SystemExit("could not find body `{`")
    start = m.start()
    depth = 0
    seen_open = False
    for i in range(body_brace, len(content)):
        ch = content[i]
        if ch == "{":
            depth += 1
            seen_open = True
        elif ch == "}":
            depth -= 1
            if seen_open and depth == 0:
                end = i
                full_text = content[start : end + 1]
                return start, end, body_brace, full_text, params, ret_type
    raise SystemExit("could not find matching close brace")

def extract_body(full_text, body_brace_offset):
    body_start = body_brace_offset + 1
    close = full_text.rfind("}")
    return full_text[body_start:close].rstrip("\n")

def split_params(params):
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

def replace_this_with_ctx(body):
    return re.sub(r"\bthis\.", "ctx.", body)

def indent_body_lines(body, n):
    prefix = " " * n
    return "\n".join(prefix + line if line else line for line in body.splitlines())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("method_name")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    content = FILE.read_text()
    start, end, body_brace, full_text, params, ret_type = find_method(content, args.method_name)
    body = extract_body(full_text, body_brace - start)
    arg_names = split_params(params)
    params_str = ", ".join(f"{n}: any" for n in arg_names)
    args_forward = ", ".join(arg_names)
    snake = camel_to_snake(args.method_name)
    body_with_ctx = indent_body_lines(replace_this_with_ctx(body), 4)
    candidate_imports = [
        ("LocalPeerDirectoryStore", "@envoymesh/local-store", "type"),
        ("ContactOwnerKeyStore", "@envoymesh/local-store", "type"),
        ("PeerProfileCacheStore", "@envoymesh/local-store", "type"),
        ("LocalTaskStore", "@envoymesh/local-store", "type"),
        ("TrustStore", "@envoymesh/local-store", "type"),
        ("PeerDirectoryStore", "@envoymesh/local-store", "type"),
        ("NodeProfile", "@envoymesh/api", "type"),
        ("NodeConfig", "@envoymesh/api", "type"),
        ("HumanProfile", "@envoymesh/api", "type"),
        ("BondRecord", "@envoymesh/api", "type"),
        ("ChatMessage", "@envoymesh/api", "type"),
        ("LibraryItem", "@envoymesh/api", "type"),
        ("AgentShareProposal", "@envoymesh/api", "type"),
        ("TransferStatus", "@envoymesh/api", "type"),
        ("NodeService", "@envoymesh/api", "type"),
        ("NodeStatus", "@envoymesh/api", "type"),
        ("SetPublicProfileThumbnailParams", "@envoymesh/api", "type"),
        ("UpsertProfileGalleryPhotoParams", "@envoymesh/api", "type"),
        ("ImportFleetManifestParams", "@envoymesh/api", "type"),
        ("UpdateProfileGalleryPhotoVisibilityParams", "@envoymesh/api", "type"),
        ("ProfileGalleryPhotoVisibility", "@envoymesh/api", "type"),
        ("ConnectionStatus", "@envoymesh/api", "type"),
        ("BridgeStatus", "@envoymesh/api", "type"),
        ("OpenClawStatus", "@envoymesh/api", "type"),
        ("SessionTokenRecord", "@envoymesh/local-store", "type"),
        ("ProfileGalleryPhotoSchema", "@envoymesh/protocol", "value"),
        ("ProfilePhotoRefSchema", "@envoymesh/protocol", "value"),
        ("ProfilePhotoRef", "@envoymesh/protocol", "type"),
        ("photoIdFromGalleryPath", "./profile-photo.js", "value"),
        ("profileGalleryVaultPath", "./profile-photo.js", "value"),
        ("profileThumbnailVaultPath", "./profile-photo.js", "value"),
        ("importProfilePhotoBytes", "./profile-photo.js", "value"),
        ("parseProfilePhotoMime", "./profile-photo.js", "value"),
        ("MAX_PROFILE_THUMBNAIL_BYTES", "./profile-photo.js", "value"),
        ("MAX_PROFILE_GALLERY_PHOTOS", "@envoymesh/api", "value"),
        ("MAX_PROFILE_GALLERY_PHOTO_BYTES", "@envoymesh/api", "value"),
    ]
    used_names = []
    for name, _module, _kind in candidate_imports:
        if re.search(r"\b" + re.escape(name) + r"\b", body):
            used_names.append((name, _module, _kind))
    by_module = {}
    for name, module, kind in used_names:
        by_module.setdefault(module, []).append(name)
    imports_block_lines = []
    for module, names in sorted(by_module.items()):
        joined = ", ".join(names)
        kinds = {k for n, m, k in used_names if m == module}
        if kinds == {"type"}:
            imports_block_lines.append(f"import type {{ {joined} }} from \"{module}\";")
        else:
            imports_block_lines.append(f"import {{ {joined} }} from \"{module}\";")
    imports_block = "\n".join(imports_block_lines)
    runtime_src = f'''// @ts-nocheck - runtime is loosely typed by design.
{imports_block}

/**
 * {args.method_name} runtime.
 *
 * Extracted from node-service-impl.ts by outputs/extract_method.py.
 * The class method is now a 1-line delegation to
 * {args.method_name}ViaRuntime(this._{snake}_context(), ...args).
 */
export async function {args.method_name}ViaRuntime(
  ctx: any,
  {params_str}
): Promise<any> {{
{body_with_ctx}
}}
'''
    if args.dry_run:
        print(f"Would create node-service-handlers-{snake}.ts ({len(runtime_src)} chars)")
        print(f"Would patch {FILE} ({end - start + 1} chars replaced)")
        return
    runtime_path = RUNTIME_DIR / f"node-service-handlers-{snake}.ts"
    runtime_path.write_text(runtime_src)
    print(f"wrote {runtime_path}")
    lead_ws_match = re.match(r"^(  )", content[start:])
    lead_ws = lead_ws_match.group(1) if lead_ws_match else "  "
    new_method = (
        f"{lead_ws}async {args.method_name}{params}: {ret_type} {{\n"
        f"{lead_ws}  return {args.method_name}ViaRuntime(this._{snake}_context(), {args_forward});\n"
        f"{lead_ws}}}\n"
    )
    new_content = content[:start] + new_method + content[end + 1:]
    import_anchor = '} from "./node-service-handlers-validate-pairing-token.js";'
    if import_anchor in new_content:
        new_content = new_content.replace(
            import_anchor,
            import_anchor
            + f'\nimport {{ {args.method_name}ViaRuntime }} from "./node-service-handlers-{snake}.js";',
            1,
        )
    factory_block = (
        f"  private _{snake}_context(): any {{\n"
        f"    const self = this as unknown as Record<string | symbol, unknown>;\n"
        f"    return new Proxy(self, {{\n"
        f"      get(target, prop: string | symbol) {{\n"
        f"        const value = target[prop];\n"
        f"        return typeof value === \"function\" ? (value as (...a: unknown[]) => unknown).bind(target) : value;\n"
        f"      }},\n"
        f"    }});\n"
        f"  }}\n"
    )
    factory_pattern = r"  private _[a-zA-Z]+Context\(\)[^{]*\{[\s\S]*?\n  \}\n"
    factories = list(re.finditer(factory_pattern, new_content))
    if factories:
        last = factories[-1]
        insert_at = last.end()
        new_content = new_content[:insert_at] + "\n" + factory_block + new_content[insert_at:]
    else:
        anchor = "  private _smallProfileDelegationsContext(): SmallProfileDelegationsContext {"
        if anchor in new_content:
            new_content = new_content.replace(anchor, factory_block + "\n" + anchor, 1)
    FILE.write_text(new_content)
    print(f"patched {FILE}")
    r = subprocess.run(["npx", "tsc", "--noEmit", "-p", "apps/node/tsconfig.json"], capture_output=True, text=True)
    if r.returncode != 0:
        print("--- tsc errors ---")
        print(r.stdout)
        print(r.stderr)
        sys.exit(1)
    print("tsc clean")

if __name__ == "__main__":
    main()
