# Wallet Matcher & Bank Card Offer Engine Implementation Plan

> **For Claude / Antigravity:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Transform CinePlus into India's first cinema price intelligence platform with automated bank card discount calculation, allowing users to select cards they own (ICICI, Kotak, SBI, Axis, HDFC, IndusInd) and instantly view true out-of-pocket costs with Buy-One-Get-One (BOGO) and flat savings across all theatres.

**Architecture:**
1. **Bank Offer Knowledge Base & Calculator (`bank_offers.py`)**: A rule-based engine modeling major Indian cinema card benefits (BOGO caps, minimum ticket rules, chain exclusions like Kotak PVR vs generic BMS).
2. **REST API Extensions (`app.py`)**:
   - `GET /api/wallet/cards`: Catalog of supported cards with bank logos/badges and offer summaries.
   - `POST /api/wallet/calculate`: Computes net payable amount, savings, and best card recommendation for a given ticket price and quantity.
   - Enhanced `/api/comparison` and `/api/compare/<movie_id>`: Dynamically accepts `cards` and `qty` query parameters to attach real effective costs and card recommendation tags to every screening.
3. **Two26 Frontend Wallet Modal & LocalStorage Persistence (`main.js`, `style.css`, `movies.html`)**:
   - A "💳 My Cards" toggle in the header and comparison drawer.
   - Interactive bank card selector with `localStorage` persistence so user preferences persist across sessions.
   - Dynamic ticket quantity toggle (1, 2, 3, 4 tickets) with instant recalculation of BOGO benefits.
   - Visual "Best Card to Swipe" recommendation badge on every theatre show row.
4. **Automated Unit Testing (`tests/test_wallet.py`)**: Comprehensive test suite validating BOGO math, max discount caps, chain restrictions, and API responses.

**Tech Stack:** Python 3.10+ (Flask, unittest), Vanilla JavaScript (ES6+, LocalStorage), CSS3 (Two26 Design Tokens).

---

### Task 1: Create Bank Card Offer Rules & Calculator Module (`bank_offers.py`)

**Files:**
- Create: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\bank_offers.py`
- Test: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\tests\test_wallet.py`

**Step 1: Write the failing unit tests for `bank_offers.py`**
Create `tests/test_wallet.py` testing:
- Card listing returns expected popular cards (ICICI Coral/Sapphiro, Kotak PVR, SBI Elite, Axis MyZone, HDFC Millennia).
- BOGO logic: when buying 2 tickets at ₹300 with ICICI Sapphiro (BOGO up to ₹500), 2nd ticket is free (discount = ₹300, total = ₹300, effective per ticket = ₹150).
- Discount cap: when buying 2 tickets at ₹600 with ICICI Coral (BOGO up to ₹250), discount = ₹250 (total = ₹950, effective per ticket = ₹475).
- Chain restriction: Kotak PVR card applies to PVR INOX but does not apply to Cinepolis or Single Screens.
- Single ticket vs multiple tickets: BOGO requires minimum 2 tickets; 1 ticket gets flat discount or 0 depending on card terms.

**Step 2: Run test to verify it fails**
Command: `.\venv\Scripts\python.exe -m unittest tests/test_wallet.py`
Expected: FAIL (`ModuleNotFoundError: No module named 'bank_offers'`).

