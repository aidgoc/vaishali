---
name: YC pitch — Vaishali as company brain (operating layer)
description: The thesis we're applying to YC with — Vaishali isn't an ERP, it's a codification engine that watches existing tools and turns implicit org knowledge into machine-executable constraints AI agents can act on. Pivoted from "AI-native ERP" to "operating layer / connective tissue" framing on 2026-04-29.
type: project
originSessionId: 26b463ef-1334-4e3e-8736-23448a7468dd
---
The pitch we're going to YC with: Vaishali is **not an ERP**. The ERP-shaped DocType+endpoint+permission surface is the *output*, not the product. The product is the codification engine.

## Thesis (in one paragraph)

Most companies will not replace their stack. We don't ask them to. Vaishali is a layer that watches what people do across their existing tools (Slack, email, ERPs, browsers), infers the rules they're following, asks one human to confirm each rule, and enforces it as a machine-executable constraint. It enters as connective tissue — read-only, low-resistance. It exits as the company's operating layer — and the original tools become storage. AI agents can then take real actions inside the company because the constraints exist.

## Why this is fundable

Bottleneck for AI-running-companies isn't model quality. It's domain knowledge. RAG over comms = mirror of paper. Real executable knowledge requires destroying flexibility — picking one way each workflow runs, encoding it as a constraint. Existing ERPs (SAP/Oracle/Salesforce/ERPNext) are 1990s data models with chatbots stapled on. We're built the other way: every workflow authored as a constraint AI agents can execute against.

## The wedge (sharp)

NOT "every business in the world." NOT a vertical. The wedge is **one workflow we codify across many companies**, sold standalone with 90-day payback. After 90 days we're embedded; we expand to the next workflow.

Strongest candidate: **discount-approval on quotations** — universally hated, universally manual, universally costing margin. We have the pattern (`budget.check_budget_cap` `before_submit` guard already gates expense overruns); we'd port it to a neighbouring workflow.

## Metaphor decisions

- "Virus" / "infiltrate / take over" — accurate, **unfundable**, never use externally.
- "Connective tissue" — sells, low-resistance entry. **Use this.**
- "Operating layer for AI-native ops" — investor language.
- "Mitochondria" — was a separate organism, became essential infrastructure. Garry will love this; also accurate.

## Three things to do BEFORE submitting

1. Get **one paying customer outside the Dynamic Group**, even at steep discount. Single-customer-and-it's-your-family is the hardest pattern-match.
2. **Pick the wedge workflow precisely**, write the 60-second standalone sales pitch for it.
3. **Fix the DSPL adoption story** over 2-3 weeks (see open follow-ups in the audit). Going into YC with "30% of org uses it daily" reads completely differently from "AI chat works."

## Pre-rehearsed objection answer

Q: *What if companies don't let an AI watch them?*
A: Read access via OAuth is already cheaper than seat licenses. Story: read-only scopes, on-customer-VPC option for regulated industries, every codified rule has one-click revert, full audit log of every enforcement. Legitimate-looking entry is "make your existing stack agent-readable" (Glean's value prop). Compounding entry is everything that happens after.

## Open undecided questions

- Pricing model (per workflow / per company / per agent action)
- Sales motion after the first 5 founder-led customers
- Defensibility math — each company's codified brain is unique and creates lock-in, but we don't yet have numbers on switching cost vs. competitor copy time
- Integration count for "real cover" — Slack + email + 2-3 ERPs + 2-3 ticketing + browser is ~18 months for one team

## Source artifacts (commit history on `main`)

- `docs/audit/2026-04-29-{infra,code,data,knowledge}.md` — full audit
- `docs/superpowers/specs/2026-04-29-service-call-design.md` — example of the codification pattern
- `~/Desktop/vaishali-yc-thesis-2026-04-29.html` — the polished personal-use copy of this thesis
