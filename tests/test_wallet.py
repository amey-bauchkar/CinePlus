import unittest
import os
import sys

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from bank_offers import (
    SUPPORTED_CARDS,
    calculate_card_benefit,
    get_best_wallet_deal
)

class TestBankOffers(unittest.TestCase):
    def test_01_supported_cards_catalog(self):
        """Verify supported cards catalog contains essential Indian banking cards"""
        self.assertGreater(len(SUPPORTED_CARDS), 5)
        card_ids = [c['id'] for c in SUPPORTED_CARDS]
        self.assertIn('icici_sapphiro', card_ids)
        self.assertIn('icici_coral', card_ids)
        self.assertIn('kotak_pvr', card_ids)
        self.assertIn('sbi_elite', card_ids)
        self.assertIn('axis_myzone', card_ids)
        self.assertIn('hdfc_millennia', card_ids)

        for card in SUPPORTED_CARDS:
            self.assertIn('name', card)
            self.assertIn('bank', card)
            self.assertIn('offer_type', card)
            self.assertIn('headline', card)

    def test_02_icici_sapphiro_bogo(self):
        """Verify ICICI Sapphiro Buy-1-Get-1 Free with ₹500 cap"""
        # 2 tickets @ ₹300 (Total base = ₹600) -> 2nd ticket free up to ₹500 (Discount = ₹300)
        res = calculate_card_benefit(ticket_price=300, qty=2, theatre_chain="PVR INOX", card_id="icici_sapphiro")
        self.assertEqual(res['discount_amount'], 300)
        self.assertEqual(res['effective_total'], 300)
        self.assertEqual(res['effective_per_ticket'], 150)
        self.assertEqual(res['savings_pct'], 50)
        self.assertTrue(res['is_eligible'])

        # 1 ticket @ ₹300 -> BOGO requires minimum 2 tickets
        res_single = calculate_card_benefit(ticket_price=300, qty=1, theatre_chain="PVR INOX", card_id="icici_sapphiro")
        self.assertEqual(res_single['discount_amount'], 0)
        self.assertEqual(res_single['effective_total'], 300)
        self.assertFalse(res_single['is_eligible'])

    def test_03_icici_coral_bogo_cap(self):
        """Verify ICICI Coral ₹250 cap on high-ticket showtimes"""
        # 2 tickets @ ₹600 (Total base = ₹1200) -> BOGO capped at ₹250
        res = calculate_card_benefit(ticket_price=600, qty=2, theatre_chain="PVR INOX", card_id="icici_coral")
        self.assertEqual(res['discount_amount'], 250)
        self.assertEqual(res['effective_total'], 950)
        self.assertEqual(res['effective_per_ticket'], 475)

    def test_04_kotak_pvr_chain_restriction(self):
        """Verify Kotak PVR card applies exclusively to PVR INOX cinemas"""
        # Valid on PVR INOX
        res_pvr = calculate_card_benefit(ticket_price=300, qty=2, theatre_chain="PVR INOX", card_id="kotak_pvr")
        self.assertTrue(res_pvr['is_eligible'])
        self.assertEqual(res_pvr['discount_amount'], 300)

        # Ineligible on Cinepolis
        res_cinepolis = calculate_card_benefit(ticket_price=300, qty=2, theatre_chain="Cinépolis", card_id="kotak_pvr")
        self.assertFalse(res_cinepolis['is_eligible'])
        self.assertEqual(res_cinepolis['discount_amount'], 0)

    def test_05_sbi_elite_flat_per_ticket(self):
        """Verify SBI Card ELITE flat ₹250 off per ticket"""
        # 2 tickets @ ₹350 (Total base = ₹700) -> ₹250 off per ticket = ₹500 off
        res = calculate_card_benefit(ticket_price=350, qty=2, theatre_chain="Single Screen", card_id="sbi_elite")
        self.assertEqual(res['discount_amount'], 500)
        self.assertEqual(res['effective_total'], 200)
        self.assertEqual(res['effective_per_ticket'], 100)

    def test_06_get_best_wallet_deal(self):
        """Verify algorithm selects the card yielding maximum net savings"""
        user_cards = ["icici_coral", "icici_sapphiro", "hdfc_millennia"]
        # For 2 tickets @ ₹400:
        # icici_coral discount = ₹250
        # icici_sapphiro discount = ₹400
        # hdfc_millennia discount = 20% of 800 = ₹160
        # Best should be icici_sapphiro with ₹400 discount
        best = get_best_wallet_deal(ticket_price=400, qty=2, theatre_chain="PVR INOX", selected_card_ids=user_cards)
        self.assertIsNotNone(best)
        self.assertEqual(best['best_card_id'], 'icici_sapphiro')
        self.assertEqual(best['max_savings'], 400)
        self.assertEqual(best['effective_total'], 400)
        self.assertEqual(best['effective_per_ticket'], 200)

class TestWalletAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app import app
        app.config['TESTING'] = True
        cls.client = app.test_client()

    def test_07_api_wallet_cards(self):
        """Verify GET /api/wallet/cards returns supported cards catalogue"""
        r = self.client.get('/api/wallet/cards')
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(data.get('status'), 'success')
        self.assertIn('cards', data)
        self.assertGreater(len(data['cards']), 5)

    def test_08_api_wallet_calculate(self):
        """Verify POST /api/wallet/calculate calculates savings accurately"""
        payload = {
            "ticket_price": 300,
            "qty": 2,
            "theatre_chain": "PVR INOX",
            "cards": ["icici_sapphiro", "kotak_pvr"]
        }
        r = self.client.post('/api/wallet/calculate', json=payload)
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(data.get('status'), 'success')
        deal = data.get('deal', {})
        self.assertTrue(deal.get('has_offer'))
        self.assertEqual(deal.get('max_savings'), 300)
        self.assertEqual(deal.get('effective_per_ticket'), 150)

    def test_09_api_compare_with_wallet(self):
        """Verify /api/compare/<movie_id> attaches wallet deal when cards and qty are passed"""
        r = self.client.get('/api/compare/ET00496545?city=Mumbai&cards=icici_sapphiro,sbi_elite&qty=2')
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertEqual(data.get('status'), 'success')
        comp = data.get('comparison', {})
        self.assertIn('comparison_table', comp)
        if comp['comparison_table']:
            row = comp['comparison_table'][0]
            self.assertIn('wallet_deal', row)
            self.assertIn('effective_price', row)
            self.assertIn('effective_total', row)
            self.assertIn('savings_amount', row)

if __name__ == '__main__':
    unittest.main()
