"""
app.py
Main entry point for Movie Ticket Price & Show Finder Automation.
Launches Flask web server and serves the OnePlus-inspired interface with live data,
upcoming movies, price comparison matrix, and multi-platform direct booking launchers.
"""

import os
import sys
import re
import webbrowser
import threading
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from bank_offers import SUPPORTED_CARDS, calculate_card_benefit, get_best_wallet_deal
from catalog_updater import add_movie_to_catalog, sync_new_theatrical_releases
from finder_engine import (
    CITIES, THEATRES, NOW_SHOWING_MOVIES, UPCOMING_MOVIES, PROMO_CODES,
    get_movie_shows, get_upcoming_movies, get_price_comparison, get_booking_details, get_price_matrix,
    resolve_youtube_trailer_id, get_ist_now
)
from price_tracker import alert_manager
from data_exporter import export_shows_to_csv, export_comparison_to_csv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024  # 2MB request limit protection against DoS
app.jinja_env.auto_reload = True

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(self), camera=(), microphone=()'
    return response

@app.route('/')
def index():
    return render_template('index.html', cities=CITIES, movie_count=len(NOW_SHOWING_MOVIES))

@app.route('/movies')
def movies_page():
    return render_template('movies.html', cities=CITIES, movie_count=len(NOW_SHOWING_MOVIES))

@app.route('/static/<path:filename>')
def serve_static(filename):
    static_dir = os.path.join(BASE_DIR, 'static')
    if not os.path.exists(static_dir):
        static_dir = os.path.join(BASE_DIR, 'public', 'static')
    
    # Path traversal defense: ensure resolved path stays within static_dir
    safe_base = os.path.abspath(static_dir)
    requested = os.path.abspath(os.path.join(static_dir, filename))
    if not requested.startswith(safe_base):
        return jsonify({"status": "error", "message": "Access denied"}), 403

    return send_from_directory(static_dir, filename)

@app.route('/api/movies', methods=['GET'])
def api_movies():
    city = request.args.get('city', 'Mumbai')
    search = request.args.get('search', '')
    formats = request.args.getlist('format')
    max_price = request.args.get('max_price', type=int)
    chain = request.args.get('chain', 'All')
    sort_by = request.args.get('sort_by', 'cheapest')
    language = request.args.get('language', 'All')
    
    shows = get_movie_shows(
        city=city, 
        search_query=search, 
        selected_formats=formats if formats else None,
        max_price=max_price,
        theatre_chain=chain,
        sort_by=sort_by,
        language=language
    )
    return jsonify({
        "status": "success",
        "count": len(shows),
        "city": city,
        "movies": shows
    })

@app.route('/api/upcoming', methods=['GET'])
def api_upcoming():
    city = request.args.get('city', 'Mumbai')
    search = request.args.get('search', '')
    upcoming = get_upcoming_movies(city=city, search_query=search)
    return jsonify({
        "status": "success",
        "city": city,
        "count": len(upcoming),
        "upcoming_movies": upcoming
    })

@app.route('/api/wallet/cards', methods=['GET'])
def api_wallet_cards():
    return jsonify({
        "status": "success",
        "count": len(SUPPORTED_CARDS),
        "cards": SUPPORTED_CARDS
    })

@app.route('/api/wallet/calculate', methods=['POST'])
def api_wallet_calculate():
    payload = request.get_json() or {}
    ticket_price = payload.get('ticket_price', 250)
    qty = payload.get('qty', 2)
    theatre_chain = payload.get('theatre_chain', 'PVR INOX')
    cards = payload.get('cards', [])
    deal = get_best_wallet_deal(
        ticket_price=ticket_price,
        qty=qty,
        theatre_chain=theatre_chain,
        selected_card_ids=cards
    )
    return jsonify({
        "status": "success",
        "deal": deal
    })

