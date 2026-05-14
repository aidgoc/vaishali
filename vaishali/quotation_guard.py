"""Quotation discount approval guard.

Hooks into Quotation.before_submit. Computes the total effective discount
% (line-level price_list_rate vs net_total before tax) and gates submission:

    discount %         action
    ─────────────      ──────────────────────────────────────────────
    ≤ 5%               pass silently
    > 5%, ≤ 15%        pass; add a Comment for audit trail
    > 15%, ≤ 30%       require Sales Manager / Director / System Manager;
                       add a Comment naming the approver
    > 30%               require Director / System Manager;
                       add a Comment naming the approver

Field-tier reps without the right role get a hard block with a message
explaining what the threshold is and who can approve. This is the single
biggest piece of pricing discipline missing from the existing CRM stack
(per the 2026-04-29 audit and CLAUDE.md "knowledge / codification holes").
"""
import frappe
from frappe import _


# Default tiers — site-config can override via `quotation_discount_tiers`
# (a dict like {"warn": 5, "manager": 15, "director": 30}) without a code change.
_DEFAULTS = {"warn": 5.0, "manager": 15.0, "director": 30.0}

_MANAGER_ROLES = {"Sales Manager", "Director", "System Manager", "Administrator"}
_DIRECTOR_ROLES = {"Director", "System Manager", "Administrator"}


def _tiers():
    cfg = frappe.conf.get("quotation_discount_tiers") or {}
    return {
        "warn":     float(cfg.get("warn",     _DEFAULTS["warn"])),
        "manager":  float(cfg.get("manager",  _DEFAULTS["manager"])),
        "director": float(cfg.get("director", _DEFAULTS["director"])),
    }


def _user_cap(user):
    """Per-user discount ceiling, in % (overrides director threshold).

    Config in site_config.json::quotation_discount_user_caps, e.g.:
        {"sales3@dgoc.in": 50}

    Returns None if no cap is set for this user.
    """
    caps = frappe.conf.get("quotation_discount_user_caps") or {}
    raw = caps.get(user)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _compute_total_discount_pct(doc):
    """Effective discount % across line-level + document-level discounts.

    gross = sum(qty × price_list_rate) for items where price_list_rate is set.
            Falls back to qty × rate if PLR is missing (no list price = no
            discount, by definition).
    net   = doc.net_total (after both line and additional discounts, before tax).

    Returns 0.0 when gross is 0 or net == gross.
    """
    gross = 0.0
    for it in (doc.items or []):
        plr = float(it.price_list_rate or 0)
        rate = float(it.rate or 0)
        qty = float(it.qty or 0)
        # Use price_list_rate when available, else current rate (no implied discount).
        line_gross = qty * (plr if plr > 0 else rate)
        gross += line_gross

    if gross <= 0:
        return 0.0

    net = float(doc.net_total or 0)
    if net >= gross:
        return 0.0  # zero or negative discount (markup)

    return ((gross - net) / gross) * 100.0


def validate_discount_approval(doc, method=None):
    """Hard-gate Quotation submission past discount thresholds.

    Wired in hooks.py: doc_events.Quotation.before_submit.
    """
    pct = _compute_total_discount_pct(doc)
    tiers = _tiers()

    # ≤ warn: silent pass
    if pct <= tiers["warn"]:
        return

    user = frappe.session.user
    user_roles = set(frappe.get_roles(user))
    personal_cap = _user_cap(user)

    # > director threshold: needs Director / System Manager, OR a personal cap that covers it
    if pct > tiers["director"]:
        if user_roles & _DIRECTOR_ROLES:
            doc.add_comment(
                "Comment",
                f"Discount {pct:.1f}% — director-tier approval ({user})."
            )
            return
        if personal_cap is not None and pct <= personal_cap:
            doc.add_comment(
                "Comment",
                f"Discount {pct:.1f}% — within personal cap {personal_cap:.0f}% for {user}."
            )
            return
        ceiling = personal_cap if personal_cap is not None else tiers["director"]
        frappe.throw(
            _(
                "Discount {0:.1f}% exceeds your {1:.0f}% approval limit. "
                "Reduce the discount or have a Director submit on your behalf."
            ).format(pct, ceiling),
            frappe.PermissionError,
        )

    # > manager threshold: needs Sales Manager / Director / System Manager, OR a personal cap covering it
    if pct > tiers["manager"]:
        if personal_cap is not None and pct <= personal_cap:
            doc.add_comment(
                "Comment",
                f"Discount {pct:.1f}% — within personal cap {personal_cap:.0f}% for {user}."
            )
            return
        if not (user_roles & _MANAGER_ROLES):
            frappe.throw(
                _(
                    "Discount {0:.1f}% exceeds the {1:.0f}% manager-approval threshold. "
                    "Reduce the discount or have a Sales Manager submit on your behalf."
                ).format(pct, tiers["manager"]),
                frappe.PermissionError,
            )
        doc.add_comment(
            "Comment",
            f"Discount {pct:.1f}% — manager-tier approval ({user})."
        )
        return

    # > warn but ≤ manager: silent comment for audit, no role check
    doc.add_comment(
        "Comment",
        f"Discount {pct:.1f}% — within auto-approve range."
    )
