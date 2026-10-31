import os
import sys

# Add parent directory to sys.path so app and other modules can be found
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from app import app, index

# Explicitly register /api/index route in case Vercel forwards directly to /api/index
@app.route('/api/index')
def vercel_entry():
    return index()

class VercelPathFixMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get('PATH_INFO', '')
        # Handle prefix if Vercel routes /api/index/<route>
        if path.startswith('/api/index/'):
            sub_path = path[len('/api/index'):]
            environ['PATH_INFO'] = sub_path or '/'
        elif path == '/api/index':
            # Check original requested URI from Vercel proxy headers
            orig = (
                environ.get('HTTP_X_FORWARDED_URI') or
                environ.get('REQUEST_URI') or
                environ.get('HTTP_X_MATCHED_PATH') or
                environ.get('RAW_URI')
            )
            if orig and orig not in ['/api/index', '/api/index/']:
                environ['PATH_INFO'] = orig.split('?')[0]
        return self.wsgi_app(environ, start_response)

app.wsgi_app = VercelPathFixMiddleware(app.wsgi_app)

# Vercel looks for 'app' in api/index.py
if __name__ == '__main__':
    app.run(port=5000)
