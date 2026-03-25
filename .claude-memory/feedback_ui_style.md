---
name: UI style preferences — Notion-inspired flat design
description: User strongly prefers Notion-style professional UI over colorful/playful designs. Key design decisions made.
type: feedback
---

The UI was described as "childish" and "like dont know whats going on." User wants Notion-inspired design.

**Why:** Field staff using the PWA need a serious business tool, not a colorful toy. Visual hierarchy was the core problem — everything had equal weight.

**How to apply:**
- Zero decorative shadows — flat surfaces with 1px borders
- No scale transforms on :active — use opacity or background changes
- Typography does the hierarchy, not color or decoration
- Monochrome by default — color only for status pills and brand CTA
- Tab bars use underline style, not pill/fill
- HR grid uses Notion sidebar-style rows (icon + text horizontal), not centered tile boxes
- Toasts: bottom-center, white surface with colored left border
- KPI display: single kpiRow card with dividers, not separate stat cards
