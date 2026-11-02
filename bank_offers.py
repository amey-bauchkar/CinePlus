"""
bank_offers.py
Rules engine and discount calculation module for Indian credit/debit card cinema benefits.
Models Buy-One-Get-One (BOGO), flat discounts, and percentage cashbacks across multiplex chains.
"""

SUPPORTED_CARDS = [
    {
        "id": "icici_sapphiro",
        "bank": "ICICI Bank",
        "name": "ICICI Sapphiro / Emeralde Card",
        "offer_type": "BOGO",
        "max_discount": 500,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹500 off)",
        "badge": "Premium BOGO",
        "icon": "gem"
    },
    {
        "id": "icici_coral",
        "bank": "ICICI Bank",
        "name": "ICICI Coral / Rubyx Card",
        "offer_type": "BOGO",
        "max_discount": 250,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹250 off)",
        "badge": "Popular BOGO",
        "icon": "credit-card"
    },
    {
        "id": "kotak_pvr",
        "bank": "Kotak Mahindra",
        "name": "Kotak PVR INOX Platinum/Signature",
        "offer_type": "BOGO",
        "max_discount": 400,
        "min_tickets": 2,
        "chains": ["PVR INOX"],
        "headline": "Buy 1 Get 1 Free at PVR INOX (Up to ₹400)",
        "badge": "PVR Exclusive",
        "icon": "film"
    },
    {
        "id": "sbi_elite",
        "bank": "SBI Card",
        "name": "SBI Card ELITE / Aurum",
        "offer_type": "FLAT_PER_TICKET",
        "discount_per_ticket": 250,
        "max_tickets": 2,
        "min_tickets": 1,
        "chains": ["ALL"],
        "headline": "Free Tickets / Flat ₹250 Off per ticket",
        "badge": "High Value",
        "icon": "award"
    },
    {
        "id": "axis_myzone",
        "bank": "Axis Bank",
        "name": "Axis Bank My Zone Card",
        "offer_type": "BOGO",
        "max_discount": 200,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹200 off)",
        "badge": "BOGO",
        "icon": "zap"
    },
    {
        "id": "hdfc_millennia",
        "bank": "HDFC Bank",
        "name": "HDFC Millennia / Regalia Gold",
        "offer_type": "PERCENTAGE",
        "percentage": 20,
        "max_discount": 200,
        "min_tickets": 1,
        "chains": ["ALL"],
        "headline": "20% Instant Cashback/Discount (Up to ₹200)",
        "badge": "Cashback",
        "icon": "percent"
    },
    {
        "id": "indusind_legend",
        "bank": "IndusInd Bank",
        "name": "IndusInd Legend / Pinnacle",
        "offer_type": "BOGO",
        "max_discount": 200,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹200 off)",
        "badge": "BOGO",
        "icon": "star"
    },
    {
        "id": "rbl_popcorn",
        "bank": "RBL Bank",
        "name": "RBL Bank Play / Popcorn Card",
        "offer_type": "BOGO",
        "max_discount": 250,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹250 off via BMS)",
        "badge": "Entertainment",
        "icon": "coffee"
    }
]

CARDS_BY_ID = {c["id"]: c for c in SUPPORTED_CARDS}

