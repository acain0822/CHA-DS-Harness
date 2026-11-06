#!/usr/bin/env python3
"""Detect what changed in the Figma source of truth since the last run.

Two commands:

  snapshot   Fingerprint the Figma file from saved tool outputs:
               --metadata  folder of get_metadata XML, one file per page
               --variables Figma variables JSON (flat or {"modes": {...}})
               --screens   optional folder of get_screenshot PNGs named <node-id>.png (1:234 → 1-234)
             Writes design-system/figma-snapshot.json (or --out).

  diff       Compare two snapshots and report what changed:
               python figma_sync.py diff OLD.json NEW.json --manifest design-system/manifest.json \
                   --out design-system/reports/figma-changes [--apply]
             Reports added / removed / renamed component sets, added / removed variants and
             variant values, variants whose layer structure changed, changed screenshots, and
             added / removed / changed variables. With --apply, marks affected components in the
             manifest as `stale` (if built) or `extracted` (if new) and adds a dated note.
             Exit code: 0 no changes, 2 changes found.

A component set is a frame or section whose direct children are components
(<symbol> in get_metadata), or a standalone component on a page.
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


# ---------------------------------------------------------------- reading tool outputs

def read_xml(path: Path):
    text = path.read_text()
    if text.lstrip().startswith("["):  # tool-result JSON wrapper [{type, text}]
        text = "".join(i.get("text", "") for i in json.loads(text))
    start, end = text.find("<canvas"), text.rfind("</canvas>")
    if start < 0 or end < 0:
        return None
    return ET.fromstring(text[start:end + len("</canvas>")])


def load_variables(path: Path):
    raw = json.loads(path.read_text())
    if isinstance(raw, dict) and "modes" in raw:
        return {f"{mode}::{k}": v for mode, vals in raw["modes"].items() for k, v in vals.items()}
    return dict(raw)


def canon(node, depth=0):
    """Canonical text for a subtree: tag, name, rounded size, hidden; children in order.
    Positions are left out so moving a variant on the canvas isn't a change, and the
    variant's own name is left out so a rename is reported as a rename."""
    w = round(float(node.get("width", 0) or 0))
    h = round(float(node.get("height", 0) or 0))
    name = "" if depth == 0 else node.get("name", "")
    parts = [f"{node.tag}|{name}|{w}x{h}|{'H' if node.get('hidden') == 'true' else ''}"]
    for c in node:
        parts.append(canon(c, depth + 1))
    return "(" + ";".join(parts) + ")"


def sha(text):
    return hashlib.sha256(text.encode() if isinstance(text, str) else text).hexdigest()[:16]


def props_from(names):
    props = {}
    for n in names:
        for kv in n.split(","):
            if "=" in kv:
                k, v = (s.strip() for s in kv.split("=", 1))
                props.setdefault(k, [])
                if v not in props[k]:
                    props[k].append(v)
    return props


# ---------------------------------------------------------------- snapshot

def collect_sets(metadata_dir: Path):
    sets, pages = {}, {}
    for p in sorted(metadata_dir.glob("*")):
        root = read_xml(p)
        if root is None:
            continue
        page = root.get("name") or p.stem
        pages[root.get("id") or p.stem] = page

        def walk(node):
            syms = [c for c in node if c.tag == "symbol"]
            if syms and node.tag != "canvas":
                sets[node.get("id")] = fingerprint(node.get("name"), page, syms)
            elif node.tag == "canvas":
                for sym in syms:  # standalone components on the page
                    sets[sym.get("id")] = fingerprint(sym.get("name"), page, [sym])
            for c in node:
                if c.tag in ("frame", "section", "group"):
                    walk(c)

        walk(root)
    return sets, pages


def fingerprint(name, page, syms):
    variants = {s.get("id"): s.get("name") for s in syms}
    return {
        "name": (name or "").strip(),
        "page": page,
        "variants": variants,
        "properties": props_from(variants.values()),
        "variantHashes": {s.get("id"): sha(canon(s)) for s in syms},
        "structureHash": sha("".join(canon(s) for s in syms)),
    }


ASSET_URL = re.compile(r"https://www\.figma\.com/api/mcp/asset/[\w-]+(\.\w+)?")


def context_fingerprint(text: str) -> str:
    """Hash of saved get_design_context code with the per-call asset URLs removed."""
    text = ASSET_URL.sub("ASSET", text)
    return sha(re.sub(r"\s+", " ", text))