**Step 3: Implement `bank_offers.py`**
Define card data structures:
```python
SUPPORTED_CARDS = [
    {
        "id": "icici_sapphiro",
        "bank": "ICICI Bank",
        "name": "ICICI Sapphiro / Emeralde Credit Card",
        "offer_type": "BOGO",
        "max_discount": 500,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹500 off)",
        "badge": "Premium BOGO"
    },
    {
        "id": "icici_coral",
        "bank": "ICICI Bank",
        "name": "ICICI Coral / Rubyx Credit Card",
        "offer_type": "BOGO",
        "max_discount": 250,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹250 off)",
        "badge": "Popular BOGO"
    },
    {
        "id": "kotak_pvr",
        "bank": "Kotak Mahindra",
        "name": "Kotak PVR INOX Platinum/Signature Card",
        "offer_type": "BOGO",
        "max_discount": 400,
        "min_tickets": 2,
        "chains": ["PVR INOX"],
        "headline": "Buy 1 Get 1 Free at PVR INOX (Up to ₹400)",
        "badge": "PVR Exclusive"
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
        "badge": "High Value"
    },
    {
        "id": "axis_myzone",
        "bank": "Axis Bank",
        "name": "Axis Bank My Zone Credit Card",
        "offer_type": "BOGO",
        "max_discount": 200,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹200 off via District/BMS)",
        "badge": "BOGO"
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
        "headline": "20% Instant Discount / Cashback (Up to ₹200)",
        "badge": "Cashback"
    },
    {
        "id": "indusind_legend",
        "bank": "IndusInd Bank",
        "name": "IndusInd Legend / Pinnacle Card",
        "offer_type": "BOGO",
        "max_discount": 200,
        "min_tickets": 2,
        "chains": ["ALL"],
        "headline": "Buy 1 Get 1 Free (Up to ₹200 off)",
        "badge": "BOGO"
    }
]
```
Implement `calculate_card_benefit(ticket_price, qty=2, theatre_chain="PVR INOX", card_id=None)` and `get_best_wallet_deal(ticket_price, qty=2, theatre_chain="PVR INOX", selected_card_ids=[])`.

**Step 4: Run test to verify it passes**
Command: `.\venv\Scripts\python.exe -m unittest tests/test_wallet.py`
Expected: PASS.

**Step 5: Commit**
`git add bank_offers.py tests/test_wallet.py`
`git commit -m "feat: add bank card rules engine and discount calculator"`

---

### Task 2: Integrate Wallet Endpoints in `app.py` & Extend Comparison Logic