@app.route('/api/compare/<movie_id>', methods=['GET'])
def api_compare_alias(movie_id):
    city = request.args.get('city', 'Mumbai')
    user_lat = request.args.get('user_lat', type=float) or request.args.get('lat', type=float)
    user_lng = request.args.get('user_lng', type=float) or request.args.get('user_lon', type=float) or request.args.get('lng', type=float) or request.args.get('lon', type=float)
    sort_by = request.args.get('sort_by') or request.args.get('sort', 'cheapest')
    cards_raw = request.args.get('cards', '')
    selected_cards = [c.strip() for c in cards_raw.split(',') if c.strip()] if cards_raw else None
    ticket_qty = max(1, min(10, request.args.get('qty', 2, type=int)))
    data = get_price_comparison(
        movie_id, 
        city=city, 
        user_lat=user_lat, 
        user_lng=user_lng, 
        sort_by=sort_by,
        selected_card_ids=selected_cards,
        ticket_qty=ticket_qty
    )
    if not data:
        return jsonify({"status": "error", "message": "Movie not found"}), 404
    return jsonify({"status": "success", "comparison": data})

@app.route('/api/comparison', methods=['GET'])
def api_comparison():
    movie_id = request.args.get('movie_id')
    city = request.args.get('city', 'Mumbai')
    user_lat = request.args.get('user_lat', type=float) or request.args.get('lat', type=float)
    user_lng = request.args.get('user_lng', type=float) or request.args.get('user_lon', type=float) or request.args.get('lng', type=float) or request.args.get('lon', type=float)
    sort_by = request.args.get('sort', 'cheapest')
    cards_raw = request.args.get('cards', '')
    selected_cards = [c.strip() for c in cards_raw.split(',') if c.strip()] if cards_raw else None
    ticket_qty = max(1, min(10, request.args.get('qty', 2, type=int)))
    if not movie_id:
        return jsonify({"status": "error", "message": "movie_id is required"}), 400
        
    data = get_price_comparison(
        movie_id, 
        city=city, 
        user_lat=user_lat, 
        user_lng=user_lng, 
        sort_by=sort_by,
        selected_card_ids=selected_cards,
        ticket_qty=ticket_qty
    )
    if not data:
        return jsonify({"status": "error", "message": "Movie not found"}), 404
        
    return jsonify({"status": "success", "comparison": data})

@app.route('/api/booking-details', methods=['GET'])
def api_booking_details():
    movie_id = request.args.get('movie_id')
    city = request.args.get('city', 'Mumbai')
    theatre_id = request.args.get('theatre_id')
    theatre_name = request.args.get('theatre') or request.args.get('theatre_name')
    show_time = request.args.get('show_time') or request.args.get('time')
    show_format = request.args.get('format')
    
    if not movie_id:
        return jsonify({"status": "error", "message": "movie_id is required"}), 400
        
    data = get_booking_details(
        movie_id,
        theatre_id=theatre_id,
        city=city,
        theatre_name=theatre_name,
        show_time=show_time,
        show_format=show_format
    )
    if not data:
        return jsonify({"status": "error", "message": "Movie not found"}), 404
        
    return jsonify({"status": "success", "data": data})


@app.route('/api/trailer', methods=['GET'])
def api_trailer():
    title = request.args.get('title', '').strip()
    if not title:
        return jsonify({"status": "error", "message": "title is required"}), 400
        
    clean_title = re.sub(r'[<>]', '', title)[:120].strip()
    trailer_id = resolve_youtube_trailer_id(clean_title)
    
    # Validate trailer_id is strictly a valid 11-char YouTube ID
    if not re.match(r'^[a-zA-Z0-9_\-]{11}$', trailer_id):
        trailer_id = "PWuJ5-WiEgY"

    embed_url = f"https://www.youtube-nocookie.com/embed/{trailer_id}?autoplay=1&rel=0&modestbranding=1"
    watch_url = f"https://www.youtube.com/watch?v={trailer_id}"
    
    return jsonify({
        "status": "success",
        "title": clean_title,
        "trailer_id": trailer_id,
        "embed_url": embed_url,
        "watch_url": watch_url
    })

@app.route('/api/promos', methods=['GET'])
def api_promos():
    return jsonify({
        "status": "success",
        "promos": PROMO_CODES
    })