def build_snapshot(args):
    sets, pages = collect_sets(Path(args.metadata))
    if args.set_variables:  # get_variable_defs per component set: <node-id>.json
        for f in Path(args.set_variables).glob("*.json"):
            nid = f.stem.replace("-", ":", 1)
            if nid in sets:
                sets[nid]["usedVariables"] = json.loads(f.read_text())
    if args.context:  # saved get_design_context code, first line `// figma-node: 1:234`
        for f in Path(args.context).glob("*"):
            if not f.is_file():
                continue
            text = f.read_text()
            m = re.search(r"figma-node:\s*([\d:]+)", text.splitlines()[0] if text else "")
            if m and m.group(1) in sets:
                sets[m.group(1)]["contextHash"] = context_fingerprint(text)
                sets[m.group(1)]["contextFile"] = f.name
    if args.screens:
        for nid, s in sets.items():
            f = Path(args.screens) / f"{nid.replace(':', '-')}.png"
            if f.exists():
                s["screenHash"] = sha(f.read_bytes())
    if args.carry and Path(args.carry).exists():
        prev = json.loads(Path(args.carry).read_text()).get("sets", {})
        for nid, s in sets.items():
            for k in ("screenHash", "usedVariables", "contextHash", "contextFile"):
                if k not in s and k in prev.get(nid, {}):
                    s[k] = prev[nid][k]
                    s.setdefault("carried", []).append(k)
    snap = {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "pages": pages,
        "sets": sets,
        "variables": load_variables(Path(args.variables)) if args.variables else {},
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap, indent=2) + "\n")
    print(f"snapshot: {len(sets)} component sets on {len(pages)} page(s), {len(snap['variables'])} variables, "
          f"{sum(1 for s in sets.values() if 'screenHash' in s)} screenshots → {out}")


# ---------------------------------------------------------------- diff