**Files:**
- Modify: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\app.py`
- Modify: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\finder_engine.py`
- Test: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\tests\test_wallet.py`

**Step 1: Add unit tests for wallet API routes in `tests/test_wallet.py`**
- Test `GET /api/wallet/cards` returns 200 and list of supported cards.
- Test `POST /api/wallet/calculate` returns correct calculated savings.
- Test `GET /api/compare/<movie_id>?cards=icici_sapphiro&qty=2` returns annotated `effective_price` and `best_card_deal` on each showtime.

**Step 2: Run test to verify it fails**
Command: `.\venv\Scripts\python.exe -m unittest tests/test_wallet.py`
Expected: FAIL (`404 Not Found` for wallet endpoints).

**Step 3: Implement Flask routes in `app.py`**
- `@app.route('/api/wallet/cards', methods=['GET'])`:
  Returns JSON list of cards.
- `@app.route('/api/wallet/calculate', methods=['POST'])`:
  Parses `{ ticket_price, qty, theatre_chain, cards }` and returns best card savings.
- In `api_comparison()` and `api_compare_alias()`:
  Read `cards = request.args.get('cards', '')` (comma-separated IDs) and `qty = request.args.get('qty', 2, type=int)`.
  Pass `user_cards` and `ticket_qty` to `get_price_comparison()`.
- In `finder_engine.py`:
  Update `get_price_comparison()` to attach `effective_price`, `savings_amount`, `best_card_name`, and `card_applied` to each comparison row.

**Step 4: Run test to verify it passes**
Command: `.\venv\Scripts\python.exe -m unittest tests/test_wallet.py`
Expected: PASS.

**Step 5: Commit**
`git add app.py finder_engine.py tests/test_wallet.py`
`git commit -m "feat: add wallet API endpoints and embed card discount in movie comparison"`

---

### Task 3: Build "My Cards Wallet" Drawer & Dynamic UI in Frontend

**Files:**
- Modify: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\templates\movies.html`
- Modify: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\static\js\main.js`
- Modify: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\static\css\style.css`
- Copy to: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\public\static/`

**Step 1: Update `templates/movies.html`**
- Add a "💳 My Cards (0)" button in the top action/filter bar.
- Add the `wallet-modal` dialog:
  - Header: "Select Your Cards & Discounts"
  - Subtitle: "Choose the cards you carry. CinePlus automatically applies Buy-1-Get-1 and bank offers to show your true out-of-pocket price."
  - Ticket quantity stepper: `[-] 2 Tickets [+]` (with explanation of BOGO eligibility).
  - Cards grid: Checkbox chips with bank brand tags, offer headlines, and savings badges.
  - Footer buttons: "Save My Wallet" & "Reset".

**Step 2: Update `static/js/main.js`**
- State management:
  - `userWalletCards = JSON.parse(localStorage.getItem('cineplus_wallet_cards') || '["icici_coral", "sbi_elite"]')` (sensible default or empty).
  - `userTicketQty = parseInt(localStorage.getItem('cineplus_ticket_qty') || '2')`.
- Functions:
  - `openWalletModal()` / `closeWalletModal()`
  - `renderWalletCardsList()`: dynamically loads cards from `/api/wallet/cards`.
  - `toggleWalletCard(cardId)`
  - `changeTicketQty(delta)`
  - Update `openCompareModal(movieId)`: appends `&cards=${userWalletCards.join(',')}&qty=${userTicketQty}` to the fetch request.
  - Update comparison table rendering:
    - If `effective_price < silver_price`: show crossed-out original price, highlighted green effective price, and card tag (e.g. `🎉 ₹150 with ICICI (BOGO)`).
    - Top summary banner: "Best Card to Swipe: **ICICI Sapphiro** saves you **₹300** on 2 tickets at this venue".

**Step 3: Update `static/css/style.css`**
- Style `.wallet-badge`, `.wallet-modal`, `.card-chip`, `.qty-stepper`, `.effective-price-pill`, and `.savings-highlight`.
- Maintain Two26 dark aesthetic with OnePlus red accent highlights and high-contrast typography.

**Step 4: Synchronize `public/static/`**
- Copy modified files from `static/` to `public/static/` to ensure Vercel static asset consistency.

**Step 5: Verify in local browser and running tests**
- Verify tests pass: `.\venv\Scripts\python.exe -m unittest discover tests`

**Step 6: Commit**
`git add templates/movies.html static/js/main.js static/css/style.css public/static/`
`git commit -m "feat: add interactive wallet drawer, card selection chips, and effective price rendering"`

---

### Task 4: Automated End-to-End Test Suite & Deployment Verification

**Files:**
- Modify: `c:\Users\SEBIN\Desktop\PPproject\Python-Mini-Project\tests/test_cineplus.py`

**Step 1: Add Wallet E2E assertions into `test_cineplus.py`**
- Verify complete checkout calculation and response contract.

**Step 2: Run all tests**
Command: `.\venv\Scripts\python.exe -m unittest discover tests`
Expected: 100% PASS with 0 errors.

**Step 3: Push to GitHub and verify live Vercel deployment**
Commands:
```bash
git push origin main
```
Test live endpoints on `https://cine-plus-ten.vercel.app/`:
- `GET /api/wallet/cards`
- `GET /api/compare/ET00496545?cards=icici_sapphiro&qty=2`

---

### Verification Checklist
- [ ] User can click "💳 My Cards" and select any combination of cards.
- [ ] Selected cards are saved in `localStorage` across page refreshes.
- [ ] Switching ticket count from 1 to 2 enables BOGO discounts.
- [ ] Comparison table displays crossed-out regular price and green net payable price.
- [ ] The best card to swipe is explicitly recommended for each screening.
- [ ] All tests pass in `tests/test_wallet.py` and `tests/test_cineplus.py`.
- [ ] Live Vercel site is deployed and functional.

