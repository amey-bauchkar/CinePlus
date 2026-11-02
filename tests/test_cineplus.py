import unittest
import json
import os
import sys

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from finder_engine import haversine_distance_km, get_ist_now, ALL_LOCALITY_KEYS

class CinePlusTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config['TESTING'] = True
        cls.client = app.test_client()

    def test_01_landing_and_movies_pages(self):
        """Verify main web routes render successfully with status 200"""
        r_home = self.client.get('/')
        self.assertEqual(r_home.status_code, 200)
        self.assertIn(b'CinePlus', r_home.data)

        r_movies = self.client.get('/movies')
        self.assertEqual(r_movies.status_code, 200)
        self.assertIn(b'CinePlus', r_movies.data)

    def test_02_security_headers_enforcement(self):
        """Verify OWASP recommended security headers are attached to responses"""
        r = self.client.get('/')
        self.assertEqual(r.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(r.headers.get('X-Frame-Options'), 'SAMEORIGIN')
        self.assertEqual(r.headers.get('X-XSS-Protection'), '1; mode=block')
        self.assertEqual(r.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
        self.assertIn('geolocation=(self)', r.headers.get('Permissions-Policy', ''))

    def test_03_path_traversal_defense(self):
        """Verify path traversal attacks against static assets return 403 or 404"""
        r_attack1 = self.client.get('/static/../app.py')
        self.assertIn(r_attack1.status_code, [403, 404])

        r_attack2 = self.client.get('/static/%2e%2e/app.py')
        self.assertIn(r_attack2.status_code, [403, 404])

        r_valid = self.client.get('/static/css/style.css')
        self.assertEqual(r_valid.status_code, 200)
        r_valid.close()

    def test_04_api_movies_and_upcoming(self):
        """Verify /api/movies and dynamic city /api/upcoming endpoints"""
        r_mov = self.client.get('/api/movies?city=Mumbai')
        self.assertEqual(r_mov.status_code, 200)
        data = r_mov.get_json()
        self.assertEqual(data.get('status'), 'success')
        self.assertGreater(data.get('count', 0), 0)

        # Dynamic city upcoming check
        r_up_mum = self.client.get('/api/upcoming?city=Mumbai')
        self.assertEqual(r_up_mum.status_code, 200)
        data_up_mum = r_up_mum.get_json()
        self.assertEqual(data_up_mum.get('city'), 'Mumbai')

        r_up_blr = self.client.get('/api/upcoming?city=Bengaluru')
        self.assertEqual(r_up_blr.status_code, 200)
        data_up_blr = r_up_blr.get_json()
        self.assertEqual(data_up_blr.get('city'), 'Bengaluru')

    def test_05_api_comparison_and_rest_alias(self):
        """Verify comparison endpoint, RESTful alias /api/compare/<id>, and outing metrics"""
        # Query parameter route
        r_comp = self.client.get('/api/comparison?movie_id=ET00496545&city=Mumbai')
        self.assertEqual(r_comp.status_code, 200)
        data = r_comp.get_json()
        self.assertEqual(data.get('status'), 'success')
        comp = data.get('comparison', {})
        self.assertIn('comparison_table', comp)
        self.assertIn('cheapest_option', comp)
        self.assertIn('best_value_option', comp)

        if comp.get('comparison_table'):
            first_row = comp['comparison_table'][0]
            self.assertIn('est_travel_cost', first_row)
            self.assertIn('est_travel_time_mins', first_row)
            self.assertIn('total_outing_cost', first_row)
            self.assertIn('smart_score', first_row)

        # RESTful alias route: /api/compare/<movie_id>
        r_alias = self.client.get('/api/compare/ET00496545?city=Mumbai')
        self.assertEqual(r_alias.status_code, 200)
        data_alias = r_alias.get_json()
        self.assertEqual(data_alias.get('status'), 'success')

    def test_06_price_matrix_and_golden_hour(self):
        """Verify price matrix calculations and 4-window analysis"""
        r_mat = self.client.get('/api/price-matrix?city=Mumbai&movie_id=ET00496545')
        self.assertEqual(r_mat.status_code, 200)
        data = r_mat.get_json()
        self.assertEqual(data.get('status'), 'success')
        matrix = data.get('data', {})
        self.assertIn('time_windows', matrix)
        self.assertIn('morning', matrix['time_windows'])
        self.assertIn('evening', matrix['time_windows'])
        self.assertIn('golden_deal', matrix)

    def test_07_price_alert_lifecycle_and_simulator_reset(self):
        """Verify price alert creation, simulation (drop, surge, reset), and deletion"""
        # 1. Create alert
        payload = {
            "movie_id": "ET00496545",
            "movie_title": "Clayface",
            "target_price": 250,
            "city": "Mumbai",
            "format_type": "2D",
            "email": "test@example.com"
        }
        r_create = self.client.post('/api/alerts', json=payload)
        self.assertEqual(r_create.status_code, 200)
        create_data = r_create.get_json()
        alert_id = create_data.get('alert', {}).get('id')
        self.assertIsNotNone(alert_id)

        # 2. Simulate Flash Drop
        r_drop = self.client.post('/api/alerts/simulate', json={"action": "drop", "movie_id": "ET00496545", "price": 120})
        self.assertEqual(r_drop.status_code, 200)
        drop_data = r_drop.get_json()
        self.assertEqual(drop_data['result']['action'], 'drop')

        # 3. Simulate Surge
        r_surge = self.client.post('/api/alerts/simulate', json={"action": "surge", "movie_id": "ET00496545", "price": 450})
        self.assertEqual(r_surge.status_code, 200)
        surge_data = r_surge.get_json()
        self.assertEqual(surge_data['result']['action'], 'surge')

        # 4. Simulate Reset (verifying examiner simulator bugfix!)
        r_reset = self.client.post('/api/alerts/simulate', json={"action": "reset"})
        self.assertEqual(r_reset.status_code, 200)
        reset_data = r_reset.get_json()
        self.assertEqual(reset_data['result']['action'], 'reset')

        # 5. Delete alert via RESTful alias: DELETE /api/alerts/<alert_id>
        r_del = self.client.delete(f'/api/alerts/{alert_id}')
        self.assertEqual(r_del.status_code, 200)
        self.assertEqual(r_del.get_json().get('status'), 'success')

    def test_08_csv_exports_with_utf8_bom(self):
        """Verify unified /api/export/csv and dedicated endpoints prepend UTF-8 BOM (\ufeff)"""
        # Shows CSV
        r_shows = self.client.get('/api/export/csv?type=movies&city=Mumbai')
        self.assertEqual(r_shows.status_code, 200)
        self.assertTrue(r_shows.data.startswith(b'\xef\xbb\xbf'))

        # Comparison CSV
        r_comp = self.client.get('/api/export/csv?type=compare&movie_id=ET00496545&city=Mumbai')
        self.assertEqual(r_comp.status_code, 200)
        self.assertTrue(r_comp.data.startswith(b'\xef\xbb\xbf'))

        # Price Matrix CSV
        r_mat = self.client.get('/api/export/csv?type=matrix&movie_id=ET00496545&city=Mumbai')
        self.assertEqual(r_mat.status_code, 200)
        self.assertTrue(r_mat.data.startswith(b'\xef\xbb\xbf'))

    def test_09_haversine_and_ist_timezone(self):
        """Verify distance formulas and Indian Standard Time calculations"""
        # Distance between Mumbai Gateway (18.9220, 72.8347) and CST (18.9400, 72.8353) is ~2.0 km
        dist = haversine_distance_km(18.9220, 72.8347, 18.9400, 72.8353)
        self.assertAlmostEqual(dist, 2.0, delta=0.5)

        # Zero or minimal distance returns proper float
        dist_zero = haversine_distance_km(19.0, 72.8, 19.0, 72.8)
        self.assertEqual(dist_zero, 0.0)

        # IST time should be valid datetime
        ist_now = get_ist_now()
        self.assertIsNotNone(ist_now)

        # Locality keys dictionary should include major Indian hubs
        self.assertIn('Lower Parel', ALL_LOCALITY_KEYS)
        self.assertIn('Bandra Kurla Complex', ALL_LOCALITY_KEYS)
        self.assertIn('Koramangala', ALL_LOCALITY_KEYS)
        self.assertIn('Indiranagar', ALL_LOCALITY_KEYS)

    def test_10_wallet_matcher_e2e(self):
        """Verify end-to-end wallet calculation and discount injection into comparison"""
        # 1. Cards catalogue
        r_cards = self.client.get('/api/wallet/cards')
        self.assertEqual(r_cards.status_code, 200)
        cards_data = r_cards.get_json()
        self.assertIn('cards', cards_data)
        self.assertGreater(len(cards_data['cards']), 5)

        # 2. Standalone calculator
        calc_payload = {
            "ticket_price": 400,
            "qty": 2,
            "theatre_chain": "PVR INOX",
            "cards": ["icici_sapphiro"]
        }
        r_calc = self.client.post('/api/wallet/calculate', json=calc_payload)
        self.assertEqual(r_calc.status_code, 200)
        calc_res = r_calc.get_json().get('deal', {})
        self.assertTrue(calc_res.get('has_offer'))
        self.assertEqual(calc_res.get('max_savings'), 400)
        self.assertEqual(calc_res.get('effective_per_ticket'), 200)

        # 3. Injected comparison endpoint
        r_comp = self.client.get('/api/compare/ET00496545?city=Mumbai&cards=icici_sapphiro&qty=2')
        self.assertEqual(r_comp.status_code, 200)
        comp_data = r_comp.get_json().get('comparison', {})
        self.assertIn('comparison_table', comp_data)
        if comp_data['comparison_table']:
            first_row = comp_data['comparison_table'][0]
            self.assertIn('effective_price', first_row)
            self.assertIn('wallet_deal', first_row)
            self.assertIn('savings_amount', first_row)

    def test_11_real_time_clock_and_matrix_active_window(self):
        """Verify real-time IST clock API and active window resolution in Price Matrix"""
        # 1. System clock endpoint
        r_clock = self.client.get('/api/system/clock')
        self.assertEqual(r_clock.status_code, 200)
        clock_data = r_clock.get_json()
        self.assertEqual(clock_data.get('status'), 'success')
        self.assertIn('current_ist_time', clock_data)
        self.assertIn('active_window', clock_data)
        self.assertIn(clock_data.get('active_window'), ['morning', 'matinee', 'evening', 'night'])

        # 2. Price matrix returns active_window and current_ist_time
        r_mat = self.client.get('/api/price-matrix?city=Mumbai&movie_id=ET00496545')
        self.assertEqual(r_mat.status_code, 200)
        mat_data = r_mat.get_json().get('data', {})
        self.assertIn('active_window', mat_data)
        self.assertIn('current_ist_time', mat_data)
        self.assertEqual(mat_data.get('active_window'), clock_data.get('active_window'))

    def test_12_catalog_on_demand_sync_and_registration(self):
        """Verify catalog sync and on-demand movie registration snapshot persistence"""
        # 1. Trigger theatrical sync
        r_sync = self.client.post('/api/catalog/sync')
        self.assertEqual(r_sync.status_code, 200)
        sync_data = r_sync.get_json()
        self.assertEqual(sync_data.get('status'), 'success')
        self.assertIn('count_added', sync_data)

        # 2. Add movie validation (missing title)
        r_add_bad = self.client.post('/api/catalog/add', json={})
        self.assertEqual(r_add_bad.status_code, 400)

        # 3. Add existing movie (duplicate check)
        r_add_dup = self.client.post('/api/catalog/add', json={"title": "Clayface"})
        self.assertEqual(r_add_dup.status_code, 200)
        dup_data = r_add_dup.get_json()
        self.assertEqual(dup_data.get('status'), 'exists')

if __name__ == '__main__':
    unittest.main()
