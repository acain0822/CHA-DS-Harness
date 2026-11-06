#!/usr/bin/env python3
"""Flag Figma values that are not bound to a Figma variable ("unmatched tokens").

Reads the React+Tailwind reference code that the Figma MCP `get_design_context`
tool returns (saved one file per component set) and reports, for every layer:

  unbound-match  a raw value is used where a variable with the same value exists
                 (the designer typed the value instead of picking the variable)
  unbound        a raw value is used and no variable has that value
  unknown-var    the layer is bound to a variable that is not in this file's
                 variables (deleted, renamed, or from another library)
  text-style     text whose size / line height / tracking matches no text style

Each finding names the component, the variant, the Figma layer and node id, the
CSS property and the value, with a link to the node.

Usage:
  python token_audit.py --context design-system/figma/context \
      --variables design-system/tokens.figma.json \
      [--metadata design-system/figma/metadata] [--file-url https://www.figma.com/design/KEY/Name] \
      [--manifest design-system/manifest.json] \
      --out design-system/reports/token-audit

Writes <out>.json and <out>.md. With --manifest, also writes a per-component
summary note into the manifest. Exits 1 with --fail-on-issues if anything is found.

Context files: <Component Name>.tsx (or .txt), optionally starting with a line
`// figma-node: 150:10522` naming the component set node.
"""
import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------- variables

def norm_var(name: str) -> str:
    """Normalise a Figma variable name the way get_design_context writes it in CSS."""
    name = name.replace("\\/", "/").replace("\\&", "&").replace("\\", "")
    name = name.strip().lstrip("-").lower()
    name = re.sub(r"\s+", "-", name)
    return name


def hex_of(value: str):
    """Return #rrggbb or #rrggbbaa (lowercase) for hex / rgb / rgba / named colours."""
    v = value.strip().lower()
    named = {"white": "#ffffff", "black": "#000000"}
    if v in named:
        return named[v]
    m = re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})", v)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 8 and h.endswith("ff"):
            h = h[:6]
        return "#" + h
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)", v)
    if m:
        r, g, b = (round(float(m.group(i))) for i in (1, 2, 3))
        a = m.group(4)
        h = f"#{r:02x}{g:02x}{b:02x}"
        if a is not None:
            af = float(a[:-1]) / 100 if a.endswith("%") else float(a)
            if af < 1:
                h += f"{round(af * 255):02x}"
        return h
    return None


def load_variables(path: Path):
    raw = json.loads(path.read_text())
    if isinstance(raw, dict) and "modes" in raw:  # multi-mode: names are the same in every mode
        merged = {}
        for m in raw["modes"].values():
            merged.update(m)
        raw = merged
    names = {norm_var(k): k for k in raw}
    colors = defaultdict(list)
    numbers = defaultdict(list)
    styles = []
    for k, v in raw.items():
        v = str(v)
        if v.startswith("Font("):
            f = dict((a, b.strip().strip('"')) for a, b in re.findall(r'(\w+)\s*:\s*("[^"]*"|[^,)]+)', v))
            try:
                styles.append({
                    "name": k,
                    "size": float(f.get("size", "nan")),
                    "lineHeight": f.get("lineHeight"),
                    "letterSpacing": float(f.get("letterSpacing", "0") or 0),
                })
            except ValueError:
                pass
            continue
        h = hex_of(v)
        if h:
            colors[h].append(k)
        elif re.fullmatch(r"-?\d+(\.\d+)?", v):
            numbers[float(v)].append(k)
    return raw, names, colors, numbers, styles


# ---------------------------------------------------------------- metadata (node → variant / layer names)

def load_metadata(paths):
    parent_symbol, layer_name = {}, {}
    for p in paths:
        text = p.read_text()
        if text.lstrip().startswith("["):  # tool-result JSON wrapper [{type,text}]
            text = "".join(i.get("text", "") for i in json.loads(text))
        start, end = text.find("<canvas"), text.rfind("</canvas>")
        if start < 0 or end < 0:
            continue
        root = ET.fromstring(text[start:end + 9])

        def walk(node, sym):
            nid = node.get("id")
            if node.tag == "symbol":
                sym = node.get("name")
            if nid:
                layer_name[nid] = node.get("name")
                if sym:
                    parent_symbol[nid] = sym
            for c in node:
                walk(c, sym)

        walk(root, None)
    return parent_symbol, layer_name


# ---------------------------------------------------------------- parsing the reference code

