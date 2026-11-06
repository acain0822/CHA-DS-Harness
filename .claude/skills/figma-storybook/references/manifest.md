# Manifest

`design-system/manifest.json` is the source of truth for progress. Keep it in the repo so it survives across sessions and shows up in code review.

```json
{
  "figma": {
    "fileUrl": "https://www.figma.com/design/<fileKey>/<name>",
    "fileKey": "<fileKey>",
    "lastInventoried": "2026-11-06",
    "lastSyncCheck": "2026-11-13"
  },
  "settings": {
    "framework": "react-ts",
    "vrTool": "playwright",
    "themes": ["light", "dark"],
    "viewports": [375, 1280]
  },
  "foundations": {
    "colors": "verified",
    "typography": "built",
    "spacing": "extracted"
  },
  "components": [
    {
      "name": "Button",
      "category": "Actions",
      "figmaNodeId": "123:456",
      "figmaUrl": "https://www.figma.com/design/<fileKey>/<name>?node-id=123-456",
      "source": "generated",
      "codePath": "src/components/Button/Button.tsx",
      "properties": {
        "Variant": { "type": "VARIANT", "values": ["primary", "secondary", "ghost"] },
        "Size": { "type": "VARIANT", "values": ["sm", "md", "lg"] },
        "State": { "type": "VARIANT", "values": ["default", "hover", "focus", "disabled"] },
        "Show icon": { "type": "BOOLEAN" },
        "Label": { "type": "TEXT" },
        "Icon": { "type": "INSTANCE_SWAP" }
      },
      "dependsOn": ["Icon"],
      "status": "verified",
      "tokenAudit": { "unbound-match": 1, "unbound": 4, "unknown-var": 0, "text-style": 0, "total": 5,
                      "report": "token-audit.md#button" },
      "notes": [
        "Token audit: 5 unmatched value(s) — see token-audit.md#button",
        "Figma has no loading state; added one, flagged for design review"
      ]
    }
  ]
}
```

## Fields

- `source`: `generated` (built by this skill from Figma), `existing` (already in the codebase; stories only), `mixed`.
- `dependsOn`: other components used inside this one. Build dependencies first.
- `notes`: anything a designer or developer should decide. These feed the end-of-batch report. The scripts add dated `Figma changed …` and `Token audit: …` notes at the top; keep them, they're how the next run knows the history.
- `tokenAudit`: counts written by `token_audit.py`. The aim is `total: 0` for every component.

## Status values

| Status | Meaning |
|---|---|
| `extracted` | Inventoried from Figma, properties recorded |
| `built` | Component (if generated) and stories written |
| `verified` | Rendered and compared against the Figma screenshot; differences recorded |
| `baselined` | Visual regression baseline captured |
| `blocked` | Needs a design decision, or couldn't be read (e.g. rate limit); reason in `notes` |
| `stale` | Was built, but Figma changed since; rebuild, re-verify, then back to `verified` |
| `removed-in-figma` | The component set no longer exists in Figma; ask before deleting the code |
| `superseded` | An older copy of a component that exists elsewhere in the file |

Re-inventorying the Figma file later is the sync check (`references/sync-and-audit.md`): `figma_sync.py diff --apply` updates statuses, properties and notes here.
