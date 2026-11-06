# Manifest

`design-system/manifest.json` is the source of truth for progress. Keep it in the repo so it survives across sessions and shows up in code review.

```json
{
  "figma": {
    "fileUrl": "https://www.figma.com/design/<fileKey>/<name>",
    "fileKey": "<fileKey>",
    "lastInventoried": "2026-11-06"
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
      "notes": ["Figma has no loading state; added one, flagged for design review"]
    }
  ]
}
```

## Fields

- `source`: `generated` (built by this skill from Figma), `existing` (already in the codebase; stories only), `mixed`.
- `dependsOn`: other components used inside this one. Build dependencies first.
- `notes`: anything a designer or developer should decide. These feed the end-of-batch report.

## Status values

| Status | Meaning |
|---|---|
| `extracted` | Inventoried from Figma, properties recorded |
| `built` | Component (if generated) and stories written |
| `verified` | Rendered and compared against the Figma screenshot; differences recorded |
| `baselined` | Visual regression baseline captured |
| `blocked` | Needs a design decision; reason in `notes` |

Re-inventorying the Figma file later: diff the new inventory against the manifest and report added, removed and changed components (new variant values, renamed properties) before touching code.