TAG_RE = re.compile(r"<(div|p|span|img|button|a|input|label|svg|section|ul|li|h[1-6])\b")
CLASS_TOKEN_RE = re.compile(r"(?<![\w-])(-?[a-z][a-z0-9-]*?)-\[((?:[^\[\]\s]|\[[^\]]*\])+)\]")
NAMED_COLOR_RE = re.compile(r"(?<![\w\[-])(bg|text|border|fill|stroke|outline|decoration)-(white|black)(?![\w-])")

SKIP_PREFIXES = {
    "w", "h", "size", "min-w", "min-h", "max-w", "max-h", "inset", "left", "right", "top", "bottom",
    "translate-x", "translate-y", "-translate-x", "-translate-y", "z", "flex", "basis", "grid-cols",
    "font", "word-break", "text-decoration-skip-ink", "text-underline-position", "content", "aspect",
    "rotate", "-rotate", "scale", "order",
}
SPACING_PREFIXES = {"p", "px", "py", "pt", "pb", "pl", "pr", "m", "mx", "my", "mt", "mb", "ml", "mr",
                    "gap", "gap-x", "gap-y", "space-x", "space-y"}


def find_tags(code: str):
    """Yield (start, end, text) for each JSX opening tag, skipping over braces and strings."""
    for m in TAG_RE.finditer(code):
        i, depth, quote = m.end(), 0, None
        while i < len(code):
            c = code[i]
            if quote:
                if c == "\\":
                    i += 2
                    continue
                if c == quote:
                    quote = None
            elif c in "\"'`":
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            elif c == ">" and depth == 0 and code[i - 1] != "=":
                break
            i += 1
        yield m.start(), i, code[m.start():i + 1]


def string_literals(tag: str):
    """Yield (start, content) for every string chunk in a tag, including chunks of
    template literals nested inside ${...} (which the reference code uses heavily)."""
    out = []

    def scan(i, stop):
        while i < len(tag):
            c = tag[i]
            if stop and c == "}":
                return i
            if c in "\"'":
                j = i + 1
                while j < len(tag) and tag[j] != c:
                    j += 2 if tag[j] == "\\" else 1
                out.append((i, tag[i + 1:j]))
                i = j + 1
            elif c == "`":
                i = template(i)
            elif c == "{" and stop:
                i = scan(i + 1, True) + 1
            else:
                i += 1
        return i

    def template(i):
        start, j, chunk_start = i, i + 1, i + 1
        while j < len(tag):
            if tag[j] == "\\":
                j += 2
                continue
            if tag[j] == "`":
                out.append((start if chunk_start == start + 1 else chunk_start - 1, tag[chunk_start:j]))
                return j + 1
            if tag.startswith("${", j):
                out.append((start if chunk_start == start + 1 else chunk_start - 1, tag[chunk_start:j]))
                j = scan(j + 2, True) + 1
                chunk_start = j
                continue
            j += 1
        return j

    scan(0, False)
    return sorted(out)


def condition_before(tag: str, pos: int):
    """Return (kind, condition) for the literal at pos.
    kind is 'if' (guarded by condition), 'else' (fallback branch of a ternary) or 'all'."""
    before = tag[max(0, pos - 240):pos]
    before = re.sub(r"String\.raw\s*$", "", before.rstrip()).rstrip()
    if before.endswith("?"):
        expr = before[:-1].rstrip()
        cut = max(expr.rfind(" : "), expr.rfind("{"), expr.rfind("||"), expr.rfind("("))
        # keep balanced parentheses / brackets in conditions like [..].includes(type)
        if "includes(" in expr[max(0, cut - 40):]:
            cut = max(expr.rfind(" : "), expr.rfind("{"))
        expr = expr[cut + 1:].strip(" :{$(")
        return "if", expr or None
    if before.endswith(":"):
        return "else", None
    return "all", None


FLAG_PROPS = {"label", "hasValue", "isRequired", "showLabel", "showHelpText", "showHelperText",
              "showDoubleText", "iconLeft", "iconRight", "iconLeftImage", "iconRightImage"}