def calculate_card_benefit(ticket_price, qty=2, theatre_chain="PVR INOX", card_id=None):
    """
    Computes out-of-pocket ticket cost and savings for a specific card.
    """
    base_price = max(0, int(ticket_price))
    tickets = max(1, int(qty))
    base_total = base_price * tickets

    card = CARDS_BY_ID.get(card_id)
    if not card:
        return {
            "card_id": card_id,
            "card_name": "No Card Selected",
            "is_eligible": False,
            "reason": "Card not recognized",
            "base_total": base_total,
            "discount_amount": 0,
            "effective_total": base_total,
            "effective_per_ticket": base_price,
            "savings_pct": 0
        }

    # Verify theatre chain applicability
    allowed_chains = card.get("chains", ["ALL"])
    chain_clean = theatre_chain.strip() if theatre_chain else ""
    if "ALL" not in allowed_chains and not any(ac.lower() in chain_clean.lower() for ac in allowed_chains):
        return {
            "card_id": card["id"],
            "card_name": card["name"],
            "bank": card["bank"],
            "is_eligible": False,
            "reason": f"Only valid at {', '.join(allowed_chains)}",
            "base_total": base_total,
            "discount_amount": 0,
            "effective_total": base_total,
            "effective_per_ticket": base_price,
            "savings_pct": 0
        }

    # Verify minimum ticket requirement
    min_req = card.get("min_tickets", 1)
    if tickets < min_req:
        return {
            "card_id": card["id"],
            "card_name": card["name"],
            "bank": card["bank"],
            "is_eligible": False,
            "reason": f"Requires minimum {min_req} tickets for offer",
            "base_total": base_total,
            "discount_amount": 0,
            "effective_total": base_total,
            "effective_per_ticket": base_price,
            "savings_pct": 0
        }

    # Calculate discount amount by offer type
    offer_type = card.get("offer_type")
    discount = 0

    if offer_type == "BOGO":
        # 1 free ticket for every 2 tickets, up to max_discount per free ticket
        free_tickets = tickets // 2
        cap = card.get("max_discount", base_price)
        discount = free_tickets * min(base_price, cap)

    elif offer_type == "FLAT_PER_TICKET":
        max_tix = card.get("max_tickets", tickets)
        eligible_tix = min(tickets, max_tix)
        flat_val = card.get("discount_per_ticket", base_price)
        discount = eligible_tix * min(base_price, flat_val)

    elif offer_type == "PERCENTAGE":
        pct = card.get("percentage", 0) / 100.0
        calculated_pct_discount = int(base_total * pct)
        cap = card.get("max_discount", base_total)
        discount = min(calculated_pct_discount, cap)

    discount = min(discount, base_total)
    effective_total = max(0, base_total - discount)
    effective_per_ticket = round(effective_total / tickets) if tickets > 0 else 0
    savings_pct = round((discount / base_total) * 100) if base_total > 0 else 0

    return {
        "card_id": card["id"],
        "card_name": card["name"],
        "bank": card["bank"],
        "offer_type": offer_type,
        "headline": card["headline"],
        "badge": card["badge"],
        "is_eligible": True,
        "base_total": base_total,
        "discount_amount": discount,
        "effective_total": effective_total,
        "effective_per_ticket": effective_per_ticket,
        "savings_pct": savings_pct
    }

def get_best_wallet_deal(ticket_price, qty=2, theatre_chain="PVR INOX", selected_card_ids=None):
    """
    Evaluates all cards in user's selected wallet and returns the card
    yielding the highest net financial savings.
    """
    base_price = max(0, int(ticket_price))
    tickets = max(1, int(qty))
    base_total = base_price * tickets

    if not selected_card_ids:
        return {
            "has_offer": False,
            "best_card_id": None,
            "best_card_name": None,
            "max_savings": 0,
            "base_total": base_total,
            "effective_total": base_total,
            "effective_per_ticket": base_price,
            "savings_pct": 0,
            "badge": None,
            "headline": "No Card Applied"
        }

    evaluated = []
    for cid in selected_card_ids:
        benefit = calculate_card_benefit(base_price, qty=tickets, theatre_chain=theatre_chain, card_id=cid)
        if benefit.get("is_eligible") and benefit.get("discount_amount", 0) > 0:
            evaluated.append(benefit)

    if not evaluated:
        return {
            "has_offer": False,
            "best_card_id": None,
            "best_card_name": None,
            "max_savings": 0,
            "base_total": base_total,
            "effective_total": base_total,
            "effective_per_ticket": base_price,
            "savings_pct": 0,
            "badge": None,
            "headline": "No Eligible Card Offer"
        }

    # Pick the offer with maximum discount (and lowest effective total)
    evaluated.sort(key=lambda x: (x["discount_amount"], x["savings_pct"]), reverse=True)
    best = evaluated[0]

    return {
        "has_offer": True,
        "best_card_id": best["card_id"],
        "best_card_name": best["card_name"],
        "bank": best["bank"],
        "max_savings": best["discount_amount"],
        "base_total": best["base_total"],
        "effective_total": best["effective_total"],
        "effective_per_ticket": best["effective_per_ticket"],
        "savings_pct": best["savings_pct"],
        "badge": best["badge"],
        "headline": best["headline"]
    }

