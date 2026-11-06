#!/usr/bin/env python3
"""Convert Figma variable definitions into CSS custom properties and a typed TS token object.

Input JSON, either:
  1. A flat map, as returned by the Figma MCP `get_variable_defs` tool:
       {"color/primary/500": "#1A73E8", "spacing/md": "16",
        "Heading/H1": "Font(family: \"Inter\", style: Bold, size: 32, weight: 700, lineHeight: 40, letterSpacing: 0)"}
  2. Several modes (call get_variable_defs once per mode and combine):
       {"modes": {"light": {...flat map...}, "dark": {...flat map...}}}
     The first mode is the default (:root); others go under [data-theme="<mode>"].

Output (in --out dir): tokens.css, tokens.ts

Usage: python tokens_to_css.py tokens.figma.json --out src/tokens
"""
import argparse
import json
import re
import sys
from pathlib import Path

PX_HINTS = ("spacing", "space", "radius", "size", "gap", "padding", "margin",
            "width", "height", "border", "breakpoint", "inset", "offset")
FONT_RE = re.compile(r"^Font\((.*)\)$", re.S)


def slug(part: str) -> str:
    part = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", part.strip())
    part = re.sub(r"[^a-zA-Z0-9]+", "-", part).strip("-").lower()
    return part or "x"


def var_name(path: str) -> str:
    return "--" + "-".join(slug(p) for p in path.split("/") if p.strip())


def parse_font(value: str):
    m = FONT_RE.match(value.strip())
    if not m:
        return None
    out = {}
    for key, val in re.findall(r'(\w+)\s*:\s*("[^"]*"|[^,]+)', m.group(1)):
        out[key] = val.strip().strip('"')
    return out


def line_height(font):
    """Figma MCP gives line height in px, except 100 (or anything over 3x the size) means a percent."""
    lh, size = font.get("lineHeight", ""), font.get("size", "")
    if not re.fullmatch(r"[\d.]+", lh):
        return lh or None
    lhv = float(lh)
    if lhv == 100 or (re.fullmatch(r"[\d.]+", size) and lhv > 3 * float(size)):
        return "normal" if lhv == 100 else f"{lhv / 100:g}"
    return f"{lh}px"


def letter_spacing(font):
    """Figma MCP gives letter spacing as a percent of the font size; CSS em is the same ratio."""
    ls = font.get("letterSpacing", "")
    if not re.fullmatch(r"-?[\d.]+", ls):
        return ls or None
    return "0" if float(ls) == 0 else f"{float(ls) / 100:g}em"


def parse_effect(value: str):
    m = re.match(r"^Effect\((.*)\)$", value.strip(), re.S)
    if not m:
        return None
    body = m.group(1)
    color = re.search(r"color:\s*(#[0-9A-Fa-f]{6,8})", body)
    off = re.search(r"offset:\s*\((-?[\d.]+),\s*(-?[\d.]+)\)", body)
    rad = re.search(r"radius:\s*(-?[\d.]+)", body)
    spr = re.search(r"spread:\s*(-?[\d.]+)", body)
    inset = "INNER" in body
    if not (color and off and rad):
        return None
    px = lambda v: "0" if float(v) == 0 else f"{v}px"
    return (("inset " if inset else "") +
            f"{px(off.group(1))} {px(off.group(2))} {px(rad.group(1))} {px(spr.group(1) if spr else '0')} {color.group(1)}")


def css_value(path: str, value):
    if isinstance(value, (int, float)):
        value = str(value)
    value = str(value).strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", value) and any(h in path.lower() for h in PX_HINTS):
        return "0" if float(value) == 0 else f"{value}px"
    return value


def expand(path: str, value):
    """Yield (css var name, css value, ts path parts, ts value) tuples for one Figma variable."""
    parts = [slug(p) for p in path.split("/") if p.strip()]
    effect = parse_effect(value) if isinstance(value, str) else None
    if effect:
        yield var_name(path), effect, parts, effect
        return
    font = parse_font(value) if isinstance(value, str) else None
    if font is None:
        v = css_value(path, value)
        yield var_name(path), v, parts, v
        return
    base = var_name(path)
    fam = font.get("family")
    mapping = {
        "font-family": f'"{fam}", system-ui, sans-serif' if fam else None,
        "font-size": f'{font["size"]}px' if "size" in font else None,
        "font-weight": font.get("weight"),
        "line-height": line_height(font),
        "letter-spacing": letter_spacing(font),
    }
    for prop, v in mapping.items():
        if v not in (None, ""):
            yield f"{base}-{prop}", v, parts + [slug(prop)], v


def set_nested(tree: dict, parts, value):
    node = tree
    for p in parts[:-1]:
        nxt = node.get(p)
        if not isinstance(nxt, dict):
            nxt = {} if nxt is None else {"default": nxt}
            node[p] = nxt
        node = nxt
    leaf = parts[-1]
    if isinstance(node.get(leaf), dict):
        node[leaf]["default"] = value
    else:
        node[leaf] = value


def camel_keys(tree):
    if not isinstance(tree, dict):
        return tree
    out = {}
    for k, v in tree.items():
        key = re.sub(r"-([a-z0-9])", lambda m: m.group(1).upper(), k)
        if key[0].isdigit():
            key = "_" + key  # keeps keys valid as identifiers, e.g. tokens.color.primary._500
        out[key] = camel_keys(v)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--out", default="src/tokens")
    args = ap.parse_args()

    data = json.loads(Path(args.input).read_text())
    modes = data["modes"] if isinstance(data, dict) and "modes" in data else {"default": data}
    if not modes or not all(isinstance(m, dict) for m in modes.values()):
        sys.exit("Input must be a flat {name: value} map or {\"modes\": {mode: map}}")

    css_blocks, ts_tree, seen = [], {}, {}
    for i, (mode, values) in enumerate(modes.items()):
        selector = ":root" if i == 0 else f'[data-theme="{slug(mode)}"]'
        if i == 0 and mode != "default":
            selector = f':root, [data-theme="{slug(mode)}"]'
        lines = []
        for path, value in sorted(values.items()):
            for name, v, parts, tsv in expand(path, value):
                if name in seen and seen[name] != path and i == 0:
                    print(f"warning: {path!r} and {seen[name]!r} both map to {name}", file=sys.stderr)
                seen.setdefault(name, path)
                lines.append(f"  {name}: {v};")
                if i == 0:
                    set_nested(ts_tree, parts, f"var({name})")
        css_blocks.append(f"{selector} {{\n" + "\n".join(lines) + "\n}")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    header = "/* Generated from Figma variables by tokens_to_css.py. Do not edit by hand. */\n"
    (out / "tokens.css").write_text(header + "\n\n".join(css_blocks) + "\n")
    ts = (header + "export const tokens = " + json.dumps(camel_keys(ts_tree), indent=2) + " as const;\n"
          "export type Tokens = typeof tokens;\n"
          f"export const themes = {json.dumps([slug(m) for m in modes])} as const;\n")
    (out / "tokens.ts").write_text(ts)
    print(f"Wrote {len(seen)} variables across {len(modes)} mode(s) to {out}/tokens.css and tokens.ts")


if __name__ == "__main__":
    main()