def diff(old, new, partial=False):
    """Return a list of change records. With partial=True, sets missing from NEW
    are assumed unchecked rather than removed (for runs that re-read only some pages)."""
    changes = []
    o, n = old.get("sets", {}), new.get("sets", {})
    checked_pages = set(new.get("pages", {}).values())
    for nid, s in n.items():
        if nid not in o:
            changes.append({"type": "set-added", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": f"{len(s['variants'])} variant(s)"})
            continue
        before = o[nid]
        if before["name"] != s["name"]:
            changes.append({"type": "set-renamed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": f"was '{before['name']}'"})
        # property / value changes
        for prop in sorted(set(before["properties"]) | set(s["properties"])):
            a, b = before["properties"].get(prop, []), s["properties"].get(prop, [])
            if prop not in before["properties"]:
                changes.append({"type": "property-added", "node": nid, "name": s["name"], "page": s["page"],
                                "detail": f"`{prop}` = {', '.join(b)}"})
            elif prop not in s["properties"]:
                changes.append({"type": "property-removed", "node": nid, "name": s["name"], "page": s["page"],
                                "detail": f"`{prop}` (was {', '.join(a)})"})
            else:
                add, rem = [x for x in b if x not in a], [x for x in a if x not in b]
                if add or rem:
                    bits = ([f"added {', '.join(add)}"] if add else []) + ([f"removed {', '.join(rem)}"] if rem else [])
                    changes.append({"type": "values-changed", "node": nid, "name": s["name"], "page": s["page"],
                                    "detail": f"`{prop}`: {'; '.join(bits)}"})
        # variants added / removed (by node id), and layer changes inside kept variants
        ov, nv = before["variants"], s["variants"]
        added = [nv[i] for i in nv if i not in ov]
        removed = [ov[i] for i in ov if i not in nv]
        if added:
            changes.append({"type": "variants-added", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": "; ".join(added[:8]) + (" …" if len(added) > 8 else "")})
        if removed:
            changes.append({"type": "variants-removed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": "; ".join(removed[:8]) + (" …" if len(removed) > 8 else "")})
        renamed = [f"{ov[i]} → {nv[i]}" for i in nv if i in ov and ov[i] != nv[i]]
        if renamed:
            changes.append({"type": "variants-renamed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": "; ".join(renamed[:8]) + (" …" if len(renamed) > 8 else "")})
        changed = [nv[i] for i in nv if i in ov and before["variantHashes"].get(i) != s["variantHashes"].get(i)]
        if changed:
            changes.append({"type": "layers-changed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": f"{len(changed)} variant(s): " + "; ".join(changed[:6]) + (" …" if len(changed) > 6 else "")})
        fresh = lambda k: k not in s.get("carried", [])
        bu, nu = before.get("usedVariables"), s.get("usedVariables")
        if bu is not None and nu is not None and fresh("usedVariables") and bu != nu:
            bits = []
            for k in sorted(set(bu) | set(nu)):
                if k not in bu:
                    bits.append(f"now uses `{k}`")
                elif k not in nu:
                    bits.append(f"no longer uses `{k}`")
                elif str(bu[k]) != str(nu[k]):
                    bits.append(f"`{k}` {bu[k]} → {nu[k]}")
            changes.append({"type": "variables-used-changed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": "; ".join(bits[:8]) + (" …" if len(bits) > 8 else "")})
        if before.get("contextHash") and s.get("contextHash") and fresh("contextHash") and before["contextHash"] != s["contextHash"]:
            changes.append({"type": "design-changed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": f"design code differs from last read ({s.get('contextFile', '')})"})
        if before.get("screenHash") and s.get("screenHash") and fresh("screenHash") and before["screenHash"] != s["screenHash"]:
            changes.append({"type": "visual-changed", "node": nid, "name": s["name"], "page": s["page"],
                            "detail": "Figma screenshot differs from last run (colours, text, effects or layout)"})
    for nid, s in o.items():
        if nid in n:
            continue
        if partial and s["page"] not in checked_pages:
            continue
        changes.append({"type": "set-removed", "node": nid, "name": s["name"], "page": s["page"], "detail": ""})

    ov, nv = old.get("variables", {}), new.get("variables", {})
    if nv:  # a run that didn't re-read variables shouldn't report them all removed
        for k in sorted(set(ov) | set(nv)):
            if k not in ov:
                changes.append({"type": "variable-added", "name": k, "detail": str(nv[k])})
            elif k not in nv:
                if not partial:
                    changes.append({"type": "variable-removed", "name": k, "detail": f"was {ov[k]}"})
            elif str(ov[k]) != str(nv[k]):
                changes.append({"type": "variable-changed", "name": k, "detail": f"{ov[k]} → {nv[k]}"})
    return changes


LABELS = {
    "set-added": "New component sets",
    "set-removed": "Removed component sets",
    "set-renamed": "Renamed component sets",
    "property-added": "New properties",
    "property-removed": "Removed properties",
    "values-changed": "Variant values added or removed",
    "variants-added": "New variants",
    "variants-removed": "Removed variants",
    "variants-renamed": "Renamed variants",
    "variables-used-changed": "Variables used by a component changed",
    "design-changed": "Design details changed",
    "layers-changed": "Variant size or layers changed",
    "visual-changed": "Visual changes",
    "variable-added": "New variables",
    "variable-removed": "Removed variables",
    "variable-changed": "Changed variable values",
}
BUILT = {"built", "verified", "baselined", "stale"}


def impact(changes, manifest):
    comps = {c.get("figmaNodeId"): c for c in manifest.get("components", [])} if manifest else {}
    for ch in changes:
        c = comps.get(ch.get("node"))
        if ch["type"].startswith("variable-"):
            ch["action"] = "Regenerate tokens (`npm run tokens`); visual tests show every affected story"
        elif ch["type"] == "set-added":
            ch["action"] = "Inventory and add to the manifest"
        elif c and c.get("status") in BUILT:
            ch["action"] = f"Rebuild `{c['name']}` ({c.get('codePath', 'code')}) and update its stories"
            ch["built"] = True
        elif c and c.get("status") == "superseded":
            ch["action"] = "Superseded copy; check whether the canonical version changed too"
        else:
            ch["action"] = "Update manifest entry (not built yet)"
    return changes


def write_report(changes, out: Path, old, new, file_url):
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"from": old.get("generated"), "to": new.get("generated"), "changes": changes},
              open(out.with_suffix(".json"), "w"), indent=2)
    built = [c for c in changes if c.get("built")]
    lines = [f"# Figma changes since {old.get('generated', 'last run')}", ""]
    if not changes:
        lines.append("No changes. Storybook matches the Figma source of truth as of this check.")
    else:
        lines += [f"**{len(changes)} change(s)**, {len(built)} affecting components already in Storybook.", ""]
        if built:
            lines += ["## Needs rebuilding", ""] + sorted({f"- **{c['name']}** — {c['action']}" for c in built}) + [""]
        for t, label in LABELS.items():
            rows = [c for c in changes if c["type"] == t]
            if not rows:
                continue
            lines += [f"## {label} ({len(rows)})", ""]
            for c in rows:
                link = ""
                if c.get("node") and file_url:
                    sep = "&" if "?" in file_url else "?"
                    link = f" ([Figma]({file_url}{sep}node-id={c['node'].replace(':', '-')}))"
                where = f" · {c['page']}" if c.get("page") else ""
                lines.append(f"- **{c['name']}**{where}{link}: {c['detail']}".rstrip(": "))
            lines.append("")
    out.with_suffix(".md").write_text("\n".join(lines) + "\n")


def apply_manifest(changes, manifest_path: Path, new):
    m = json.loads(manifest_path.read_text())
    today = dt.date.today().isoformat()
    by_node = {}
    for ch in changes:
        if ch.get("node"):
            by_node.setdefault(ch["node"], []).append(ch)
    existing = {c.get("figmaNodeId") for c in m.get("components", [])}
    for c in m.get("components", []):
        chs = by_node.get(c.get("figmaNodeId"))
        if not chs:
            continue
        if any(ch["type"] == "set-removed" for ch in chs):
            c["status"] = "removed-in-figma"
        elif c.get("status") in BUILT:
            c["status"] = "stale"
        c.setdefault("notes", []).insert(0, f"Figma changed {today}: " + "; ".join(
            f"{LABELS[ch['type']].lower()} — {ch['detail']}" if ch["detail"] else LABELS[ch["type"]].lower() for ch in chs))
        s = new["sets"].get(c["figmaNodeId"])
        if s:
            c["properties"] = {k: {"type": "VARIANT", "values": v} for k, v in s["properties"].items()}
            c["variantCount"] = len(s["variants"])
    for ch in changes:
        if ch["type"] == "set-added" and ch["node"] not in existing:
            s = new["sets"][ch["node"]]
            m.setdefault("components", []).append({
                "name": s["name"], "category": s["page"], "figmaPage": s["page"], "figmaNodeId": ch["node"],
                "variantCount": len(s["variants"]),
                "properties": {k: {"type": "VARIANT", "values": v} for k, v in s["properties"].items()},
                "status": "extracted", "notes": [f"New in Figma {today}"]})
    if any(ch["type"].startswith("variable-") for ch in changes):
        m.setdefault("foundations", {})["tokensNeedRegenerating"] = today
    m.setdefault("figma", {})["lastSyncCheck"] = today
    manifest_path.write_text(json.dumps(m, indent=2) + "\n")


def run_diff(args):
    old = json.loads(Path(args.old).read_text())
    new = json.loads(Path(args.new).read_text())
    changes = diff(old, new, partial=args.partial)
    manifest = json.loads(Path(args.manifest).read_text()) if args.manifest else None
    impact(changes, manifest)
    file_url = args.file_url or (manifest or {}).get("figma", {}).get("fileUrl")
    write_report(changes, Path(args.out), old, new, file_url)
    if args.apply and args.manifest:
        apply_manifest(changes, Path(args.manifest), new)
    built = sum(1 for c in changes if c.get("built"))
    print(f"{len(changes)} change(s), {built} affecting built components → {args.out}.md")
    sys.exit(2 if changes else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("--metadata", required=True)
    s.add_argument("--variables")
    s.add_argument("--screens", help="folder of get_screenshot PNGs named <node-id>.png")
    s.add_argument("--set-variables", help="folder of get_variable_defs JSON per set, named <node-id>.json")
    s.add_argument("--context", help="folder of saved get_design_context code")
    s.add_argument("--carry", help="previous snapshot: keep its screenshots / variables / context for sets not re-checked")
    s.add_argument("--out", default="design-system/figma-snapshot.json")
    d = sub.add_parser("diff")
    d.add_argument("old")
    d.add_argument("new")
    d.add_argument("--manifest")
    d.add_argument("--file-url")
    d.add_argument("--out", default="design-system/reports/figma-changes")
    d.add_argument("--apply", action="store_true", help="update manifest statuses and notes")
    d.add_argument("--partial", action="store_true",
                   help="NEW covers only some pages; don't report unchecked pages as removed")
    a = ap.parse_args()
    build_snapshot(a) if a.cmd == "snapshot" else run_diff(a)


if __name__ == "__main__":
    main()
