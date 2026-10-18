"""Single source of truth for what MolDock sells and what each tier may do.

Mirrors ElectronVisualized's server/pricing.py: every Stripe price the
server will put in a Checkout Session is listed here, and
`/api/billing/checkout` refuses anything else. Price IDs come from the
environment, so the owner creates products in the Stripe dashboard and
switches them on without a code change. A plan whose price ID is unset is
simply not offered (feature flag by absence) — there are NO hard-coded
live price IDs for MolDock yet.

    STRIPE_PRICE_PRO_MONTHLY      price_... for "MolDock Pro" $9.99 / month
    STRIPE_PRICE_PRO_ANNUAL       price_... for "MolDock Pro" $79 / year
    <same name>_AMOUNT_CENTS      display override (must match Stripe)
    STRIPE_TRIAL_DAYS             free-trial days on new subscriptions (0)
    STRIPE_ALLOW_PROMO_CODES      "0" hides the promotion-code box

Lab / Institution is sold by quote + Stripe invoice (seats), not Checkout.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

TIER_ANON = "anonymous"   # not signed in — limits keyed by IP hash
TIER_FREE = "free"
TIER_PRO = "pro"
TIER_LAB = "lab"

_RANK = {TIER_ANON: 0, TIER_FREE: 1, TIER_PRO: 2, TIER_LAB: 3}


@dataclass(frozen=True)
class Limits:
    jobs_per_day: int            # ligand dockings per UTC day (batch ligands count)
    max_active: int              # queued + running at once
    max_exhaustiveness: int
    max_num_modes: int
    max_box_edge: float          # Å, per axis
    max_batch_ligands: int       # 0 → batch screening not available
    private_jobs: bool
    priority: int                # higher runs first
    api_keys: bool
    retention_days: Optional[int]  # None → kept until deleted
    all_pose_interactions: bool  # free: best pose only
    alphafold: bool = True


LIMITS: dict[str, Limits] = {
    TIER_ANON: Limits(3, 1, 8, 9, 30.0, 0, False, 0, False, 30, False),
    TIER_FREE: Limits(5, 2, 8, 9, 30.0, 5, False, 0, False, 30, False),
    TIER_PRO: Limits(300, 25, 32, 20, 40.0, 500, True, 10, True, None, True),
    TIER_LAB: Limits(1000, 100, 64, 20, 60.0, 2000, True, 20, True, None, True),
}


def limits_for(tier: str) -> Limits:
    return LIMITS.get(tier, LIMITS[TIER_ANON])


def higher(a: str, b: str) -> str:
    return a if _RANK.get(a, 0) >= _RANK.get(b, 0) else b


def is_paid(tier: str) -> bool:
    return tier in (TIER_PRO, TIER_LAB)


@dataclass(frozen=True)
class Plan:
    key: str
    env: str
    amount_cents: int
    interval: str
    tier: str = TIER_PRO

    @property
    def price_id(self) -> str:
        raw = (os.environ.get(self.env) or "").strip()
        return "" if raw.lower() in ("off", "none", "disabled") else raw

    @property
    def amount(self) -> int:
        raw = (os.environ.get(f"{self.env}_AMOUNT_CENTS") or "").strip()
        try:
            return int(raw) if raw else self.amount_cents
        except ValueError:
            return self.amount_cents


PLANS: tuple[Plan, ...] = (
    Plan("pro_monthly", "STRIPE_PRICE_PRO_MONTHLY", 999, "month"),
    Plan("pro_annual", "STRIPE_PRICE_PRO_ANNUAL", 7900, "year"),
)
_BY_KEY = {p.key: p for p in PLANS}

# App Store product ids (iOS / Mac app, bundle com.johnseong.dock-it).
STOREKIT_PRODUCTS = {
    "com.johnseong.dockit.pro.monthly": TIER_PRO,
    "com.johnseong.dockit.pro.annual": TIER_PRO,
}


def get_plan(key: Optional[str]) -> Optional[Plan]:
    p = _BY_KEY.get((key or "").strip().lower())
    return p if p and p.price_id else None


def tier_for_price(price_id: Optional[str]) -> Optional[str]:
    if not price_id:
        return None
    for p in PLANS:
        if p.price_id and p.price_id == price_id:
            return p.tier
    return None


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def trial_days() -> int:
    try:
        return max(0, min(30, int(os.environ.get("STRIPE_TRIAL_DAYS", "0") or 0)))
    except ValueError:
        return 0


def promo_codes_enabled() -> bool:
    return _flag("STRIPE_ALLOW_PROMO_CODES", True)


def _limits_dict(tier: str) -> dict:
    l = limits_for(tier)
    return {
        "jobs_per_day": l.jobs_per_day,
        "max_active": l.max_active,
        "max_exhaustiveness": l.max_exhaustiveness,
        "max_num_modes": l.max_num_modes,
        "max_box_edge": l.max_box_edge,
        "max_batch_ligands": l.max_batch_ligands,
        "private_jobs": l.private_jobs,
        "priority_queue": l.priority > 0,
        "api_keys": l.api_keys,
        "retention_days": l.retention_days,
        "all_pose_interactions": l.all_pose_interactions,
    }


def public_catalog() -> dict:
    """What GET /api/pricing returns. Prices appear only when buyable."""
    prices = {}
    for p in PLANS:
        if p.price_id:
            prices["monthly" if p.interval == "month" else "annual"] = {
                "plan": p.key,
                "amount_cents": p.amount,
                "interval": p.interval,
            }
    m, a = prices.get("monthly"), prices.get("annual")
    savings = None
    if m and a and m["amount_cents"] > 0:
        full = m["amount_cents"] * 12
        if a["amount_cents"] < full:
            savings = int(round(100 * (full - a["amount_cents"]) / full))
    return {
        "currency": "usd",
        "checkout_enabled": bool(prices) and bool(os.environ.get("STRIPE_SECRET_KEY")),
        "tiers": {
            "free": {"name": "Free", "limits": _limits_dict(TIER_FREE),
                     "anonymous_limits": _limits_dict(TIER_ANON)},
            "pro": {"name": "Pro", "limits": _limits_dict(TIER_PRO),
                    "prices": prices,
                    # Display prices even before Stripe is configured so the
                    # page can say what Pro will cost.
                    "list_prices": {"monthly_cents": _BY_KEY["pro_monthly"].amount,
                                    "annual_cents": _BY_KEY["pro_annual"].amount},
                    "annual_savings_percent": savings},
            "lab": {"name": "Lab / Institution", "limits": _limits_dict(TIER_LAB),
                    "quote_only": True, "min_seats": 5,
                    "list_price_per_seat_year_cents": int(
                        os.environ.get("LAB_SEAT_PRICE_CENTS", "6900") or 6900)},
        },
        "trial_days": trial_days(),
        "promo_codes": promo_codes_enabled(),
        "storekit_products": sorted(STOREKIT_PRODUCTS),
    }