@app.route('/api/alerts', methods=['GET', 'POST', 'DELETE'])
def api_alerts():
    if request.method == 'GET':
        return jsonify({
            "status": "success",
            "alerts": alert_manager.get_alerts(),
            "notifications": alert_manager.get_notifications()
        })
        
    elif request.method == 'POST':
        payload = request.get_json() or {}
        raw_title = payload.get('movie_title')
        if not raw_title:
            return jsonify({"status": "error", "message": "movie_title is required"}), 400

        # Input sanitization and bounds enforcement
        movie_title = re.sub(r'[<>]', '', str(raw_title))[:100].strip()
        movie_id = re.sub(r'[^a-zA-Z0-9_\-]', '', str(payload.get('movie_id') or ''))[:50]
        
        try:
            target_price = max(50, min(5000, int(float(payload.get('target_price', 200)))))
        except (ValueError, TypeError):
            target_price = 200

        city = payload.get('city', 'Mumbai')
        if city not in CITIES:
            city = 'Mumbai'

        format_type = re.sub(r'[^a-zA-Z0-9_\- ]', '', str(payload.get('format_type', 'All')))[:25]
        email = re.sub(r'[^a-zA-Z0-9@._\-]', '', str(payload.get('email', 'user@example.com')))[:100]

        alert = alert_manager.add_alert(
            movie_id=movie_id,
            movie_title=movie_title,
            target_price=target_price,
            city=city,
            format_type=format_type,
            email=email
        )
        return jsonify({"status": "success", "alert": alert})
        
    elif request.method == 'DELETE':
        raw_id = request.args.get('alert_id', '')
        alert_id = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_id)[:60]
        if not alert_id:
            return jsonify({"status": "error", "message": "Valid alert_id is required"}), 400
        alert_manager.delete_alert(alert_id)
        return jsonify({"status": "success", "message": "Alert deleted"})

@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
def api_delete_alert_alias(alert_id):
    clean_id = re.sub(r'[^a-zA-Z0-9_\-]', '', str(alert_id))[:60]
    if not clean_id:
        return jsonify({"status": "error", "message": "Valid alert_id is required"}), 400
    alert_manager.delete_alert(clean_id)
    return jsonify({"status": "success", "message": "Alert deleted"})

@app.route('/api/system/clock', methods=['GET'])
def api_system_clock():
    ist_now = get_ist_now()
    curr_hour = ist_now.hour + (ist_now.minute / 60.0)
    if curr_hour < 12.0:
        window = "morning"
        label = "Morning Shows (Discount Window)"
    elif curr_hour < 16.0:
        window = "matinee"
        label = "Matinee Shows"
    elif curr_hour < 20.0:
        window = "evening"
        label = "Prime Evening (Peak Demand)"
    else:
        window = "night"
        label = "Late Night Shows"

    return jsonify({
        "status": "success",
        "current_ist_time": ist_now.strftime("%I:%M %p"),
        "current_date": ist_now.strftime("%d %b, %Y"),
        "active_window": window,
        "window_label": label
    })

@app.route('/api/catalog/add', methods=['POST'])
def api_catalog_add():
    payload = request.get_json() or {}
    title = str(payload.get('title', '')).strip()
    if not title:
        return jsonify({"status": "error", "message": "Title is required"}), 400
    res = add_movie_to_catalog(
        title=title,
        genre=payload.get('genre'),
        certificate=payload.get('certificate'),
        duration=payload.get('duration'),
        poster=payload.get('poster'),
        rating=payload.get('rating', 8.5)
    )
    return jsonify(res)

@app.route('/api/catalog/sync', methods=['POST'])
def api_catalog_sync():
    res = sync_new_theatrical_releases()
    return jsonify(res)

@app.route('/api/alerts/simulate', methods=['POST'])
def api_simulate_alert():
    payload = request.get_json() or {}
    raw_action = str(payload.get('action', 'drop')).strip().lower()
    action = raw_action if raw_action in ['drop', 'surge', 'reset'] else 'drop'
    movie_id = re.sub(r'[^a-zA-Z0-9_\-]', '', str(payload.get('movie_id') or ''))[:50]
    
    city = payload.get('city', 'Mumbai')
    if city not in CITIES:
        city = 'Mumbai'

    raw_theatre = payload.get('theatre_name')
    theatre_name = re.sub(r'[<>]', '', str(raw_theatre))[:100] if raw_theatre else None

    simulated_price = payload.get('price')
    if simulated_price is not None:
        try:
            simulated_price = max(30, min(3000, int(float(simulated_price))))
        except (ValueError, TypeError):
            simulated_price = None
    
    result = alert_manager.simulate_price_fluctuation(
        action=action,
        movie_id=movie_id,
        simulated_price=simulated_price,
        theatre_name=theatre_name,
        city=city
    )
    return jsonify({"status": "success", "result": result})