def jsx_condition(code: str, tag_start: int):
    """Conditions of the `{cond && (` blocks enclosing a tag (outermost first),
    e.g. 'isFocusAndDesktop'. Boolean show/hide props are dropped."""
    stack, i, quote = [], 0, None
    while i < tag_start:
        c = code[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"`":
            quote = c
        elif c == "(":
            stack.append(i)
        elif c == ")" and stack:
            stack.pop()
        i += 1
    conds = []
    for pos in stack:
        m = re.search(r"\{([^{}]*?)\s*&&\s*$", code[max(0, pos - 300):pos])
        if m:
            conds.append(m.group(1))
    m = re.search(r"\{([^{}]*?)\s*&&\s*$", code[max(0, tag_start - 300):tag_start])  # {cond && <div ...
    if m:
        conds.append(m.group(1))
    parts = []
    for c in conds:
        for part in c.split("&&"):
            part = part.strip()
            if part and part not in FLAG_PROPS and part not in parts:
                parts.append(part)
    return " && ".join(parts) or None


def id_map(tag: str):
    """Map condition → node id from `id={cond ? "node-1_2" : ...}` and data-node-id."""
    out, default = {}, None
    m = re.search(r'data-node-id="([^"]+)"', tag)
    if m:
        default = m.group(1)
    m = re.search(r"\bid=\{(.*?)\}\s*(?:data-|/?>|$)", tag, re.S)
    if m:
        expr = m.group(1)
        for cm in re.finditer(r'([^?:]+?)\s*\?\s*"node-([\w-]+)"', expr):
            out[cm.group(1).strip()] = node_id(cm.group(2))
        last = re.findall(r'"node-([\w-]+)"\s*$', expr.strip())
        if last:
            default = default or node_id(last[-1])
        if not default:
            ids = re.findall(r'"node-([\w-]+)"', expr)
            if ids:
                default = node_id(ids[-1])
    name = re.search(r'data-name="([^"]+)"', tag)
    return out, default, name.group(1) if name else None


def node_id(raw: str) -> str:
    """'1_6469' → '1:6469';  'I1_6469-4695_11457' → 'I1:6469;4695:11457'."""
    return ";".join(seg.replace("_", ":", 1) for seg in raw.split("-"))


def humanize(cond):
    if not cond:
        return None
    out = []
    for part in [c.strip() for c in cond.split("&&")]:
        m = re.fullmatch(r"!?is([A-Z]\w*)", part)
        if m:
            bits = re.split(r"And(?=[A-Z])", m.group(1))
            bits = [re.sub(r"^Is(?=[A-Z])", "", b) for b in bits]
            out.append(", ".join(re.sub(r"([a-z])([A-Z])", r"\1 \2", b) for b in bits))
        else:
            part = re.sub(r'(\w+) === "([^"]+)"', lambda m: f"{m.group(1).capitalize()}={m.group(2)}", part)
            part = re.sub(r'\[([^\]]+)\]\.includes\((\w+)\)',
                          lambda m: f"{m.group(2).capitalize()}=" + "/".join(re.findall(r'"([^"]+)"', m.group(1))), part)
            part = part.replace("||", " or ").replace("!", "not ")
            out.append(re.sub(r"\s+", " ", part).strip()[:100])
    return ", ".join(out).replace("((", "(").replace("))", ")")


def classify(prefix: str, value: str):
    """Return the CSS property a Tailwind token sets, or None to skip it."""
    if prefix in SKIP_PREFIXES or prefix.startswith("[") or prefix.startswith("grid"):
        return None
    if prefix in SPACING_PREFIXES:
        return "spacing"
    if prefix.startswith("rounded"):
        return "radius"
    if prefix == "leading":
        return "line-height"
    if prefix == "tracking":
        return "letter-spacing"
    if prefix in {"shadow", "drop-shadow"}:
        return "shadow"
    v = value.removeprefix("color:")
    is_color = bool(hex_of(v)) or v.startswith(("var(", "rgb", "#")) and not re.fullmatch(r"-?[\d.]+px", v)
    if prefix in {"bg", "fill", "stroke", "decoration", "outline"}:
        return "color" if is_color else None
    if prefix == "text":
        return "color" if (is_color and not re.search(r"\d+px\)?$", v)) else "font-size"
    if prefix.startswith("border"):
        if re.fullmatch(r"-?[\d.]+px", v):
            return "border-width"
        return "border-color" if is_color else None
    return None


def parse_var(value: str):
    m = re.match(r"var\(\s*(--[^,)]+)\s*(?:,\s*(.+))?\)$", value)
    return (m.group(1), (m.group(2) or "").strip()) if m else (None, None)


def audit_file(path: Path, comp: str, node_hint, vars_, parent_symbol, layer_name):
    raw, names, colors, numbers, styles = vars_
    code = path.read_text()
    findings = []
    for tag_start, _, tag in find_tags(code):
        conds, default_id, data_name = id_map(tag)
        cls_attr = re.search(r"className=", tag)
        if not cls_attr:
            continue
        block = jsx_condition(code, tag_start)
        typo = defaultdict(dict)  # variant key → {size, leading, tracking}
        cls_end = cls_attr.end() + len(class_expr(tag[cls_attr.end():]))
        for lit_pos, lit in string_literals(tag):
            if lit_pos < cls_attr.end() or lit_pos >= cls_end:
                continue
            kind, cond = condition_before(tag, lit_pos)
            if kind == "if":
                node = conds.get(cond) or default_id
                variant = parent_symbol.get(node) or humanize(cond)
            elif kind == "else":
                node = default_id
                variant = parent_symbol.get(node) or "other variants"
            else:
                node = default_id or node_hint
                variant = parent_symbol.get(node) if not conds else None
                variant = variant or (humanize(block) if block else "all variants")
            if block and kind != "all":
                variant = f"{humanize(block)} › {variant}"
            layer = layer_name.get(node) or data_name
            tokens = [(m.group(1), m.group(2)) for m in CLASS_TOKEN_RE.finditer(lit)]
            tokens += [(m.group(1), m.group(2)) for m in NAMED_COLOR_RE.finditer(lit)]
            for prefix, value in tokens:
                value = value.replace("\\/", "/")
                prop = classify(prefix, value)
                if not prop:
                    continue
                base = dict(component=comp, variant=variant, node=node, layer=layer, property=prop,
                            tailwind=f"{prefix}-[{value}]")
                v = value.removeprefix("color:")
                if prop in {"font-size", "line-height", "letter-spacing"} and not v.startswith("var("):
                    key = {"font-size": "size", "line-height": "leading", "letter-spacing": "tracking"}[prop]
                    typo[(kind, cond)][key] = v
                    typo[(kind, cond)].setdefault("_where", (node, variant, layer))
                    continue
                vn, fallback = parse_var(v)
                if vn:
                    clean = vn.replace("\\", "")
                    if norm_var(vn) not in names:
                        findings.append({**base, "kind": "unknown-var", "value": fallback or v, "variable": clean,
                                         "message": f"bound to `{clean}`, which is not a variable in this file"})
                    continue
                findings.append({**base, **match_raw(prop, v, colors, numbers)})
        # text: unconditional size/leading/tracking apply to every branch
        common = {k: v for k, v in typo.get(("all", None), {}).items() if k != "_where"}
        branches = [k for k in typo if k != ("all", None)] or ([("all", None)] if ("all", None) in typo else [])
        for b in branches:
            t = {**common, **{k: v for k, v in typo[b].items() if k != "_where"}}
            where = typo[b].get("_where") or typo.get(("all", None), {}).get("_where")
            if "size" not in t or not where:
                continue
            f = text_style_finding(t, styles)
            if f:
                node, variant, layer = where
                findings.append(dict(component=comp, variant=variant, node=node, layer=layer, property="text-style",
                                     tailwind=" ".join(f"{k}:{t[k]}" for k in ("size", "leading", "tracking") if k in t), **f))
    seen, out = set(), []
    for f in findings:
        k = (f["node"], f["property"], f.get("value"), f["kind"], f["variant"])
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out


def class_expr(rest: str) -> str:
    """The className attribute value: a "string" or a balanced {expression}."""
    rest = rest.lstrip()
    if rest.startswith('"'):
        return rest[: rest.index('"', 1) + 1]
    depth, i, quote = 0, 0, None
    while i < len(rest):
        c = rest[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return rest[: i + 1]
        i += 1
    return rest


def px(v):
    m = re.fullmatch(r"(-?[\d.]+)px", v.strip())
    return float(m.group(1)) if m else None


def rank(name):
    """Prefer palette / semantic variables over component-specific ones in suggestions."""
    n = name.lower()
    order = ["colors/", "text/", "backgrounds/", "borders/", "border/", "spacing/", "scale/", "radius/"]
    for i, pre in enumerate(order):
        if n.startswith(pre):
            return (i, name)
    return (len(order) + (1 if n.startswith("buttons/") else 0), name)


def match_raw(prop, value, colors, numbers):
    if prop in {"color", "border-color"}:
        h = hex_of(value)
        hits = sorted(colors.get(h, []) if h else [], key=rank)
        if not hits and h and len(h) == 9:  # tint of a token colour (e.g. 6% ADA)?
            base = sorted(colors.get(h[:7], []), key=rank)
            if base:
                return {"kind": "unbound", "value": value,
                        "message": f"{value} is {round(int(h[7:], 16) / 255 * 100)}% of `{base[0]}`; no variable for this tint",
                        "suggest": base[:3]}
        if hits:
            return {"kind": "unbound-match", "value": value, "message": f"{value} is the value of {', '.join('`'+x+'`' for x in hits[:3])} but isn't bound to it", "suggest": hits[:3]}
        return {"kind": "unbound", "value": value, "message": f"{value} matches no colour variable"}
    n = px(value)
    if n is None:
        return {"kind": "unbound", "value": value, "message": f"{value} is not bound to a variable"}
    want = {"spacing": ("spacing", "padding", "space", "gap"), "radius": ("radius", "rad"),
            "border-width": ("border", "stroke", "width")}.get(prop, ())
    hits = sorted([k for k in numbers.get(n, []) if any(w in k.lower() for w in want)], key=rank)
    if hits:
        return {"kind": "unbound-match", "value": value, "message": f"{value} equals {', '.join('`'+x+'`' for x in hits[:3])} but isn't bound to it", "suggest": hits[:3]}
    if prop == "border-width":
        return {"kind": "unbound", "value": value, "message": f"{value} border width has no variable", "severity": "low"}
    return {"kind": "unbound", "value": value, "message": f"{value} matches no {prop} variable"}


def text_style_finding(t, styles):
    size = px(t["size"]) if "size" in t else None
    if size is None:
        return None
    lead = t.get("leading")
    track = px(t["tracking"]) if t.get("tracking") else (0.0 if "tracking" in t else None)

    def lh_matches(s):
        if lead is None:
            return True  # inherited; nothing to compare
        lh = s["lineHeight"]
        if lead == "normal":
            return lh in (None, "100")
        lp = px(lead)
        return lp is not None and lh not in (None, "100") and abs(float(lh) - lp) < 0.01

    def tr_matches(s):
        return track is None or abs(size * s["letterSpacing"] / 100 - track) < 0.02

    for s in styles:
        if abs(s["size"] - size) < 0.01 and lh_matches(s) and tr_matches(s):
            return None
    desc = f"{t.get('size')} / {lead or 'inherited'}" + (f", tracking {t['tracking']}" if t.get("tracking") else "")
    near = [s for s in styles if abs(s["size"] - size) < 0.01]
    hint = ""
    if near:
        s0 = near[0]
        lh = "normal" if s0["lineHeight"] in (None, "100") else f"{s0['lineHeight']}px"
        hint = f"; `{s0['name']}` is {size:g}px / {lh}"
    return {"kind": "text-style", "value": desc, "message": f"text {desc} matches no text style{hint}",
            "suggest": [s["name"] for s in near[:3]]}


# ---------------------------------------------------------------- output

KIND_LABEL = {
    "unbound-match": "Raw value with a matching variable",
    "unbound": "Raw value, no matching variable",
    "unknown-var": "Bound to a variable that isn't in this file",
    "text-style": "Text not using a text style",
}


def node_url(file_url, node, fallback=None):
    if node and not re.fullmatch(r"\d+:\d+", node):
        node = fallback  # nested instance layers can't be linked directly; link the component set
    if not file_url or not node:
        return None
    sep = "&" if "?" in file_url else "?"
    return f"{file_url}{sep}node-id={node.replace(':', '-')}"


def write_reports(findings, out: Path, file_url, components, hints=None):
    hints = hints or {}
    out.parent.mkdir(parents=True, exist_ok=True)
    by_comp = defaultdict(list)
    for f in findings:
        f["url"] = node_url(file_url, f.get("node"), hints.get(f["component"]))
        by_comp[f["component"]].append(f)
    summary = {c: {k: sum(1 for f in fs if f["kind"] == k) for k in KIND_LABEL} for c, fs in by_comp.items()}
    for c in components:
        summary.setdefault(c, {k: 0 for k in KIND_LABEL})
    json.dump({"total": len(findings), "summary": summary, "findings": findings},
              open(out.with_suffix(".json"), "w"), indent=2)

    lines = ["# Token audit", "",
             f"**{len(findings)} unmatched values** across {sum(1 for c in summary if any(summary[c].values()))} "
             f"of {len(summary)} audited components. The goal is zero: every colour, spacing, radius and text "
             "style in a component should come from a Figma variable or text style.", "",
             "| Component | Raw, variable exists | Raw, no variable | Unknown variable | Text style | Total |",
             "|---|---|---|---|---|---|"]
    for c in sorted(summary):
        s = summary[c]
        lines.append(f"| [{c}](#{slug(c)}) | {s['unbound-match']} | {s['unbound']} | {s['unknown-var']} | {s['text-style']} | {sum(s.values())} |")
    lines += ["", "**Raw, variable exists** is the quickest fix: select the layer in Figma and pick the suggested variable. "
              "**Raw, no variable** needs a decision: add a variable, or change the value to an existing one.", ""]
    for c in sorted(by_comp):
        lines += [f"## {c}", ""]
        for kind in KIND_LABEL:
            fs = [f for f in by_comp[c] if f["kind"] == kind]
            if not fs:
                continue
            lines += [f"### {KIND_LABEL[kind]} ({len(fs)})", "",
                      "| Variant | Layer | Property | Value | Note |", "|---|---|---|---|---|"]
            for f in sorted(fs, key=lambda f: (str(f.get("variant")), str(f.get("layer")), f["property"])):
                layer = f.get("layer") or "—"
                node = f.get("node") or ""
                where = f"[{layer}]({f['url']})" if f.get("url") else (f"{layer} `{node}`" if node else layer)
                lines.append(f"| {f.get('variant') or '—'} | {where} | {f['property']} | `{f['value']}` | {f['message']} |")
            lines.append("")
    out.with_suffix(".md").write_text("\n".join(lines) + "\n")
    return summary


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def update_manifest(manifest_path: Path, summary, report_name):
    m = json.loads(manifest_path.read_text())
    for c in m.get("components", []):
        s = summary.get(c["name"])
        if s is None:
            continue
        total = sum(s.values())
        c["tokenAudit"] = {**s, "total": total, "report": f"{report_name}.md#{slug(c['name'])}"}
        c["notes"] = [n for n in c.get("notes", []) if not n.startswith("Token audit:")]
        if total:
            parts = [f"{s[k]} {KIND_LABEL[k].lower()}" for k in KIND_LABEL if s[k]]
            c["notes"].insert(0, f"Token audit: {total} unmatched value(s) — {'; '.join(parts)}. See {report_name}.md#{slug(c['name'])}")
    manifest_path.write_text(json.dumps(m, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--context", required=True, help="folder of saved get_design_context outputs")
    ap.add_argument("--variables", required=True, help="Figma variables JSON (flat or {modes: ...})")
    ap.add_argument("--metadata", help="folder (or file) of saved get_metadata XML, for variant/layer names")
    ap.add_argument("--file-url", help="Figma file URL, for node links")
    ap.add_argument("--manifest", help="manifest.json to annotate")
    ap.add_argument("--out", default="design-system/reports/token-audit")
    ap.add_argument("--fail-on-issues", action="store_true")
    a = ap.parse_args()

    vars_ = load_variables(Path(a.variables))
    meta_paths = []
    if a.metadata:
        mp = Path(a.metadata)
        meta_paths = sorted(mp.glob("*")) if mp.is_dir() else [mp]
    parent_symbol, layer_name = load_metadata(meta_paths)

    findings, comps, hints = [], [], {}
    for p in sorted(Path(a.context).glob("*")):
        if p.suffix not in {".tsx", ".txt", ".jsx", ".ts"}:
            continue
        comp = p.stem.replace(".design-context", "")
        first = p.read_text().splitlines()[:1]
        hint = re.search(r"figma-node:\s*([\d:]+)", first[0]).group(1) if first and "figma-node" in first[0] else None
        comps.append(comp)
        hints[comp] = hint
        findings += audit_file(p, comp, hint, vars_, parent_symbol, layer_name)

    out = Path(a.out)
    summary = write_reports(findings, out, a.file_url, comps, hints)
    if a.manifest:
        update_manifest(Path(a.manifest), summary, out.name)
    print(f"{len(findings)} unmatched value(s) in {len(comps)} component(s) → {out}.md")
    for c in sorted(summary):
        t = sum(summary[c].values())
        print(f"  {c}: {t}")
    if a.fail_on_issues and findings:
        sys.exit(1)


if __name__ == "__main__":
    main()
