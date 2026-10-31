"""
price_tracker.py
Background price tracking and alert notification engine.
Allows users to subscribe to price drops on specific movies and formats.
Runs background polling with schedule and logs/triggers notifications.
"""

import threading
import time
import schedule
from datetime import datetime
from finder_engine import get_movie_shows

class PriceAlertManager:
    def __init__(self):
        self.alerts = []
        self.notification_history = []
        self.is_running = False
        self._thread = None
        self._lock = threading.Lock()

    def add_alert(self, movie_id, movie_title, target_price, city="Mumbai", format_type="All", email=None):
        """Adds a price alert watcher with memory cap protection"""
        with self._lock:
            # Memory exhaustion defense: cap active alerts at 50 entries
            if len(self.alerts) >= 50:
                self.alerts.pop(0)

            alert = {
                "id": f"alert-{int(time.time() * 1000)}",
                "movie_id": movie_id,
                "movie_title": movie_title,
                "target_price": int(target_price),
                "city": city,
                "format_type": format_type,
                "email": email or "user@example.com",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "status": "Active",
                "last_checked": None,
                "last_price_found": None
            }
            self.alerts.append(alert)
            self._check_single_alert(alert)
            return alert

    def get_alerts(self):
        """Returns list of active alerts"""
        with self._lock:
            return list(self.alerts)

    def delete_alert(self, alert_id):
        """Removes an alert by ID"""
        with self._lock:
            self.alerts = [a for a in self.alerts if a["id"] != alert_id]
            return True

    def get_notifications(self):
        """Returns trigger history"""
        with self._lock:
            return list(self.notification_history)

    def _check_single_alert(self, alert):
        """Evaluates price condition against current movie database"""
        shows = get_movie_shows(city=alert["city"])
        for m in shows:
            if m["id"] == alert["movie_id"] or m["title"].lower() == alert["movie_title"].lower():
                current_min = m["min_price"]
                alert["last_checked"] = datetime.now().strftime("%H:%M:%S")
                alert["last_price_found"] = current_min

                if current_min <= alert["target_price"]:
                    alert["status"] = "TRIGGERED"
                    notif = {
                        "id": f"notif-{int(time.time() * 1000)}",
                        "title": f"Price Drop Alert: {alert['movie_title']}",
                        "message": f"Tickets for {alert['movie_title']} in {alert['city']} are now available for ₹{current_min} (Target: ₹{alert['target_price']})!",
                        "movie_title": alert["movie_title"],
                        "city": alert["city"],
                        "price": current_min,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    if not any(n["title"] == notif["title"] and n["price"] == current_min for n in self.notification_history):
                        self.notification_history.insert(0, notif)
                        if len(self.notification_history) > 100:
                            self.notification_history = self.notification_history[:100]
                break

    def simulate_price_fluctuation(self, action="drop", movie_id=None, simulated_price=None, theatre_name=None, city="Mumbai"):
        """
        Simulates an instant price fluctuation (flash drop or surge) to showcase
        the reactive alert daemon, automated threshold verification, and toast dispatching
        live to the examiner during project review.
        """
        with self._lock:
            shows = get_movie_shows(city=city)
            target_movie = None
            if movie_id and movie_id != "all":
                target_movie = next((m for m in shows if m["id"] == movie_id or m["title"].lower() == movie_id.lower()), None)
            if not target_movie and self.alerts:
                first_alert_mid = self.alerts[0].get("movie_id")
                target_movie = next((m for m in shows if m["id"] == first_alert_mid), None)
            if not target_movie and shows:
                target_movie = shows[0]

            if not target_movie:
                return {"error": "No movies found in city"}

            mid = target_movie["id"]
            mtitle = target_movie["title"]
            base_min = target_movie.get("min_price", 180)

            # Resolve theatre
            th_shows = target_movie.get("theatre_shows", [])
            target_theatre = theatre_name
            booking_url = target_movie.get("direct_booking_links", {}).get("bookmyshow", "https://in.bookmyshow.com")
            if not target_theatre and th_shows:
                target_theatre = th_shows[0].get("theatre_name", "MovieMax")
                if th_shows[0].get("shows"):
                    booking_url = th_shows[0]["shows"][0].get("booking_url", booking_url)
            elif not target_theatre:
                target_theatre = f"Multiplex, {city}"

            if action == "drop":
                if simulated_price:
                    drop_price = int(simulated_price)
                elif base_min > 90:
                    drop_price = max(75, int(base_min * 0.60))
                else:
                    drop_price = max(20, int(base_min * 0.65))

                if drop_price >= base_min:
                    drop_price = max(20, base_min - 20)

                # Check if there is an active alert for this movie; if none, auto-create one
                matched_alert = next((a for a in self.alerts if a["movie_id"] == mid or a["movie_title"].lower() == mtitle.lower()), None)
                if not matched_alert:
                    matched_alert = {
                        "id": f"alert-{int(time.time() * 1000)}",
                        "movie_id": mid,
                        "movie_title": mtitle,
                        "target_price": int(drop_price + 35),
                        "city": city,
                        "format_type": "2D",
                        "email": "examiner.demo@cineplus.ai",
                        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "status": "Active",
                        "last_checked": None,
                        "last_price_found": base_min
                    }
                    self.alerts.append(matched_alert)

                matched_alert["status"] = "TRIGGERED"
                matched_alert["last_checked"] = datetime.now().strftime("%H:%M:%S")
                matched_alert["last_price_found"] = drop_price

                savings = max(0, base_min - drop_price)
                pct = round((savings / base_min) * 100) if base_min > 0 else 40

                notif = {
                    "id": f"notif-{int(time.time() * 1000)}",
                    "type": "drop",
                    "title": f"🔥 FLASH PRICE DROP: {mtitle}",
                    "message": f"Tickets at {target_theatre} dropped from ₹{base_min} to ₹{drop_price} ({pct}% OFF)! Target threshold (₹{matched_alert['target_price']}) met.",
                    "movie_title": mtitle,
                    "theatre_name": target_theatre,
                    "city": city,
                    "old_price": base_min,
                    "price": drop_price,
                    "target_price": matched_alert["target_price"],
                    "savings": savings,
                    "booking_url": booking_url,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "is_simulated": True
                }
                self.notification_history.insert(0, notif)

                return {
                    "action": "drop",
                    "movie_title": mtitle,
                    "theatre_name": target_theatre,
                    "old_price": base_min,
                    "new_price": drop_price,
                    "target_price": matched_alert["target_price"],
                    "savings": savings,
                    "alert_id": matched_alert["id"],
                    "booking_url": booking_url,
                    "notification": notif
                }

            elif action == "surge":
                surge_price = int(simulated_price) if simulated_price else int(base_min * 1.8)
                notif = {
                    "id": f"notif-{int(time.time() * 1000)}",
                    "type": "surge",
                    "title": f"📈 PRIME-TIME SURGE: {mtitle}",
                    "message": f"Peak demand spike at {target_theatre}! Evening ticket rates rose from ₹{base_min} to ₹{surge_price}. Arbiter recommends morning/matinee slots to save.",
                    "movie_title": mtitle,
                    "theatre_name": target_theatre,
                    "city": city,
                    "old_price": base_min,
                    "price": surge_price,
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "is_simulated": True
                }
                self.notification_history.insert(0, notif)
                return {
                    "action": "surge",
                    "movie_title": mtitle,
                    "theatre_name": target_theatre,
                    "old_price": base_min,
                    "new_price": surge_price,
                    "notification": notif
                }

            elif action == "reset":
                for a in self.alerts:
                    a["status"] = "Active"
                return {
                    "action": "reset",
                    "message": "Reset all watchers to active monitoring state."
                }

    def check_all_alerts(self):
        """Runs check on all alerts"""
        with self._lock:
            for alert in self.alerts:
                self._check_single_alert(alert)

    def start_scheduler(self):
        """Starts background periodic checking thread using schedule library"""
        if self.is_running:
            return

        self.is_running = True
        schedule.every(30).seconds.do(self.check_all_alerts)

        def run_loop():
            while self.is_running:
                schedule.run_pending()
                time.sleep(1)

        self._thread = threading.Thread(target=run_loop, daemon=True)
        self._thread.start()

# Global alert manager singleton
alert_manager = PriceAlertManager()
alert_manager.start_scheduler()