@app.route('/api/export/csv', methods=['GET'])
def export_csv_unified():
    export_type = request.args.get('type', 'movies').lower()
    if export_type in ['compare', 'comparison']:
        return export_comparison()
    elif export_type in ['matrix', 'price-matrix', 'pricematrix']:
        return export_price_matrix()
    else:
        return export_shows()

@app.route('/api/export/shows', methods=['GET'])
def export_shows():
    city = request.args.get('city', 'Mumbai')
    search = request.args.get('search', '')
    csv_data = export_shows_to_csv(city=city, search_query=search)
    bom_csv = "\ufeff" + csv_data
    safe_city = re.sub(r'[^a-zA-Z0-9_\-]', '_', city.lower())
    return Response(
        bom_csv,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="movie_shows_{safe_city}.csv"'}
    )

@app.route('/api/export/comparison', methods=['GET'])
def export_comparison():
    movie_id = request.args.get('movie_id')
    if not movie_id:
        return Response("movie_id is required", status=400)
    city = request.args.get('city', 'Mumbai')
    csv_data = export_comparison_to_csv(movie_id, city=city)
    bom_csv = "\ufeff" + csv_data
    safe_movie = re.sub(r'[^a-zA-Z0-9_\-]', '_', movie_id)
    safe_city = re.sub(r'[^a-zA-Z0-9_\-]', '_', city.lower())
    return Response(
        bom_csv,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="price_comparison_{safe_movie}_{safe_city}.csv"'}
    )


@app.route('/api/price-matrix', methods=['GET'])
def api_price_matrix():
    city = request.args.get('city', 'Mumbai')
    movie_id = request.args.get('movie_id', None)
    user_lat = request.args.get('user_lat', type=float) or request.args.get('lat', type=float)
    user_lng = request.args.get('user_lng', type=float) or request.args.get('user_lon', type=float) or request.args.get('lng', type=float) or request.args.get('lon', type=float)
    matrix = get_price_matrix(city=city, movie_id=movie_id, user_lat=user_lat, user_lng=user_lng)
    if not matrix:
        return jsonify({"status": "error", "message": "No matrix data available for this selection"}), 404
    return jsonify({"status": "success", "data": matrix})


@app.route('/api/export/price-matrix', methods=['GET'])
def export_price_matrix():
    city = request.args.get('city', 'Mumbai')
    movie_id = request.args.get('movie_id', None)
    matrix = get_price_matrix(city=city, movie_id=movie_id)
    if not matrix or not matrix.get("all_shows"):
        return Response("No show data available for export", status=404)

    import pandas as pd
    import io

    rows = []
    for s in matrix["all_shows"]:
        rows.append({
            "Movie": s["movie_title"],
            "City": city,
            "Theatre": s["theatre_name"],
            "Chain": s["chain"],
            "Time": s["time"],
            "Time Window": "Morning" if s["hour"] < 12.0 else ("Matinee" if s["hour"] < 16.0 else ("Evening" if s["hour"] < 20.0 else "Night")),
            "Format": s["format"],
            "Silver (Rs)": s["silver"],
            "Gold (Rs)": s["gold"],
            "Recliner (Rs)": s["recliner"],
            "Seats Left": s["seats_left"],
            "Availability": s["availability"],
            "Direct Booking Link": s["booking_url"]
        })

    df = pd.DataFrame(rows)
    output = io.StringIO()
    df.to_csv(output, index=False)
    csv_str = output.getvalue()

    bom_csv = "\ufeff" + csv_str
    movie_title_clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', matrix['selected_movie']['title'].lower())
    safe_city = re.sub(r'[^a-zA-Z0-9_\-]', '_', city.lower())
    filename = f"cineplus_price_matrix_{movie_title_clean}_{safe_city}.csv"
    return Response(
        bom_csv,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


def open_browser():
    """Automatically open default web browser to the app"""
    webbrowser.open_new("http://127.0.0.1:5000")

if __name__ == '__main__':
    print("=================================================================")
    print("  [CinePlus] Movie Ticket Price & Show Finder Automation         ")
    print("=================================================================")
    print("  Starting server at: http://127.0.0.1:5000")
    print("  Opening browser automatically...")
    print("=================================================================")
    
    threading.Timer(1.2, open_browser).start()
    app.run(host='127.0.0.1', port=5000, debug=False)

